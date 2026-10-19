import { useEffect, useRef, useState } from 'react'
import { encryptSopsSecret, MAX_SECRET_BYTES, type SopsSecretRequest, type SopsSecretResult } from '@hapi/protocol'
import type { ApiClient } from '@/api/client'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/use-translation'

function SopsSecretForm({
    api,
    sessionId,
    request
}: {
    api: ApiClient
    sessionId: string
    request: SopsSecretRequest
}) {
    const { t } = useTranslation()
    const input = useRef<HTMLInputElement>(null)
    const pastedValue = useRef<string | null>(null)
    const mounted = useRef(true)
    const busy = useRef(false)
    const [saving, setSaving] = useState(false)
    const [pasted, setPasted] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<SopsSecretResult | null>(null)
    const [expired, setExpired] = useState(Date.now() >= request.expiresAt)
    const secure = !!globalThis.crypto?.subtle

    useEffect(() => {
        mounted.current = true
        const field = input.current
        const timeout = setTimeout(
            () => {
                if (field) field.value = ''
                pastedValue.current = null
                setExpired(true)
            },
            Math.max(0, request.expiresAt - Date.now())
        )
        return () => {
            mounted.current = false
            clearTimeout(timeout)
            if (field) field.value = ''
            pastedValue.current = null
        }
    }, [request.expiresAt])

    async function submit(cancel: boolean) {
        if (busy.current || expired) return
        busy.current = true
        setSaving(true)
        setError(null)
        const value = pastedValue.current ?? input.current?.value ?? ''
        if (input.current) input.current.value = ''
        pastedValue.current = null
        setPasted(false)
        try {
            if (!cancel && (!value || new TextEncoder().encode(value).length > MAX_SECRET_BYTES)) {
                setError(t('sopsSecret.invalidLength'))
                return
            }
            const reply = cancel ? { action: 'cancel' as const } : await encryptSopsSecret(request, value)
            const response = await api.submitSopsSecret(sessionId, request.id, reply)
            if (mounted.current) setResult(response)
        } catch {
            if (mounted.current) setError(t('sopsSecret.deliveryError'))
        } finally {
            busy.current = false
            if (mounted.current) setSaving(false)
        }
    }

    function acceptPaste(value: string) {
        if (!mounted.current || busy.current || Date.now() >= request.expiresAt || !input.current) return
        if (!value || new TextEncoder().encode(value).length > MAX_SECRET_BYTES) {
            setError(t('sopsSecret.invalidLength'))
            return
        }
        // Password inputs strip newlines. Keep pasted bytes in memory and show a
        // fixed mask, so multiline credentials reach SOPS without alteration.
        pastedValue.current = value
        input.current.value = '••••••••'
        setPasted(true)
        setError(null)
        input.current.focus()
    }

    async function paste() {
        try {
            const value = await navigator.clipboard.readText()
            acceptPaste(value)
        } catch {
            if (mounted.current) setError(t('sopsSecret.clipboardError'))
        }
    }

    return (
        <form
            className="rounded-lg border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-3 space-y-2"
            autoComplete="off"
            onSubmit={(event) => {
                event.preventDefault()
                void submit(false)
            }}
        >
            <div className="font-medium">{t('sopsSecret.title')}</div>
            <div className="text-xs break-all">
                <span className="text-[var(--app-hint)]">{t('sopsSecret.file')} </span>
                <code>{request.file}</code>
            </div>
            <div className="text-xs break-all">
                <span className="text-[var(--app-hint)]">{t('sopsSecret.key')} </span>
                <code>{JSON.stringify(request.key)}</code>
            </div>
            {result ? (
                <p role="status" className="text-sm">
                    {t(`sopsSecret.result.${result.status}`)}
                    {result.notified === false ? ` ${t('sopsSecret.notifyError')}` : ''}
                </p>
            ) : expired ? (
                <p role="status" className="text-sm">
                    {t('sopsSecret.result.expired')}
                </p>
            ) : (
                <>
                    <p className="text-xs text-[var(--app-hint)]">{t('sopsSecret.description')}</p>
                    {!secure && (
                        <p role="alert" className="text-sm">
                            {t('sopsSecret.httpsRequired')}
                        </p>
                    )}
                    <label className="block text-sm" htmlFor={`secret-${request.id}`}>
                        {t('sopsSecret.value')}
                    </label>
                    <input
                        ref={input}
                        id={`secret-${request.id}`}
                        type="password"
                        required
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        readOnly={pasted}
                        onPaste={(event) => {
                            event.preventDefault()
                            acceptPaste(event.clipboardData.getData('text/plain'))
                        }}
                        disabled={saving || !secure}
                        className="w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm"
                    />
                    <div className="flex flex-wrap gap-2">
                        {pasted && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={saving}
                                onClick={() => {
                                    pastedValue.current = null
                                    if (input.current) input.current.value = ''
                                    setPasted(false)
                                    input.current?.focus()
                                }}
                            >
                                {t('sopsSecret.clear')}
                            </Button>
                        )}
                        {typeof navigator.clipboard?.readText === 'function' && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={saving || !secure}
                                onClick={() => void paste()}
                            >
                                {t('sopsSecret.paste')}
                            </Button>
                        )}
                        <Button type="submit" size="sm" disabled={saving || !secure}>
                            {t(saving ? 'sopsSecret.saving' : 'sopsSecret.save')}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={saving}
                            onClick={() => void submit(true)}
                        >
                            {t('sopsSecret.cancel')}
                        </Button>
                    </div>
                </>
            )}
            {error && (
                <p role="alert" className="text-sm">
                    {error}
                </p>
            )}
        </form>
    )
}

export function SopsSecretRequests({
    api,
    sessionId,
    requests
}: {
    api: ApiClient
    sessionId: string
    requests?: Record<string, SopsSecretRequest>
}) {
    if (!requests || !Object.keys(requests).length) return null
    return (
        <section
            aria-label="SOPS credentials"
            className="mx-auto w-full max-w-content max-h-[50vh] shrink-0 overflow-y-auto px-3 py-2 space-y-2"
        >
            {Object.values(requests).map((request) => (
                <SopsSecretForm key={`${sessionId}:${request.id}`} api={api} sessionId={sessionId} request={request} />
            ))}
        </section>
    )
}
