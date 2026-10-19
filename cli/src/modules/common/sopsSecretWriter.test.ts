import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { prepareSopsDestination, writeSopsSecret } from './sopsSecretWriter'

let hasSops = false
try {
    execFileSync('sops', ['set', '--help'], { stdio: 'pipe' })
    execFileSync('age-keygen', ['-h'], { stdio: 'pipe' })
    hasSops = true
} catch {
    /* Integration coverage requires the optional SOPS and age tools. */
}

describe('SOPS destination validation', () => {
    it('rejects metadata and prototype keys', async () => {
        for (const key of [['sops', 'age'], ['__proto__', 'token'], ['constructor']]) {
            await expect(prepareSopsDestination({ file: '/unused.yaml', key }, '/tmp')).rejects.toThrow(
                'Invalid credential key'
            )
        }
    })
})

describe.skipIf(!hasSops)('SOPS writer integration', () => {
    let dir: string | undefined
    const oldAgeKeyFile = process.env.SOPS_AGE_KEY_FILE
    afterEach(async () => {
        if (oldAgeKeyFile === undefined) delete process.env.SOPS_AGE_KEY_FILE
        else process.env.SOPS_AGE_KEY_FILE = oldAgeKeyFile
        if (dir) await rm(dir, { recursive: true, force: true })
    })

    async function setup(extraArgs: string[] = []) {
        dir = await mkdtemp(join(tmpdir(), 'hapi-sops-test-'))
        const keyFile = join(dir, 'age.key')
        execFileSync('age-keygen', ['-o', keyFile], { stdio: 'pipe' })
        process.env.SOPS_AGE_KEY_FILE = keyFile
        const recipient = execFileSync('age-keygen', ['-y', keyFile], { encoding: 'utf8' }).trim()
        const file = join(dir, 'secrets.json')
        const encrypted = execFileSync(
            'sops',
            ['encrypt', '--age', recipient, ...extraArgs, '--filename-override', file],
            {
                cwd: dir,
                input: JSON.stringify({ service: { token: 'old' }, other: 'unchanged' }),
                stdio: ['pipe', 'pipe', 'pipe']
            }
        )
        await writeFile(file, encrypted)
        return { file, encrypted }
    }

    it('updates only the requested key, preserves literal bytes, and leaves only ciphertext on disk', async () => {
        const { file } = await setup()
        const value = '秘密\n"quoted"\n$(touch DO-NOT-RUN)'
        await writeSopsSecret(await prepareSopsDestination({ file, key: ['service', 'token'] }, dir!), value)
        const encrypted = await readFile(file, 'utf8')
        expect(encrypted).not.toContain(value)
        expect(JSON.parse(encrypted).service.token).toMatch(/^ENC\[AES256_GCM,/)
        const decrypted = execFileSync('sops', ['decrypt', file], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
        expect(JSON.parse(decrypted)).toEqual({ service: { token: value }, other: 'unchanged' })
        expect(await readdir(dir!)).toEqual(expect.arrayContaining(['age.key', 'secrets.json']))
        expect((await readdir(dir!)).some((name) => name.startsWith('.hapi-sops-'))).toBe(false)
        expect(await readdir(dir!)).not.toContain('DO-NOT-RUN')
    })

    it('refuses an excluded key before passing the credential to SOPS', async () => {
        const { file, encrypted } = await setup(['--encrypted-regex', '^other$'])
        const destination = await prepareSopsDestination({ file, key: ['service', 'token'] }, dir!)
        await expect(writeSopsSecret(destination, 'must-not-be-written')).rejects.toThrow('SOPS did not encrypt')
        expect(await readFile(file)).toEqual(encrypted)
        expect((await readdir(dir!)).some((name) => name.startsWith('.hapi-sops-'))).toBe(false)
    })

    it('preserves external edits made while the credential form is open', async () => {
        const { file } = await setup()
        const destination = await prepareSopsDestination({ file, key: ['service', 'token'] }, dir!)
        const changed = Buffer.concat([destination.original, Buffer.from('\n')])
        await writeFile(file, changed)
        await expect(writeSopsSecret(destination, 'new-value')).rejects.toThrow('SOPS file changed')
        expect(await readFile(file)).toEqual(changed)
    })
})
