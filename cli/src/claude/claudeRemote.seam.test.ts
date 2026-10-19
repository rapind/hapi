import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SDKMessage } from '@/claude/sdk/types'

const spawnMock = vi.fn()
const killProcessMock = vi.fn(async (child: any) => {
    child.killed = true
    child.stdout.end()
    child.emit('close', 0)
    return true
})

vi.mock('node:child_process', () => ({
    ...require('node:child_process'),
    spawn: spawnMock
}))

vi.mock('@/claude/utils/claudeCheckSession', () => ({
    claudeCheckSession: () => true
}))

vi.mock('@/modules/watcher/awaitFileExist', () => ({
    awaitFileExist: async () => true
}))

vi.mock('@/utils/process', () => ({
    isProcessAlive: () => false,
    isWindows: () => false,
    killProcess: async () => true,
    killProcessByChildProcess: killProcessMock
}))

vi.mock('@/utils/bunRuntime', () => ({
    withBunRuntimeEnv: (env: NodeJS.ProcessEnv) => env
}))

function createFakeChild() {
    const child = new EventEmitter() as EventEmitter & {
        stdin: PassThrough
        stdout: PassThrough
        stderr: PassThrough
        killed: boolean
    }

    child.stdin = new PassThrough()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.killed = false
    return child
}

afterEach(() => {
    vi.clearAllMocks()
    delete process.env.HAPI_CLAUDE_PATH
})

describe('claudeRemote/query real seam', () => {
    it('propagates scheduled nextMessage failures through real query prompt plumbing', async () => {
        const child = createFakeChild()
        spawnMock.mockReturnValueOnce(child)
        process.env.HAPI_CLAUDE_PATH = 'claude'
        const { claudeRemote } = await import('./claudeRemote')

        const received: SDKMessage[] = []
        let nextCallCount = 0

        const runPromise = claudeRemote({
            sessionId: 'session-1',
            path: process.cwd(),
            mcpServers: {},
            claudeEnvVars: {},
            claudeArgs: [],
            allowedTools: [],
            hookSettingsPath: '/tmp/hook.json',
            canCallTool: async () => ({ behavior: 'allow', updatedInput: {} }),
            nextMessage: async () => {
                nextCallCount += 1
                if (nextCallCount === 1) {
                    return { message: 'A', mode: { permissionMode: 'default' } }
                }
                throw new Error('next message failed')
            },
            onReady: () => {},
            isAborted: () => false,
            onSessionFound: () => {},
            onMessage: (message) => {
                received.push(message)
            },
            onCompletionEvent: () => {},
            onSessionReset: () => {}
        })

        child.stdout.write(JSON.stringify({
            type: 'assistant',
            message: {
                role: 'assistant',
                content: [{ type: 'text', text: 'A_1' }]
            }
        }) + '\n')
        child.stdout.write(JSON.stringify({
            type: 'result',
            subtype: 'success',
            num_turns: 1,
            total_cost_usd: 0,
            duration_ms: 1,
            duration_api_ms: 1,
            is_error: false,
            session_id: 's-1'
        }) + '\n')

        await expect(runPromise).rejects.toThrow('next message failed')
        expect(received.map((message) => message.type)).toEqual(['assistant', 'result'])
    }, 15_000)
})

it('writes a steer before the current result and acknowledges only when Claude starts it', async () => {
    const child = createFakeChild()
    spawnMock.mockReturnValueOnce(child)
    process.env.HAPI_CLAUDE_PATH = 'claude'
    const { claudeRemote } = await import('./claudeRemote')
    const inputs: Array<{ uuid: string; message: { content: string } }> = []
    child.stdin.on('data', data => {
        for (const line of data.toString().trim().split('\n')) inputs.push(JSON.parse(line))
    })
    const onStarted = vi.fn()
    const onReady = vi.fn()
    let steer: ((text: string, callbacks: { onStarted: () => void; onRejected: () => void; onIndeterminate: () => void }) => boolean) | null = null
    let fetched = false
    const running = claudeRemote({
        sessionId: null, path: process.cwd(), allowedTools: [], hookSettingsPath: '/tmp/hook.json',
        canCallTool: async () => ({ behavior: 'allow', updatedInput: {} }),
        nextMessage: async () => fetched ? null : (fetched = true, { message: 'initial', mode: { permissionMode: 'default' } }),
        onReady, isAborted: () => false, onSessionFound: () => { }, onMessage: () => { },
        onSteerableChange: target => { steer = target }
    })
    try {
        await vi.waitFor(() => expect(inputs).toHaveLength(1))
        expect(inputs[0].uuid).toEqual(expect.any(String))
        child.stdout.write(JSON.stringify({ type: 'command_lifecycle', command_uuid: inputs[0].uuid, state: 'started' }) + '\n')
        await vi.waitFor(() => expect(steer).toBeTypeOf('function'))
        expect(steer!('change direction', { onStarted, onRejected: vi.fn(), onIndeterminate: vi.fn() })).toBe(true)
        await vi.waitFor(() => expect(inputs).toHaveLength(2))
        expect(inputs[1].message.content).toBe('change direction')
        expect(onStarted).not.toHaveBeenCalled()
        child.stdout.write(JSON.stringify({ type: 'command_lifecycle', command_uuid: inputs[1].uuid, state: 'started' }) + '\n')
        await vi.waitFor(() => expect(onStarted).toHaveBeenCalledOnce())
        child.stdout.write(JSON.stringify({ type: 'result', subtype: 'success' }) + '\n')
        await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce())
    } finally {
        child.stdout.end()
        child.emit('close', 0)
        await running
    }
})

async function steeringHarness(reportLifecycle = true) {
    const child = createFakeChild()
    spawnMock.mockReturnValueOnce(child)
    process.env.HAPI_CLAUDE_PATH = 'claude'
    const { claudeRemote } = await import('./claudeRemote')
    const inputs: Array<{ uuid: string; message: { content: string } }> = []
    child.stdin.on('data', data => {
        for (const line of data.toString().trim().split('\n')) inputs.push(JSON.parse(line))
    })
    const onReady = vi.fn()
    const onResult = vi.fn()
    let steer: import('./claudeRemote').SteerFunction | null = null
    let fetched = false
    const running = claudeRemote({
        sessionId: null, path: process.cwd(), allowedTools: [], hookSettingsPath: '/tmp/hook.json',
        canCallTool: async () => ({ behavior: 'allow', updatedInput: {} }),
        nextMessage: async () => fetched ? null : (fetched = true, { message: 'initial', mode: { permissionMode: 'default' } }),
        onReady, onResult, isAborted: () => false, onSessionFound: () => { }, onMessage: () => { },
        onSteerableChange: target => { steer = target }
    })
    const event = (value: Record<string, unknown>) => child.stdout.write(JSON.stringify(value) + '\n')
    await vi.waitFor(() => expect(inputs).toHaveLength(1))
    if (reportLifecycle) {
        event({ type: 'command_lifecycle', command_uuid: inputs[0].uuid, state: 'started' })
        await vi.waitFor(() => expect(steer).toBeTypeOf('function'))
    }
    return {
        child, inputs, onReady, onResult, event, running,
        get steer() { return steer },
        async close() { child.stdout.end(); child.emit('close', 0); await running }
    }
}

it('keeps a queued follow-up busy across results and becomes ready after explicit rejection', async () => {
    const harness = await steeringHarness()
    const callbacks = { onStarted: vi.fn(), onRejected: vi.fn(), onIndeterminate: vi.fn() }
    try {
        harness.steer!('follow-up', callbacks)
        await vi.waitFor(() => expect(harness.inputs).toHaveLength(2))
        const uuid = harness.inputs[1].uuid
        harness.event({ type: 'command_lifecycle', command_uuid: uuid, state: 'queued' })
        harness.event({ type: 'result', subtype: 'success' })
        await vi.waitFor(() => expect(harness.onResult).toHaveBeenCalledOnce())
        expect(harness.onReady).not.toHaveBeenCalled()
        expect(callbacks.onStarted).not.toHaveBeenCalled()
        harness.event({ type: 'command_lifecycle', command_uuid: uuid, state: 'refused' })
        await vi.waitFor(() => expect(callbacks.onRejected).toHaveBeenCalledOnce())
        await vi.waitFor(() => expect(harness.onReady).toHaveBeenCalledOnce())
    } finally {
        await harness.close()
    }
})

it('holds unacknowledged steering as uncertain instead of hanging or replaying it', async () => {
    const harness = await steeringHarness()
    const outcome = harness.running.then(() => null, error => error as Error)
    const callbacks = { onStarted: vi.fn(), onRejected: vi.fn(), onIndeterminate: vi.fn() }
    vi.useFakeTimers()
    try {
        harness.steer!('missing acknowledgment', callbacks)
        await vi.waitFor(() => expect(harness.inputs).toHaveLength(2))
        harness.event({ type: 'command_lifecycle', command_uuid: harness.inputs[1].uuid, state: 'queued' })
        harness.event({ type: 'result', subtype: 'success' })
        await vi.waitFor(() => expect(harness.onResult).toHaveBeenCalledOnce())
        await vi.advanceTimersByTimeAsync(30_000)
        expect(callbacks.onIndeterminate).toHaveBeenCalledOnce()
        expect(callbacks.onStarted).not.toHaveBeenCalled()
        expect(callbacks.onRejected).not.toHaveBeenCalled()
        expect(harness.inputs).toHaveLength(2)
        expect((await outcome)?.message).toMatch(/acknowledge/)
    } finally {
        vi.useRealTimers()
        harness.child.stdout.end()
        harness.child.emit('close', 0)
        await outcome
    }
})

it('finishes a follow-up whose completed acknowledgment arrives after its result', async () => {
    const harness = await steeringHarness()
    const callbacks = { onStarted: vi.fn(), onRejected: vi.fn(), onIndeterminate: vi.fn() }
    try {
        harness.steer!('follow-up', callbacks)
        await vi.waitFor(() => expect(harness.inputs).toHaveLength(2))
        harness.event({ type: 'result', subtype: 'success' })
        await vi.waitFor(() => expect(harness.onResult).toHaveBeenCalledOnce())
        harness.event({ type: 'command_lifecycle', command_uuid: harness.inputs[1].uuid, state: 'completed' })
        await vi.waitFor(() => expect(harness.onReady).toHaveBeenCalledOnce())
        expect(callbacks.onStarted).toHaveBeenCalledOnce()
    } finally { await harness.close() }
})

it('settles every uncertain steer on a crash even if one settlement callback throws', async () => {
    const harness = await steeringHarness()
    const outcome = harness.running.then(() => null, error => error as Error)
    const second = vi.fn()
    harness.steer!('one', { onStarted: vi.fn(), onRejected: vi.fn(), onIndeterminate: () => { throw new Error('settlement failed') } })
    harness.steer!('two', { onStarted: vi.fn(), onRejected: vi.fn(), onIndeterminate: second })
    harness.child.stdout.end()
    harness.child.emit('close', 1)
    expect((await outcome)?.message).toMatch(/exited with code 1/)
    expect(second).toHaveBeenCalledOnce()
})


it('keeps ordinary queued delivery when the CLI cannot prove lifecycle support', async () => {
    const harness = await steeringHarness(false)
    try {
        expect(harness.steer).toBeNull()
        harness.event({ type: 'result', subtype: 'success' })
        await vi.waitFor(() => expect(harness.onReady).toHaveBeenCalledOnce())
        expect(harness.inputs).toHaveLength(1)
    } finally { await harness.close() }
})
