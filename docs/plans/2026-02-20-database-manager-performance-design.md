# Database Manager Performance Design

Date: 2026-02-20
Topic: Database Manager page rerun latency
Status: Approved

## Problem Statement
The Database Manager page is slow on every interaction because Streamlit reruns the full script and the current render path eagerly fetches expensive schema data for every database.

Observed hotspots:
- Frontend eagerly calls schema per database during render.
- Backend schema loader downloads and fully parses each CSV table.
- Location resolution and dataset metadata lookups repeat for each schema call.
- No effective rerun-level caching in the Database Manager page.

## Goals
- Make Database Manager interactions responsive.
- Reduce per-interaction network and parsing load.
- Preserve current core functionality (list DBs, previews, import/delete).

## Non-Goals
- Full persistent metadata migration for all existing datasets.
- Broad redesign of unrelated pages.

## Recommended Approach
Balanced change with strong performance gain:
- Lazy-load table previews only for the database being viewed.
- Add/adjust backend schema preview path to avoid full-file parsing.
- Add targeted frontend and backend caching with explicit invalidation on import/delete.

## Architecture
1. Keep `/databases` as lightweight list endpoint.
2. Remove eager schema loading from initial Database Manager render.
3. Load schema preview only when user opens a specific database section (or presses a load-preview control).
4. Cache per-database preview data and reuse across Streamlit reruns.
5. Invalidate cache entries when database state changes.

## Components and Data Flow
### Frontend (`frontend/pages/1_🗄️_Database_Manager.py`)
- Cache health check and database list reads.
- Replace eager loop-level `get_database_schema` with conditional fetch.
- Store preview payload in `st.session_state` by database name.
- On import/delete/hide success, clear affected cache/session keys and rerun.

### Backend (`backend/routes/databases.py`, `backend/services/datasets.py`)
- Provide lightweight schema preview path:
  - Read only first `N` rows for preview (`nrows=sample_rows`).
  - Derive columns from preview/header.
  - Avoid full dataframe materialization for entire file.
- Row count handling:
  - Either omit row count in preview mode, or
  - Compute approximate count using cheap line-count strategy.
- Optional short-TTL in-memory cache keyed by `(user_id, database, sample_rows)`.

## Error Handling
- Preview failure should degrade locally per database section (warning only there).
- Initial auth/health/list errors remain page-level blockers.
- If stale cached preview exists and refresh fails, continue showing cached content with warning.

## Testing Strategy
### Backend
- Schema preview returns expected columns and sample rows.
- Large CSV path avoids full parse behavior.
- Proper 404/400 behavior for missing/invalid targets.

### Frontend (behavioral/manual + automated where available)
- Initial page load does not fetch schema for all databases.
- Expanding/loading one database triggers only one schema request.
- Repeated interactions reuse cached preview data.
- Import/delete invalidates caches and refreshes correctly.

## Success Criteria
- Interactions no longer re-trigger all-database/all-table preview work.
- Significant reduction in request volume and payload processed per interaction.
- No regression in visible preview correctness for loaded databases.

## Rollout and Risk
- Rollout behind normal branch flow; no feature flag required.
- Primary risk: stale cached preview after data changes.
- Mitigation: explicit cache invalidation after import/delete/hide operations.

## Follow-up Implementation Plan
Next step is to invoke the `writing-plans` skill and produce a concrete task-by-task implementation plan from this design.
