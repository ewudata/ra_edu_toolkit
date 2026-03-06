# Operator-Based Query Mode Design

**Goal:** Merge the separate pre-defined query mode into the operator-based mode so catalog-backed practice has a single entry point.

## Summary

The relational algebra exercises page currently exposes two catalog-backed modes:
- `predefined`, which shows the full query catalog
- `operators`, which requires the user to pick operators before any query appears

This change removes the separate `predefined` mode and keeps a single catalog-backed mode based on operator filtering. In that mode, an empty operator selection means "show all queries."

## UI Behavior

- Replace the two catalog-backed practice cards with one operator-based card and the existing custom-query card.
- Keep the current operator multiselect.
- When no operators are selected, show the full available query list.
- When one or more operators are selected, show only matching queries.
- Keep the existing no-match message when the active operator filter yields zero queries.

## State And Data Flow

- Remove the `predefined` practice-mode branch from the page flow.
- Continue using the existing catalog fetch and sorting logic.
- Reuse `_query_matches_selected_operators(...)` for filtered results.
- Interpret an empty `operator_filter_select` as no filter rather than an incomplete selection.

## Error Handling

- Keep the current warnings when catalog data is unavailable.
- Keep the current informational message when the selected database has no available catalog queries.
- Keep the current no-match message for selected operators that yield no results.

## Testing

- Update frontend tests so operator mode remains the single catalog-backed path.
- Add coverage for the empty-selection case to confirm it means "show all queries."
