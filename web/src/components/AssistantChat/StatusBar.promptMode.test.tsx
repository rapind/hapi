import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { StatusBar } from './StatusBar'

describe('fixed steering policy', () => {
    it('does not display a delivery mode or toggle in the status line', () => {
        render(<I18nProvider><StatusBar active thinking agentState={null} agentFlavor="codex" /></I18nProvider>)
        expect(screen.queryByText('Queue')).not.toBeInTheDocument()
        expect(screen.queryByText('Steer')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Switch follow-ups/ })).not.toBeInTheDocument()
    })
})
