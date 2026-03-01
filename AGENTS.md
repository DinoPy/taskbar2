# AGENTS.md

## Session Bootstrap (Required)

For every new chat in this repository, load context in this order:

1. `AGENTS.md`
2. `docs/PROJECT_CONTEXT.md`
3. `docs/HANDOFF.md`

Then start with:

- a 6-bullet summary of project context,
- key assumptions/risks for the requested task,
- the first concrete implementation steps.

Default kickoff prompt to paste in a new chat:

`Read AGENTS.md + docs/PROJECT_CONTEXT.md + docs/HANDOFF.md, summarize key context in 6 bullets, then do: <task>.`

## Project Rules For Agents

- Preserve existing local changes unless the user explicitly asks otherwise.
- Treat these docs as protocol sources of truth:
  - `docs/websocket_events.md`
  - `frontend_scheduler_ws_contract_v2.md`
  - `frontend_user_settings_ws_contract.md`
- Scheduler and calendar work must handle both IPC naming styles:
  - kebab-case (example: `schedule-create`)
  - underscore (example: `schedule_create`)
- Normalize backend nullable wrappers (`sql.Null*` JSON shapes) before UI logic.
- Validate identifiers/timestamps at boundaries:
  - UUID where expected
  - RFC3339 timestamps for schedule/occurrence mutations
- Keep main-process behavior in `src/main/*` and renderer DOM behavior in `src/js/*`.
- If a task is large enough to risk regressions, run a smoke check and report what was validated.

