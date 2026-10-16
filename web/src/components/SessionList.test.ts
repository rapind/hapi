import { describe, expect, it } from 'vitest'
import { toSessionSummary, type Session } from '@hapi/protocol'
import type { SessionSummary } from '@/types/api'
import {
    deduplicateSessionsByAgentId,
    bucketRunningSessions,
    getSessionTimeRange,
    getPullRefreshIndicatorRotation,
    getPullToRefreshState,
    getSessionDedupKey,
    getWorktreeSessionLabel,
    isSidebarEmptySessionStub,
    normalizeSearch,
    prepareSidebarSessions,
    sessionMatchesQuery,
    sessionMatchesTimeRange,
    shouldShowPinnedDivider,
    shouldShowSessionInSidebar
} from './SessionList'

function makeSession(overrides: Partial<SessionSummary> & { id: string }): SessionSummary {
    return {
        active: false,
        thinking: false,
        activeAt: 0,
        updatedAt: 0,
        metadata: null,
        metadataVersion: 0,
        agentStateVersion: 0,
        todosUpdatedAt: 0,
        todoProgress: null,
        pendingRequestsCount: 0,
        pendingRequestKinds: [],
        pendingRequests: [],
        backgroundTaskCount: 0,
        futureScheduledMessageCount: 0,
        nextScheduledAt: null,
        model: null,
        effort: null,
        ...overrides
    }
}

describe('getWorktreeSessionLabel', () => {
    it('returns the worktree name for sessions grouped under a shared repository', () => {
        const session = makeSession({
            id: 'worktree-session',
            metadata: {
                path: '/work/hapi-worktrees/fix-resume',
                worktree: {
                    basePath: '/work/hapi',
                    branch: 'fix/resume',
                    name: 'fix-resume',
                    worktreePath: '/work/hapi-worktrees/fix-resume'
                }
            }
        })

        expect(getWorktreeSessionLabel(session)).toBe('fix-resume')
    })

    it('does not add a subtitle to ordinary sessions', () => {
        const session = makeSession({
            id: 'ordinary-session',
            metadata: { path: '/work/hapi' }
        })

        expect(getWorktreeSessionLabel(session)).toBeNull()
    })

    it('falls back to the worktree directory name when metadata name is blank', () => {
        const session = makeSession({
            id: 'windows-worktree-session',
            metadata: {
                path: 'C:\\work\\hapi-worktrees\\fix-resume',
                worktree: {
                    basePath: 'C:\\work\\hapi',
                    branch: 'fix/resume',
                    name: '   ',
                    worktreePath: 'C:\\work\\hapi-worktrees\\fix-resume\\'
                }
            }
        })

        expect(getWorktreeSessionLabel(session)).toBe('fix-resume')
    })
})

describe('shouldShowPinnedDivider', () => {
    it('shows one divider at the visible pinned-to-unpinned boundary', () => {
        const sessions = [
            makeSession({ id: 'pinned-a', pinned: true }),
            makeSession({ id: 'pinned-b', pinned: true }),
            makeSession({ id: 'regular-a' }),
            makeSession({ id: 'regular-b' })
        ]

        expect(sessions.map((_, index) => shouldShowPinnedDivider(sessions, index)))
            .toEqual([false, false, true, false])
    })

    it('does not show a divider when all visible sessions have the same pin state', () => {
        expect(shouldShowPinnedDivider([
            makeSession({ id: 'a' }),
            makeSession({ id: 'b' })
        ], 1)).toBe(false)
    })
})

describe('deduplicateSessionsByAgentId', () => {
    it('deduplicates sessions with the same agentSessionId', () => {
        const sessions = [
            makeSession({ id: 'a', metadata: { path: '/p', agentSessionId: 'thread-1' }, updatedAt: 100 }),
            makeSession({ id: 'b', metadata: { path: '/p', agentSessionId: 'thread-1' }, updatedAt: 200 })
        ]
        const result = deduplicateSessionsByAgentId(sessions)
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('b') // more recent wins
    })

    it('keeps active session over inactive duplicate', () => {
        const sessions = [
            makeSession({ id: 'a', active: true, metadata: { path: '/p', agentSessionId: 'thread-1' }, updatedAt: 100 }),
            makeSession({ id: 'b', metadata: { path: '/p', agentSessionId: 'thread-1' }, updatedAt: 200 })
        ]
        const result = deduplicateSessionsByAgentId(sessions)
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('a') // active wins despite older updatedAt
    })

    it('prefers selected session among inactive duplicates', () => {
        const sessions = [
            makeSession({ id: 'a', metadata: { path: '/p', agentSessionId: 'thread-1' }, updatedAt: 100 }),
            makeSession({ id: 'b', metadata: { path: '/p', agentSessionId: 'thread-1' }, updatedAt: 200 })
        ]
        const result = deduplicateSessionsByAgentId(sessions, 'a')
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('a') // selected wins despite older updatedAt
    })

    it('preserves a pinned session when deduplicating by recency', () => {
        const sessions = [
            makeSession({ id: 'pinned', pinned: true, metadata: { path: '/p', agentSessionId: 'thread-1' }, updatedAt: 100 }),
            makeSession({ id: 'recent', metadata: { path: '/p', agentSessionId: 'thread-1' }, updatedAt: 200 })
        ]
        const result = deduplicateSessionsByAgentId(sessions)
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('pinned')
    })

    it('keeps the selected inactive session ahead of a pinned duplicate', () => {
        const sessions = [
            makeSession({ id: 'selected', metadata: { path: '/p', agentSessionId: 'thread-1' }, updatedAt: 100 }),
            makeSession({ id: 'pinned', pinned: true, metadata: { path: '/p', agentSessionId: 'thread-1' }, updatedAt: 200 })
        ]
        const result = deduplicateSessionsByAgentId(sessions, 'selected')
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('selected')
    })

    it('active always wins over selected inactive', () => {
        const sessions = [
            makeSession({ id: 'a', metadata: { path: '/p', agentSessionId: 'thread-1' }, updatedAt: 200 }),
            makeSession({ id: 'b', active: true, metadata: { path: '/p', agentSessionId: 'thread-1' }, updatedAt: 100 })
        ]
        const result = deduplicateSessionsByAgentId(sessions, 'a')
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('b') // active wins over selected
    })

    it('passes through sessions without agentSessionId', () => {
        const sessions = [
            makeSession({ id: 'a', metadata: { path: '/p' } }),
            makeSession({ id: 'b', metadata: { path: '/p', agentSessionId: 'thread-1' } }),
            makeSession({ id: 'c', metadata: null })
        ]
        const result = deduplicateSessionsByAgentId(sessions)
        expect(result).toHaveLength(3)
    })

    it('deduplicates cursor sessions by summary agentSessionId', () => {
        const sessions = [
            makeSession({
                id: 'a',
                active: true,
                metadata: { path: '/p', flavor: 'cursor', agentSessionId: 'acp-thread-1' },
                updatedAt: 100
            }),
            makeSession({
                id: 'b',
                metadata: { path: '/p', flavor: 'cursor', agentSessionId: 'acp-thread-1' },
                updatedAt: 200
            })
        ]
        const result = deduplicateSessionsByAgentId(sessions)
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('a')
    })

    it('deduplicates independently across different agentSessionIds', () => {
        const sessions = [
            makeSession({ id: 'a', metadata: { path: '/p', agentSessionId: 'thread-1' }, updatedAt: 100 }),
            makeSession({ id: 'b', metadata: { path: '/p', agentSessionId: 'thread-1' }, updatedAt: 200 }),
            makeSession({ id: 'c', metadata: { path: '/p', agentSessionId: 'thread-2' }, updatedAt: 100 }),
            makeSession({ id: 'd', metadata: { path: '/p', agentSessionId: 'thread-2' }, updatedAt: 200 })
        ]
        const result = deduplicateSessionsByAgentId(sessions)
        expect(result).toHaveLength(2)
        expect(result.map(s => s.id).sort()).toEqual(['b', 'd'])
    })

    it('does not dedupe across flavors sharing the same flattened agentSessionId', () => {
        const sessions = [
            makeSession({
                id: 'codex',
                metadata: { path: '/p', flavor: 'codex', agentSessionId: 'stale-shared-id' },
                updatedAt: 100
            }),
            makeSession({
                id: 'cursor',
                metadata: { path: '/p', flavor: 'cursor', agentSessionId: 'stale-shared-id' },
                updatedAt: 200
            })
        ]

        expect(getSessionDedupKey(sessions[0])).toBe('codex:stale-shared-id')
        expect(getSessionDedupKey(sessions[1])).toBe('cursor:stale-shared-id')
        expect(deduplicateSessionsByAgentId(sessions).map(session => session.id).sort()).toEqual(['codex', 'cursor'])
        expect(prepareSidebarSessions(sessions).map(session => session.id).sort()).toEqual(['codex', 'cursor'])
    })
})


describe('isSidebarEmptySessionStub', () => {
    it('treats inactive sessions without agent id or title as stubs', () => {
        expect(isSidebarEmptySessionStub(makeSession({
            id: 'stub',
            metadata: { path: '/work/hapi' }
        }))).toBe(true)
    })

    it('does not treat active sessions as stubs', () => {
        expect(isSidebarEmptySessionStub(makeSession({
            id: 'live',
            active: true,
            metadata: { path: '/work/hapi' }
        }))).toBe(false)
    })

    it('does not treat sessions with agentSessionId as stubs', () => {
        expect(isSidebarEmptySessionStub(makeSession({
            id: 'resume',
            metadata: { path: '/work/hapi', agentSessionId: 'thread-1' }
        }))).toBe(false)
    })

    it('does not treat sessions with summary text as stubs', () => {
        expect(isSidebarEmptySessionStub(makeSession({
            id: 'titled',
            metadata: { path: '/work/hapi', summary: { text: 'Fix sidebar' } }
        }))).toBe(false)
    })
})

describe('prepareSidebarSessions', () => {
    it('hides inactive empty stubs but keeps real sessions', () => {
        const sessions = [
            makeSession({ id: 'stub', metadata: { path: '/work/hapi' } }),
            makeSession({
                id: 'real',
                metadata: { path: '/work/hapi', agentSessionId: 'thread-1', summary: { text: 'Real chat' } }
            })
        ]

        const result = prepareSidebarSessions(sessions)
        expect(result.map(session => session.id)).toEqual(['real'])
    })

    it('keeps an archived Pi session with a native session id and no title', () => {
        const piSession: Session = {
            id: 'archived-pi',
            namespace: 'default',
            seq: 1,
            createdAt: 50,
            active: false,
            activeAt: 0,
            updatedAt: 100,
            metadata: {
                path: '/work/hapi',
                host: 'local',
                flavor: 'pi',
                piSessionId: 'pi-session-1',
                lifecycleState: 'archived'
            },
            metadataVersion: 1,
            agentState: null,
            agentStateVersion: 0,
            thinking: false,
            thinkingAt: 0,
            model: null,
            modelReasoningEffort: null,
            effort: null,
            serviceTier: null
        }

        const summary = toSessionSummary(piSession)

        expect(summary.metadata?.agentSessionId).toBe('pi-session-1')
        expect(prepareSidebarSessions([summary]).map(session => session.id)).toEqual(['archived-pi'])
    })

    it('keeps the selected inactive stub visible', () => {
        const sessions = [
            makeSession({ id: 'stub', metadata: { path: '/work/hapi' } }),
            makeSession({
                id: 'real',
                metadata: { path: '/work/hapi', agentSessionId: 'thread-1' }
            })
        ]

        const result = prepareSidebarSessions(sessions, 'stub')
        expect(result.map(session => session.id).sort()).toEqual(['real', 'stub'])
    })

    it('keeps a pinned inactive stub visible', () => {
        const sessions = [
            makeSession({ id: 'pinned-stub', pinned: true, metadata: { path: '/work/hapi' } }),
            makeSession({ id: 'stub', metadata: { path: '/work/hapi' } })
        ]

        const result = prepareSidebarSessions(sessions)
        expect(result.map(session => session.id)).toEqual(['pinned-stub'])
    })

    it('deduplicates before filtering stubs', () => {
        const sessions = [
            makeSession({ id: 'stub', metadata: { path: '/work/hapi' } }),
            makeSession({
                id: 'older',
                metadata: { path: '/work/hapi', agentSessionId: 'thread-1' },
                updatedAt: 100
            }),
            makeSession({
                id: 'newer',
                metadata: { path: '/work/hapi', agentSessionId: 'thread-1' },
                updatedAt: 200
            })
        ]

        const result = prepareSidebarSessions(sessions)
        expect(result.map(session => session.id)).toEqual(['newer'])
    })
})

describe('shouldShowSessionInSidebar', () => {
    it('always shows active, selected, and pinned sessions', () => {
        const stub = makeSession({ id: 'stub', metadata: { path: '/work/hapi' } })
        expect(shouldShowSessionInSidebar(stub)).toBe(false)
        expect(shouldShowSessionInSidebar(stub, 'stub')).toBe(true)
        expect(shouldShowSessionInSidebar({ ...stub, active: true })).toBe(true)
        expect(shouldShowSessionInSidebar({ ...stub, pinned: true })).toBe(true)
    })
})

describe('session list search helpers', () => {
    it('normalizes whitespace and case before filtering', () => {
        const session = makeSession({
            id: 'session-1',
            metadata: {
                path: '/work/hapi',
                name: 'Fix Bot Review',
                flavor: 'codex',
                machineId: 'machine-1'
            }
        })

        expect(normalizeSearch('  BOT  ')).toBe('bot')
        expect(sessionMatchesQuery(session, normalizeSearch('bot review'), 'desktop')).toBe(true)
        expect(sessionMatchesQuery(session, normalizeSearch('desktop'), 'desktop')).toBe(true)
        expect(sessionMatchesQuery(session, normalizeSearch('missing'), 'desktop')).toBe(false)
    })

    it('matches the displayed worktree label and worktree path', () => {
        const session = makeSession({
            id: 'worktree-session',
            metadata: {
                path: '/work/hapi',
                worktree: {
                    basePath: '/work/hapi',
                    branch: 'fix/sidebar-search',
                    name: 'sidebar-search',
                    worktreePath: '/work/hapi-worktrees/fix-sidebar-search'
                }
            }
        })

        expect(sessionMatchesQuery(session, normalizeSearch('sidebar-search'), 'desktop')).toBe(true)
        expect(sessionMatchesQuery(session, normalizeSearch('hapi-worktrees'), 'desktop')).toBe(true)
    })

    it('supports complete wildcard patterns without changing plain text matching', () => {
        const session = makeSession({
            id: 'session-123',
            metadata: {
                path: '/work/hapi',
                name: 'Fix Bot Review',
                flavor: 'codex'
            }
        })

        expect(sessionMatchesQuery(session, normalizeSearch('*bot*'), 'desktop')).toBe(true)
        expect(sessionMatchesQuery(session, normalizeSearch('Fix*Review'), 'desktop')).toBe(true)
        expect(sessionMatchesQuery(session, normalizeSearch('session-???'), 'desktop')).toBe(true)
        expect(sessionMatchesQuery(session, normalizeSearch('bot*review'), 'desktop')).toBe(false)
        expect(sessionMatchesQuery(session, normalizeSearch('bot review'), 'desktop')).toBe(true)
    })
})

describe('session list time filter helpers', () => {
    it('treats the selected end date as inclusive in local time', () => {
        const range = getSessionTimeRange('2026-07-01', '2026-07-18')
        expect(range).toEqual({
            start: new Date(2026, 6, 1).getTime(),
            end: new Date(2026, 6, 19).getTime()
        })
        expect(sessionMatchesTimeRange(makeSession({ id: 'inside', updatedAt: new Date(2026, 6, 18, 23, 59).getTime() }), range)).toBe(true)
        expect(sessionMatchesTimeRange(makeSession({ id: 'outside', updatedAt: new Date(2026, 6, 19).getTime() }), range)).toBe(false)
    })

    it('does not filter until both dates are selected', () => {
        expect(getSessionTimeRange('', '')).toBeNull()
        expect(getSessionTimeRange('2026-07-01', '')).toBeNull()
    })
})

describe('getPullToRefreshState', () => {
    it('requires a deliberate pull past the trigger distance', () => {
        expect(getPullToRefreshState(15)).toBe('idle')
        expect(getPullToRefreshState(16)).toBe('pulling')
        expect(getPullToRefreshState(63)).toBe('pulling')
        expect(getPullToRefreshState(64)).toBe('ready')
    })
})

describe('getPullRefreshIndicatorRotation', () => {
    it('turns the pull indicator upward once refresh is ready', () => {
        expect(getPullRefreshIndicatorRotation('pulling')).toBe(0)
        expect(getPullRefreshIndicatorRotation('ready')).toBe(180)
    })
})

describe('bucketRunningSessions', () => {
    // tiann/hapi#1820: a keepalive-only session stays `active` (its socket is
    // genuinely up) but must not read as a ready session in the list.
    const idle = makeSession({
        id: 'idle-1',
        active: true,
        updatedAt: 10,
        metadata: { path: '/p', host: 'h', lifecycleState: 'idle' } as SessionSummary['metadata']
    })
    const quiet = makeSession({
        id: 'quiet-1',
        active: true,
        updatedAt: 20,
        metadata: { path: '/p', host: 'h', lifecycleState: 'running' } as SessionSummary['metadata']
    })

    it('separates keepalive-only sessions from quiet-but-ready ones', () => {
        const buckets = bucketRunningSessions([idle, quiet], true)

        expect(buckets.idle.map((s) => s.id)).toEqual(['idle-1'])
        expect(buckets.active.map((s) => s.id)).toEqual(['quiet-1'])
        // Exactly one bucket each — the row must not be duplicated.
        expect(buckets.working).toHaveLength(0)
        expect(buckets.pending).toHaveLength(0)
    })

    it('moves a session out of idle once it is working again', () => {
        const woken = { ...idle, thinking: true }
        const buckets = bucketRunningSessions([woken, quiet], true)

        expect(buckets.idle).toHaveLength(0)
        expect(buckets.working.map((s) => s.id)).toEqual(['idle-1'])
    })

    it('keeps real work ahead of the idle mark', () => {
        // An idle-marked session that picked up a background task or a pending
        // request belongs in its work bucket, not in idle.
        expect(bucketRunningSessions([{ ...idle, backgroundTaskCount: 1 }], true).working).toHaveLength(1)
        expect(bucketRunningSessions([{ ...idle, pendingRequestsCount: 1 }], true).pending).toHaveLength(1)
    })

    it('ignores disconnected and pinned sessions', () => {
        const buckets = bucketRunningSessions([
            { ...idle, active: false },
            { ...idle, id: 'idle-pinned', pinned: true }
        ], true)

        expect(buckets.idle).toHaveLength(0)
    })
})
