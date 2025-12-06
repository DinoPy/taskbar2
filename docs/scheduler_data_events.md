# Scheduler data & event surface

This document summarizes what the backend already provides for the calendar view and which WebSocket events mutate or delete each kind of entity.  Use it as a reference for wiring the UI to the backend data streams.

## 1. Data the server already spills out

- **Connected payload (on `connect`)** – returns the authenticated user plus:
  - `tasks`: the current active tasks for the user (`internal/database/tasks.sql.go`).
  - `notifications`: unseen notifications (with pagination controls available via `notifications_fetch`).
  - `schedules`: every active schedule definition (`internal/database/schedules.sql.go`), including `rrule`, `start_local`, `notify_offsets_min`, `muted_offsets_min`, `show_before_minutes`, `category`, etc.
  - `notifications_unseen_count` via a broadcast after connect.
  - `occurrences_start`, `occurrences_end`, `occurrences`: the planner records between now (truncated to the day) and the schedule horizon so you can render repeating blocks immediately. Each occurrence references its `schedule_id` and carries `occurs_at` + `rev`.

- **Real-time pushes**:
  - `new_task_created` / `related_task_*` supply instant task updates (see `websockets_custom_events.go` around the task handlers).
  - `notification_created`, `notifications_marked_seen`, `notification_snoozed`, `notifications_reemitted` keep the notification list in sync (`dispatcher_service.go` and the notification handlers).
  - `schedule_created`, `schedule_updated`, `schedule_deleted` reflect recurring definition changes.

- **Occurrences** – new event `occurrences_fetch` queries `occurrences` (from `sql/queries/occurrences.sql`) between two timestamps so the UI knows about every planned instance even before a task materializes. Response is emitted through `occurrences_list`. Each occurrence references its parent schedule via `schedule_id` and carries `occurs_at` + `rev`.

- **Linkage data**:
  - `task_links` ties an `occurrence_id` to a `task_id`, letting you decorate an occurrence with the actual task details once the planner has created it.
  - `notification_jobs` holds queued notifications; when the dispatcher fires, we insert a row into `notifications`, broadcast it, and mark the job as `sent_at` (`internal/database/notification_jobs.sql.go` and `dispatcher_service.go`).

## 2. CRUD surfaces for the calendar

### Instant tasks (`tasks`)

| Action | WebSocket event | Effect |
| --- | --- | --- |
| Create a manual task | `task_create` | Persists the provided task row and broadcasts `new_task_created` to siblings. |
| Toggle (start/pause) | `task_toggle` | Updates duration/is_active/last_modified and broadcasts `related_task_toggled`. |
| Edit metadata | `task_edit` | Updates title/description/category/tags/priority/due date/visibility and emits `related_task_edited`. |
| Complete | `task_completed` | Sets `is_completed`, `completed_at`, and notifies others via `related_task_deleted`. |
| Delete | `task_delete` | Deletes the row and emits `related_task_deleted`. |
| Duplicate | `task_duplicate` | Creates a fresh task row & broadcasts `new_task_created`. |
| Split | `task_split` | Runs a transaction to delete the source and insert multiple tasks, emitting delete + create events. |

These events mutate the `tasks` table directly. The scheduler only re-materializes tasks for recurring runs, so once a row exists the calendar UI can edit/delete it through the same `task_*` commands above.

### Recurring definitions (`schedules`)

| Action | Event | Notes |
| --- | --- | --- |
| List all schedules | `schedule_list` → `schedules_list` | Useful for building the recurrence legend/filters; includes every column defined in `sql/schema/012_schedules_and_scheduler.sql`. |
| Create a new recurrence | `schedule_create` | Inserts a `schedules` row; a schedule may be `kind=task` (task materialization + notification jobs) or `kind=reminder` (notification but no task). |
| Edit a recurrence | `schedule_edit` | Cancels future `notification_jobs`, deletes future `occurrences`, increments `rev`, updates the schedule row, and returns `schedule_updated`. The planner will rebuild occurrences/tasks for the new rule. |
| Delete a recurrence | `schedule_delete` | Cancels future jobs, removes future occurrences (which cascades to their `task_links`), deletes the schedule, and replies with `schedule_deleted`. |
| Natural-language reminders | `reminder_submit` | Creates a schedule for an instant or recurring reminder; if the reminder is imminent, `processImmediateReminder` adds the first occurrence/task and schedules the first notification synchronously. |

The `schedule_create` payload (and the `reminder_submit` flow that drives it) accept an optional `common_language` string so the backend knows what textual input produced the recurrence definition or instant schedule.

Recurring updates are reflected in `new_task_created` (when the planner materializes an occurrence) and in `notification_created` when notification jobs fire.

### Occurrences (`occurrences`)

- **Access pattern** – client emits `occurrences_fetch` with a `start`/`end` range and receives `occurrences_list`. Query uses `GetOccurrencesInRange` and returns the planner-generated rows even before tasks exist.
- **Data shape** – each occurrence has `{ id, schedule_id, occurs_at, rev }`. Use `schedule_id` to look up metadata from the schedules list, and optionally resolve `task_id` via `GetTaskIDForOccurrence` when you want to treat materialized tasks differently.
- **What happens when the scheduler runs** – `ScheduleService` computes the next up-to-`horizon` occurrences, upserts them in `occurrences`, then:
  1. If `kind == "task"`, `ensureTaskForOccurrence` creates a `tasks` row and links it.
  2. Regardless of kind, `createTaskNotificationJobs` / `createReminderNotificationJobs` enqueue offset-based notifications in `notification_jobs`.

The UI should poll new occurrences when the user pans the calendar—there is no push for every planner tick.

### Notifications (`notifications`)

- **Access** – `notifications_fetch` supports offset/limit/filters; the `connected` response and the `notifications_batch` data carry the same `Notification` model from `internal/database/models.go`.
- **Mutations**:
  - `notification_mark_seen` / `notification_mark_all_seen`.
  - `notification_archive`.
  - `notification_snooze` (supports millis/minutes/seconds).
  - The cron job `DispatchDueNotifications` also releases snoozed notifications (`notifications_reemitted`).

- **Relationship to calendar** – each notification payload includes `schedule_id` and `occurrence_id`, so you can highlight the associated occurrence even before the user clicks it.

## 3. Keeping the client in sync

- Listen to `new_task_created`, `related_task_*`, and `tasks_became_visible` for manual task updates.
- Listen to `schedule_created`, `schedule_updated`, `schedule_deleted` to refresh your recurrence catalog, then re-query occurrences for the current viewport.
- Listen to `notification_created`/`notifications_reemitted`/`notifications_unseen_count` to surface reminder popups.
- If you modify a recurrence, the backend automatically cancels future notification jobs and occurrences before applying your edit, so simply re-fetch occurrences in the affected range after `schedule_updated` or `schedule_deleted`.

## References

- Scheduler planner: `schedule_service.go`, especially `processSchedule`, `ensureTaskForOccurrence`, and the notification job helpers.
- Notification dispatch: `dispatcher_service.go` and `database/notification_jobs.sql.go`.
- Database schema: `sql/schema/012_schedules_and_scheduler.sql`.
