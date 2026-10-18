import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionSummary } from '@/types/api'
import { I18nProvider } from '@/lib/i18n-context'
import { ToastProvider } from '@/lib/toast-context'
import { SessionList } from './SessionList'

beforeEach(() => localStorage.clear())
afterEach(cleanup)

function session(id: string, createdAt: number, path = '/work/project'): SessionSummary {
    return {
        id, createdAt, updatedAt: createdAt, activeAt: 0, active: false, thinking: false,
        metadata: { name: `Chat ${id}`, path, machineId: 'machine' },
        metadataVersion: 0, agentStateVersion: 0, todosUpdatedAt: 0, todoProgress: null,
        pendingRequestsCount: 0, pendingRequestKinds: [], pendingRequests: [], backgroundTaskCount: 0,
        futureScheduledMessageCount: 0, nextScheduledAt: null, model: null, effort: null,
    }
}

function list(sessions: SessionSummary[]) {
    return <QueryClientProvider client={new QueryClient()}><ToastProvider><I18nProvider>
        <SessionList sessions={sessions} selectedSessionId={null} api={null} renderHeader={false}
            onSelect={vi.fn()} onNewSession={vi.fn()} onRefresh={vi.fn()} isLoading={false} />
    </I18nProvider></ToastProvider></QueryClientProvider>
}

function chatOrder() {
    return screen.getAllByRole('button').filter(button => button.classList.contains('session-list-item'))
        .map(button => button.querySelector('[title^="Chat "]')?.getAttribute('title'))
}

describe('Stable sidebar order', () => {
    it('keeps newest-created chats first despite activity and connection changes', () => {
        const older = session('older', 100)
        const newer = session('newer', 200)
        const { rerender } = render(list([older, newer]))
        expect(chatOrder()).toEqual(['Chat newer', 'Chat older'])
        rerender(list([newer, { ...older, updatedAt: 999, active: true, thinking: true, pendingRequestsCount: 1 }]))
        expect(chatOrder()).toEqual(['Chat newer', 'Chat older'])
        rerender(list([{ ...older, updatedAt: 2000 }, newer]))
        expect(chatOrder()).toEqual(['Chat newer', 'Chat older'])
    })

    it('uses a deterministic order for equal creation dates across reloads', () => {
        const alpha = session('alpha', 100)
        const beta = session('beta', 100)
        const first = render(list([beta, alpha]))
        expect(chatOrder()).toEqual(['Chat alpha', 'Chat beta'])
        first.unmount()
        render(list([{ ...beta, updatedAt: 900 }, alpha]))
        expect(chatOrder()).toEqual(['Chat alpha', 'Chat beta'])
    })

    it('keeps project order and collapsed folders stable when an older project becomes active', () => {
        const older = session('older', 100, '/work/older')
        const newer = session('newer', 200, '/work/newer')
        const { rerender } = render(list([older, newer]))
        const projectOrder = () => screen.getAllByRole('button').filter(button => button.hasAttribute('aria-expanded'))
            .map(button => button.textContent)
        expect(projectOrder()).toEqual(['work/newer', 'work/older'])
        fireEvent.click(screen.getByRole('button', { name: 'work/newer', expanded: true }))
        rerender(list([{ ...older, updatedAt: 999, active: true, pendingRequestsCount: 1 }, newer]))
        expect(projectOrder()).toEqual(['work/newer', 'work/older'])
        expect(screen.getByRole('button', { name: 'work/newer', expanded: false })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Chat newer/ })).not.toBeInTheDocument()
    })

    it('retains explicit pin priority and creation order within each section', () => {
        const older = { ...session('older', 100), pinned: true }
        const newer = { ...session('newer', 200), pinned: true }
        const unpinned = session('unpinned', 300)
        const global = { ...session('global', 50), globalPinned: true }
        const { rerender } = render(list([older, newer, unpinned, global]))
        expect(chatOrder()).toEqual(['Chat global', 'Chat newer', 'Chat older', 'Chat unpinned'])
        rerender(list([{ ...older, updatedAt: 999 }, global, unpinned, newer]))
        expect(chatOrder()).toEqual(['Chat global', 'Chat newer', 'Chat older', 'Chat unpinned'])
    })
})
