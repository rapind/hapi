import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@/types/api'
import type { ApiClient } from '@/api/client'
import { isTelegramApp } from '@/hooks/useTelegram'
import { useSessionActions } from '@/hooks/mutations/useSessionActions'
import { SessionActionMenu } from '@/components/SessionActionMenu'
import { SessionExportDialog } from '@/components/SessionExportDialog'
import { RenameSessionDialog } from '@/components/RenameSessionDialog'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useScratchlistCount } from '@/lib/use-scratchlist-count'
import { formatReopenError } from '@/lib/reopenError'
import { retargetSharePendingTransfer } from '@/lib/sharePendingState'
import { useTranslation } from '@/lib/use-translation'
import { getSessionTitle } from '@/lib/sessionTitle'
import { useToast } from '@/lib/toast-context'
import { queryKeys } from '@/lib/query-keys'
import { markCodexSessionsImported } from '@/lib/codexImportedSessions'
import { markSessionUnread } from '@/lib/sessionLastSeen'

/** Same preference order as session-list chips: display label → host → short id. */
export function resolveSessionHeaderMachineLabel(
    session: Session,
    labelsById: Record<string, string>
): string | null {
    const machineId = session.metadata?.machineId?.trim() || null
    if (machineId && labelsById[machineId]) {
        return labelsById[machineId]
    }
    const host = session.metadata?.host?.trim()
    if (host) {
        return host
    }
    if (machineId) {
        return machineId.slice(0, 8)
    }
    return null
}

function FilesIcon(props: { className?: string }) {
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
            className={props.className}
        >
            <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
        </svg>
    )
}

function OutlineIcon(props: { className?: string }) {
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
            className={props.className}
        >
            <path d="M8 6h13" />
            <path d="M8 12h13" />
            <path d="M8 18h13" />
            <path d="M3 6h.01" />
            <path d="M3 12h.01" />
            <path d="M3 18h.01" />
        </svg>
    )
}

function headerToggleClass(active: boolean): string {
    return `flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
        active
            ? 'bg-[var(--app-button)] text-[var(--app-button-text)] hover:opacity-90'
            : 'text-[var(--app-hint)] hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]'
        }`
}

function TerminalIcon(props: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
    )
}

function MoreVerticalIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
            className={props.className}
        >
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
        </svg>
    )
}

export function SessionHeader(props: {
    session: Session
    serviceTier?: string | null
    onBack: () => void
    onToggleFiles?: () => void
    filesActive?: boolean
    onToggleOutline?: () => void
    outlineActive?: boolean
    onToggleTerminal?: () => void
    terminalActive?: boolean
    api: ApiClient | null
    titleSuggestionAvailable?: boolean
    canReopen?: boolean
    reopenDisabledReason?: string
    reopenHint?: string
    onSessionDeleted?: () => void
    onSessionReopened?: (newSessionId: string) => void | Promise<void>
}) {
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const { addToast } = useToast()
    const { session, api, onSessionDeleted, onSessionReopened } = props
    const title = useMemo(() => getSessionTitle(session), [session])
    const codexSessionId = session.metadata?.flavor === 'codex'
        ? session.metadata.codexSessionId?.trim() || null
        : null
    const piSessionId = session.metadata?.flavor === 'pi'
        ? session.metadata.piSessionId?.trim() || null
        : null
    const [menuOpen, setMenuOpen] = useState(false)
    const [menuAnchorPoint, setMenuAnchorPoint] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
    const menuId = useId()
    const menuAnchorRef = useRef<HTMLButtonElement | null>(null)
    const [renameOpen, setRenameOpen] = useState(false)
    const [exportOpen, setExportOpen] = useState(false)
    const [archiveOpen, setArchiveOpen] = useState(false)
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [isSyncingCodex, setIsSyncingCodex] = useState(false)
    const [isSyncingPi, setIsSyncingPi] = useState(false)

    const { archiveSession, reopenSession, renameSession, suggestSessionTitle, updateSessionSummary, setPinMode, deleteSession, isPending } = useSessionActions(
        api,
        session.id,
        session.metadata?.flavor ?? null
    )
    const [reopenError, setReopenError] = useState<string | null>(null)

    const handleSetPinMode = async (mode: 'none' | 'project' | 'global') => {
        try {
            await setPinMode(mode)
        } catch (error) {
            addToast({
                title: t('session.action.pinFailed'),
                body: error instanceof Error ? error.message : t('dialog.error.default'),
                sessionId: session.id,
                url: `/sessions/${session.id}`
            })
        }
    }
    // tiann/hapi#893: surface the scratchlist entry count in the
    // delete-confirm copy so the operator knows what cascades when they
    // confirm. Read-only hook reuses the cache filled by SessionChat -
    // no extra network when both components are mounted.
    const scratchlistCount = useScratchlistCount(session.id, api)

    const handleDelete = async () => {
        await deleteSession()
        onSessionDeleted?.()
    }

    const handleReopen = async () => {
        setReopenError(null)
        try {
            const result = await reopenSession()
            if (result.sessionId && result.sessionId !== session.id) {
                retargetSharePendingTransfer(session.id, result.sessionId)
                await onSessionReopened?.(result.sessionId)
            }
        } catch (error) {
            setReopenError(formatReopenError(error))
        }
    }

    const handleSyncCodex = async () => {
        if (!api || !codexSessionId || isSyncingCodex || session.active) return

        setIsSyncingCodex(true)
        try {
            // 中文注释：手动同步必须携带当前会话归属机器和目录；多台 runner 在线时后端不能靠猜。
            const result = await api.syncCodexSession({
                sessionIds: [codexSessionId],
                cwd: typeof session.metadata?.path === 'string' ? session.metadata.path : undefined,
                machineId: typeof session.metadata?.machineId === 'string' ? session.metadata.machineId : undefined
            })
            if (!result.success) {
                throw new Error(result.error || t('codexSync.failed.body'))
            }

            markCodexSessionsImported([codexSessionId])
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.session(session.id) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.messages(session.id) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
            ])
            addToast({
                title: t('codexSync.manual.success.title'),
                body: (result.syncedCount ?? 1) === 0
                    ? t('codexSync.manual.success.noNewMessages')
                    : t('codexSync.manual.success.body', { n: result.syncedCount ?? 1 }),
                sessionId: session.id,
                url: `/sessions/${session.id}`
            })
        } catch (error) {
            addToast({
                title: t('codexSync.manual.failed.title'),
                body: error instanceof Error ? error.message : t('codexSync.failed.body'),
                sessionId: session.id,
                url: `/sessions/${session.id}`
            })
        } finally {
            setIsSyncingCodex(false)
        }
    }

    const handleSyncPi = async () => {
        if (!api || !piSessionId || session.active || isSyncingPi) return

        setIsSyncingPi(true)
        try {
            const result = await api.importPiSessions({
                sessionIds: [piSessionId],
                cwd: typeof session.metadata?.path === 'string' ? session.metadata.path : undefined,
                machineId: typeof session.metadata?.machineId === 'string' ? session.metadata.machineId : undefined
            })
            const imported = result.results.find((item) => item.piSessionId === piSessionId)
            if (imported?.error) {
                const message = imported.error.code === 'transcript_diverged'
                    ? t('piImport.error.diverged')
                    : imported.error.code === 'session_active'
                        ? t('piImport.error.active')
                        : imported.error.message
                throw new Error(message)
            }
            if (!imported) throw new Error(result.error || t('piImport.failed.body'))

            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.session(session.id) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.messages(session.id) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
            ])
            addToast({
                title: t('piImport.manual.success.title'),
                body: (imported.appended ?? 0) === 0
                    ? t('piImport.manual.success.noNewMessages')
                    : t('piImport.manual.success.body', { n: imported.appended ?? 0 }),
                sessionId: session.id,
                url: `/sessions/${session.id}`
            })
        } catch (error) {
            addToast({
                title: t('piImport.manual.failed.title'),
                body: error instanceof Error ? error.message : t('piImport.failed.body'),
                sessionId: session.id,
                url: `/sessions/${session.id}`
            })
        } finally {
            setIsSyncingPi(false)
        }
    }

    const handleMenuToggle = () => {
        if (!menuOpen && menuAnchorRef.current) {
            const rect = menuAnchorRef.current.getBoundingClientRect()
            setMenuAnchorPoint({ x: rect.left + rect.width / 2, y: rect.bottom })
        }
        setMenuOpen((open) => !open)
    }

    // In Telegram, don't render header (Telegram provides its own)
    if (isTelegramApp()) {
        return null
    }

    return (
        <>
            <div className="bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
                <div className="mx-auto w-full max-w-content flex items-center gap-2 p-3">
                    {/* Back button */}
                    <button
                        type="button"
                        onClick={props.onBack}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <polyline points="15 18 9 12 15 6" />
                        </svg>
                    </button>

                    <div className="min-w-0 flex-1 truncate font-semibold" title={title}>
                        {title}
                    </div>

                    {props.onToggleFiles ? (
                        <button
                            type="button"
                            onClick={props.onToggleFiles}
                            className={headerToggleClass(props.filesActive ?? false)}
                            title={props.filesActive ? t('session.view.returnToChat') : t('session.title')}
                            aria-label={props.filesActive ? t('session.view.returnToChat') : t('session.title')}
                            aria-pressed={props.filesActive ?? false}
                        >
                            <FilesIcon />
                        </button>
                    ) : null}

                    {props.onToggleOutline ? (
                        <button
                            type="button"
                            onClick={props.onToggleOutline}
                            className={headerToggleClass(props.outlineActive ?? false)}
                            title={props.outlineActive ? t('session.outline.close') : t('session.outline.open')}
                            aria-label={props.outlineActive ? t('session.outline.close') : t('session.outline.open')}
                            aria-pressed={props.outlineActive ?? false}
                        >
                            <OutlineIcon />
                        </button>
                    ) : null}

                    {props.onToggleTerminal ? (
                        <button
                            type="button"
                            onClick={props.onToggleTerminal}
                            className={headerToggleClass(props.terminalActive ?? false)}
                            title="Terminal"
                            aria-label="Terminal"
                            aria-pressed={props.terminalActive ?? false}
                        >
                            <TerminalIcon />
                        </button>
                    ) : null}

                    <button
                        type="button"
                        onClick={handleMenuToggle}
                        onPointerDown={(e) => e.stopPropagation()}
                        ref={menuAnchorRef}
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        aria-controls={menuOpen ? menuId : undefined}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                        title={t('session.more')}
                    >
                        <MoreVerticalIcon />
                    </button>
                </div>
            </div>

            <SessionActionMenu
                isOpen={menuOpen}
                onClose={() => setMenuOpen(false)}
                sessionId={session.id}
                sessionTitle={title}
                sessionActive={session.active}
                sessionPinned={Boolean(session.pinned)}
                sessionGlobalPinned={Boolean(session.globalPinned)}
                onRename={() => setRenameOpen(true)}
                onMarkUnread={() => markSessionUnread(session.id, session.updatedAt)}
                onSetPinMode={api ? (mode) => void handleSetPinMode(mode) : undefined}
                onExport={() => setExportOpen(true)}
                onSyncCodex={api && codexSessionId && !session.active ? handleSyncCodex : undefined}
                onSyncPi={api && piSessionId && !session.active ? handleSyncPi : undefined}
                onArchive={() => setArchiveOpen(true)}
                onReopen={props.canReopen === false ? undefined : handleReopen}
                reopenDisabledReason={props.reopenDisabledReason}
                reopenHint={props.reopenHint}
                onDelete={() => setDeleteOpen(true)}
                anchorPoint={menuAnchorPoint}
                menuId={menuId}
            />

            {reopenError ? (
                <ConfirmDialog
                    isOpen={true}
                    onClose={() => setReopenError(null)}
                    title={t('dialog.reopen.errorTitle')}
                    description={reopenError}
                    confirmLabel={t('dialog.reopen.dismiss')}
                    confirmingLabel={t('dialog.reopen.dismiss')}
                    onConfirm={async () => setReopenError(null)}
                    isPending={false}
                    centerTitle
                />
            ) : null}

            <RenameSessionDialog
                isOpen={renameOpen}
                onClose={() => setRenameOpen(false)}
                currentName={title}
                onRename={renameSession}
                onSuggestTitle={api && props.titleSuggestionAvailable ? suggestSessionTitle : undefined}
                onUpdateSummary={api && props.titleSuggestionAvailable ? updateSessionSummary : undefined}
                isPending={isPending}
            />

            <SessionExportDialog
                isOpen={exportOpen}
                onClose={() => setExportOpen(false)}
                sessionId={session.id}
                api={api}
            />

            <ConfirmDialog
                isOpen={archiveOpen}
                onClose={() => setArchiveOpen(false)}
                title={t('dialog.archive.title')}
                description={t('dialog.archive.description', { name: title })}
                confirmLabel={t('dialog.archive.confirm')}
                confirmingLabel={t('dialog.archive.confirming')}
                onConfirm={archiveSession}
                isPending={isPending}
                destructive
                centerTitle
            />

            <ConfirmDialog
                isOpen={deleteOpen}
                onClose={() => setDeleteOpen(false)}
                title={t('dialog.delete.title')}
                description={
                    scratchlistCount > 0
                        ? `${t('dialog.delete.description', { name: title })} ${t(
                            scratchlistCount === 1
                                ? 'dialog.delete.scratchlist.one'
                                : 'dialog.delete.scratchlist.other',
                            { n: String(scratchlistCount) }
                        )}`
                        : t('dialog.delete.description', { name: title })
                }
                confirmLabel={t('dialog.delete.confirm')}
                confirmingLabel={t('dialog.delete.confirming')}
                onConfirm={handleDelete}
                isPending={isPending}
                destructive
                centerTitle
            />
        </>
    )
}
