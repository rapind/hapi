---
# hapi-p7pv
title: Add agent-requested SOPS credential input
status: in-progress
type: feature
priority: normal
created_at: 2026-10-19T02:51:29Z
updated_at: 2026-10-19T03:22:42Z
---

Add a secret-request tool that identifies a SOPS destination, a masked web input, and direct local delivery through stdin. Keep plaintext out of chat, permission state, logs, and terminal replay. Include focused regression tests and cross-package verification.

## Work

- [x] Implement encrypted request protocol and local SOPS writer.
- [x] Wire agent tools, hub routes, and masked web input.
- [x] Add regression coverage and verify relevant packages.
- [ ] Review, commit, and land on deploy (user requested direct landing).

## Verification

All package typechecks pass. Focused CLI regressions: 35 passed, including real SOPS/age integration. Full hub suite: 1427 passed; web: 3336 passed; shared: 338 passed; relay: 118 passed. Fixtures regenerated without drift. Playwright smoke verified browser-to-local encrypted delivery, encrypted SOPS storage, and preservation of unrelated keys; task browser and local servers closed.

Full CLI suite: 3020 passed, 11 skipped, 4 unrelated failures. Three Git fixture commits are rejected by the global author hook because the tests force test@example.com. A skill-discovery test also failed on the rerun (passed on the first run). No unrelated application changes made.

The Git-hook fixture failures are now fixed and the affected 49 tests pass. The skill-discovery test passes in isolation (28 tests). User requested committing, pushing, and merging directly into deploy instead of waiting on a PR.
