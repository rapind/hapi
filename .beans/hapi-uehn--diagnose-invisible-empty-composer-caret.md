---
# hapi-uehn
title: Diagnose invisible empty composer caret
status: todo
type: bug
priority: normal
created_at: 2026-10-19T04:22:53Z
updated_at: 2026-10-19T04:54:06Z
---

Scrollbar fix is confirmed deployed, but the user still cannot see the empty composer caret. Establish whether direct click focuses the field, then reproduce the remaining focus or painting failure before editing.

Current Chromium fixture: empty field is unfocused after reload because automatic focus was disabled to stop caret jumps. Clicking directly focuses it; computed caret color equals visible text, height 26px exceeds 22px line height, selection is 0..0. Headless screenshots also omit the caret for a separate native textarea control, so they cannot establish a painting failure. Awaiting whether direct click reveals the caret on the user device.

User clarified that the caret appears once typing starts, but not in the focused empty input. A controlled screenshot comparison with caret-animation:manual confirms empty caret painting works in the local Chromium fixture. Initial padding hypothesis was disproved by repeating with blinking frozen; no product CSS changes made. Added a temporary pixel comparison test that passes on current code, so it is not yet a regression reproducer. Need browser/device identification to reproduce the remaining issue.

The frozen-caret comparison also passes with the personal dark palette. Removed the temporary passing test rather than keep coverage that cannot catch the user-reported failure. No product changes made or deployed. Browser and dev server cleaned up.

User confirms Chrome shows the empty caret and Safari does not. Scope the remaining investigation to WebKit/Safari; do not change working Chrome focus behavior.

Installed a Nix WebKit browser and software Mesa renderer for local testing. The global playwright-cli is incompatible with this older WebKit build; a matching Playwright 1.59.1 driver runs successfully. A screenshot pixel comparison detects 19 caret pixels for the current HAPI style, extra padding, no placeholder, a space placeholder, overflow visible, and typed text. Thus Linux WebKit also does not reproduce the user Mac Safari symptom. Created /tmp/hapi-safari-caret-test.html with six numbered native/style comparisons for a user-device feedback loop; sent the file in HAPI. No application changes deployed.

Parked at the user request. Latest device comparison: Chrome and iOS show the empty caret; desktop Safari on the user Mac does not. Awaiting optional results from the attached six-box diagnostic page if resumed. No further code changes or deployment.
