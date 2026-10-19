import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { RPC_METHODS } from '@hapi/protocol/rpcMethods';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { Session } from './session';
import type { EnhancedMode } from './loop';

// claudeRemote() wraps the actual Claude Agent SDK subprocess spawn (the
// external-process boundary for this launcher) -- mock it the same way
// cursorLegacyRemoteLauncher.test.ts mocks `spawn`, rather than mocking any
// internal collaborator.
const claudeRemoteMock = vi.fn();

vi.mock('./claudeRemote', () => ({
    claudeRemote: (opts: unknown) => claudeRemoteMock(opts)
}));

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
        debugLargeJson: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

type RpcHandler = (params: unknown) => Promise<unknown> | unknown;

function makeClient() {
    const handlers = new Map<string, RpcHandler>();
    let agentState: Record<string, unknown> = {};
    return {
        handlers,
        rpcHandlerManager: {
            registerHandler: vi.fn((method: string, handler: RpcHandler) => {
                handlers.set(method, handler);
            })
        },
        updateMetadata: vi.fn(),
        updateAgentState: vi.fn((handler: (state: any) => any) => {
            agentState = handler(agentState);
        }),
        sendSessionEvent: vi.fn(),
        sendClaudeSessionMessage: vi.fn(),
        notePendingHubPromptEcho: vi.fn(),
        discardPendingHubPromptEcho: vi.fn(),
        discardPendingHubPromptEchoText: vi.fn(),
        sendAgentMessage: vi.fn(),
        keepAlive: vi.fn(),
        setSteerDeliveryState: vi.fn(async (_ids: string[], _state: 'queued' | 'dispatching') => true),
        emitSteerIndeterminate: vi.fn(),
        emitMessagesConsumed: vi.fn()
    };
}

function makeSession(queue: MessageQueue2<EnhancedMode>, client: ReturnType<typeof makeClient>): Session {
    return new Session({
        api: {} as never,
        client: client as never,
        path: '/tmp/project',
        logPath: '/tmp/log',
        sessionId: null,
        mcpServers: {},
        messageQueue: queue,
        onModeChange: vi.fn(),
        mode: 'remote',
        startedBy: 'runner',
        startingMode: 'remote',
        hookSettingsPath: '/tmp/hooks.json'
    });
}


beforeEach(() => {
    claudeRemoteMock.mockReset();
    process.stdin.isTTY = false;
    process.stdout.isTTY = false;
    process.env.CLAUDE_REMOTE_RESPAWN_BACKOFF_MS = '0';
});
afterEach(() => { delete process.env.CLAUDE_REMOTE_RESPAWN_BACKOFF_MS; });

it('reserves automatic steering until Claude acknowledges consumption', async () => {
    const queue = new MessageQueue2<EnhancedMode>(mode => JSON.stringify(mode));
    const client = makeClient();
    const session = makeSession(queue, client);
    const mode: EnhancedMode = { permissionMode: 'default' };
    queue.push('initial', mode, 'initial');
    let exposed = false;
    let result: unknown;
    let consumedBeforeStart = false;
    let callbacks: import('./claudeRemote').SteerCallbacks | undefined;
    claudeRemoteMock.mockImplementation(async (opts) => {
        try {
            await opts.nextMessage();
            if (!opts.onSteerableChange) return;
            opts.onSteerableChange((_text: string, handlers: import('./claudeRemote').SteerCallbacks) => {
                callbacks = handlers;
                return true;
            });
            exposed = typeof session.steerQueuedMessage === 'function';
            queue.push('new instruction', mode, 'steer');
            result = await session.steerQueuedMessage?.('steer');
            consumedBeforeStart = client.emitMessagesConsumed.mock.calls.some(([ids]) => ids.includes('steer'));
            await callbacks?.onStarted();
            opts.onResult?.();
        } finally {
            void client.handlers.get(RPC_METHODS.Switch)?.(undefined);
        }
    });
    const { claudeRemoteLauncher } = await import('./claudeRemoteLauncher');
    try {
        await claudeRemoteLauncher(session);
        expect(exposed).toBe(true);
        expect(result).toEqual({ steered: true });
        expect(consumedBeforeStart).toBe(false);
        expect(client.setSteerDeliveryState).toHaveBeenCalledWith(['steer'], 'dispatching');
        expect(client.emitMessagesConsumed).toHaveBeenCalledWith(['steer'], { steered: true });
        expect(session.steerQueuedMessage).toBeNull();
    } finally { session.stopKeepAlive(); }
});

it('keeps uncertain writes out of automatic replay and restores explicitly rejected writes', async () => {
    const queue = new MessageQueue2<EnhancedMode>(mode => JSON.stringify(mode));
    const client = makeClient();
    const session = makeSession(queue, client);
    const mode: EnhancedMode = { permissionMode: 'default' };
    queue.push('initial', mode, 'initial');
    claudeRemoteMock.mockImplementation(async (opts) => {
        try {
            await opts.nextMessage();
            const pending = new Map<string, import('./claudeRemote').SteerCallbacks>();
            opts.onSteerableChange((text: string, callbacks: import('./claudeRemote').SteerCallbacks) => {
                pending.set(text, callbacks); return true;
            });
            queue.push('uncertain', mode, 'uncertain');
            await session.steerQueuedMessage!('uncertain');
            queue.push('refused', mode, 'refused');
            await session.steerQueuedMessage!('refused');
            opts.onResult();
            await pending.get('uncertain')!.onIndeterminate();
            await pending.get('refused')!.onRejected();
        } finally { void client.handlers.get(RPC_METHODS.Switch)?.(undefined); }
    });
    const { claudeRemoteLauncher } = await import('./claudeRemoteLauncher');
    try {
        await claudeRemoteLauncher(session);
        expect(client.emitSteerIndeterminate).toHaveBeenCalledWith(['uncertain']);
        expect(queue.peekByLocalId('uncertain')).toBeNull();
        expect(queue.peekByLocalId('initial')).toBeNull();
        expect(queue.peekByLocalId('refused')?.message).toBe('refused');
        expect(client.setSteerDeliveryState).toHaveBeenCalledWith(['refused'], 'queued');
        expect(client.emitMessagesConsumed).not.toHaveBeenCalledWith(['uncertain'], { steered: true });
    } finally { session.stopKeepAlive(); }
});

it('consumes an acknowledged steer even when flushing earlier output fails', async () => {
    const queue = new MessageQueue2<EnhancedMode>(mode => JSON.stringify(mode));
    const client = makeClient();
    const session = makeSession(queue, client);
    const mode: EnhancedMode = { permissionMode: 'default' };
    queue.push('initial', mode, 'initial');
    let startError: unknown;
    claudeRemoteMock.mockImplementation(async (opts) => {
        try {
            await opts.nextMessage();
            let callbacks: import('./claudeRemote').SteerCallbacks | undefined;
            opts.onSteerableChange((_text: string, handlers: import('./claudeRemote').SteerCallbacks) => {
                callbacks = handlers; return true;
            });
            queue.push('steer', mode, 'steer');
            await session.steerQueuedMessage!('steer');
            client.sendClaudeSessionMessage.mockImplementationOnce(() => { throw new Error('output write failed'); });
            opts.onMessage({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'earlier output' }] } });
            try { await callbacks!.onStarted(); } catch (error) { startError = error; }
            await callbacks!.onIndeterminate();
            opts.onResult();
        } finally { void client.handlers.get(RPC_METHODS.Switch)?.(undefined); }
    });
    const { claudeRemoteLauncher } = await import('./claudeRemoteLauncher');
    try {
        await claudeRemoteLauncher(session);
        expect(startError).toEqual(new Error('output write failed'));
        expect(client.emitMessagesConsumed).toHaveBeenCalledWith(['steer'], { steered: true });
        expect(client.emitSteerIndeterminate).not.toHaveBeenCalled();
        expect(queue.peekByLocalId('steer')).toBeNull();
    } finally { session.stopKeepAlive(); }
});

it('does not steer a later turn after persisting dispatch state yields execution', async () => {
    const queue = new MessageQueue2<EnhancedMode>(mode => JSON.stringify(mode));
    const client = makeClient();
    const session = makeSession(queue, client);
    const mode: EnhancedMode = { permissionMode: 'default' };
    queue.push('initial', mode, 'initial');
    const oldTurn = vi.fn(() => true);
    const newTurn = vi.fn(() => true);
    let result: unknown;
    claudeRemoteMock.mockImplementation(async (opts) => {
        try {
            await opts.nextMessage();
            opts.onSteerableChange(oldTurn);
            queue.push('instruction', mode, 'steer');
            const pending = session.steerQueuedMessage!('steer');
            opts.onSteerableChange(null);
            opts.onSteerableChange(newTurn);
            result = await pending;
            opts.onResult();
        } finally { void client.handlers.get(RPC_METHODS.Switch)?.(undefined); }
    });
    const { claudeRemoteLauncher } = await import('./claudeRemoteLauncher');
    try {
        await claudeRemoteLauncher(session);
        expect(result).toEqual({ steered: false, error: 'Active turn changed' });
        expect(oldTurn).not.toHaveBeenCalled();
        expect(newTurn).not.toHaveBeenCalled();
        expect(queue.peekByLocalId('steer')?.message).toBe('instruction');
    } finally { session.stopKeepAlive(); }
});

it.each([
    { text: '/compact', mode: { permissionMode: 'default' } as EnhancedMode },
    { text: 'instruction', mode: { permissionMode: 'plan' } as EnhancedMode },
])('defers control commands and incompatible modes: $text $mode', async ({ text, mode }) => {
    const queue = new MessageQueue2<EnhancedMode>(mode => JSON.stringify(mode));
    const client = makeClient();
    const session = makeSession(queue, client);
    queue.push('initial', { permissionMode: 'default' }, 'initial');
    const steer = vi.fn(() => true);
    claudeRemoteMock.mockImplementation(async (opts) => {
        try {
            await opts.nextMessage();
            opts.onSteerableChange(steer);
            queue.push(text, mode, 'steer');
            await session.steerQueuedMessage!('steer');
            opts.onResult();
        } finally { void client.handlers.get(RPC_METHODS.Switch)?.(undefined); }
    });
    const { claudeRemoteLauncher } = await import('./claudeRemoteLauncher');
    try {
        await claudeRemoteLauncher(session);
        expect(steer).not.toHaveBeenCalled();
        expect(client.setSteerDeliveryState).not.toHaveBeenCalled();
        expect(queue.peekByLocalId('steer')?.message).toBe(text);
    } finally { session.stopKeepAlive(); }
});

it('preserves arrival order when delivery-state acknowledgments finish out of order', async () => {
    const queue = new MessageQueue2<EnhancedMode>(mode => JSON.stringify(mode));
    const client = makeClient();
    const session = makeSession(queue, client);
    const mode: EnhancedMode = { permissionMode: 'default' };
    queue.push('initial', mode, 'initial');
    let releaseFirst!: (ok: boolean) => void;
    const firstState = new Promise<boolean>(resolve => { releaseFirst = resolve; });
    client.setSteerDeliveryState.mockImplementation(async (ids: string[], state: string) =>
        ids[0] === 'one' && state === 'dispatching' ? firstState : true);
    const sent: string[] = [];
    let beforeRelease: string[] = [];
    const callbacks: Array<import('./claudeRemote').SteerCallbacks> = [];
    claudeRemoteMock.mockImplementation(async (opts) => {
        try {
            await opts.nextMessage();
            opts.onSteerableChange((text: string, handlers: import('./claudeRemote').SteerCallbacks) => {
                sent.push(text); callbacks.push(handlers); return true;
            });
            queue.push('one', mode, 'one');
            const one = session.steerQueuedMessage!('one');
            queue.push('two', mode, 'two');
            const two = session.steerQueuedMessage!('two');
            await new Promise<void>(resolve => setImmediate(resolve));
            beforeRelease = [...sent];
            releaseFirst(true);
            await Promise.all([one, two]);
            for (const pending of callbacks) await pending.onStarted();
            opts.onResult();
        } finally { void client.handlers.get(RPC_METHODS.Switch)?.(undefined); }
    });
    const { claudeRemoteLauncher } = await import('./claudeRemoteLauncher');
    try {
        await claudeRemoteLauncher(session);
        expect(beforeRelease).toEqual([]);
        expect(sent).toEqual(['one', 'two']);
    } finally { session.stopKeepAlive(); }
});
