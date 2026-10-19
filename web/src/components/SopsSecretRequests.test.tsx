import { webcrypto } from 'node:crypto'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSecretKeyPair, decryptSopsSecret, type SopsSecretReply, type SopsSecretRequest } from '@hapi/protocol'
import type { ApiClient } from '@/api/client'
import { I18nProvider } from '@/lib/i18n-context'
import { SopsSecretRequests } from './SopsSecretRequests'

afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
})

async function setup() {
    vi.stubGlobal('crypto', webcrypto)
    const pair = await createSecretKeyPair()
    const request: SopsSecretRequest = {
        id: crypto.randomUUID(),
        file: '/repo/secrets.yaml',
        key: ['service', 'token'],
        publicKey: pair.publicKey,
        expiresAt: Date.now() + 60_000
    }
    const submit = vi.fn(async (_sessionId: string, _requestId: string, _reply: SopsSecretReply) => ({
        status: 'saved' as const,
        notified: true
    }))
    const api = { submitSopsSecret: submit } as unknown as ApiClient
    const view = (requests: Record<string, SopsSecretRequest>) => (
        <I18nProvider>
            <SopsSecretRequests api={api} sessionId="session-1" requests={requests} />
        </I18nProvider>
    )
    const rendered = render(view({ [request.id]: request }))
    return { ...rendered, view, request, pair, submit }
}

describe('SOPS credential form', () => {
    it('shows the destination, masks the value, and encrypts before making an API call', async () => {
        const { pair, request, submit } = await setup()
        expect(screen.getByText(request.file)).toBeInTheDocument()
        const input = screen.getByLabelText('Credential value') as HTMLInputElement
        expect(input.type).toBe('password')
        const secret = 'do-not-put-this-in-chat'
        fireEvent.change(input, { target: { value: secret } })
        fireEvent.click(screen.getByRole('button', { name: 'Save to SOPS' }))
        expect(input.value).toBe('')
        await waitFor(() => expect(submit).toHaveBeenCalledOnce())
        const reply = submit.mock.calls[0][2]
        expect(JSON.stringify(reply)).not.toContain(secret)
        if (reply.action !== 'save') throw new Error('Expected encrypted value')
        expect(await decryptSopsSecret(request.id, pair.privateKey, reply)).toBe(secret)
        expect(await screen.findByText('Credential saved to SOPS.')).toBeInTheDocument()
        expect(JSON.stringify(localStorage)).not.toContain(secret)
    })

    it('clears an entered secret on cancellation and never sends it', async () => {
        const { submit } = await setup()
        const input = screen.getByLabelText('Credential value') as HTMLInputElement
        fireEvent.change(input, { target: { value: 'private' } })
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        await waitFor(() => expect(submit).toHaveBeenCalledWith('session-1', expect.any(String), { action: 'cancel' }))
        expect(input.value).toBe('')
    })

    it('preserves multiline clipboard bytes without putting plaintext in the field', async () => {
        const { request, pair, submit } = await setup()
        const value = '  line one\r\n秘密\nline three\n'
        const input = screen.getByLabelText('Credential value') as HTMLInputElement
        fireEvent.paste(input, { clipboardData: { getData: () => value } })
        expect(input.value).not.toContain('line')
        expect(input.readOnly).toBe(true)
        fireEvent.click(screen.getByRole('button', { name: 'Save to SOPS' }))
        await waitFor(() => expect(submit).toHaveBeenCalledOnce())
        const reply = submit.mock.calls[0][2]
        if (reply.action !== 'save') throw new Error('Expected encrypted value')
        expect(await decryptSopsSecret(request.id, pair.privateKey, reply)).toBe(value)
    })

    it('allows replacing a pasted credential and keeps validation failures local', async () => {
        const { submit } = await setup()
        const input = screen.getByLabelText('Credential value') as HTMLInputElement
        fireEvent.paste(input, { clipboardData: { getData: () => 'old-value' } })
        fireEvent.click(screen.getByRole('button', { name: 'Clear pasted value' }))
        expect(input.value).toBe('')
        expect(input.readOnly).toBe(false)
        fireEvent.paste(input, { clipboardData: { getData: () => 'x'.repeat(65537) } })
        expect(screen.getByRole('alert')).toHaveTextContent('64 KiB')
        expect(submit).not.toHaveBeenCalled()
    })

    it('clears the field on expiry and prevents sending an expired credential', async () => {
        vi.useFakeTimers()
        const { rerender, view, request, submit } = await setup()
        request.expiresAt = Date.now() + 1000
        rerender(view({ [request.id]: request }))
        const input = screen.getByLabelText('Credential value') as HTMLInputElement
        fireEvent.change(input, { target: { value: 'private' } })
        act(() => vi.advanceTimersByTime(1000))
        expect(input.value).toBe('')
        expect(
            screen.getByText('This credential request expired. Ask the agent to request it again.')
        ).toBeInTheDocument()
        expect(submit).not.toHaveBeenCalled()
    })

    it('keeps failures generic and clears the field', async () => {
        const { submit } = await setup()
        submit.mockRejectedValueOnce(new Error('private diagnostic'))
        const input = screen.getByLabelText('Credential value') as HTMLInputElement
        fireEvent.change(input, { target: { value: 'private' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save to SOPS' }))
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Delivery could not be confirmed'))
        expect(input.value).toBe('')
        expect(screen.queryByText('private diagnostic')).not.toBeInTheDocument()
    })
})
