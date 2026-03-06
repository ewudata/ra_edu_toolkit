# Operator Query Mastery Design

Topic: Persist per-user mastery for operator-based relational algebra queries so users can practice selectively based on progress.

Date: 2026-03-06

## Problem

The operator-based relational algebra page lets users browse the full query catalog or narrow it by selected operators, but it does not remember which queries a signed-in user has already mastered. As a result, users cannot easily focus on unfinished questions or review only the queries they have already completed successfully.

## Goal

Record per-user mastery for operator-based queries and use that progress to support selective practice.

## Mastery Rule

A query is marked as mastered when the user submits a correct answer for that query at least once.

## Recommended Approach

Store mastery per user and per query, then expose a compact progress filter alongside the existing operator filter.

This keeps the model aligned with the current query catalog, supports immediate selective-practice use cases, and leaves room for future aggregate progress views without changing the storage model.

## Alternatives Considered

### 1. Track attempted instead of mastered

Rejected because a failed or exploratory submission does not mean the user has completed the concept. Mastery is a cleaner basis for selective practice.

### 2. Track operator-level mastery only

Rejected because users practice concrete exercises, not just operator categories. Operator summaries can be derived later from per-query mastery.

### 3. Store full submission history and derive mastery from it

Rejected for now because it is more infrastructure than the current selective-practice requirement needs.

## Design

### Data Model

Persist a minimal mastery record keyed by:

- `user_id`
- `database_name`
- `query_id`
- `mastered_at`
- `updated_at`

This should be an upsert-friendly model so repeated correct answers do not create duplicate records.

### Backend

- Add a storage layer for mastery records scoped to authenticated users.
- Add a read API that returns the mastered query IDs for a selected database.
- Add a write path that records mastery when a relational algebra exercise evaluation is correct.
- Keep the write path non-blocking from the user perspective as much as possible; the correctness result should remain primary.

### Frontend

- Extend the operator-based query page with a second filter: `All`, `Unmastered`, `Mastered`.
- Keep the existing operator multiselect unchanged.
- Apply filters in sequence:
  1. operator match
  2. progress match
- Annotate each query in the list with a mastery indicator so users can see progress even in the `All` view.

### Default Behavior

Default the progress filter to `Unmastered`.

That supports the main use case directly: continuing practice on unfinished material.

### Failure Handling

- If mastery data fails to load, do not block query practice.
- Fall back to showing the unannotated catalog and surface a lightweight warning if needed.
- If mastery persistence fails after a correct answer, do not hide the successful evaluation result. Show a non-blocking error or warning instead.

## Scope

This design applies to operator-based relational algebra practice. It does not require changes to SQL exercises or the RA ↔ SQL reference page.

## Testing

- Backend tests for writing mastery on correct evaluation results.
- Backend tests for not writing mastery on incorrect results.
- Backend tests for listing mastered queries for a user/database.
- Frontend tests for filtering query lists by `All`, `Unmastered`, and `Mastered`.
- Frontend tests for preserving difficulty ordering and existing operator filtering.
- Frontend tests for showing mastery indicators in the query list.

## Expected Outcome

Signed-in users can return to operator-based practice and focus on unmastered questions, review mastered questions, or view the full catalog with visible mastery state.
