# Operator Tag Styling Design

**Goal:** Change the selected operator tags in the relational algebra exercises page from the default red styling to white pills with dark text.

## Summary

The operator filter uses Streamlit's multiselect widget, which currently renders selected values with the framework's default accent styling. On this page, that appears as red-selected tags, which does not match the desired visual treatment.

## UI Behavior

- Keep the existing operator multiselect component and filtering behavior.
- Change only the selected-value tag appearance.
- Selected operator tags should render with:
  - white background
  - dark text
  - a subtle light border so they remain visually distinct

## Implementation Approach

- Add page-local CSS in the relational algebra exercises page.
- Target the Streamlit/BaseWeb multiselect tag elements rather than replacing the control.
- Scope the CSS to the page-level multiselect presentation so the change stays local to this screen.

## Risks

- Streamlit DOM selectors can change between versions.
- A narrow selector is preferred to reduce impact on unrelated controls in the same app.

## Testing

- Add a regression test that checks the page source contains the CSS hook for the selected multiselect tag styling.
- Re-run the existing operator-based frontend tests to confirm the styling addition does not affect query-filter behavior.
