import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { MessageSpeechButton } from './MessageSpeechButton'

type Spoken = { text: string; onend: () => void; onerror: () => void }
let spoken: Spoken[]
const speak = vi.fn()
const cancel = vi.fn()

function mount(text = 'Hello world.') {
    return render(
        <I18nProvider>
            <MessageSpeechButton text={text} />
        </I18nProvider>
    )
}

beforeEach(() => {
    localStorage.clear()
    spoken = []
    speak.mockReset().mockImplementation((utterance) => spoken.push(utterance))
    cancel.mockReset()
    vi.stubGlobal('speechSynthesis', { speak, cancel })
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

describe('message read aloud', () => {
    it('switches messages without overlap or stale completion events stopping the new message', () => {
        mount('First message.')
        mount('Second message.')
        fireEvent.click(screen.getAllByRole('button', { name: 'Read aloud' })[0])
        const first = spoken[0]
        fireEvent.click(screen.getByRole('button', { name: 'Read aloud' }))
        expect(spoken.map((utterance) => utterance.text)).toEqual(['First message.', 'Second message.'])
        expect(screen.getAllByRole('button', { name: 'Stop reading' })).toHaveLength(1)
        act(() => {
            first.onend()
            first.onerror()
        })
        expect(screen.getByRole('button', { name: 'Stop reading' })).toBeTruthy()
        expect(screen.queryByRole('status')).toBeNull()
        act(() => spoken[1].onend())
        expect(screen.getAllByRole('button', { name: 'Read aloud' })).toHaveLength(2)
    })

    it('reads a long answer in order and stops queuing after cancellation', () => {
        const text = 'A complete sentence with useful details. '.repeat(30).trim()
        mount(text)
        fireEvent.click(screen.getByRole('button', { name: 'Read aloud' }))
        for (let index = 0; index < spoken.length; index++) {
            act(() => spoken[index].onend())
        }
        expect(spoken.length).toBeGreaterThan(1)
        expect(spoken.every((utterance) => utterance.text.length <= 240)).toBe(true)
        expect(spoken.map((utterance) => utterance.text).join(' ')).toBe(text)
        fireEvent.click(screen.getByRole('button', { name: 'Read aloud' }))
        const last = spoken.at(-1)!
        const count = spoken.length
        fireEvent.click(screen.getByRole('button', { name: 'Stop reading' }))
        act(() => last.onend())
        expect(spoken).toHaveLength(count)
    })

    it('reports browser speech errors and allows retry', () => {
        mount()
        fireEvent.click(screen.getByRole('button', { name: 'Read aloud' }))
        act(() => spoken[0].onerror())
        expect(screen.getByRole('status')).toHaveTextContent('Could not read this message. Try again.')
        fireEvent.click(screen.getByRole('button', { name: 'Read aloud' }))
        expect(screen.queryByRole('status')).toBeNull()
        expect(spoken).toHaveLength(2)
    })

    it('handles a synchronous speech failure without leaving playback stuck', () => {
        speak.mockImplementationOnce(() => {
            throw new Error('audio unavailable')
        })
        mount()
        fireEvent.click(screen.getByRole('button', { name: 'Read aloud' }))
        expect(screen.getByRole('status')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Read aloud' }))
        expect(screen.getByRole('button', { name: 'Stop reading' })).toBeTruthy()
    })

    it('stops speech when its message is unmounted', () => {
        const view = mount()
        fireEvent.click(screen.getByRole('button', { name: 'Read aloud' }))
        cancel.mockClear()
        view.unmount()
        expect(cancel).toHaveBeenCalledTimes(1)
    })

    it('hides the action when browser speech is unavailable or the message has no readable text', () => {
        vi.stubGlobal('speechSynthesis', undefined)
        mount()
        expect(screen.queryByRole('button')).toBeNull()
        vi.stubGlobal('speechSynthesis', { speak, cancel })
        mount('---\n\n[link]: https://example.com')
        expect(screen.queryByRole('button')).toBeNull()
    })

    it('reads Markdown structure without link targets, image URLs or formatting markers', () => {
        mount(
            '# Heading\n\n- **First** &amp; `second`\n- [Third](https://example.com)\n\n![A diagram](https://example.com/image.png)\n\n```sh\necho hello\n```'
        )
        fireEvent.click(screen.getByRole('button', { name: 'Read aloud' }))
        expect(spoken[0].text).toBe('Heading First & second Third A diagram echo hello')
    })
})
