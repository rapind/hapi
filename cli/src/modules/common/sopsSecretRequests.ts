import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
    createSecretKeyPair,
    decryptSopsSecret,
    RPC_METHODS,
    SOPS_SECRET_TTL_MS,
    SopsSecretInputSchema,
    SopsSecretReplySchema,
    type SopsSecretInput,
    type SopsSecretRequest,
    type SopsSecretResult
} from '@hapi/protocol'
import type { ApiSessionClient } from '@/api/apiSession'
import { prepareSopsDestination, writeSopsSecret, type SopsDestination } from './sopsSecretWriter'

const submissionSchema = z.object({ requestId: z.string().uuid(), reply: SopsSecretReplySchema }).strict()
type Pending = {
    request: SopsSecretRequest
    destination: SopsDestination
    privateKey: CryptoKey
    timer: ReturnType<typeof setTimeout>
    saving: boolean
}

export const SOPS_SECRET_TOOL_DESCRIPTION =
    'Ask the human to save a credential directly into an existing SOPS-encrypted YAML or JSON file on this session machine. Supply only the file and object key path, never the value. HAPI displays a masked input and encrypts delivery to the local helper; plaintext is not returned to you. Returns immediately with a request ID. Tell the human the form is ready and end your turn. After submission HAPI sends a status message so you can continue. Do not ask them to paste credentials into chat or decrypt/print the saved value.'

export class SopsSecretRequests {
    private readonly pending = new Map<string, Pending>()
    private closed = false

    constructor(
        private readonly client: ApiSessionClient,
        private readonly cwd: string
    ) {
        client.rpcHandlerManager.registerHandler(
            RPC_METHODS.SubmitSopsSecret,
            async (data: unknown): Promise<SopsSecretResult> => {
                const parsed = submissionSchema.safeParse(data)
                if (!parsed.success) return { status: 'invalid' }
                return await this.submit(parsed.data)
            }
        )
        this.publish()
    }

    async request(input: SopsSecretInput): Promise<SopsSecretRequest> {
        if (this.closed || this.pending.size >= 5) throw new Error('Credential requests are unavailable')
        const destination = await prepareSopsDestination(SopsSecretInputSchema.parse(input), this.cwd)
        const pair = await createSecretKeyPair()
        if (this.closed || this.pending.size >= 5) throw new Error('Credential requests are unavailable')
        const request: SopsSecretRequest = {
            id: randomUUID(),
            file: destination.file,
            key: [...destination.key],
            publicKey: pair.publicKey,
            expiresAt: Date.now() + SOPS_SECRET_TTL_MS
        }
        const timer = setTimeout(() => this.remove(request.id), SOPS_SECRET_TTL_MS)
        timer.unref()
        this.pending.set(request.id, { request, destination, privateKey: pair.privateKey, timer, saving: false })
        this.publish()
        return request
    }

    private publish(): void {
        const requests = Object.fromEntries(Array.from(this.pending, ([id, entry]) => [id, entry.request]))
        this.client.updateAgentState((state) => ({ ...state, sopsSecretRequests: requests }))
    }

    private remove(id: string): void {
        const entry = this.pending.get(id)
        if (!entry || entry.saving) return
        clearTimeout(entry.timer)
        this.pending.delete(id)
        this.publish()
    }

    private async submit({ requestId, reply }: z.infer<typeof submissionSchema>): Promise<SopsSecretResult> {
        const entry = this.pending.get(requestId)
        if (!entry) return { status: 'unavailable' }
        if (entry.saving) return { status: 'busy' }
        if (Date.now() >= entry.request.expiresAt) {
            this.remove(requestId)
            return { status: 'expired' }
        }
        if (reply.action === 'cancel') {
            this.remove(requestId)
            return { status: 'canceled' }
        }
        entry.saving = true
        try {
            const value = await decryptSopsSecret(requestId, entry.privateKey, reply)
            await writeSopsSecret(entry.destination, value)
            return { status: 'saved' }
        } catch {
            // Do not propagate crypto, child-process, or filesystem diagnostics.
            return { status: 'failed' }
        } finally {
            entry.saving = false
            this.remove(requestId)
        }
    }

    close(): void {
        this.closed = true
        for (const entry of this.pending.values()) clearTimeout(entry.timer)
        this.pending.clear()
        this.publish()
    }
}
