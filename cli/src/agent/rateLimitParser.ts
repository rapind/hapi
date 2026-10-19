import type { AgentMessage } from './types';

/**
 * Detect rate_limit_event JSON in agent text output and convert to
 * a standardized AgentMessage, so the web layer doesn't need to
 * parse undocumented Claude-internal JSON formats.
 *
 * Converted text format (pipe-delimited, parsed by web's reducerEvents.ts):
 *   - "Claude AI usage limit warning|{unixSeconds}|{percentInt}|{rateLimitType}"
 *   - "Claude AI usage limit reached|{unixSeconds}|{rateLimitType}"
 *
 * Returns null if the text is not a rate_limit_event (pass through as-is).
 * Returns { suppress: true } for known-noisy statuses (e.g. 'allowed').
 * Returns { suppress: false, message } for statuses worth displaying.
 */
export type RateLimitResult =
    | null
    | { suppress: true }
    | { suppress: false; message: AgentMessage };

export function parseRateLimitText(text: string, filter = new RateLimitEventFilter()): RateLimitResult {
    if (text[0] !== '{') return null;

    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return null;
    }
    if (typeof parsed !== 'object' || parsed === null) return null;

    // Unwrap { type: "output", data: { ... } } wrapper
    const record = parsed as Record<string, unknown>;
    let inner = record;
    if (record.type === 'output' && typeof record.data === 'object' && record.data !== null) {
        inner = record.data as Record<string, unknown>;
    }

    if (inner.type !== 'rate_limit_event') return null;

    const message = filter.convert(inner.rate_limit_info);
    return message === null
        ? { suppress: true }
        : { suppress: false, message: { type: 'text', text: message } };
}

/** Warning memory belongs to the session, so prompt boundaries do not repeat alerts. */
export class RateLimitEventFilter {
    private readonly warnings = new Map<string, { resetsAt: number; percent: number }>();

    convert(info: unknown): string | null {
        if (typeof info !== 'object' || info === null) return null;
        const { status, resetsAt, utilization, rateLimitType } = info as Record<string, unknown>;
        if (typeof resetsAt !== 'number' || !Number.isFinite(resetsAt) || resetsAt < 0) return null;

        const reset = Math.round(resetsAt);
        const limitType = typeof rateLimitType === 'string' ? rateLimitType : '';
        if (status === 'rejected') {
            return `Claude AI usage limit reached|${reset}|${limitType}`;
        }
        if (status !== 'allowed_warning' || typeof utilization !== 'number'
            || !Number.isFinite(utilization) || utilization < 0.9) return null;

        const percent = Math.round(utilization * 100);
        const previous = this.warnings.get(limitType);
        if (previous?.resetsAt === reset && previous.percent === percent) return null;
        this.warnings.set(limitType, { resetsAt: reset, percent });
        return `Claude AI usage limit warning|${reset}|${percent}|${limitType}`;
    }
}
