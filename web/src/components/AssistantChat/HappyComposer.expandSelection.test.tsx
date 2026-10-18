import {
    AssistantRuntimeProvider,
    type ChatModelAdapter,
    useLocalRuntime,
} from '@assistant-ui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Ref } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HappyComposer } from './HappyComposer'

vi.mock('@/components/AssistantChat/ComposerButtons', () => ({
    ComposerButtons: (props: {
        modelValueLabel?: string
        modelValueButtonRef?: Ref<HTMLButtonElement>
        onModelValueToggle?: () => void
    }) => (
        <div>
            {props.modelValueLabel ? (
                <button
                    ref={props.modelValueButtonRef}
                    type="button"
                    aria-label="Composer settings"
                    onClick={props.onModelValueToggle}
                />
            ) : null}
        </div>
    ),
    UnifiedButton: () => null,
    DictationButton: () => null,
    isComposerPrimaryFillHeight: () => true,
}))

vi.mock('@/components/AssistantChat/StatusBar', () => ({ StatusBar: () => null }))
vi.mock('@/hooks/useComposerDraft', () => ({
    useComposerDraft: () => ({ sessionId: undefined, complete: true, restoredAny: false, hasStoredAttachments: false }),
}))
vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        isTelegram: false,
        isTouch: false,
        haptic: {
            impact: () => {},
            notification: () => {},
            selection: () => {},
        },
    }),
}))
vi.mock('@/hooks/usePWAInstall', () => ({
    usePWAInstall: () => ({
        installState: 'idle',
        canInstall: false,
        canInstallIOS: false,
        isStandalone: false,
        isIOS: false,
        promptInstall: async () => false,
        dismissInstall: () => {},
    }),
}))
vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) => key === 'misc.typeAMessage' ? 'Type a message' : key,
    }),
}))

const adapter: ChatModelAdapter = {
    async *run() {},
}

function TestRuntime(props: { withSettings?: boolean }) {
    const runtime = useLocalRuntime(adapter)
    return (
        <AssistantRuntimeProvider runtime={runtime}>
            <HappyComposer
                agentFlavor={props.withSettings ? 'claude' : undefined}
                onPermissionModeChange={props.withSettings ? () => {} : undefined}
            />
            {props.withSettings ? (
                <button
                    type="button"
                    aria-label="Outside action"
                    onPointerDown={(event) => event.stopPropagation()}
                />
            ) : null}
        </AssistantRuntimeProvider>
    )
}

describe('HappyComposer settings sheet', () => {
    beforeEach(() => {
        localStorage.clear()
        localStorage.setItem('hapi.composer.richMentions', '0')
    })

    it('closes settings when clicking outside while preserving inside and trigger interactions', () => {
        render(<TestRuntime withSettings />)

        const settingsButton = screen.getByRole('button', { name: 'Composer settings' })
        fireEvent.click(settingsButton)

        const panelLabel = screen.getByText('misc.permissionMode')
        fireEvent.pointerDown(panelLabel)
        expect(screen.getByText('misc.permissionMode')).toBeInTheDocument()

        fireEvent.pointerDown(settingsButton)
        expect(screen.getByText('misc.permissionMode')).toBeInTheDocument()

        fireEvent.click(settingsButton)
        expect(screen.queryByText('misc.permissionMode')).not.toBeInTheDocument()

        fireEvent.click(settingsButton)
        expect(screen.getByText('misc.permissionMode')).toBeInTheDocument()

        fireEvent.pointerDown(screen.getByRole('textbox'))
        expect(screen.queryByText('misc.permissionMode')).not.toBeInTheDocument()

        fireEvent.click(settingsButton)
        expect(screen.getByText('misc.permissionMode')).toBeInTheDocument()

        fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside action' }))
        expect(screen.queryByText('misc.permissionMode')).not.toBeInTheDocument()
    })
})
