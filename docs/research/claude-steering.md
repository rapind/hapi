# Claude steering

Checked 2026-10-19. GitHub states below come from the live API.

Yes, current Claude Code can receive instructions during an active tool workflow. The upstream HAPI integration inspected here withheld subsequent input until the entire turn returned a `result`. This fork now uses native lifecycle acknowledgments to steer compatible immediate messages automatically.

## What Claude supports

The current [interactive-mode reference](https://code.claude.com/docs/en/interactive-mode#when-claude-code-sends-what-you-queued) says an ordinary queued message reaches Claude after running tool calls finish, within the same turn. Commands and shell commands wait until the turn ends. `Ctrl+Enter` or `Ctrl+X Ctrl+S` sends queued messages immediately, starting with version 2.1.275. From 2.1.281, work that supports backgrounding continues while Claude reads the message; other work is interrupted. A normal message cannot change reasoning already underway inside a model request.

This capability predates the recent send-now shortcut: the official [changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md) mentions real-time steering in 0.2.108, a fix for steering messages lost during subagent work in 2.0.68, and the shortcut changes in 2.1.275 and 2.1.281. Those entries do not establish the minimum version for mid-turn stream-json injection.

The Agent SDK [streaming-input guide](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode) describes an asynchronous input iterable, sequential queued messages, and interruption. It does not clearly promise when a new message joins an active turn. [TypeScript SDK issue #70](https://github.com/anthropics/claude-agent-sdk-typescript/issues/70), opened 2025-11-20 and closed 2025-11-21, was answered with that guide. Subsequent comments dispute whether streaming input provides steering, including a comment on 2026-09-16. Its closed state alone does not prove the runtime behavior. Targeted searches found no directly relevant Python SDK steering PR or issue.

## Relevant HAPI work

| Item | Live status | Scope and evidence |
| --- | --- | --- |
| [PR #2008: Claude remote mid-turn steer](https://github.com/tiann/hapi/pull/2008) | Open, created 2026-10-12, updated 2026-10-13 | Adds Claude to the existing per-message Steer action. The author reports real Claude Code 2.1.296 tests for both tool-boundary absorption and follow-up-turn fallback, plus browser and phone checks. The inspected diff writes UUID-tagged input immediately and tracks `command_lifecycle` events to avoid declaring the session ready before a pending steer runs. |
| [PR #1351: steer Claude mid-turn messages](https://github.com/tiann/hapi/pull/1351) | Open, created 2026-08-03, updated 2026-10-03 | Adds a separate input channel, per-message intent, a composer setting and `HAPI_CLAUDE_STEERING=1`. The author reports a real six-step workflow redirected after step two, with no steps three through six and only one result. Guards cover aborts, incompatible modes and isolated commands. The author documents possible duplicate replay after a crash. |
| [Issue #888: Codex/Claude mid-turn steering](https://github.com/tiann/hapi/issues/888) | Closed as completed 2026-08-19; opened 2026-06-13 | Records HAPI's queue-until-result behavior. Its original suggestion that Claude needs interrupt plus resubmit conflicts with the newer PRs and current interactive documentation. |
| [PR #1825: auto-steer peer messages](https://github.com/tiann/hapi/pull/1825), continuing [#1708](https://github.com/tiann/hapi/pull/1708) | Both open; created 2026-09-11 and 2026-08-28 respectively | Makes `ping_peer` nudges steer automatically for Codex and Cursor. #1825 explicitly tests that Claude is downgraded. Enabling Claude's manual Steer button alone would not deliver this orchestration behavior. |

The runtime tests above are contributor reports, not independently reproduced here. The #2008 diff was checked against its summary; its lifecycle handling has evolved beyond parts of the PR description. Neither PR has merged.

## Relevant Claude issues

- [Claude Code #30492](https://github.com/anthropics/claude-code/issues/30492): priority steering between tool calls, opened 2026-03-03, closed as completed 2026-08-17.
- [Claude Code #64624](https://github.com/anthropics/claude-code/issues/64624): send a steering message during generation, opened 2026-06-02, closed as completed 2026-08-17.
- [TypeScript SDK #366](https://github.com/anthropics/claude-agent-sdk-typescript/issues/366) and [#405](https://github.com/anthropics/claude-agent-sdk-typescript/issues/405): open reports, created 2026-07-06 and 2026-08-10, about interrupts being reported as execution errors. Interrupt plus resubmit needs its own error-handling review.

## Local integration and recommendation

Claude Code 2.1.303 is installed locally. HAPI already supplies stream-json input through `PushableAsyncIterable` in `cli/src/claude/sdk/query.ts`. The integration now exposes a separate live input path while ordinary queued delivery remains available for commands and incompatible modes. Claude is included in the steering capability catalog.

The owner's policy is to steer ordinary interactive and orchestrator messages automatically whenever the agent supports it, matching the existing always-YOLO policy. Do not add a Queue/Steer choice to New Chat, model settings or the status line. Scheduled delivery, replay, incompatible active modes and unsupported transports may require durable deferral.

The local implementation adapts #2008's native input channel and lifecycle tracking. It requires observed lifecycle support before enabling steering. A write alone never counts as consumption. Refusals restore the reserved message, while uncertain writes stay held for explicit resolution. A completed original turn is not replayed after a later steering failure. A pending follow-up has a 30-second acknowledgment deadline after a result; expiration stops that process and holds unresolved input as uncertain.

A live check against Claude Code 2.1.303 sent an instruction during a running tool call. Claude emitted queued, started and completed events for the new prompt, replaced the next action, and finished with one result. The test file contained FIRST and STEERED; the unwanted WRONG action did not run. Deterministic tests also cover the actual HAPI input/output stream and the launcher queue boundary, including result races, uncertain delivery and output-flush failure. No SDK dependency migration, preference UI or extra delivery-intent field was added.

A foreground subagent counts as one tool call, so a plain steer waits until the whole subagent returns. Live HAPI logs showed delays of 55 to 158 seconds, each one behind subagent work. Claude Code accepts `priority: "now" | "next" | "later"` on stream-json user messages. Checks against 2.1.306 compared the two:

| Case | No priority | `priority: "now"` |
| --- | --- | --- |
| Foreground subagent making four 12-second Bash calls, steer at 20s | Steer started at 60s, after all four steps, inside the same turn | Steer started at 21s, when the current step finished. The subagent was killed and its turn ended with an empty `result`; the original prompt reported `cancelled`, then the steer started as the next turn |
| Main-thread 45-second foreground Bash | Not measured | The Bash call ran to completion; Claude then cut the turn the same way |

`now` does not interrupt a running tool call; it cuts the turn at the next tool boundary, including a boundary inside a subagent. HAPI sends every steer with `now`. The existing lifecycle tracking already covered a steer that starts after a `result`.

## Which PR to use

Use #2008 as a reference for a small adaptation. It has substantially less production code and fits the existing queue reservations. Neither PR is ready to take wholesale under the owner's always-steer policy.

The comparison uses the complete file diffs fetched from GitHub, with these immutable heads:

| | [#2008 at `4c22ab4`](https://github.com/tiann/hapi/commit/4c22ab471e767804784525fa2ef8740f5906d907) | [#1351 at `feb7017`](https://github.com/tiann/hapi/commit/feb70174798df546512ebd9096768c94ddead945) |
| --- | --- | --- |
| Full head SHA | `4c22ab471e767804784525fa2ef8740f5906d907` | `feb70174798df546512ebd9096768c94ddead945` |
| Changed files | 11 | 22 |
| Added/deleted lines | 890 / 28 | 913 / 28 |
| Added test lines | 627 | 431 |
| Added production/docs lines | 263 | 482 |
| Product surface | Existing Steer RPC and capability flag; no web code, new preference or environment variable | New `steer` wire boolean, composer preference, localStorage hook, alternate shortcuts, environment opt-in and session ingress hook |
| Delivery tracking | UUIDs, lifecycle acknowledgments, queue reservations and pending steers across results | Direct input write, immediate acknowledgment and addition to the current batch for crash replay |

Counts include comments and type declarations. The full PR totals hide the difference: most of #2008 is tests, while #1351 adds nearly twice as many non-test lines.

The useful part of #2008 is in [claudeRemote.ts](https://github.com/tiann/hapi/blob/4c22ab471e767804784525fa2ef8740f5906d907/cli/src/claude/claudeRemote.ts) and [claudeRemoteLauncher.ts](https://github.com/tiann/hapi/blob/4c22ab471e767804784525fa2ef8740f5906d907/cli/src/claude/claudeRemoteLauncher.ts): preserve a pending message until Claude reports it started, keep the session busy across a result when another prompt is waiting, and avoid replaying the original completed turn after a later failure. A `started` acknowledgment means Claude invoked the input; it does not mean Claude completed the requested work. HAPI's custom SDK already forwards these events, so an SDK dependency migration is unnecessary.

Static inspection found these risks in #2008; they were not reproduced against a live Claude process:

- `onDropped` restores every unstarted reservation on process teardown, including writes whose acknowledgment may have been lost. An explicit rejection and an unknown transport outcome need different handling. Replaying the latter can duplicate a prompt Claude already persisted. The queue already supports an indeterminate reservation state, but this path does not use it.
- `startSteer` removes a pending entry before awaiting `onStarted`. If the launcher's output flush rejects, the error is logged and the reservation can remain dispatching with no pending entry to settle it. Keep ownership until settlement succeeds or record a recoverable outcome.
- Before any lifecycle event has arrived, the fallback immediately treats a write as consumed. That also skips follow-up-turn gating. A verified capability requirement would be cleaner than silently claiming the older transport has equivalent guarantees.
- A prompt reported as `queued` is waited on without a deadline if its later acknowledgment never arrives. Only prompts with no lifecycle report age out, after two results. This differs from the PR description's bounded-wait claim.

#1351's smaller transport function leaves more correctness work: it does not track lifecycle acknowledgments or steers that become separate follow-up turns. Its `onReady` still clears the single in-flight batch at the first result. It also bypasses queue reservations and acknowledges delivery before Claude confirms consumption. The abort guard prevents new input after cancellation, but does not prove recovery for previously written input that Claude has not started. Its [session hook](https://github.com/tiann/hapi/blob/feb70174798df546512ebd9096768c94ddead945/cli/src/claude/session.ts), new wire boolean and [113-line preference hook](https://github.com/tiann/hapi/blob/feb70174798df546512ebd9096768c94ddead945/web/src/hooks/useComposerSteerBehavior.ts) add machinery this fork does not need.

Adapt #2008's input channel and lifecycle tracking into the automatic delivery path established by local commit `ebbbe08b`. Keep compatible-mode and isolated-command guards, acknowledgment ordering, result-boundary tracking and recovery tests. Omit manual-button gating, preferences, alternate shortcuts, environment switches and a second delivery-intent field. Tighten uncertain-outcome and settlement handling before enabling Claude's capability. Test multiple steers, a steer after the final tool call, lost acknowledgments, abort/crash recovery and flush failure. The comparison itself made no application changes; the local implementation described above followed it.
