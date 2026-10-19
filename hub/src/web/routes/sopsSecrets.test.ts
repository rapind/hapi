import { describe, expect, it, mock } from 'bun:test'
import { Hono } from 'hono'
import { createSecretKeyPair, encryptSopsSecret, type SopsSecretRequest, type SopsSecretResult } from '@hapi/protocol'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { createSopsSecretsRoutes } from './sopsSecrets'

async function setup(result: SopsSecretResult = { status: 'saved' }) {
    const keys = await createSecretKeyPair()
    const request: SopsSecretRequest = {
        id: crypto.randomUUID(),
        file: '/repo/secret.yaml',
        key: ['token'],
        publicKey: keys.publicKey,
        expiresAt: Date.now() + 60_000
    }
    const session = { active: true, agentState: { sopsSecretRequests: { [request.id]: request } } }
    const submit = mock(async () => result)
    const sendMessage = mock(async () => {})
    const engine = {
        resolveSessionAccess: (_id: string, namespace: string) =>
            namespace === 'owner'
                ? { ok: true, sessionId: 'session-1', session }
                : { ok: false, reason: 'access-denied' },
        submitSopsSecret: submit,
        sendMessage
    } as unknown as SyncEngine
    const app = new Hono<WebAppEnv>()
    app.use('*', async (c, next) => {
        c.set('namespace', c.req.header('x-namespace') ?? 'owner')
        await next()
    })
    app.route(
        '/api',
        createSopsSecretsRoutes(() => engine)
    )
    const post = (body: unknown, namespace = 'owner', id = request.id) =>
        app.request(`/api/sessions/session-1/sops-secrets/${id}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-namespace': namespace },
            body: JSON.stringify(body)
        })
    return { request, session, submit, sendMessage, post }
}

describe('SOPS credential route', () => {
    it('relays only ciphertext and sends only safe completion metadata to chat', async () => {
        const { request, submit, sendMessage, post } = await setup()
        const secret = 'do-not-save-in-chat'
        const envelope = await encryptSopsSecret(request, secret)
        const response = await post(envelope)
        expect(await response.json()).toEqual({ status: 'saved', notified: true })
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(submit).toHaveBeenCalledWith('session-1', request.id, envelope)
        expect(JSON.stringify(submit.mock.calls)).not.toContain(secret)
        expect(JSON.stringify(sendMessage.mock.calls)).not.toContain(secret)
        expect(JSON.stringify(sendMessage.mock.calls)).toContain(request.file)
    })

    it('enforces namespace ownership, active sessions, pending IDs, and expiry before relaying', async () => {
        const { request, session, submit, post } = await setup()
        expect((await post({ action: 'cancel' }, 'intruder')).status).toBe(403)
        expect((await post({ action: 'cancel' }, 'owner', crypto.randomUUID())).status).toBe(409)
        session.active = false
        expect((await post({ action: 'cancel' })).status).toBe(409)
        session.active = true
        request.expiresAt = Date.now() - 1
        expect((await post({ action: 'cancel' })).status).toBe(409)
        expect(submit).not.toHaveBeenCalled()
    })

    it('rejects plaintext and oversized requests without reflecting their contents', async () => {
        const { submit, post } = await setup()
        const response = await post({ action: 'save', value: 'private' })
        expect(response.status).toBe(400)
        expect(await response.text()).not.toContain('private')
        expect((await post({ value: 'x'.repeat(100_000) })).status).toBe(413)
        expect(submit).not.toHaveBeenCalled()
    })

    it('reports notification failure without misreporting a completed save', async () => {
        const { post, sendMessage } = await setup()
        sendMessage.mockRejectedValueOnce(new Error('error containing private data'))
        const response = await post({ action: 'cancel' })
        expect(await response.json()).toEqual({ status: 'saved', notified: false })
    })

    it('suppresses transport diagnostics and does not notify for an uncertain result', async () => {
        const { post, submit, sendMessage } = await setup()
        submit.mockRejectedValueOnce(new Error('private data in transport error'))
        const response = await post({ action: 'cancel' })
        expect(response.status).toBe(503)
        expect(await response.text()).not.toContain('private data')
        expect(sendMessage).not.toHaveBeenCalled()
    })
})
