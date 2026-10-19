/* Exercises conversation and draft selection with the real plain text composer. */

import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import '../src/index.css'
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react'
import { HappyComposer } from '../src/components/AssistantChat/HappyComposer'
import { I18nProvider } from '../src/lib/i18n-context'
import { applyGlobalSelectAll } from '../src/components/SessionChat'

declare global {
    interface Window {
        __composerCopyE2E?: {
            setValue: (value: string) => void
            getValue: () => string
            setDisabled: (disabled: boolean) => void
        }
    }
}

// Mirrors the SessionChat effect: the takeover must live at window scope
// because the broken case is focus on the page body / message thread.
window.addEventListener('keydown', applyGlobalSelectAll)

function Harness() {
    const runtime = useLocalRuntime({ async *run() {} })
    const [disabled, setDisabled] = useState(false)
    window.__composerCopyE2E = {
        setValue: (value) => runtime.thread.composer.setText(value),
        getValue: () => runtime.thread.composer.getState().text,
        setDisabled
    }
    return (
        <div style={{ padding: 40, width: 640 }}>
            <div data-testid="message-thread" style={{ marginBottom: 24 }}>
                <div className="happy-thread-messages flex flex-col gap-3">
                    <div
                        data-testid="assistant-message-1"
                        className="happy-chat-text"
                        style={{ whiteSpace: 'pre-wrap' }}
                    >
                        {'The quick brown fox jumps over the lazy dog.\nSecond line of the first reply.'}
                    </div>
                    <div
                        data-testid="assistant-message-2"
                        className="happy-chat-text"
                        style={{ whiteSpace: 'pre-wrap' }}
                    >
                        {'Another assistant message with a code block:\nconst x = 1;'}
                    </div>
                    <div
                        data-testid="user-message-1"
                        className="happy-user-bubble happy-chat-text"
                        style={{ whiteSpace: 'pre-wrap' }}
                    >
                        {'my earlier user message'}
                    </div>
                </div>
            </div>
            <AssistantRuntimeProvider runtime={runtime}>
                <I18nProvider>
                    <HappyComposer disabled={disabled} />
                </I18nProvider>
            </AssistantRuntimeProvider>
        </div>
    )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Harness />
    </React.StrictMode>
)
