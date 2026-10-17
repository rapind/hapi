import { useState } from 'react'
import { useTranslation } from '@/lib/use-translation'

export function CodexPromptModeSettings(props: {
    mode: 'queue' | 'steer'
    onChange: (mode: 'queue' | 'steer') => Promise<void>
}) {
    const { t } = useTranslation()
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(false)
    const selectMode = async (mode: 'queue' | 'steer') => {
        if (saving || mode === props.mode) return
        setSaving(true)
        setError(false)
        try {
            await props.onChange(mode)
        } catch {
            setError(true)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="py-2">
            <div className="px-3 pb-1 text-xs font-semibold text-[var(--app-hint)]">
                {t('newSession.codexPromptMode')}
            </div>
            <div role="group" aria-label={t('newSession.codexPromptMode')} aria-busy={saving}>
                {(['queue', 'steer'] as const).map(mode => (
                    <button
                        key={mode}
                        type="button"
                        aria-pressed={props.mode === mode}
                        disabled={saving}
                        onClick={() => void selectMode(mode)}
                        onMouseDown={event => event.preventDefault()}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--app-secondary-bg)] disabled:opacity-50"
                    >
                        <span className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${props.mode === mode ? 'border-[var(--app-link)]' : 'border-[var(--app-hint)]'}`}>
                            {props.mode === mode ? <span className="h-2 w-2 rounded-full bg-[var(--app-link)]" /> : null}
                        </span>
                        <span className={props.mode === mode ? 'text-[var(--app-link)]' : ''}>
                            {t(mode === 'steer' ? 'chat.codexPromptMode.steer' : 'chat.codexPromptMode.queue')}
                        </span>
                    </button>
                ))}
            </div>
            {error ? <div role="alert" className="px-3 pt-1 text-xs text-red-500">{t('chat.codexPromptMode.error')}</div> : null}
        </div>
    )
}
