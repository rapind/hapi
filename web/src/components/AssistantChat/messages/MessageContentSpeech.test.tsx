import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { HTMLAttributes, PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { HappyAssistantMessage } from './AssistantMessage'
import { HappyUserMessage } from './UserMessage'

const speak = vi.fn()
const state = {
    message: {
        id: 'message',
        role: 'assistant',
        createdAt: new Date(),
        content: [] as Array<{ type: string; text?: string; toolName?: string; args?: unknown; result?: unknown }>,
        metadata: { custom: {} as { kind?: string } }
    },
    thread: { messages: [] as unknown[], isRunning: false }
}

vi.mock('@assistant-ui/react', () => ({
    useAuiState: (selector: (value: typeof state) => unknown) => selector(state),
    MessagePrimitive: {
        Root: ({ children, ...props }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) => (
            <div {...props}>{children}</div>
        ),
        Content: () => null
    }
}))
vi.mock('@/components/AssistantChat/context', () => ({
    useHappyChatContext: () => ({ metadata: {}, disabled: false }),
    useOptionalHappyChatContext: () => undefined
}))
vi.mock('@/hooks/useSessionSummaryInChat', () => ({ useSessionSummaryInChat: () => false }))
vi.mock('@/components/CliOutputBlock', () => ({ CliOutputBlock: ({ text }: { text: string }) => <pre>{text}</pre> }))

beforeEach(() => {
    localStorage.clear()
    speak.mockReset()
    state.message.role = 'assistant'
    state.message.metadata.custom = {}
    state.message.content = [{ type: 'text', text: 'The update is ready.' }]
    vi.stubGlobal('speechSynthesis', { speak, cancel: vi.fn() })
    vi.stubGlobal(
        'SpeechSynthesisUtterance',
        class {
            constructor(public text: string) {}
        }
    )
})
afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
})

describe('conversational message speech', () => {
    it.each(['assistant', 'user'])('does not offer read aloud for %s terminal output', (role) => {
        state.message.role = role
        state.message.metadata.custom.kind = 'cli-output'
        state.message.content = [{ type: 'text', text: 'git status --short\nM src/index.ts' }]
        render(<I18nProvider>{role === 'assistant' ? <HappyAssistantMessage /> : <HappyUserMessage />}</I18nProvider>)
        expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'Read aloud' })).toBeNull()
    })

    it('speaks assistant prose without tool calls or their results', () => {
        state.message.content.push({
            type: 'tool-call',
            toolName: 'exec_command',
            args: { cmd: 'git status' },
            result: 'M src/index.ts'
        })
        render(
            <I18nProvider>
                <HappyAssistantMessage />
            </I18nProvider>
        )
        fireEvent.click(screen.getByRole('button', { name: 'Read aloud' }))
        expect(speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'The update is ready.' }))
    })
})
