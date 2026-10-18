import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { SessionSummary } from '@/types/api'
import { I18nProvider } from '@/lib/i18n-context'
import { ToastProvider } from '@/lib/toast-context'
import { SessionList } from './SessionList'

afterEach(() => cleanup())

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
    return render(
        <QueryClientProvider client={new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            }
        })}>
            <ToastProvider>
                <I18nProvider>{children}</I18nProvider>
            </ToastProvider>
        </QueryClientProvider>
    )
}

function renderSessionList(sessions: SessionSummary[]) {
    return renderWithProviders(
        <SessionList
            sessions={sessions}
            selectedSessionId={null}
            onSelect={vi.fn()}
            onNewSession={vi.fn()}
            onRefresh={vi.fn()}
            isLoading={false}
            renderHeader={false}
            api={null}
        />
    )
}

describe('Personal sidebar controls', () => {
    beforeEach(() => localStorage.clear())

    it('keeps new chat and removes search, calendar and read controls', () => {
        renderWithProviders(
            <SessionList
                sessions={[makeSession({ id: 'unread', updatedAt: 2000, metadata: { path: '/work/repo', name: 'Unread chat' } })]}
                onSelect={vi.fn()}
                onNewSession={vi.fn()}
                onRefresh={vi.fn()}
                isLoading={false}
                api={null}
                headerActions={<button type="button">Settings</button>}
            />
        )
        expect(screen.getByRole('button', { name: 'New Session' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
        expect(screen.queryByTestId('session-list-search')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /mark all|unread only|date range/i })).not.toBeInTheDocument()
        expect(screen.queryByTitle('Copy: /work/repo')).not.toBeInTheDocument()
    })

    it('initially shows every chat regardless of preview and active-only preferences', () => {
        localStorage.setItem('hapi-session-preview-limit', '3')
        localStorage.setItem('hapi-show-active-sessions-only', 'true')
        const sessions = Array.from({ length: 25 }, (_, index) => makeSession({
            id: `chat-${index}`,
            updatedAt: index + 1,
            metadata: { path: '/work/repo', name: `Chat number ${index}` },
        }))
        renderSessionList(sessions)
        for (let index = 0; index < sessions.length; index++) {
            expect(screen.getByRole('button', { name: new RegExp(`Chat number ${index} `) })).toBeVisible()
        }
        expect(screen.queryByRole('button', { name: /expand|collapse/i })).not.toBeInTheDocument()
    })
})
