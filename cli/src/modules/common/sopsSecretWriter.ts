import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { chmod, lstat, mkdtemp, open, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { parse } from 'yaml'
import type { SopsSecretInput } from '@hapi/protocol'

const MAX_SOPS_FILE_BYTES = 1024 * 1024
const encryptedValue = /^ENC\[AES256_GCM,/

export type SopsDestination = SopsSecretInput & { original: Buffer; dev: number; ino: number; mode: number }

function document(bytes: Buffer, file: string): Record<string, unknown> {
    const value: unknown =
        extname(file).toLowerCase() === '.json'
            ? JSON.parse(bytes.toString('utf8'))
            : parse(bytes.toString('utf8'), { maxAliasCount: 0 })
    if (!value || typeof value !== 'object' || Array.isArray(value) || !('sops' in value))
        throw new Error('Expected an existing SOPS document')
    return value as Record<string, unknown>
}

export async function prepareSopsDestination(input: SopsSecretInput, cwd: string): Promise<SopsDestination> {
    if (input.key[0] === 'sops' || input.key.some((key) => ['__proto__', 'constructor', 'prototype'].includes(key)))
        throw new Error('Invalid credential key')
    const file = await realpath(resolve(cwd, input.file))
    if (!['.yaml', '.yml', '.json'].includes(extname(file).toLowerCase()))
        throw new Error('Use an existing SOPS YAML or JSON file')
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
        const stat = await handle.stat()
        if (!stat.isFile() || stat.size > MAX_SOPS_FILE_BYTES) throw new Error('Invalid SOPS file')
        const original = await handle.readFile()
        document(original, file)
        return { ...input, file, original, dev: stat.dev, ino: stat.ino, mode: stat.mode & 0o777 }
    } finally {
        await handle.close()
    }
}

// Neither stream is inherited: SOPS diagnostics may contain decrypted data.
async function setSopsValue(file: string, key: string[], value: string, cwd: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const child = spawn(
            'sops',
            ['set', '--value-stdin', '--', file, key.map((part) => `[${JSON.stringify(part)}]`).join('')],
            {
                cwd,
                shell: false,
                stdio: ['pipe', 'ignore', 'ignore']
            }
        )
        const timeout = setTimeout(() => {
            child.kill('SIGKILL')
        }, 10_000)
        const fail = () => {
            child.kill('SIGKILL')
            reject(new Error('SOPS update failed'))
        }
        child.on('error', fail)
        child.stdin.on('error', fail)
        child.on('close', (code) => {
            clearTimeout(timeout)
            if (code === 0) resolve()
            else reject(new Error('SOPS update failed'))
        })
        child.stdin.end(JSON.stringify(value))
    })
}

function assertEncrypted(bytes: Buffer, destination: SopsDestination): void {
    let value: unknown = document(bytes, destination.file)
    for (const key of destination.key) {
        if (!value || typeof value !== 'object' || !Object.hasOwn(value, key))
            throw new Error('SOPS did not encrypt the credential key')
        value = (value as Record<string, unknown>)[key]
    }
    if (typeof value !== 'string' || !encryptedValue.test(value))
        throw new Error('SOPS did not encrypt the credential key')
}

export async function writeSopsSecret(destination: SopsDestination, value: string): Promise<void> {
    const parent = dirname(destination.file)
    const scratch = await mkdtemp(join(parent, '.hapi-sops-'))
    const staged = join(scratch, `secret${extname(destination.file)}`)
    try {
        await writeFile(staged, destination.original, { mode: 0o600, flag: 'wx' })
        // Prove the requested key is encrypted before giving SOPS the real value.
        await setSopsValue(staged, destination.key, 'hapi-encryption-check', parent)
        assertEncrypted(await readFile(staged), destination)
        await setSopsValue(staged, destination.key, value, parent)
        assertEncrypted(await readFile(staged), destination)

        const current = await lstat(destination.file)
        if (
            !current.isFile() ||
            current.dev !== destination.dev ||
            current.ino !== destination.ino ||
            !(await readFile(destination.file)).equals(destination.original)
        ) {
            throw new Error('SOPS file changed; request the credential again')
        }
        await chmod(staged, destination.mode)
        await rename(staged, destination.file)
    } finally {
        await rm(scratch, { recursive: true, force: true })
    }
}
