import { describe, expect, it } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from './index'
import type { EventPublisher } from '../sync/eventPublisher'
import { SessionCache } from '../sync/sessionCache'

describe('agent chat renaming', () => {
    it('allows an agent to rename a chat previously named through the web API', async () => {
        const store = new Store(':memory:')
        try {
            const cache = new SessionCache(store, { emit: () => {} } as unknown as EventPublisher)
            const session = cache.getOrCreateSession(
                'agent-rename',
                {
                    path: '/sports',
                    host: 'localhost',
                    flavor: 'codex'
                },
                null,
                'default'
            )
            await cache.renameSession(session.id, 'Gravelines')
            const current = store.sessions.getSession(session.id)!

            const result = store.sessions.updateSessionMetadata(
                session.id,
                {
                    ...(current.metadata as Record<string, unknown>),
                    name: 'Metal staging - q5te'
                },
                current.metadataVersion,
                'default'
            )

            expect(result.result).toBe('success')
            cache.refreshSession(session.id)
            expect(cache.getSession(session.id)?.metadata?.name).toBe('Metal staging - q5te')
            expect(store.sessions.getSession(session.id)?.metadata).not.toHaveProperty('userChosenName')
        } finally {
            store.close()
        }
    })

    it('allows agent renames on persisted chats with a legacy saved-name field', () => {
        const directory = mkdtempSync(join(tmpdir(), 'hapi-title-'))
        const dbPath = join(directory, 'hapi.db')
        const store = new Store(dbPath)
        try {
            const metadata = {
                path: '/sports',
                host: 'localhost',
                flavor: 'codex',
                name: 'Gravelines',
                userChosenName: 'Gravelines'
            }
            const session = store.sessions.getOrCreateSession('legacy-rename', metadata, null, 'default')
            const db = new Database(dbPath)
            try {
                db.query('UPDATE sessions SET metadata = ? WHERE id = ?').run(JSON.stringify(metadata), session.id)
            } finally {
                db.close()
            }

            const result = store.sessions.updateSessionMetadata(
                session.id,
                {
                    ...metadata,
                    name: 'Metal staging - q5te'
                },
                session.metadataVersion,
                'default'
            )

            expect(result.result).toBe('success')
            expect(store.sessions.getSession(session.id)?.metadata).toMatchObject({ name: 'Metal staging - q5te' })
        } finally {
            store.close()
            rmSync(directory, { recursive: true, force: true })
        }
    })
})
