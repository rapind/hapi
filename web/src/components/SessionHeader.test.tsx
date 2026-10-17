import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@/types/api'
import type { ApiClient } from '@/api/client'
import { I18nProvider } from '@/lib/i18n-context'
import { ToastProvider, useToast } from '@/lib/toast-context'
import { resolveSessionHeaderMachineLabel, SessionHeader } from './SessionHeader'

afterEach(() => {
    cleanup()
    localStorage.clear()
})

function ToastMessages() {
    const { toasts } = useToast()
    return <>{toasts.map((toast) => <div key={toast.id}>{toast.title}: {toast.body}</div>)}</>
}

function baseSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        namespace: 'default',
        seq: 0,
        createdAt: 0,
        updatedAt: 0,
        active: true,
        activeAt: 0,
        metadata: { flavor: 'codex', path: '/repo', host: 'machine' },
        metadataVersion: 0,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        model: null,
        modelReasoningEffort: null,
        effort: null,
        serviceTier: null,
        ...overrides
    }
}

function renderHeader(session: Session, extra?: { serviceTier?: string | null; titleSuggestionAvailable?: boolean }) {
    return render(
        <QueryClientProvider client={new QueryClient()}>
            <ToastProvider>
                <I18nProvider>
                    <SessionHeader
                        session={session}
                        serviceTier={extra?.serviceTier}
                        titleSuggestionAvailable={extra?.titleSuggestionAvailable}
                        onBack={vi.fn()}
                        api={null}
                    />
                </I18nProvider>
            </ToastProvider>
        </QueryClientProvider>
    )
}

function renderHeaderWithApi(session: Session, api: ApiClient) {
    return render(
        <QueryClientProvider client={new QueryClient()}>
            <ToastProvider>
                <I18nProvider>
                    <SessionHeader session={session} onBack={vi.fn()} api={api} />
                </I18nProvider>
            </ToastProvider>
        </QueryClientProvider>
    )
}

describe('resolveSessionHeaderMachineLabel', () => {
    it('prefers cached/display labels, then host, then short machine id', () => {
        expect(resolveSessionHeaderMachineLabel(
            baseSession({ metadata: { flavor: 'cursor', path: '/r', host: 'host.local', machineId: 'abc123456789' } }),
            { abc123456789: 'Workstation' }
        )).toBe('Workstation')

        expect(resolveSessionHeaderMachineLabel(
            baseSession({ metadata: { flavor: 'cursor', path: '/r', host: 'host.local', machineId: 'abc123456789' } }),
            {}
        )).toBe('host.local')

        expect(resolveSessionHeaderMachineLabel(
            baseSession({ metadata: { flavor: 'cursor', path: '/r', host: '', machineId: 'abc123456789' } }),
            {}
        )).toBe('abc12345')

        expect(resolveSessionHeaderMachineLabel(
            baseSession({ metadata: { flavor: 'cursor', path: '/r', host: '' } }),
            {}
        )).toBeNull()
    })
})

describe('SessionHeader', () => {
    it('shows only the title even when session metadata is available', () => {
        renderHeader(baseSession({
            metadata: { flavor: 'codex', name: 'Personal chat', path: '/repo', host: 'machine' },
            model: 'gpt-5',
            modelReasoningEffort: 'xhigh',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        }), { serviceTier: 'priority' })
        expect(screen.getByTitle('Personal chat')).toHaveClass('truncate')
        for (const label of ['codex', 'gpt-5', 'reasoning xhigh', 'fast', 'machine']) {
            expect(screen.queryByText(label)).not.toBeInTheDocument()
        }
        expect(screen.queryByTestId('session-header-age')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: /More/ })).toBeInTheDocument()
    })

    it('does not offer manual Codex sync while the HAPI session is active', () => {
        const api = {
            getMachines: vi.fn().mockResolvedValue({ machines: [] }),
            getScratchlist: vi.fn().mockResolvedValue({ entries: [] }),
            syncCodexSession: vi.fn()
        } as unknown as ApiClient

        renderHeaderWithApi(baseSession({
            active: true,
            metadata: { flavor: 'codex', path: '/repo', host: 'machine', codexSessionId: 'codex-thread-1' }
        }), api)

        fireEvent.click(screen.getByRole('button', { name: /More/ }))
        expect(screen.queryByRole('menuitem', { name: /Sync Codex/ })).toBeNull()
    })

    it('keeps manual Codex sync available for an inactive imported thread', () => {
        const api = {
            getMachines: vi.fn().mockResolvedValue({ machines: [] }),
            getScratchlist: vi.fn().mockResolvedValue({ entries: [] }),
            syncCodexSession: vi.fn()
        } as unknown as ApiClient

        renderHeaderWithApi(baseSession({
            active: false,
            metadata: { flavor: 'codex', path: '/repo', host: 'machine', codexSessionId: 'codex-thread-1' }
        }), api)

        fireEvent.click(screen.getByRole('button', { name: /More/ }))
        expect(screen.getByRole('menuitem', { name: /Sync Codex/ })).toBeInTheDocument()
    })

    it('hides title generation when the Hub does not advertise the capability', () => {
        const api = {
            getMachines: vi.fn().mockResolvedValue({ machines: [] }),
            getScratchlist: vi.fn().mockResolvedValue({ entries: [] })
        } as unknown as ApiClient

        render(
            <QueryClientProvider client={new QueryClient()}>
                <ToastProvider>
                    <I18nProvider>
                        <SessionHeader
                            session={baseSession()}
                            onBack={vi.fn()}
                            api={api}
                            titleSuggestionAvailable={false}
                        />
                    </I18nProvider>
                </ToastProvider>
            </QueryClientProvider>
        )

        fireEvent.click(screen.getByTitle('More actions'))
        fireEvent.click(screen.getByRole('menuitem', { name: /Rename/ }))

        expect(screen.queryByRole('button', { name: 'Generate' })).not.toBeInTheDocument()
    })

    it('manually syncs an inactive Pi session through its owning machine', async () => {
        const importPiSessions = vi.fn().mockResolvedValue({
            success: true,
            results: [{ piSessionId: 'pi-native-1', hapiSessionId: 'session-1', action: 'updated', appended: 2 }]
        })
        const api = {
            getMachines: vi.fn().mockResolvedValue({ machines: [] }),
            importPiSessions
        } as unknown as import('@/api/client').ApiClient
        const queryClient = new QueryClient()
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined)
        render(
            <QueryClientProvider client={queryClient}>
                <ToastProvider>
                    <I18nProvider>
                        <SessionHeader
                            session={baseSession({
                                active: false,
                                metadata: {
                                    flavor: 'pi',
                                    path: '/repo',
                                    host: 'machine',
                                    machineId: 'machine-1',
                                    piSessionId: 'pi-native-1'
                                }
                            })}
                            onBack={vi.fn()}
                            api={api}
                        />
                    </I18nProvider>
                </ToastProvider>
            </QueryClientProvider>
        )

        fireEvent.click(screen.getByRole('button', { name: /More/ }))
        fireEvent.click(screen.getByRole('menuitem', { name: /Sync Pi history/ }))

        await waitFor(() => expect(importPiSessions).toHaveBeenCalledWith({
            sessionIds: ['pi-native-1'],
            cwd: '/repo',
            machineId: 'machine-1'
        }))
        expect(invalidateQueries).toHaveBeenCalledTimes(3)
    })

    it('does not offer manual Pi sync while the HAPI session is active', () => {
        const api = {
            getMachines: vi.fn().mockResolvedValue({ machines: [] }),
            importPiSessions: vi.fn()
        } as unknown as import('@/api/client').ApiClient
        render(
            <QueryClientProvider client={new QueryClient()}>
                <ToastProvider>
                    <I18nProvider>
                        <SessionHeader
                            session={baseSession({
                                active: true,
                                metadata: { flavor: 'pi', path: '/repo', host: 'machine', machineId: 'machine-1', piSessionId: 'pi-native-1' }
                            })}
                            onBack={vi.fn()}
                            api={api}
                        />
                    </I18nProvider>
                </ToastProvider>
            </QueryClientProvider>
        )

        fireEvent.click(screen.getByRole('button', { name: /More/ }))
        expect(screen.queryByRole('menuitem', { name: /Sync Pi history/ })).toBeNull()
    })

    it('renders and toggles the agent terminal control', () => {
        const onToggleTerminal = vi.fn()
        render(
            <QueryClientProvider client={new QueryClient()}>
                <ToastProvider>
                    <I18nProvider>
                        <SessionHeader
                            session={baseSession({ metadata: { flavor: 'agy', path: '/repo', host: 'machine' } })}
                            onBack={vi.fn()}
                            onToggleTerminal={onToggleTerminal}
                            terminalActive
                            api={null}
                        />
                    </I18nProvider>
                </ToastProvider>
            </QueryClientProvider>
        )

        const terminal = screen.getByRole('button', { name: 'Terminal' })
        expect(terminal).toHaveAttribute('aria-pressed', 'true')
        terminal.click()
        expect(onToggleTerminal).toHaveBeenCalledOnce()
    })

    it('anchors the action menu to the center of the More actions trigger', () => {
        renderHeader(baseSession())

        const moreButton = screen.getByTitle('More actions')
        const getBoundingClientRect = vi.spyOn(moreButton, 'getBoundingClientRect').mockReturnValue({
            bottom: 64,
            height: 32,
            left: 100,
            right: 132,
            top: 32,
            width: 32,
            x: 100,
            y: 32,
            toJSON: () => ({})
        } as DOMRect)

        try {
            fireEvent.click(moreButton)

            expect(screen.getByRole('menu').parentElement).toHaveStyle({ left: '116px' })
        } finally {
            getBoundingClientRect.mockRestore()
        }
    })

    it('toggles pin state from the header action menu', async () => {
        const setSessionPinMode = vi.fn().mockResolvedValue(undefined)
        const api = {
            getScratchlist: vi.fn().mockResolvedValue({ entries: [] }),
            setSessionPinMode
        } as unknown as ApiClient
        const session: Session = {
            id: 'session-pin',
            namespace: 'default',
            seq: 0,
            createdAt: 0,
            updatedAt: 0,
            active: false,
            activeAt: 0,
            metadata: { flavor: 'codex', path: '/repo', host: 'machine' },
            metadataVersion: 0,
            agentState: null,
            agentStateVersion: 0,
            thinking: false,
            thinkingAt: 0,
            model: null,
            modelReasoningEffort: null,
            effort: null,
            serviceTier: null,
            pinned: false,
            globalPinned: false
        }

        render(
            <QueryClientProvider client={new QueryClient()}>
                <ToastProvider>
                    <I18nProvider>
                        <SessionHeader session={session} onBack={vi.fn()} api={api} />
                    </I18nProvider>
                </ToastProvider>
            </QueryClientProvider>
        )

        fireEvent.click(screen.getByTitle('More actions'))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Pin globally' }))

        await waitFor(() => expect(setSessionPinMode).toHaveBeenCalledWith('session-pin', 'global'))
    })

    it('shows an error toast when toggling the pin fails', async () => {
        const api = {
            getScratchlist: vi.fn().mockResolvedValue({ entries: [] }),
            setSessionPinMode: vi.fn().mockRejectedValue(new Error('Network unavailable'))
        } as unknown as ApiClient

        render(
            <QueryClientProvider client={new QueryClient()}>
                <ToastProvider>
                    <I18nProvider>
                        <SessionHeader session={baseSession({ pinned: false })} onBack={vi.fn()} api={api} />
                        <ToastMessages />
                    </I18nProvider>
                </ToastProvider>
            </QueryClientProvider>
        )

        fireEvent.click(screen.getByTitle('More actions'))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Pin in project' }))

        expect(await screen.findByText('Could not update pin: Network unavailable')).toBeInTheDocument()
    })
})
