import { describe, expect, it } from 'bun:test'
import { randomUUID } from 'node:crypto'
import {
    createSecretKeyPair,
    decryptSopsSecret,
    encryptSopsSecret,
    MAX_SECRET_BYTES,
    SopsSecretInputSchema,
    SopsSecretReplySchema,
    SopsSecretRequestSchema
} from './sopsSecrets'

describe('SOPS secret delivery', () => {
    it('round trips multiline Unicode without exposing the value in the envelope', async () => {
        const pair = await createSecretKeyPair()
        const request = {
            id: randomUUID(),
            file: '/project/secrets.yaml',
            key: ['service', 'token'],
            publicKey: pair.publicKey,
            expiresAt: Date.now() + 1000
        }
        const value = '秘密\n"credential"\n$(never-run-this)'
        const reply = SopsSecretReplySchema.parse(await encryptSopsSecret(request, value))
        expect(JSON.stringify(reply)).not.toContain(value)
        if (reply.action !== 'save') throw new Error('Expected encrypted value')
        expect(await decryptSopsSecret(request.id, pair.privateKey, reply)).toBe(value)
        await expect(decryptSopsSecret(randomUUID(), pair.privateKey, reply)).rejects.toThrow()
        const other = await createSecretKeyPair()
        await expect(decryptSopsSecret(request.id, other.privateKey, reply)).rejects.toThrow()
        await expect(
            decryptSopsSecret(request.id, pair.privateKey, { ...reply, iv: btoa('invalid-nonce') })
        ).rejects.toThrow()
    })

    it('rejects plaintext fields and invalid paths rather than persisting them', () => {
        expect(SopsSecretInputSchema.safeParse({ file: 'secret.yaml', key: ['token'], value: 'secret' }).success).toBe(
            false
        )
        expect(SopsSecretRequestSchema.safeParse({ value: 'secret' }).success).toBe(false)
        expect(SopsSecretReplySchema.safeParse({ action: 'save', value: 'secret' }).success).toBe(false)
        expect(SopsSecretInputSchema.safeParse({ file: 'secret.yaml', key: [] }).success).toBe(false)
    })

    it('rejects empty and oversized UTF-8 values before transfer', async () => {
        const pair = await createSecretKeyPair()
        const request = {
            id: randomUUID(),
            file: 'secret.yaml',
            key: ['token'],
            publicKey: pair.publicKey,
            expiresAt: 0
        }
        await expect(encryptSopsSecret(request, '')).rejects.toThrow('Invalid credential length')
        await expect(encryptSopsSecret(request, '😀'.repeat(MAX_SECRET_BYTES))).rejects.toThrow(
            'Invalid credential length'
        )
    })
})
