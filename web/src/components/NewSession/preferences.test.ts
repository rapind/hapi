import { beforeEach, describe, expect, it } from 'vitest'
import {
    loadPreferredAgent,
    loadPreferredLaunchSettings,
    resolvePreferredLaunchSettings,
    savePreferredAgent,
    savePreferredLaunchSettings,
} from './preferences'

describe('NewSession preferences', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it('remembers Codex follow-up delivery per machine and ignores it for other agents', () => {
        const settings = {
            model: 'auto', cursorSelectedBase: 'auto', effort: 'auto',
            modelReasoningEffort: 'default', codexPromptMode: 'steer'
        } as const
        savePreferredLaunchSettings('one', 'codex', settings)
        savePreferredLaunchSettings('one', 'claude', settings)
        expect(loadPreferredLaunchSettings('one', 'codex')?.codexPromptMode).toBe('steer')
        expect(
            resolvePreferredLaunchSettings('codex', loadPreferredLaunchSettings('one', 'codex')).codexPromptMode
        ).toBe('steer')
        expect(loadPreferredLaunchSettings('two', 'codex')).toBeNull()
        expect(loadPreferredLaunchSettings('one', 'claude')?.codexPromptMode).toBeUndefined()
    })

    it('loads defaults when storage is empty', () => {
        expect(loadPreferredAgent()).toBe('claude')
    })

    it('loads saved values from storage', () => {
        localStorage.setItem('hapi:newSession:agent', 'codex')
        localStorage.setItem('hapi:newSession:yolo', 'true')

        expect(loadPreferredAgent()).toBe('codex')
    })

    it('falls back to default agent on invalid stored value', () => {
        localStorage.setItem('hapi:newSession:agent', 'unknown-agent')

        expect(loadPreferredAgent()).toBe('claude')
    })

    it('persists new values to storage', () => {
        savePreferredAgent('gemini')

        expect(localStorage.getItem('hapi:newSession:agent')).toBe('gemini')
    })

    it('round-trips launch settings per machine and agent', () => {
        savePreferredLaunchSettings('machine-1', 'codex', {
            model: 'gpt-5.6-sol',
            cursorSelectedBase: 'auto',
            effort: 'auto',
            modelReasoningEffort: 'xhigh',
        })
        savePreferredLaunchSettings('machine-1', 'claude', {
            model: 'opus',
            cursorSelectedBase: 'auto',
            effort: 'high',
            modelReasoningEffort: 'default'
        })
        savePreferredLaunchSettings('machine-2', 'codex', {
            model: 'gpt-5.6-terra',
            cursorSelectedBase: 'auto',
            effort: 'auto',
            modelReasoningEffort: 'max'
        })

        expect(loadPreferredLaunchSettings('machine-1', 'codex')).toEqual({
            model: 'gpt-5.6-sol',
            cursorSelectedBase: 'auto',
            effort: 'auto',
            modelReasoningEffort: 'xhigh',
        })
        expect(loadPreferredLaunchSettings('machine-1', 'claude')).toEqual({
            model: 'opus',
            cursorSelectedBase: 'auto',
            effort: 'high',
            modelReasoningEffort: 'default'
        })
        expect(loadPreferredLaunchSettings('machine-2', 'codex')).toEqual({
            model: 'gpt-5.6-terra',
            cursorSelectedBase: 'auto',
            effort: 'auto',
            modelReasoningEffort: 'max'
        })
    })

    it('returns null when no launch settings were saved for the target', () => {
        savePreferredLaunchSettings('machine-1', 'codex', {
            model: 'gpt-5.6-sol',
            cursorSelectedBase: 'auto',
            effort: 'auto',
            modelReasoningEffort: 'high'
        })

        expect(loadPreferredLaunchSettings('machine-2', 'codex')).toBeNull()
        expect(loadPreferredLaunchSettings('machine-1', 'claude')).toBeNull()
    })

    it('fills missing optional launch fields from older stored values', () => {
        localStorage.setItem(
            'hapi:newSession:launchSettings:v1:machine-1:codex',
            JSON.stringify({ model: 'gpt-5.6-sol' })
        )

        expect(loadPreferredLaunchSettings('machine-1', 'codex')).toEqual({
            model: 'gpt-5.6-sol',
            cursorSelectedBase: 'auto',
            effort: 'auto',
            modelReasoningEffort: 'default'
        })
    })

    it('ignores malformed launch settings', () => {
        localStorage.setItem(
            'hapi:newSession:launchSettings:v1:machine-1:codex',
            '{not-json'
        )
        expect(loadPreferredLaunchSettings('machine-1', 'codex')).toBeNull()

        localStorage.setItem(
            'hapi:newSession:launchSettings:v1:machine-1:codex',
            JSON.stringify({ model: 42 })
        )
        expect(loadPreferredLaunchSettings('machine-1', 'codex')).toBeNull()
    })

    it('falls back when remembered static Claude options are no longer available', () => {
        expect(
            resolvePreferredLaunchSettings('claude', {
                model: 'retired-model',
                cursorSelectedBase: 'auto',
                effort: 'ultra',
                modelReasoningEffort: 'default'
            })
        ).toEqual({
            model: 'auto',
            cursorSelectedBase: 'auto',
            effort: 'auto',
            modelReasoningEffort: 'default',
        })
    })

    it('keeps dynamic model values for catalog validation after restore', () => {
        expect(resolvePreferredLaunchSettings('codex', {
            model: 'gpt-5.6-sol',
            cursorSelectedBase: 'auto',
            effort: 'auto',
            modelReasoningEffort: 'xhigh',
        })).toEqual({
            model: 'gpt-5.6-sol',
            cursorSelectedBase: 'auto',
            effort: 'auto',
            modelReasoningEffort: 'xhigh',
        })
    })

    it('does not reset a remembered Kimi alias against the static Default-only list', () => {
        // Kimi's catalog is dynamic; validating against MODEL_OPTIONS.kimi
        // (only 'auto') must not turn a saved alias back into Default before
        // the real catalog arrives.
        expect(resolvePreferredLaunchSettings('kimi', {
            model: 'GLM-5.3-flash',
            cursorSelectedBase: 'auto',
            effort: 'auto',
            modelReasoningEffort: 'default'
        })).toEqual({
            model: 'GLM-5.3-flash',
            cursorSelectedBase: 'auto',
            effort: 'auto',
            modelReasoningEffort: 'default',
        })
    })

    it('drops an OpenCode reasoning value that is not offered at launch', () => {
        expect(resolvePreferredLaunchSettings('opencode', {
            model: 'provider/model',
            cursorSelectedBase: 'auto',
            effort: 'auto',
            modelReasoningEffort: 'xhigh'
        })).toEqual({
            model: 'provider/model',
            cursorSelectedBase: 'auto',
            effort: 'auto',
            modelReasoningEffort: 'default',
        })
    })
})
