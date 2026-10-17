import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { SessionSummary } from '@/types/api'
import { I18nProvider } from '@/lib/i18n-context'
import { ToastProvider } from '@/lib/toast-context'
import { SessionList } from './SessionList'


afterEach(() => {
    cleanup()
    localStorage.removeItem('hapi-session-preview-limit')
    localStorage.removeItem('hapi-pin-in-progress-sessions')
})

function makeSession(overrides: Partial<SessionSummary> & { id: string }): SessionSummary {
    return {
        active: false,
        thinking: false,
        activeAt: 0,
        createdAt: 0,
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

function renderWithProviders(children: ReactNode) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        }
    })

    return render(
        <QueryClientProvider client={queryClient}>
            <ToastProvider>
                <I18nProvider>
                    {children}
                </I18nProvider>
            </ToastProvider>
        </QueryClientProvider>
    )
}

describe('SessionList directory action', () => {
    it('starts a new session with the project machine and directory', () => {
        const onNewSessionInDirectory = vi.fn()
        const session = makeSession({
            id: 'session-1',
            updatedAt: Date.now(),
            metadata: {
                path: '/home/ubuntu',
                machineId: 'machine-1',
                name: 'Greeting',
                flavor: 'codex',
            }
        })

        renderWithProviders(
            <SessionList
                sessions={[session]}
                selectedSessionId={null}
                onSelect={vi.fn()}
                onNewSession={vi.fn()}
                onNewSessionInDirectory={onNewSessionInDirectory}
                onRefresh={vi.fn()}
                isLoading={false}
                renderHeader={false}
                api={null}
                machineLabelsById={{ 'machine-1': 'Mint' }}
            />
        )

        fireEvent.click(screen.getByRole('button', { name: 'New session in this directory' }))

        expect(onNewSessionInDirectory).toHaveBeenCalledWith({
            machineId: 'machine-1',
            directory: '/home/ubuntu',
        })
    })

    it('keeps the sticky project header opaque and aligned with the list viewport', () => {
        const session = makeSession({
            id: 'session-1',
            updatedAt: Date.now(),
            metadata: {
                path: '/home/ubuntu',
                name: 'Greeting',
                flavor: 'codex',
            }
        })

        renderWithProviders(
            <SessionList
                sessions={[session]}
                selectedSessionId={null}
                onSelect={vi.fn()}
                onNewSession={vi.fn()}
                onRefresh={vi.fn()}
                isLoading={false}
                renderHeader={false}
                api={null}
            />
        )

        const projectHeader = screen.getByTitle('/home/ubuntu')
        expect(projectHeader).toHaveClass('bg-[var(--app-bg)]')
        expect(projectHeader).toHaveClass('hover:bg-[var(--app-secondary-bg)]')
        expect(projectHeader).not.toHaveClass('hover:bg-[var(--app-subtle-bg)]')

        const listContent = projectHeader.parentElement?.parentElement
        expect(listContent).not.toHaveClass('pt-1')

    })

    it('hides the directory action for sessions without path metadata', () => {
        renderWithProviders(
            <SessionList
                sessions={[makeSession({ id: 'session-without-path' })]}
                selectedSessionId={null}
                onSelect={vi.fn()}
                onNewSession={vi.fn()}
                onNewSessionInDirectory={vi.fn()}
                onRefresh={vi.fn()}
                isLoading={false}
                renderHeader={false}
                api={null}
            />
        )

        expect(screen.queryByRole('button', { name: 'New session in this directory' })).toBeNull()
    })
})

describe('SessionList action menu parity', () => {
    it.each([
        ['running', true],
        ['closed', false]
    ] as const)('offers conversation export for a %s session', (_label, active) => {
        const session = makeSession({
            id: `session-${active ? 'running' : 'closed'}`,
            active,
            updatedAt: Date.now(),
            metadata: {
                path: '/home/ubuntu',
                machineId: 'machine-1',
                name: active ? 'Running session' : 'Closed session',
                flavor: 'codex'
            }
        })

        renderWithProviders(
            <SessionList
                sessions={[session]}
                selectedSessionId={null}
                onSelect={vi.fn()}
                onNewSession={vi.fn()}
                onRefresh={vi.fn()}
                isLoading={false}
                renderHeader={false}
                api={null}
            />
        )

        fireEvent.contextMenu(screen.getByRole('button', { name: new RegExp(active ? 'Running session' : 'Closed session') }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Export conversation' }))

        expect(screen.getByRole('dialog')).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Export conversation' })).toBeInTheDocument()
    })
})

describe('SessionList collapse behavior', () => {
    function renderSessionList(sessions: SessionSummary[], selectedSessionId: string | null = 'session-running') {
        return (
            <QueryClientProvider client={new QueryClient({
                defaultOptions: {
                    queries: { retry: false },
                    mutations: { retry: false },
                }
            })}>
                <ToastProvider>
                    <I18nProvider>
                        <SessionList
                            sessions={sessions}
                            selectedSessionId={selectedSessionId}
                            onSelect={vi.fn()}
                            onNewSession={vi.fn()}
                            onRefresh={vi.fn()}
                            isLoading={false}
                            renderHeader={false}
                            api={null}
                        />
                    </I18nProvider>
                </ToastProvider>
            </QueryClientProvider>
        )
    }

    function getProjectPanel(): Element {
        const header = screen.getByTitle('/work/hapi')
        const panel = header.nextElementSibling
        if (!panel) {
            throw new Error('Expected project collapse panel')
        }
        return panel
    }


    it('leaves active sessions in directory groups when pin-in-progress is off', () => {
        const sessions = [
            makeSession({
                id: 'session-running',
                active: true,
                thinking: true,
                updatedAt: 100,
                metadata: { path: '/work/hapi', name: 'Running task', flavor: 'codex' },
            }),
            makeSession({
                id: 'session-idle',
                updatedAt: 50,
                metadata: { path: '/work/other', name: 'Other task', flavor: 'codex' },
            }),
        ]
        render(renderSessionList(sessions, null))

        expect(screen.queryByTitle('In progress')).toBeNull()
        expect(screen.getByTitle('/work/hapi')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Running task/ })).toBeInTheDocument()
        // Active group stays expanded by default so the project glance is immediate.
        expect(screen.getByTitle('/work/hapi').nextElementSibling).toBeVisible()
    })

    it('pins active sessions into In progress when the preference is on', () => {
        localStorage.setItem('hapi-pin-in-progress-sessions', 'true')
        const sessions = [
            makeSession({
                id: 'session-running',
                active: true,
                thinking: true,
                updatedAt: 100,
                metadata: { path: '/work/hapi', name: 'Running task', flavor: 'codex' },
            }),
            makeSession({
                id: 'session-idle',
                updatedAt: 50,
                metadata: { path: '/work/hapi', name: 'Idle task', flavor: 'codex' },
            }),
        ]
        render(renderSessionList(sessions, null))

        expect(screen.getByTitle('In progress')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Running task/ })).toBeInTheDocument()
        // Directory group retains only the inactive session.
        expect(getProjectPanel().getAttribute('data-open')).toBeNull()
    })

    it('keeps project-pinned active sessions in their project group when the preference is on', () => {
        localStorage.setItem('hapi-pin-in-progress-sessions', 'true')
        const sessions = [
            makeSession({
                id: 'session-pinned-running',
                active: true,
                thinking: true,
                pinned: true,
                updatedAt: 100,
                metadata: { path: '/work/hapi', name: 'Pinned running task', flavor: 'codex' },
            }),
            makeSession({
                id: 'session-idle',
                updatedAt: 50,
                metadata: { path: '/work/hapi', name: 'Idle task', flavor: 'codex' },
            }),
        ]
        render(renderSessionList(sessions, null))

        expect(screen.queryByTitle('In progress')).toBeNull()
        expect(getProjectPanel()).toBeVisible()
        expect(screen.getByRole('button', { name: /Pinned running task/ })).toBeInTheDocument()
    })

    it('keeps In progress above project-pin groups; project pin stays first inside its group', () => {
        localStorage.setItem('hapi-pin-in-progress-sessions', 'true')
        const sessions = [
            makeSession({
                id: 'session-global',
                globalPinned: true,
                updatedAt: 300,
                metadata: { path: '/work/global', name: 'Global pin', flavor: 'codex' },
            }),
            makeSession({
                id: 'session-project-pin',
                pinned: true,
                updatedAt: 100,
                metadata: { path: '/work/pinned-project', name: 'Project pin', flavor: 'codex' },
            }),
            makeSession({
                id: 'session-project-idle',
                updatedAt: 200,
                metadata: { path: '/work/pinned-project', name: 'Project idle', flavor: 'codex' },
            }),
            makeSession({
                id: 'session-floater',
                active: true,
                thinking: true,
                updatedAt: 250,
                metadata: { path: '/work/other', name: 'Unpinned floater', flavor: 'codex' },
            }),
            makeSession({
                id: 'session-idle-other',
                updatedAt: 50,
                metadata: { path: '/work/other', name: 'Other idle', flavor: 'codex' },
            }),
        ]
        render(renderSessionList(sessions, null))

        const globalSection = screen.getByTitle('Pinned sessions')
        const inProgress = screen.getByTitle('In progress')
        const projectPinGroup = screen.getByTitle('/work/pinned-project')
        const otherGroup = screen.getByTitle('/work/other')
        const projectPinRow = screen.getByRole('button', { name: /Project pin/ })
        const projectIdleRow = screen.getByRole('button', { name: /Project idle/ })

        // Section order: global pin band → In progress → directory groups
        // (project-pin groups may sort first among groups, but never above In progress).
        expect(globalSection).toAppearBefore(inProgress)
        expect(inProgress).toAppearBefore(projectPinGroup)
        expect(projectPinGroup).toAppearBefore(otherGroup)
        // Intra-group: project pin stays first inside its folder.
        expect(projectPinRow).toAppearBefore(projectIdleRow)
        expect(screen.getByRole('button', { name: /Unpinned floater/ })).toBeInTheDocument()
    })

    it('does not label quiet active sessions as Idle', () => {
        const sessions = [
            makeSession({
                id: 'session-quiet',
                active: true,
                updatedAt: 100,
                metadata: { path: '/work/hapi', name: 'Quiet task', flavor: 'codex' },
            }),
        ]
        render(renderSessionList(sessions, null))

        expect(screen.getByRole('button', { name: /Quiet task/ })).toBeInTheDocument()
        expect(screen.queryByText('Idle')).toBeNull()
        expect(screen.queryByTitle('Idle')).toBeNull()
    })

    it('keeps quiet active sessions in the Active section when pin-in-progress is on', () => {
        localStorage.setItem('hapi-pin-in-progress-sessions', 'true')
        const sessions = [
            makeSession({
                id: 'session-running',
                active: true,
                thinking: true,
                updatedAt: 100,
                metadata: { path: '/work/hapi', name: 'Running task', flavor: 'codex' },
            }),
            makeSession({
                id: 'session-quiet',
                active: true,
                updatedAt: 90,
                metadata: { path: '/work/hapi', name: 'Quiet task', flavor: 'codex' },
            }),
            makeSession({
                id: 'session-pending',
                active: true,
                pendingRequestsCount: 1,
                updatedAt: 80,
                metadata: { path: '/work/other', name: 'Pending task', flavor: 'codex' },
            }),
        ]
        render(renderSessionList(sessions, null))

        expect(screen.getByTitle('In progress')).toBeInTheDocument()
        expect(screen.getByText(/Running \(1\)/)).toBeInTheDocument()
        expect(screen.getByText(/pending \(1\)/)).toBeInTheDocument()
        // Quiet active sessions float into their own Active section (finished
        // executing, still connected) instead of falling into directory groups.
        expect(screen.getByTitle('Active sessions')).toBeInTheDocument()
        expect(screen.getByText(/Active \(1\)/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Quiet task/ })).toBeInTheDocument()
        // The directory header survives as an action-only header (copy-path /
        // new-session-in-directory) even though every row floated.
        expect(screen.getByTitle('/work/hapi')).toBeInTheDocument()
        expect(screen.getByTitle('/work/hapi').nextElementSibling).toBeNull()
        expect(screen.getByTitle('/work/other')).toBeInTheDocument()
        expect(screen.getByTitle('/work/other').nextElementSibling).toBeNull()
    })

    it('keeps new-session-in-directory actions for projects whose rows all floated', () => {
        localStorage.setItem('hapi-pin-in-progress-sessions', 'true')
        const onNewSessionInDirectory = vi.fn()
        const sessions = [
            makeSession({
                id: 'session-quiet',
                active: true,
                updatedAt: 100,
                metadata: { path: '/work/hapi', machineId: 'machine-1', name: 'Quiet task', flavor: 'codex' },
            }),
        ]
        renderWithProviders(
            <SessionList
                sessions={sessions}
                selectedSessionId={null}
                onSelect={vi.fn()}
                onNewSession={vi.fn()}
                onRefresh={vi.fn()}
                isLoading={false}
                renderHeader={false}
                api={null}
                onNewSessionInDirectory={onNewSessionInDirectory}
            />
        )

        expect(screen.getByTitle('Active sessions')).toBeInTheDocument()
        // The project header survives as an action-only header.
        const header = screen.getByTitle('/work/hapi')
        expect(header.nextElementSibling).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: 'New session in this directory' }))
        expect(onNewSessionInDirectory).toHaveBeenCalledWith({
            machineId: 'machine-1',
            directory: '/work/hapi',
        })
    })


    it('lets project folders collapse and reopen', () => {
        const sessions = [makeSession({ id: 'foldable', metadata: { path: '/work/hapi', name: 'Folder chat', flavor: 'codex' } })]
        render(renderSessionList(sessions, null))

        const toggle = screen.getByRole('button', { name: 'work/hapi', expanded: true })
        fireEvent.click(toggle)
        expect(toggle).toHaveAttribute('aria-expanded', 'false')
        expect(getProjectPanel()).not.toBeVisible()
        expect(screen.queryByRole('button', { name: /Folder chat/ })).not.toBeInTheDocument()

        fireEvent.click(toggle)
        expect(toggle).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByRole('button', { name: /Folder chat/ })).toBeVisible()
    })

    it('keeps an inactive project-pinned group expanded with no selection', () => {
        const sessions = [
            makeSession({
                id: 'session-pinned',
                pinned: true,
                updatedAt: 100,
                metadata: { path: '/work/hapi', name: 'Pinned task', flavor: 'codex' },
            }),
            makeSession({
                id: 'session-idle',
                updatedAt: 50,
                metadata: { path: '/work/hapi', name: 'Idle task', flavor: 'codex' },
            }),
        ]
        render(renderSessionList(sessions, null))

        expect(getProjectPanel()).toBeVisible()
        expect(screen.getByRole('button', { name: /Pinned task/ })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Idle task/ })).toBeInTheDocument()
    })








})
