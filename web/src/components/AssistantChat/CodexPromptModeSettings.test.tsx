import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { CodexPromptModeSettings } from './CodexPromptModeSettings'

afterEach(cleanup)

describe('Follow-up settings', () => {
    it('saves the chosen mode once and waits for the confirmed selection', async () => {
        let resolve!: () => void
        const change = vi.fn(() => new Promise<void>(done => { resolve = done }))
        const view = (mode: 'queue' | 'steer') => <I18nProvider><CodexPromptModeSettings mode={mode} onChange={change} /></I18nProvider>
        const { rerender } = render(view('queue'))
        fireEvent.click(screen.getByRole('button', { name: 'Queue' }))
        expect(change).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole('button', { name: 'Steer' }))
        expect(change).toHaveBeenCalledWith('steer')
        expect(screen.getByRole('button', { name: 'Steer' })).toBeDisabled()
        fireEvent.click(screen.getByRole('button', { name: 'Steer' }))
        expect(change).toHaveBeenCalledTimes(1)
        expect(screen.getByRole('button', { name: 'Queue' })).toHaveAttribute('aria-pressed', 'true')
        await act(async () => { resolve() })
        rerender(view('steer'))
        expect(screen.getByRole('button', { name: 'Steer' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('shows failed saves without changing the selection and permits retry', async () => {
        const change = vi.fn().mockRejectedValue(new Error('offline'))
        render(<I18nProvider><CodexPromptModeSettings mode="steer" onChange={change} /></I18nProvider>)
        fireEvent.click(screen.getByRole('button', { name: 'Queue' }))
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not change follow-up mode. Try again.'))
        expect(screen.getByRole('button', { name: 'Steer' })).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByRole('button', { name: 'Queue' })).toBeEnabled()
    })
})
