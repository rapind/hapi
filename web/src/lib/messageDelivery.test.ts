import { describe, expect, it } from 'vitest'
import {
    consumeComposerSendIntent,
    getRestoredComposerSendIntent,
    getRetryDeliveryMode,
    resolveMessageDeliveryMode,
} from './messageDelivery'

describe('consumeComposerSendIntent', () => {
    it('consumes an explicit queue request exactly once', () => {
        const ref = { current: 'queue' as const }

        expect(consumeComposerSendIntent(ref)).toBe('queue')
        expect(ref.current).toBe('default')
        expect(consumeComposerSendIntent(ref)).toBe('default')
    })

    it('defaults safely when no composer ref is present', () => {
        expect(consumeComposerSendIntent()).toBe('default')
    })
})

describe('retry delivery safety', () => {
    it('preserves queue and downgrades steer or missing legacy provenance to queue', () => {
        expect(getRetryDeliveryMode('queue')).toBe('queue')
        expect(getRetryDeliveryMode('steer')).toBe('queue')
        expect(getRetryDeliveryMode(undefined)).toBe('queue')
        expect(getRestoredComposerSendIntent('queue')).toBe('queue')
        expect(getRestoredComposerSendIntent('steer')).toBe('queue')
        expect(getRestoredComposerSendIntent(undefined)).toBe('queue')
    })
})

describe('resolveMessageDeliveryMode', () => {
    const base = {
        metadata: { flavor: 'codex' as const },
        isSessionThinking: true,
        intent: 'default' as const,
    }

    it.each(['claude', 'codex', 'pi', 'cursor'] as const)('always steers fresh active %s sends', flavor => {
        expect(resolveMessageDeliveryMode({ ...base, metadata: { flavor } })).toBe('steer')
    })

    it('does not let an old queue intent disable steering for a fresh send', () => {
        expect(resolveMessageDeliveryMode({ ...base, intent: 'queue' })).toBe('steer')
    })

    it.each([
        { isSessionThinking: false },
        { scheduledAt: 1 },
        { routesToScratchlist: true },
        { metadata: { flavor: 'kimi' as const } },
        { metadata: { flavor: 'cursor' as const, cursorSessionProtocol: 'stream-json' as const } },
    ])('defers idle, scheduled, scratchlist and unsupported sends: %j', override => {
        expect(resolveMessageDeliveryMode({ ...base, ...override })).toBe('queue')
    })
})
