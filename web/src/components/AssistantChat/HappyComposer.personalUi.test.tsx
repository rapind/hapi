import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { HappyComposer } from './HappyComposer'

function Preview(props: { onVoiceToggle: () => void }) {
    const runtime = useLocalRuntime({ async *run() {} })
    return (
        <AssistantRuntimeProvider runtime={runtime}>
            <I18nProvider>
                <HappyComposer
                    onVoiceToggle={props.onVoiceToggle}
                    onTerminal={vi.fn()}
                    onSchedule={vi.fn()}
                />
            </I18nProvider>
        </AssistantRuntimeProvider>
    )
}

afterEach(() => {
    cleanup()
    localStorage.clear()
})

describe('Personal composer', () => {
    it.each(['0', '1'])('keeps the empty input blank with rich mentions=%s', (richMentions) => {
        localStorage.setItem('hapi.composer.richMentions', richMentions)
        const onVoiceToggle = vi.fn()
        render(<Preview onVoiceToggle={onVoiceToggle} />)
        const input = screen.getByRole('textbox')
        expect(input.getAttribute('placeholder') ?? '').toBe('')
        expect(input.textContent).toBe('')
        expect(screen.queryByText(/Type a message|rich text composer/i)).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
        for (const label of [/dictate|voice/i, /expand message editor/i, /terminal/i, /schedule send/i]) {
            expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
        }
        fireEvent.keyDown(input, { key: 'D', ctrlKey: true, shiftKey: true })
        expect(onVoiceToggle).not.toHaveBeenCalled()
    })

    it('enables Send after typing a draft', () => {
        localStorage.setItem('hapi.composer.richMentions', '0')
        render(<Preview onVoiceToggle={vi.fn()} />)
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A typed message' } })
        expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    })
})
