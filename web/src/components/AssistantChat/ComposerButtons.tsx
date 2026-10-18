import { ComposerPrimitive } from '@assistant-ui/react'
import type { ConversationStatus } from '@/realtime/types'
import { useTranslation } from '@/lib/use-translation'
import type { PendingSchedule } from './ScheduleTimePicker'
import type { ReactNode, Ref } from 'react'
import type { ComposerSendIntent } from '@/lib/messageDelivery'

function ChevronIcon() {
    return <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2.5 3.75L5 6.25L7.5 3.75" /></svg>
}

function VoiceAssistantIcon(props: { size?: number }) {
    const size = props.size ?? 18
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            {/* 三条声波线，代表语音助手的输出 */}
            <path d="M12 6v12" />
            <path d="M8 9v6" />
            <path d="M16 9v6" />
            <path d="M4 11v2" />
            <path d="M20 11v2" />
        </svg>
    )
}

/**
 * Primary composer control fills the collapsed card height (Quest / touch).
 * Empty → giant voice/dictate; draft → giant Send. Draft voice stays a
 * compact toolbar circle (no width stolen from the text column).
 * Expanded editor: stay compact — fill-height would become a full-shell strip.
 */
export function isComposerPrimaryFillHeight(args: {
    canSend: boolean
    voiceEnabled: boolean
    voiceStatus: ConversationStatus
    routesToScratchlist?: boolean
    expanded?: boolean
}): boolean {
    if (args.expanded) return false
    if (args.voiceStatus === 'connecting' || args.voiceStatus === 'connected') return true
    if (args.routesToScratchlist) return true
    if (args.canSend) return true
    if (args.voiceEnabled) return true
    // Disabled grey Send when empty + voice off — still fill so layout does not jump.
    return true
}

/** Empty idle voice/dictate — FUE + morph target (not the fill-height gate). */
export function isLargeEmptyVoicePrimary(args: {
    canSend: boolean
    voiceEnabled: boolean
    voiceStatus: ConversationStatus
    routesToScratchlist?: boolean
}): boolean {
    if (args.canSend) return false
    if (args.routesToScratchlist) return false
    if (!args.voiceEnabled) return false
    if (args.voiceStatus === 'connecting' || args.voiceStatus === 'connected') return false
    return true
}

/**
 * When draft steals the primary for Send, keep voice/dictate reachable via the
 * compact toolbar DictationButton (under the text — does not eat composer width).
 */
export function shouldShowDraftVoiceButton(args: {
    canSend: boolean
    voiceEnabled: boolean
    voiceStatus: ConversationStatus
    /** Mirror UnifiedButton: scratchlist routing owns Send; do not start voice. */
    routesToScratchlist?: boolean
}): boolean {
    if (!args.canSend || !args.voiceEnabled) return false
    if (args.routesToScratchlist) return false
    if (args.voiceStatus === 'connecting' || args.voiceStatus === 'connected') return false
    return true
}

export function unifiedButtonSizeClass(fillHeight: boolean): string {
    // Fill the composer card column: fixed width, stretch height, soft square.
    // Compact remains for isolated toolbar previews / legacy callers.
    return fillHeight
        ? 'h-full min-h-14 w-16 self-stretch rounded-none rounded-r-[20px]'
        : 'h-8 w-8 rounded-full'
}

export function draftVoiceCompanionSizeClass(): string {
    return 'h-full min-h-14 w-12 self-stretch rounded-none'
}





function AttachmentIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M21.44 11.05l-8.49 8.49a5.5 5.5 0 0 1-7.78-7.78l8.49-8.49a3.5 3.5 0 0 1 4.95 4.95l-8.49 8.49a1.5 1.5 0 0 1-2.12-2.12l7.78-7.78" />
        </svg>
    )
}

function ComposerExpandIcon(props: { expanded: boolean }) {
    return props.expanded ? (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M8 3v5H3" />
            <path d="m3 3 5 5" />
            <path d="M16 3v5h5" />
            <path d="m21 3-5 5" />
            <path d="M8 21v-5H3" />
            <path d="m3 21 5-5" />
            <path d="M16 21v-5h5" />
            <path d="m21 21-5-5" />
        </svg>
    ) : (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M8 3H3v5" />
            <path d="m3 3 5 5" />
            <path d="M16 3h5v5" />
            <path d="m21 3-5 5" />
            <path d="M8 21H3v-5" />
            <path d="m3 21 5-5" />
            <path d="M16 21h5v-5" />
            <path d="m21 21-5-5" />
        </svg>
    )
}

export function ComposerExpandButton(props: {
    expanded: boolean
    onToggle: () => void
}) {
    const { t } = useTranslation()
    const label = props.expanded ? t('composer.collapse') : t('composer.expand')

    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={props.expanded}
            className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                props.expanded
                    ? 'bg-[var(--app-bg)] text-[var(--app-link)]'
                    : 'text-[var(--app-fg)] hover:bg-[var(--app-bg)] hover:text-[var(--app-fg)]'
                }`}
            onClick={props.onToggle}
        >
            <ComposerExpandIcon expanded={props.expanded} />
        </button>
    )
}

function AbortIcon(props: { spinning: boolean }) {
    if (props.spinning) {
        return (
            <svg
                className="animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
            >
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="0.75" />
            </svg>
        )
    }

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 16 16"
            fill="currentColor"
        >
            <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm4-2.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5h-4a.5.5 0 0 1-.5-.5v-4Z" />
        </svg>
    )
}

function SendIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
        </svg>
    )
}

function StopIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="currentColor"
        >
            <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
    )
}

function LoadingIcon() {
    return (
        <svg
            className="animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
        >
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="0.75" />
        </svg>
    )
}

export function UnifiedButton(props: {
    canSend: boolean
    voiceStatus: ConversationStatus
    voiceEnabled: boolean
    controlsDisabled: boolean
    onSend: (intent?: ComposerSendIntent) => void
    onVoiceToggle: () => void
    voiceLabel?: string
    /**
     * When true, stretch to the composer card height (beside input + toolbar).
     * Default true — Quest / touch need a full-height primary control.
     */
    fillHeight?: boolean
    /**
     * When true, the send button repaints amber and the aria-label
     * announces "Send to scratchlist" instead of "Send message". The
     * actual routing happens in SessionChat's wrapped onSend - the
     * button itself is content-agnostic.
     *
     * Caller MUST compute this from the actual routing decision (mode
     * AND no-pending-schedule). Attachments in scratchlist mode still
     * route to scratchlist. If the toggle is on but a pending schedule
     * would fall back to chat, the button must look like a normal chat send.
     */
    routesToScratchlist?: boolean
}) {
    const { t } = useTranslation()

    const isConnecting = props.voiceStatus === 'connecting'
    const isConnected = props.voiceStatus === 'connected'
    const isVoiceActive = isConnecting || isConnected
    const hasText = props.canSend
    const routesToScratchlist = props.routesToScratchlist ?? false
    const fillHeight = props.fillHeight ?? true
    const iconSize = fillHeight ? 28 : 18

    const handleClick = () => {
        if (isVoiceActive) {
            props.onVoiceToggle() // Stop voice
        } else if (hasText) {
            props.onSend('default') // Send message (or scratchlist add — wrapper decides)
        } else if (props.voiceEnabled && !routesToScratchlist) {
            props.onVoiceToggle() // Start voice (suppressed in scratchlist mode)
        }
    }

    let icon: React.ReactNode
    let className: string
    let ariaLabel: string

    if (isConnecting) {
        icon = <LoadingIcon />
        className = 'bg-[var(--app-button)] text-[var(--app-button-text)]'
        ariaLabel = t('voice.connecting')
    } else if (isConnected) {
        icon = <StopIcon />
        className = 'bg-[var(--app-button)] text-[var(--app-button-text)]'
        ariaLabel = t('composer.stop')
    } else if (routesToScratchlist) {
        // Amber send button - matches the scratchlist drawer accent.
        // Single visual signal carries the "this goes to the scratchlist"
        // contract; without it, the modal state is invisible to the user.
        icon = <SendIcon />
        className = 'bg-amber-500 text-white hover:bg-amber-600'
        ariaLabel = t('scratchlist.sendToScratchlist')
    } else if (hasText) {
        icon = <SendIcon />
        className = 'bg-[var(--app-button)] text-[var(--app-button-text)]'
        ariaLabel = t('composer.send')
    } else if (props.voiceEnabled) {
        icon = <VoiceAssistantIcon size={iconSize} />
        className = 'bg-[var(--app-button)] text-[var(--app-button-text)]'
        ariaLabel = props.voiceLabel ?? t('composer.voice')
    } else {
        icon = <SendIcon />
        className = 'bg-[var(--app-button)]/30 text-[var(--app-button-text)]'
        ariaLabel = t('composer.send')
    }

    // When the submission routes to scratchlist the send button is the
    // only path that does anything useful, so it must be enabled whenever
    // there is text - we deliberately do NOT fall back to voice-toggle-on-
    // empty-text. (When attachments / schedule force a chat fallback the
    // normal chat-send disable rules apply.)
    const isDisabled = props.controlsDisabled || (
        routesToScratchlist
            ? !hasText
            : !hasText && !props.voiceEnabled && !isVoiceActive
    )

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={isDisabled}
            aria-label={ariaLabel}
            title={ariaLabel}
            data-testid="composer-unified-button"
            data-size={fillHeight ? 'fill' : 'compact'}
            className={`flex ${unifiedButtonSizeClass(fillHeight)} items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        >
            {icon}
        </button>
    )
}

export function DictationButton(props: {
    /**
     * When false, hide. When true/omitted, show whenever a draft steals Send
     * from the primary (assistant voice and dictation modes).
     */
    enabled?: boolean
    canSend: boolean
    voiceEnabled: boolean
    voiceStatus: ConversationStatus
    controlsDisabled: boolean
    onVoiceToggle: () => void
    /** Override aria/title (dictate vs voice assistant). */
    voiceLabel?: string
    /** Flush companion beside fill-height Send (HappyComposer omitPrimary). */
    variant?: 'toolbar' | 'companion'
    routesToScratchlist?: boolean
}) {
    const { t } = useTranslation()
    if (props.enabled === false) return null
    if (!shouldShowDraftVoiceButton({
        canSend: props.canSend,
        voiceEnabled: props.voiceEnabled,
        voiceStatus: props.voiceStatus,
        routesToScratchlist: props.routesToScratchlist,
    })) return null

    const label = props.voiceLabel ?? t('composer.dictate')
    const companion = props.variant === 'companion'
    const iconSize = companion ? 24 : 18

    return (
        <button
            type="button"
            onClick={props.onVoiceToggle}
            disabled={props.controlsDisabled}
            aria-label={label}
            title={label}
            data-testid="composer-draft-voice-button"
            data-variant={companion ? 'companion' : 'toolbar'}
            className={
                companion
                    ? `flex ${draftVoiceCompanionSizeClass()} items-center justify-center bg-[var(--app-button)] text-[var(--app-button-text)] transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50`
                    : 'flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-fg)] transition-colors hover:bg-[var(--app-bg)] hover:text-[var(--app-fg)] disabled:cursor-not-allowed disabled:opacity-50'
            }
        >
            <VoiceAssistantIcon size={iconSize} />
        </button>
    )
}

export function ComposerButtons(props: {
    canSend: boolean
    controlsDisabled: boolean
    showAbortButton: boolean
    abortDisabled: boolean
    isAborting: boolean
    onAbort: () => void
    voiceEnabled: boolean
    dictationEnabled?: boolean
    voiceStatus: ConversationStatus
    onVoiceToggle: () => void
    onSend: (intent?: ComposerSendIntent) => void
    pendingSchedule?: PendingSchedule | null
    // Model button; it opens the full settings sheet, including effort.
    modelValueLabel?: string
    modelValueButtonRef?: Ref<HTMLButtonElement>
    modelValueDisabled?: boolean
    modelValueOpen?: boolean
    onModelValueToggle?: () => void
    scratchlistMode?: boolean
    statusLine?: ReactNode
    /** Omit UnifiedButton when HappyComposer places it beside the input. */
    omitPrimaryButton?: boolean
}) {
    const { t } = useTranslation()
    const hasSchedule = props.pendingSchedule != null

    return (
        <div className="flex shrink-0 items-center gap-1 px-[10px] py-1">
            <div
                data-testid="composer-toolbar-items"
                className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
                <ComposerPrimitive.AddAttachment
                    aria-label={t('composer.attach')}
                    title={t('composer.attach')}
                    disabled={props.controlsDisabled || hasSchedule}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--app-fg)] transition-colors hover:bg-[var(--app-bg)] hover:text-[var(--app-fg)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <AttachmentIcon />
                </ComposerPrimitive.AddAttachment>

                {props.modelValueLabel ? (
                    <button
                        ref={props.modelValueButtonRef}
                        type="button"
                        aria-label={props.modelValueLabel}
                        title={props.modelValueLabel}
                        className={`flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-medium transition-colors ${
                            props.modelValueOpen
                                ? 'bg-[var(--app-secondary-bg)] text-[var(--app-link)]'
                                : 'text-[var(--app-fg)] hover:bg-[var(--app-bg)] hover:text-[var(--app-fg)]'
                        }`}
                        onClick={props.onModelValueToggle}
                        disabled={props.modelValueDisabled}
                    >
                        {props.modelValueLabel}
                        <ChevronIcon />
                    </button>
                ) : null}

                {props.showAbortButton ? (
                    <button
                        type="button"
                        aria-label={t('composer.abort')}
                        title={t('composer.abort')}
                        disabled={props.abortDisabled}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--app-fg)] transition-colors hover:bg-[var(--app-bg)] hover:text-[var(--app-fg)] disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={props.onAbort}
                    >
                        <AbortIcon spinning={props.isAborting} />
                    </button>
                ) : null}
                {props.statusLine ? <div className="ml-auto flex shrink-0 items-center pl-2">{props.statusLine}</div> : null}
            </div>

            {props.omitPrimaryButton ? null : (
                <UnifiedButton
                    canSend={props.canSend}
                    voiceStatus={props.voiceStatus}
                    voiceEnabled={props.voiceEnabled}
                    controlsDisabled={props.controlsDisabled}
                    onSend={props.onSend}
                    onVoiceToggle={props.onVoiceToggle}
                    voiceLabel={props.dictationEnabled ? t('composer.dictate') : undefined}
                    fillHeight={false}
                    /*
                     * Derived, NOT raw scratchlistMode. Mirror SessionChat's
                     * shouldRouteToScratchlist: amber + "Send to scratchlist"
                     * whenever mode is on and there is no pending schedule.
                     * Attachments route to scratchlist too (hub upload adapter).
                     */
                    routesToScratchlist={
                        (props.scratchlistMode ?? false)
                        && props.pendingSchedule == null
                    }
                />
            )}
        </div>
    )
}
