import { describe, expect, test } from 'bun:test'
import {
    ChatCreationOverridesSchema,
    ChatCreationPreferencesSchema,
    resolveChatCreation,
    rememberChatCreation,
    type ChatCreationPreferences
} from './sessionCreation'

const saved: ChatCreationPreferences = {
    lastMachineId: 'm1',
    lastAgent: 'codex',
    machines: {
        m1: {
            directory: '/repo',
            agents: {
                codex: { model: 'gpt-test', serviceTier: 'fast', collaborationMode: 'plan' },
                claude: { model: 'opus' }
            }
        }
    }
}

describe('shared chat creation preferences', () => {
    test('uses saved machine, directory and agent settings', () => {
        expect(resolveChatCreation({}, saved, ['m1'])).toMatchObject({
            machineId: 'm1',
            directory: '/repo',
            agent: 'codex',
            model: 'gpt-test',
            serviceTier: 'fast'
        })
    })
    test('rejects permission choices on the chat creation contract', () => {
        expect(ChatCreationOverridesSchema.safeParse({ yolo: false }).success).toBe(false)
        expect(ChatCreationOverridesSchema.safeParse({ permissionMode: 'read-only' }).success).toBe(false)
    })
    test('drops removed permission preferences while preserving saved model choices', () => {
        const parsed = ChatCreationPreferencesSchema.parse({
            machines: { m1: { agents: { codex: { model: 'gpt-test', yolo: false, permissionMode: 'read-only' } } } }
        })
        expect(parsed.machines.m1.agents.codex).toEqual({ model: 'gpt-test' })
    })
    test('cross-agent creation only inherits that agent settings', () => {
        expect(resolveChatCreation({ agent: 'claude' }, saved, ['m1'])).toMatchObject({
            agent: 'claude',
            model: 'opus'
        })
        expect(resolveChatCreation({ agent: 'claude' }, saved, ['m1']).serviceTier).toBeUndefined()
    })
    test('preserves explicit clears and default choices', () => {
        expect(
            resolveChatCreation({ model: null, serviceTier: 'standard', collaborationMode: 'default' }, saved, ['m1'])
        ).toMatchObject({ model: null, serviceTier: 'standard', collaborationMode: 'default' })
    })
    test('uses normal defaults without saved values and requires a directory', () => {
        expect(resolveChatCreation({ directory: '/repo' }, { machines: {} }, ['m1'])).toMatchObject({
            machineId: 'm1',
            agent: 'claude',
            directory: '/repo',
            sessionType: 'simple'
        })
        expect(() => resolveChatCreation({}, { machines: {} }, ['m1'])).toThrow('directory')
    })
    test('rejects options for the wrong agent', () => {
        expect(() => resolveChatCreation({ agent: 'claude', serviceTier: 'fast' }, saved, ['m1'])).toThrow(
            'serviceTier'
        )
    })
    test('keeps agent scopes and replaces cleared settings on successful creation', () => {
        const resolved = resolveChatCreation({ model: null }, saved, ['m1'])
        const next = rememberChatCreation(saved, resolved)
        expect(next.machines.m1.agents.codex.model).toBeNull()
        expect(next.machines.m1.agents.claude).toEqual(saved.machines.m1.agents.claude)
        expect(saved.machines.m1.agents.codex.model).toBe('gpt-test')
    })
})
