import { z } from 'zod'

export const MAX_SECRET_BYTES = 64 * 1024
export const SOPS_SECRET_TTL_MS = 10 * 60 * 1000

const base64 = (max: number) =>
    z
        .string()
        .min(1)
        .max(max)
        .regex(/^[A-Za-z0-9+/]+={0,2}$/)

export const SopsSecretInputSchema = z
    .object({
        file: z
            .string()
            .trim()
            .min(1)
            .max(4096)
            .describe(
                'Existing SOPS-encrypted YAML or JSON file on the session machine, relative to the session directory or absolute.'
            ),
        key: z
            .array(z.string().min(1).max(256))
            .min(1)
            .max(16)
            .describe(
                'Object key path, for example ["services", "STRIPE_API_KEY"]. Never include the credential value.'
            )
    })
    .strict()

export const SopsSecretRequestSchema = SopsSecretInputSchema.extend({
    id: z.string().uuid(),
    publicKey: base64(128),
    expiresAt: z.number()
}).strict()

export const SopsSecretReplySchema = z.discriminatedUnion('action', [
    z.object({ action: z.literal('cancel') }).strict(),
    z
        .object({
            action: z.literal('save'),
            publicKey: base64(128),
            iv: base64(32),
            ciphertext: base64(90_000)
        })
        .strict()
])

export const SopsSecretResultSchema = z
    .object({
        status: z.enum(['saved', 'canceled', 'failed', 'expired', 'unavailable', 'busy', 'invalid']),
        notified: z.boolean().optional()
    })
    .strict()

export type SopsSecretInput = z.infer<typeof SopsSecretInputSchema>
export type SopsSecretRequest = z.infer<typeof SopsSecretRequestSchema>
export type SopsSecretReply = z.infer<typeof SopsSecretReplySchema>
export type SopsSecretResult = z.infer<typeof SopsSecretResultSchema>

function encode(bytes: Uint8Array): string {
    return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
}

function decode(value: string): Uint8Array<ArrayBuffer> {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
}

export async function createSecretKeyPair(): Promise<{ privateKey: CryptoKey; publicKey: string }> {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey'])
    return {
        privateKey: pair.privateKey,
        publicKey: encode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)))
    }
}

async function deriveSecretKey(privateKey: CryptoKey, publicKey: string): Promise<CryptoKey> {
    const peer = await crypto.subtle.importKey(
        'raw',
        decode(publicKey),
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        []
    )
    return await crypto.subtle.deriveKey(
        { name: 'ECDH', public: peer },
        privateKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    )
}

export async function encryptSopsSecret(request: SopsSecretRequest, value: string): Promise<SopsSecretReply> {
    const bytes = new TextEncoder().encode(value)
    if (!bytes.length || bytes.length > MAX_SECRET_BYTES) throw new Error('Invalid credential length')
    const pair = await createSecretKeyPair()
    const key = await deriveSecretKey(pair.privateKey, request.publicKey)
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(request.id) },
        key,
        bytes
    )
    return { action: 'save', publicKey: pair.publicKey, iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) }
}

export async function decryptSopsSecret(
    id: string,
    privateKey: CryptoKey,
    reply: Extract<SopsSecretReply, { action: 'save' }>
): Promise<string> {
    const key = await deriveSecretKey(privateKey, reply.publicKey)
    const bytes = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: decode(reply.iv), additionalData: new TextEncoder().encode(id) },
        key,
        decode(reply.ciphertext)
    )
    if (!bytes.byteLength || bytes.byteLength > MAX_SECRET_BYTES) throw new Error('Invalid credential length')
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}
