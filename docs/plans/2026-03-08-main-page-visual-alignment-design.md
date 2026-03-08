# Main Page Visual Alignment Design

**Goal:** Align the `Home`, `Database Manager`, and `RA ↔ SQL Reference` pages with the existing `RAExercises` page visual language while preserving each page's current workflow and shared component behavior.

## Scope

- Update page-level layout, hero sections, section framing, and page-local controls on:
  - `frontend/src/pages/Home.tsx`
  - `frontend/src/pages/DatabaseManager.tsx`
  - `frontend/src/pages/RASQLReference.tsx`
- Reuse the `RAExercises` visual system:
  - lavender-to-mint gradient hero
  - muted slate typography
  - `Lora` display headings with `Nunito Sans` supporting text
  - soft translucent cards with rounded corners and subtle borders/shadows
  - lavender primary actions and neutral secondary actions
- Leave shared inner components unchanged:
  - `Collapsible`
  - `StatusBadge`
  - `DataTable`
  - `TablePreview`
  - other reusable component internals

## Visual Direction

The current `RAExercises` page establishes a calmer, more editorial study interface than the older green/tan utility styling. The remaining main pages should match that tone so the application feels like a single product rather than separate tools stitched together.

The redesign should preserve each page's structure while changing the framing:

- `Home` becomes a studio-style landing page with a matching hero block, a soft quick-start panel, and feature cards that visually match the exercise page.
- `Database Manager` keeps its catalog and import workflows, but both sections shift into the same study-block presentation used in `RAExercises`.
- `RA ↔ SQL Reference` keeps its two-column workflow, but the setup panel, query list header, and translation tips should all read as part of the same page family as `RAExercises`.

## Constraints

- Do not refactor shared components just to force total visual parity.
- Do not change route structure, page behavior, or data flow.
- Keep page-local styling readable and maintainable; prefer extracted local class constants over repeating long Tailwind strings.
- Respect the existing in-progress work in the repo and layer changes on top without removing unrelated edits.

## Success Criteria

- The three target pages feel visually consistent with `RAExercises` at first glance.
- Users see the same palette, typography hierarchy, spacing rhythm, and card treatment across the main pages.
- Existing interactive behavior continues to work unchanged.
- The redesign is contained to page files unless a narrowly scoped shared style helper is clearly necessary.
