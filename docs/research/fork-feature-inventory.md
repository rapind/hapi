# Fork feature inventory

Checked 2026-10-21 against `personal/composer-essentials` at `327cabda`. Source: `git log origin/main..HEAD` (66 commits by Dave Rapin, plus 11 by upstream authors that arrived through merges) and the branch list. Every local and remote branch other than `origin/main` and `origin/deploy` is already merged into this branch (checked with `git rev-list HEAD..<branch>`); none holds unmerged work.

This lists what the fork changed or added, grouped by what a from-scratch rewrite would need to reproduce. It records behavior, not implementation. "Commit" points at the best place to read the original.

## 1. Agent behavior

| Feature | What it does | Commit |
| --- | --- | --- |
| Always YOLO | Every chat runs in bypass-permissions mode. New Chat, `spawn_peer` and the raw machine-spawn endpoint accept no `permissionMode` or `yolo`. Mode pickers are gone. | `2d7920cd` |
| Always steer | Messages sent while an agent is working are delivered into the running turn automatically for Codex, Cursor ACP, Pi and Claude. No Queue/Steer setting anywhere. Slash commands, compaction and incompatible modes fall back to a normal queue. | `ebbbe08b`, `7157b208` |
| Claude steering | Native stream-json input with lifecycle acknowledgments (`queued`, `started`, `cancelled`). Delivery is confirmed only when Claude says the prompt started. A lost acknowledgment leaves the message "uncertain", never silently replayed. | `7157b208` |
| Claude steers use `priority: "now"` | Cuts the turn at the next tool boundary, including inside a foreground subagent (the subagent is killed). Background subagents keep running. Verified on Claude Code 2.1.306. | `3f0521c5` |
| Reduced Claude usage warnings | Repeated rate-limit warnings are collapsed. | `3deb6697` |
| Protected chat titles | A title you rename by hand is never overwritten by auto-titling. Agents can also rename saved chat titles. | `4add399b`, `4ea3746d` |

The reasoning and live evidence for steering are in [claude-steering.md](claude-steering.md).

## 2. Agent-to-agent tools (MCP and CLI)

| Tool | What it does | Provenance |
| --- | --- | --- |
| `spawn_peer` | An agent creates a new chat with the full New Chat option set. Omitted options inherit shared defaults stored per namespace, machine and agent. | Fork, `489e9394` |
| `archive_peer` | An agent archives itself (`--self`) or another chat. Same stop-and-archive path as the UI; history is kept; Reopen undoes it. | Fork, `7a04c6f6` |
| `request_sops_secret` | The agent asks you for a credential; you paste it into a masked field in the web chat. The browser encrypts it for the local helper, the hub only relays ciphertext, and the helper writes it into a SOPS-encrypted file. The plaintext never appears in chat, terminal replay or request metadata. | Fork, `3aa8353e` |
| `ping_peer`, `inspect_peer`, `list_peers` | Message, read and discover other sessions. | Upstream (HeavyGee); heavily used here |

## 3. Chat UI behavior

- **Composer is a plain `<textarea>`.** No rich editor, no contenteditable (`815a1d12`).
- **Edits stay at the cursor** instead of jumping (`63f4d6d4`).
- **Safari empty-composer caret stays visible** (`9ce30459`; the investigation notes are in `8d47eb3a`).
- **Composer keeps focus while a message is sending.** The field is read-only, not disabled (`327cabda`).
- **Trimmed toolbar:** attach, model, stop. Layout customization and the other buttons were removed, a net deletion of about 1,500 lines (`4139ab1a`).
- **Phone:** mode controls moved into composer settings (`9fc720ed`); reduced side padding (`2a91f368`).
- **Codex settings that have not changed are not waited on** when you send a message (`30b20da3`).
- **No chat activity toasts** (`15c8e95a`).
- **No back button beside the sidebar** (`dbc4d3f8`).
- **Per-message read-aloud**, limited to conversational text. It skips code, terminal prompts, image descriptions, notification metadata and commit hashes, and hides the control on terminal-output messages (`352467a9`, `7829d174`).
- **Tool groups show no action-count badges** (`1bd10c2d`).
- **Short effort labels** in the status line (`d4ee89cc`).
- **Empty chats load older hidden history on entry** (`44a4a35a`).
- **Claude subagent rows no longer push the visible transcript out of the 400-row window** (`44e71123`).

## 4. Sidebar and navigation

- **Chats ordered by creation date**, stable (`e475019c`).
- **Project folding restored** and headers aligned (`54a7e707`).
- **App fullscreen** from the header (`635550fc`).
- **Search clear button** at 48px, with the calendar beside it (`317e39a0`, from upstream).

## 5. Visual design

All CSS and theme work, so a rewrite can start from the result rather than the diffs.

- A single personal color theme (`d531492a`, `src/themes/personal.ts`); warm chat, sidebar and composer colors; neutral compact composer (`31d0a7d6`, `744ae9ce`, `ed4f3e3c`, `7c12ce02`).
- One unified chat canvas, full-width chat, aligned gutters, tighter header (`7dc1ee36`, `1345402f`).
- Message text colour matches the user bubble; inline code matches highlights (`931bbddc`, `fa49785c`).
- Typography: 130% font size option and tuned bubble spacing (`af4c0bc8`, `55d69d72`).

## 6. Reliability work

These fix problems that only appear at scale or after reconnects, so a rewrite should expect to need equivalents.

- Cold history replay no longer floods the hub (`f9455849`).
- Unchanged history metadata is skipped on replay (`9578c69c`).
- User-message projection: reserve during durable confirmation, discard after reconnect, record the turn mapping only after the current confirmation (`5a8d38bf`, `67209c76`, `9121b981`).

## 7. Deploy workflow

Not in the product, but part of how the fork runs:

- Personal changes go on `personal/<name>` branches, then `deploy` is fast-forwarded to them.
- The hub and runner run from `~/.local/share/hapi-font-size/` through systemd drop-ins. Web-only changes can be applied to the hub alone by pointing the hub unit at a new binary path.
- The runner restarts itself when the shared `hapi` binary's mtime changes, so do not overwrite that file casually.

## Rewrite scope (owner decisions, 2026-10-21)

### Keep

- **Everything in sections 1 to 6 that is not listed under "Drop"**, including per-message read-aloud. It uses the browser's speech synthesis, with no speech service behind it, so it is not "integrated voice".
- **Scheduled prompts, including recurring ones.** The use case is a keep-awake nudge that gets an agent moving again when it stalls. Upstream only has one-shot scheduling (a single `scheduledAt`, at most 7 days out); recurrence does not exist and is new work.
- **Send-error retry, in minimal form.** A failed send keeps the text in the composer and shows an error with a retry action. Decide the exact shape when building; the current implementation is a large state machine (`restoredErrorSnapshotRef`, restore guards, suppress hooks) and a rewrite should not copy it.
- **Agents: Claude and Codex, plus Pi for DeepSeek.** DeepSeek is pay-per-token API usage; Claude and Codex are subscriptions.
- **Peer messaging and session @-mentions**, and the fork's `spawn_peer`, `archive_peer`, `request_sops_secret`.
- **Installable web app only.** Safari's "Add to Dock" works for any site on macOS 14 or later. Chrome's "Install as app" needs a web app manifest; its "Create shortcut" works without one. No service worker is needed unless you want offline support.

### Drop

- **All configuration and settings screens.** Behavior is fixed, not chosen, including the fork's hard-coded YOLO and always-steer.
- **All UI customization:** one theme (always dark), one font size, no layout options. The personal theme and the 130% font size become the fixed values.
- **Terminal** (web terminal and its `/terminal` namespace).
- **Integrated voice:** dictation, the voice assistant, ElevenLabs and the enlarge button.
- **Push relay and notifications.**
- **Native iOS and Android apps, Telegram Mini App, the website and the docs site.** It is an internal tool.
- **Scratchlist.**
- **Other agents:** Cursor, Grok, OpenCode, Kimi, Copilot, Antigravity, DeepSeek Harness (`dsh`). Keep Pi; it is the DeepSeek route.
- **Russian and Chinese locales.**

### Later

- **Usage stats and charting.** Low priority. Claude and Codex are subscriptions, so the useful numbers are rate-limit windows and remaining allowance. DeepSeek is pay-per-token API usage, so its useful number is cost. These are two different metrics; design for both when this phase starts. The fork's usage-warning work (`3deb6697`) applies to Claude subscription limits only.

### DeepSeek: Pi (decided; DSH is still beta)

Both already exist in this repo. They are the only integrations that matter for this decision.

| | DeepSeek Harness (`cli/src/dsh`) | Pi (`cli/src/pi`) |
| --- | --- | --- |
| Transport | ACP over stdio to `dsh-acp-demo`, through the shared ACP backend | Its own transport and event converter, about 25 files |
| Resume | None: fresh sessions only | Not checked |
| Steering | Not supported | Supported: its own steer dispatcher |
| Model switching, MCP injection, live tool and reasoning telemetry | None; the integration's own documentation lists these as missing | Not checked |
| Permissions | Always auto-approve, which matches the YOLO policy | Not checked |

DSH's server is described as "automation-only", so it is the thinner option. If you want steering, resume and tool visibility for DeepSeek, Pi probably gives more, but I only read the DSH documentation and the Pi file list, not the Pi behavior. Checking Pi against the DSH column would settle it.
