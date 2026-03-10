---
name: Work
description: Continue development using current focus, roadmap, and backlog
---

Environment

This project runs on a live development server.

- Code changes take effect automatically when files are saved.
- Do NOT run `npm run build` during normal development.
- Only run `npm run build` when explicitly preparing a production build or verifying packaging.

Goal

Continue development by following the project priorities and task list.

Priority order

1. planning/current-focus.md (user priorities)
2. planning/workstreams.yaml (project roadmap)
3. planning/backlog.json (task queue)

Rules

Current focus handling

- Items in `planning/current-focus.md` override backlog tasks.
- If a backlog task conflicts with an item in current-focus.md, stop and ask the user for confirmation.

If the user confirms:
- Mark the backlog task as `superseded`.
- Complete and remove the item in `current-focus.md`.

If the user declines:
- Remove the item from `current-focus.md`.
- Continue normal backlog workflow.

Maintenance
- Keep the structure of `current-focus.md` even if the problem list is empty.

Workflow

Session initialization

1. If this is the first run in this chat session:
   - Read `docs/architecture.md`.
2. Read `planning/current-focus.md`.
3. Read `planning/workstreams.yaml`.
4. Read `planning/backlog.json`.

Task selection

5. Identify the highest priority unfinished task.
6. Explain the chosen task and the planned implementation approach.

Implementation

7. Locate relevant code files.
8. Implement the smallest change needed to complete the task.
9. Avoid large refactors unless required.

Verification

10. Ensure the code logically works.
11. Confirm the task acceptance criteria are satisfied.

Project updates

12. Update `planning/backlog.json` to reflect task status and update `planning/workstreams.yaml` if milestone progress changed.
13. If a current-focus item was resolved, remove it from `current-focus.md`.

Completion

14. Summarize the work completed.
15. Write an entry to `docs/changelog.md`.
16. Suggest the next 2–3 tasks from the backlog.
17. Ask the user which task to work on next.