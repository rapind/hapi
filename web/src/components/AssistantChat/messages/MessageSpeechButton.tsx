import { useEffect, useMemo, useRef, useState } from 'react'
import { SpeakerIcon, StopReadingIcon } from '@/components/icons'
import { messageSpeechText, speakMessage, supportsMessageSpeech } from '@/lib/message-speech'
import { useTranslation } from '@/lib/use-translation'
import { MessageActionButton } from './MessageActionButton'

export function MessageSpeechButton({ text }: { text: string }) {
    const { t } = useTranslation()
    const [speaking, setSpeaking] = useState(false)
    const [failed, setFailed] = useState(false)
    const stopRef = useRef<(() => void) | undefined>(undefined)
    const readableText = useMemo(() => messageSpeechText(text), [text])

    useEffect(
        () => () => {
            stopRef.current?.()
        },
        []
    )

    if (!supportsMessageSpeech() || !readableText) return null

    return (
        <>
            <MessageActionButton
                label={speaking ? t('message.stopReading') : t('message.readAloud')}
                aria-pressed={speaking}
                onClick={() => {
                    if (stopRef.current) {
                        stopRef.current()
                        return
                    }
                    setFailed(false)
                    setSpeaking(true)
                    let completed = false
                    try {
                        const stop = speakMessage(readableText, (error) => {
                            completed = true
                            stopRef.current = undefined
                            setSpeaking(false)
                            setFailed(error)
                        })
                        if (!completed) stopRef.current = stop
                    } catch {
                        setSpeaking(false)
                        setFailed(true)
                    }
                }}
            >
                {speaking ? <StopReadingIcon className="h-3.5 w-3.5" /> : <SpeakerIcon className="h-3.5 w-3.5" />}
            </MessageActionButton>
            {failed ? (
                <span role="status" className="text-xs text-red-500">
                    {t('message.readAloudFailed')}
                </span>
            ) : null}
        </>
    )
}
