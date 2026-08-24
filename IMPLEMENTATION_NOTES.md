# Implementation Notes

## 1. What I changed

**Task 1 — seeded bugs**
- `diff.util.ts`: change detection compared only `unitPrice`, so quantity- or description-only
  edits were reported as `unchanged`. Extracted a `sameItem()` helper that compares every
  reviewer-visible field (quantity, unitPrice, description).
- `cr-detail.component.ts`: `canApprove`/`canReject` looked only at CR status. Both now also
  require `canApprovePolicy(user)` (the provided helper), so a `cr_r_o`-only viewer gets no
  enabled actions.

**Task 2 — list**
- Implemented `visibleRows`: `ALL` passes rows through; any other value filters by status.
  Loading/empty/error states stay driven by the load, not the filter.

**Task 3/4 — detail**
- `timeline` getter sorts a copy of the audit oldest-first (fixtures arrive newest-first; the API
  appends on transition, so order is not guaranteed).
- `approve()`/`reject()` share a private `runAction()` wrapper: sets `submitting`, clears the
  previous `actionError`, calls the API; on success swaps the fresh CR into the view state, on
  failure keeps the loaded CR on screen and shows the error. `finally` releases `submitting`.
- Reject requires a non-blank reason (custom `nonBlank` validator — `Validators.required` would
  accept whitespace). A guarded `reject()` marks the control touched instead of calling the API.
- Added a visible "Submitting…" status while an action is in flight.
- Detail emits a `changed` event after a successful action; the demo shell uses it to re-load the
  list so both panes agree on the CR's status.
- One-line CSS fixes: explicit page background (dark-mode browsers rendered black-on-black) and
  spacing between timeline fields.

## 2. Component & state model

Both screens keep a single `ViewState<T>` (`idle → loading → loaded/empty/error`) and the
templates switch on `state.status`, so every state is explicit and testable. Derived data
(`visibleRows`, `diff`, `timeline`, `canApprove`, `canReject`) are getters computed from that one
state plus the session user — no copies to keep in sync. Actions add exactly two fields:
`submitting` (one in-flight action at a time) and `actionError` (failure banner). Data flows one
way: mock API promise → `state` → template.

## 3. Invariants I keep

| Invariant | How / where |
|---|---|
| Only one action in flight | `submitting` guard in `runAction()` + `[disabled]` on both buttons |
| Actions need status AND policy | `canApprove`/`canReject` getters; template `*ngIf`/`[disabled]` |
| Read-only users see data, no actions | Approve disabled, reject block `*ngIf="canReject"` hidden |
| Reject never fires without a reason | `nonBlank` validator + disabled button + guard in `reject()` |
| A failed action never blanks the view | failure path only sets `actionError`; `state` untouched |
| Timeline is chronological | `timeline` getter sorts by `Date.parse(at)` on a copy |
| List and detail agree after an action | `changed` output → shell re-loads the list |

## 4. Testing strategy

Component/DOM tests (TestBed + jsdom) for everything the reviewer can see: list states, filter
narrowing, diff row classification, totals/delta text, timeline order, the approve/reject flows,
failure recovery, double-submit prevention (driven by `latencyMs`), reject validation, viewer
permissions, and cross-org "Not found". Pure-function tests for `computeDiff` edge cases.
Deliberately skipped: visual styling, the demo shell glue, and the mock API itself.

## 5. Assumptions

- Reject is part of the same approval decision, so it is gated by the same approve policy
  (there is no separate reject policy string in the convention).
- A filter with zero matches shows the table with no rows (the "empty" state is reserved for
  "the org has no CRs at all").
- Action timestamps use client `new Date().toISOString()` — acceptable against a mock API; a real
  backend would stamp server-side.
- `sameItem()` treats a description edit as a change, since the reviewer sees descriptions.

## 6. Where I used AI

I used Claude Code (Anthropic) as a pair programmer throughout: it drafted the bug fixes, the
detail-page action handling, and the test suite under my direction, and I reviewed, ran, and
verified everything (full test suite, lint/typecheck/format/build, and a manual click-through of
every flow — including slow-network and failure paths — in the running app). The judgment calls in
§5 and the scope of what to test are mine. No AI-generated code went in unreviewed.

## 7. What I'd improve with more time

- Debounce/coalesce list reloads and preserve the selected filter across reloads.
- An optimistic-UI variant of approve/reject with rollback, behind the same `runAction` seam.
- Success feedback (toast/status line) after an action, not just the status pill change.
- Accessibility pass: focus management after actions, `aria-live` on the busy/error lines.
- E2E smoke (Playwright) over the demo shell to cover the list↔detail wiring.
