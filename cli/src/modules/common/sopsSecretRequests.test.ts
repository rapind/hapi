import { afterEach, describe, expect, it, vi } from 'vitest'
import { encryptSopsSecret, RPC_METHODS, SOPS_SECRET_TTL_MS, type AgentState } from '@hapi/protocol'
import type { ApiSessionClient } from '@/api/apiSession'
import { SopsSecretRequests } from './sopsSecretRequests'
import { prepareSopsDestination, writeSopsSecret } from './sopsSecretWriter'

vi.mock('./sopsSecretWriter', () => ({ prepareSopsDestination: vi.fn(), writeSopsSecret: vi.fn() }))

function setup() {
    let state: AgentState = { requests: { unrelated: { tool: 'Bash', arguments: {} } } }
    const handlers = new Map<string, (data: unknown) => Promise<unknown>>()
    const client = {
        rpcHandlerManager: {
            registerHandler: (name: string, handler: (data: unknown) => Promise<unknown>) => handlers.set(name, handler)
        },
        updateAgentState: (update: (value: AgentState) => AgentState) => {
            state = update(state)
        }
    } as unknown as ApiSessionClient
    vi.mocked(prepareSopsDestination).mockResolvedValue({
        file: '/repo/secrets.yaml',
        key: ['token'],
        original: Buffer.from('encrypted'),
        dev: 1,
        ino: 2,
        mode: 0o600
    })
    vi.mocked(writeSopsSecret).mockResolvedValue()
    const manager = new SopsSecretRequests(client, '/repo')
    return { manager, state: () => state, submit: handlers.get(RPC_METHODS.SubmitSopsSecret)! }
}

afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
})

describe('SOPS request lifecycle', () => {
    it('rejects duplicate submissions while a save is in flight', async () => {
        const { manager, submit } = setup()
        let finish!: () => void
        vi.mocked(writeSopsSecret).mockImplementationOnce(
            () =>
                new Promise<void>((resolve) => {
                    finish = resolve
                })
        )
        try {
            const request = await manager.request({ file: 'secrets.yaml', key: ['token'] })
            const payload = { requestId: request.id, reply: await encryptSopsSecret(request, 'private') }
            const first = submit(payload)
            await vi.waitFor(() => expect(writeSopsSecret).toHaveBeenCalledOnce())
            expect(await submit(payload)).toEqual({ status: 'busy' })
            finish()
            expect(await first).toEqual({ status: 'saved' })
            expect(writeSopsSecret).toHaveBeenCalledOnce()
        } finally {
            manager.close()
        }
    })
    it('publishes only public request metadata, consumes once, and never returns the credential', async () => {
        const { manager, state, submit } = setup()
        try {
            const request = await manager.request({ file: 'secrets.yaml', key: ['token'] })
            expect(state().requests?.unrelated.tool).toBe('Bash')
            const value = 'credential-that-must-stay-private'
            const reply = await encryptSopsSecret(request, value)
            const result = await submit({ requestId: request.id, reply })
            expect(result).toEqual({ status: 'saved' })
            expect(writeSopsSecret).toHaveBeenCalledWith(expect.objectContaining({ file: request.file }), value)
            expect(JSON.stringify(state())).not.toContain(value)
            expect(state().sopsSecretRequests).toEqual({})
            expect(await submit({ requestId: request.id, reply })).toEqual({ status: 'unavailable' })
            expect(writeSopsSecret).toHaveBeenCalledTimes(1)
        } finally {
            manager.close()
        }
    })

    it('rejects cross-request ciphertext and suppresses error details', async () => {
        const { manager, submit } = setup()
        try {
            const first = await manager.request({ file: 'secrets.yaml', key: ['token'] })
            const second = await manager.request({ file: 'secrets.yaml', key: ['token'] })
            expect(await submit({ requestId: second.id, reply: await encryptSopsSecret(first, 'private') })).toEqual({
                status: 'failed'
            })
            expect(writeSopsSecret).not.toHaveBeenCalled()
            vi.mocked(writeSopsSecret).mockRejectedValue(new Error('private value in child error'))
            expect(await submit({ requestId: first.id, reply: await encryptSopsSecret(first, 'private') })).toEqual({
                status: 'failed'
            })
        } finally {
            manager.close()
        }
    })

    it('expires requests, cancels without writing, and removes forms on shutdown', async () => {
        const { manager, state, submit } = setup()
        const request = await manager.request({ file: 'secrets.yaml', key: ['token'] })
        expect(await submit({ requestId: request.id, reply: { action: 'cancel' } })).toEqual({ status: 'canceled' })
        vi.useFakeTimers()
        await manager.request({ file: 'secrets.yaml', key: ['token'] })
        vi.advanceTimersByTime(SOPS_SECRET_TTL_MS)
        expect(state().sopsSecretRequests).toEqual({})
        expect(writeSopsSecret).not.toHaveBeenCalled()
        manager.close()
        await expect(manager.request({ file: 'secrets.yaml', key: ['token'] })).rejects.toThrow()
    })
})
