# TODO Copy - Consolidated Backlog

Source: merged from `todo.md` (duplicates merged, related items grouped, completed items removed).

## 1) Stability & Regression Fixes (P0)
- [ ] Fix calendar not showing schedules/occurrences and prevent UI-created duplicates (same `occurrence_id` + `occurs_at`).
- [ ] Fix app/window position restore on OS resume + display reconnect (persist preferred screen/side/coords by display identity).
- [ ] Investigate and fix `MaxListenersExceededWarning` / listener lifecycle leaks.
- [ ] Fix category rendering consistency:
  - category header remains after completion
  - task does not move between category groups after category edit
  - command input errors after related updates
- [ ] Fix intermittent task timer not stopping when toggled off.
- [ ] Fix notification window auto-open behavior after schedule create (opens and does not close correctly).
- [ ] Fix reminder/snooze dropdown positioning when near screen edges.

## 2) Scheduler + Calendar Domain (P0/P1)
- [ ] Unify schedule/occurrence/task lifecycle so instant + recurring schedules are always visible and explainable from UI.
- [ ] Define event rendering model in calendar:
  - reminders vs tasks
  - collisions/overlap strategy
  - high-frequency event compression (e.g. every 30 min)
- [ ] Add calendar filters and search (by text/category/type/state).
- [ ] Add calendar views beyond week (2-week, month).
- [ ] Add ability to edit/delete from calendar with scope choices (single/current/future/all where applicable).
- [ ] Show all relevant task timelines in calendar:
  - scheduled occurrences
  - task active intervals (toggle history)
  - due intervals / "show before" behavior
- [ ] Improve visual encoding consistency (symbol/system instead of unstable color mapping when far in future).
- [ ] Ensure one-time/consumed schedules remain visible in history mode with clear status and deletion options.

## 3) Reminders + Natural Language Parser (P0/P1)
- [ ] Parser correctness:
  - support `between` ranges (e.g. "daily from 9 to 18 every 30 minutes")
  - prevent past instant dates when intent is future
- [ ] Improve reminder creation UX:
  - faster popup open
  - optional quick entry mode (`r1`-style shortcut path)
  - optional advanced RRULE builder (form mode)
- [ ] Reminder payload expansion:
  - tags
  - category
  - description
  - reminder offsets/multi-select
- [ ] Clarify snooze semantics:
  - preserve original due time
  - track snooze history/count
  - decide whether occurrence data is mutated on snooze
- [ ] Fix missing due date bug for some future-day reminders.

## 4) Notifications System (P0/P1)
- [ ] Data + ordering improvements:
  - show date/time clearly
  - order instant notifications by due date
  - show consumption status
- [ ] Ensure all list tabs paginate/load correctly:
  - New
  - History (initial + infinite scroll)
  - Snoozed
  - Archived
- [ ] Close behavior: auto-close window when active tab has no items (if configured).
- [ ] Add filtering/sorting dimensions (tags/categories/type/status).
- [ ] Add due-task notification strategy (including alarm behavior and escalation rules).
- [ ] Add archive + snoozed lifecycle actions with server parity.
- [ ] Evaluate integrations for delivery channels (Slack/Google/etc.) without over-spam.

## 5) Tasks + Main Window + Command UX (P1)
- [ ] Move due-date visibility logic fully server-side (client becomes event-driven).
- [ ] Ensure every task (including schedule-created) has consistent duration metadata.
- [ ] Add multi-task delete confirmation patterns and improve destructive-action clarity.
- [ ] Improve main taskbar interactions:
  - mini/quick edit concept (tags/category/due)
  - better focus behavior
  - export tasks
  - large/important tasks highlight lane
- [ ] Improve category filtering UX:
  - command-based category toggles
  - presets
  - resilient state after resume
- [ ] Commands:
  - left/right bar scrolling commands
  - chained commands in one input
  - richer command grammar
- [ ] Tag quality workflow:
  - warning for untagged tasks
  - tag recommendations from title/category

## 6) Edit / Split / Completed / Popup UX (P1/P2)
- [ ] Edit window:
  - title input outline/focus behavior
  - tag remove reliability
- [ ] Split window:
  - keyboard-first actions and shortcut map
- [ ] Completed tasks:
  - mass actions (e.g. bulk tag)
  - reorder/read flow improvement by day/time
- [ ] Popups:
  - consistent spacing/shadow/visual tokens across all modal windows

## 7) Backend + Data Contracts (P0/P1)
- [ ] Finalize server-owned due-date and due-task activation model.
- [ ] Schedule delete flow:
  - optional cascade delete of already generated tasks by `schedule_id`
- [ ] Persist natural language text on schedules and expose it cleanly in schedule UI.
- [ ] Define schedule horizon/materialization policy (e.g. 90-day plan) and consequences for UI state.
- [ ] Add auditability for reminder-generated tasks (copy/history log to avoid loss/double-record ambiguity).

## 8) Integrations + Security + Ops (P2)
- [ ] Google Calendar integration research:
  - OAuth model
  - selective sync strategy by category/calendar
  - CRUD mapping rules
- [ ] Optional biometric app access (must be toggleable and low-friction).
- [ ] General async logger/service (external DB + protected web access).

## 9) Future Product Ideas (Icebox)
- [ ] Templates + template schedules (quick search, naming consistency, analytics use cases).
- [ ] Lists as first-class entities (templated, schedulable, mutable before/after trigger, dependency-aware).
- [ ] Goal/objective tracker with periodic check-ins and progress scoring.
- [ ] Additional feature tracks: price tracker, meal planner, rich canvas/notes view, action-count/statistics trackers.

---

## Questions Needed Before Implementation
Please answer inline with `A1`, `A2`, etc. under this section.

1. What are the top 3 categories to execute first?
2. Should we treat this pass as bugfix-only, or include some P1 features too?
3. Do you want one milestone at a time (sequential), or parallel streams?
4. Which deadline/urgency applies to P0 items?
5. For calendar fixes, what is the exact "definition of done" for "shows schedules/occurrences correctly"?
6. For duplicate prevention, should uniqueness be strict on `occurrence_id`, or composite (`schedule_id + occurs_at`) when `occurrence_id` is absent?
7. In calendar, should tasks and occurrences both render at once, or should one be derived from the other to avoid duplication?
8. For overlapping reminders, do you prefer stack/aggregate chips, density collapse, or hidden-with-counter?
9. Which calendar views are mandatory now: week only, week+month, or week+2week+month?
10. For edit/delete from calendar, what scope options do you want: current only, future only, all?
11. When editing recurring events, should we clone exceptions, or mutate series rules with exclusions?
12. Should consumed one-time schedules remain visible forever, or auto-archive after X days?
13. Do you want task activity timeline (toggle intervals) in calendar now, or as a separate phase?
14. For parser behavior, should any parsed past datetime auto-roll to next valid future occurrence?
15. For `between` syntax, should out-of-range occurrences be skipped or shifted?
16. For reminder popup speed, what latency target is acceptable (e.g. <150ms to visible)?
17. Should `r1` open a compact reminder flow with defaults, or a full reminder form prefilled?
18. For snooze semantics, should original due datetime remain immutable and snooze stored as overlay metadata?
19. Do you want a visible snooze history trail per notification/schedule?
20. Notifications: should New tab load all items at once, or page in chunks (if so, chunk size)?
21. Should notifications auto-close only in auto mode, or in manual mode too when empty?
22. Due-task alarms: one-time sound, repeating until ack, or escalating pattern?
23. Do you want cross-channel notifications (Slack/Google/etc.) in this cycle or later?
24. Should due-date visibility be fully server-authoritative immediately, or behind a feature flag?
25. For schedule-created tasks, do we set default duration globally, by category, or per schedule template?
26. For task export, preferred format: CSV, JSON, markdown, or all?
27. Commands: do you want to keep the current parser and extend, or replace with a formal command grammar?
28. Category presets: please list desired preset groups and expected behavior when "All categories" is toggled.
29. For untagged-task warning, should it block completion, warn passively, or enforce only on selected categories?
30. For tag recommendations, should we start rule-based (local) or model-based (AI/API)?
31. Split window shortcuts: confirm desired keymap (submit/add row/delete row/navigation).
32. Completed tasks ordering: newest day first with top-to-bottom within day confirmed?
33. Schedule delete: should cascade delete default to OFF with confirmation each time?
34. Natural language persistence: should we store raw input only, or raw + normalized rule explanation?
35. Calendar integration: one-way export first, or full bidirectional sync now?
36. If calendar sync is enabled, should it be category-scoped, schedule-scoped, or per-event opt-in?
37. Biometrics: app-launch unlock only, or also for sensitive actions (delete/export/sync settings)?
38. Logger system: what data is allowed to leave local device (PII/task text constraints)?
39. For "task lists" feature, should lists create tasks immediately, on schedule trigger, or both?
40. What should I implement first after your answers: pick one concrete ticket as the starting point.
