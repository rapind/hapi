import { describe, expect, it } from 'vitest'
import { getComposerEscapeAction } from './HappyComposer'

describe('getComposerEscapeAction', () => {
    it('clears suggestions before aborting, and aborts before collapsing', () => {
        expect(
            getComposerEscapeAction({
                hasSuggestions: true,
                threadIsRunning: true,
                isExpanded: true
            })
        ).toBe('clearSuggestions')
        expect(
            getComposerEscapeAction({
                hasSuggestions: false,
                threadIsRunning: true,
                isExpanded: true
            })
        ).toBe('abort')
        expect(
            getComposerEscapeAction({
                hasSuggestions: false,
                threadIsRunning: false,
                isExpanded: true
            })
        ).toBe('collapse')
    })
})
