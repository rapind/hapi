import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'
import { SopsSecretReplySchema } from '@hapi/protocol'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { requireSessionFromParam, requireSyncEngine } from './guards'

export function createSopsSecretsRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()
    app.post(
        '/sessions/:id/sops-secrets/:requestId',
        bodyLimit({ maxSize: 96 * 1024, onError: (c) => c.json({ error: 'Request too large' }, 413) }),
        async (c) => {
            c.header('Cache-Control', 'no-store')
            const engine = requireSyncEngine(c, getSyncEngine)
            if (engine instanceof Response) return engine
            const access = requireSessionFromParam(c, engine, { requireActive: true })
            if (access instanceof Response) return access
            const requestId = c.req.param('requestId')
            const request = access.session.agentState?.sopsSecretRequests?.[requestId]
            if (!request || request.id !== requestId || Date.now() >= request.expiresAt)
                return c.json({ error: 'Credential request expired or unavailable' }, 409)
            let body: unknown
            try {
                body = await c.req.json()
            } catch (error) {
                if (
                    (error instanceof HTTPException && error.status === 413) ||
                    (error instanceof Error && error.name === 'BodyLimitError')
                )
                    return c.json({ error: 'Request too large' }, 413)
                return c.json({ error: 'Invalid credential response' }, 400)
            }
            const parsed = SopsSecretReplySchema.safeParse(body)
            if (!parsed.success) return c.json({ error: 'Invalid credential response' }, 400)

            try {
                const result = await engine.submitSopsSecret(access.sessionId, requestId, parsed.data)
                if (['saved', 'canceled', 'failed'].includes(result.status)) {
                    try {
                        await engine.sendMessage(access.sessionId, {
                            text: `SOPS credential request ${requestId}: ${result.status}. Destination: ${JSON.stringify(request.file)}, key: ${JSON.stringify(request.key)}. The credential value was not included in this message.`,
                            localId: `sops-secret-${requestId}`,
                            sentFrom: 'webapp'
                        })
                        return c.json({ ...result, notified: true })
                    } catch {
                        return c.json({ ...result, notified: false })
                    }
                }
                return c.json(result)
            } catch {
                // The route must never log or return transport error objects.
                return c.json(
                    {
                        error: 'Credential delivery could not be confirmed. Check the SOPS file before requesting another submission.'
                    },
                    503
                )
            }
        }
    )
    return app
}
