# Frontend Implementation State

## Context
- Repo: `/Users/costindinoiu/Documents/Dev/Projects/js/taskbar2`
- Branch head at start: `7875628`
- Backend contract source of truth: scheduler WS contract v2 + websocket events docs in backend repo.

## Locked Decisions
1. Calendar remains hybrid:
   - materialized occurrences fetched from backend (`occurrences_fetch`) are authoritative;
   - virtual rows are generated from schedules for future horizon coverage.
2. Beyond-horizon mutations target `schedule_id + anchor_occurs_at`.
3. Deleted occurrences are excluded from fetch and handled via delete events/local tombstones.

## Execution Checklist
- [x] Add compatibility alias handling for `user_settings_update` WS event.
- [x] Verify mutation payload shaping remains contract-compliant for scoped edits.
- [x] Add WS scenario runner script to simulate calendar flows without Electron UI driving.
- [x] Document script usage and expected outputs.
- [x] Run scenario checks against backend and capture pass/fail notes.

## Notes Log
- Initialized state file.
- Added `user_settings_update` alias handling in `src/main/socket/handlers.js`.
- Added script `scripts/ws-calendar-scenarios.mjs`.
- Added npm script: `calendar:ws-scenarios`.
- Script usage:
  - `TASKBAR_WS_URL=ws://127.0.0.1:8080/ws/taskbar npm run calendar:ws-scenarios`
  - optional envs: `TASKBAR_TEST_EMAIL`, `TASKBAR_TEST_GOOGLE_UID`, `TASKBAR_WS_EVENT_TIMEOUT_MS`.
- Scenario validation:
  - Initial run exposed no-occurrence polling assumption; script updated to force anchor materialization via `occurrence_edit(single)`.
  - Subsequent run exposed expected anchor-delete nuance after cancel; script updated to use `occurrence_id` for delete-after-cancel.
  - Final run passed end-to-end against local backend.
- Added canonical RRULE comparison in `calendarWindow.js` so unchanged RRULE text does not get sent as a false `changes.rrule` on occurrence edits.
- 2026-03-01: Hardened schedule projection anchor in `calendarWindow.js`.
  - `buildOccurrenceDatesForSchedule(...)` now always passes `dtstart` from `schedule.start_local` to `rrulestr(...)`, even if rule text contains `DTSTART`.
  - Prevents stale embedded `DTSTART` from masking split-series time shifts in virtual rows.
