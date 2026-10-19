import { AssistantRuntimeProvider, useLocalRuntime, type AttachmentAdapter } from '@assistant-ui/react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { HappyComposer } from './HappyComposer'
import { createAttachmentAdapter } from '@/lib/attachmentAdapter'

function Preview(props: {
    onVoiceToggle: () => void
    attachmentAdapter?: AttachmentAdapter
    autocompleteSuggestions?: (query: string) => Promise<[]>
}) {
    const runtime = useLocalRuntime({ async *run() {} }, { adapters: { attachments: props.attachmentAdapter } })
    return (
        <AssistantRuntimeProvider runtime={runtime}>
            <I18nProvider>
                <HappyComposer
                    onVoiceToggle={props.onVoiceToggle}
                    onSchedule={vi.fn()}
                    autocompleteSuggestions={props.autocompleteSuggestions}
                />
            </I18nProvider>
        </AssistantRuntimeProvider>
    )
}

afterEach(() => {
    cleanup()
    localStorage.clear()
    vi.restoreAllMocks()
})

describe('Personal composer', () => {
    it.each(['0', '1'])('keeps the empty input blank with rich mentions=%s', (richMentions) => {
        localStorage.setItem('hapi.composer.richMentions', richMentions)
        const onVoiceToggle = vi.fn()
        render(<Preview onVoiceToggle={onVoiceToggle} />)
        const input = screen.getByRole('textbox')
        expect(input.tagName).toBe('TEXTAREA')
        expect(document.querySelector('[contenteditable]')).toBeNull()
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

    it('keeps status indicators in the bottom toolbar outside the input card', () => {
        render(<Preview onVoiceToggle={vi.fn()} />)
        const toolbar = screen.getByTestId('composer-toolbar-items')
        const card = screen.getByTestId('composer-card')
        expect(toolbar).toContainElement(screen.getByTestId('composer-status'))
        expect(card).not.toContainElement(toolbar)
        expect(card).toContainElement(screen.getByRole('textbox'))
        expect(card).toContainElement(screen.getByRole('button', { name: 'Send' }))
    })

    it('enables Send after typing a draft', () => {
        localStorage.setItem('hapi.composer.richMentions', '0')
        render(<Preview onVoiceToggle={vi.fn()} />)
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A typed message' } })
        expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    })

    it('keeps @ text literal without requesting mention suggestions', async () => {
        const suggestions = vi.fn(async (): Promise<[]> => [])
        render(<Preview onVoiceToggle={vi.fn()} autocompleteSuggestions={suggestions} />)
        const input = screen.getByRole('textbox') as HTMLTextAreaElement
        await act(async () => {
            fireEvent.change(input, { target: { value: '@another-session' } })
        })
        expect(input.value).toBe('@another-session')
        expect(suggestions).not.toHaveBeenCalled()
    })

    it('uploads an attachment selected through the attachment button', async () => {
        const uploadFile = vi.fn(async () => ({ success: true, path: '/uploads/note.txt' }))
        const file = new File(['attachment text'], 'note.txt', { type: 'text/plain' })
        vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
            fireEvent.change(this, { target: { files: [file] } })
        })
        const adapter = createAttachmentAdapter({ uploadFile, deleteUploadFile: vi.fn() } as never, 'session-1')
        render(<Preview onVoiceToggle={vi.fn()} attachmentAdapter={adapter} />)
        fireEvent.click(screen.getByRole('button', { name: /attach/i }))
        await waitFor(() =>
            expect(uploadFile).toHaveBeenCalledWith('session-1', 'note.txt', btoa('attachment text'), 'text/plain')
        )
        expect(await screen.findByText('note.txt')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    })

    it('uploads images pasted into the plain textarea', async () => {
        const uploadFile = vi.fn(async () => ({ success: true, path: '/uploads/paste.png' }))
        const adapter = createAttachmentAdapter({ uploadFile, deleteUploadFile: vi.fn() } as never, 'session-1')
        render(<Preview onVoiceToggle={vi.fn()} attachmentAdapter={adapter} />)
        fireEvent.paste(screen.getByRole('textbox'), {
            clipboardData: { files: [new File(['image'], 'paste.png', { type: 'image/png' })] }
        })
        await waitFor(() =>
            expect(uploadFile).toHaveBeenCalledWith('session-1', 'paste.png', btoa('image'), 'image/png')
        )
        expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    })
})
