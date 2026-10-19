# Claude steering

Checked 2026-10-19. GitHub states below come from the live API.

Yes, current Claude Code can receive instructions during an active tool workflow. HAPI's remote Claude integration currently withholds subsequent input until the entire turn returns a `result`. Two open upstream HAPI PRs address that gap.

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

Claude Code 2.1.303 is installed locally. HAPI already supplies stream-json input through `PushableAsyncIterable` in `cli/src/claude/sdk/query.ts`. `cli/src/claude/claudeRemote.ts` only calls `scheduleNextMessage()` after a `result`, and `shared/src/modes.ts` excludes Claude from its steering catalog.

The owner's policy is to steer ordinary interactive and orchestrator messages automatically whenever the agent supports it, matching the existing always-YOLO policy. Do not add a Queue/Steer choice to New Chat, model settings or the status line. Scheduled delivery, replay, incompatible active modes and unsupported transports may require durable deferral.

A future Claude integration should use the native stream-json input channel. PR #2008 provides useful transport and lifecycle work, but its manual Steer UI does not match this policy. Delivery acknowledgment, abort recovery, pending follow-up turns and automatic orchestrator delivery need review before adoption. Validate both tool-boundary absorption and the race where input arrives after the final tool call; transport acceptance alone does not prove the model has read a message.

The inspected #2008 implementation tags prompts with UUIDs and observes `command_lifecycle` acknowledgments. On CLIs that have not reported lifecycle events, its fallback treats a successful input write as accepted. That fallback cannot establish when Claude consumed the prompt. The author reports testing with 2.1.296; no minimum version for lifecycle acknowledgments was verified here. HAPI uses its own SDK wrapper, so installing a newer Agent SDK package alone would not implement this behavior.

This task researches Claude integration only. No Claude implementation, automatic adoption or cherry-pick is authorized by this note.
