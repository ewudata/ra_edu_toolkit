# Main Page Visual Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restyle the `Home`, `Database Manager`, and `RA ↔ SQL Reference` pages so they match the `RAExercises` page visual system without changing shared component internals.

**Architecture:** Keep the redesign localized to page-level React files. Reuse the established `RAExercises` gradient hero, softened card shells, typography hierarchy, and page-local button/input styling by introducing page-specific utility constants rather than changing shared components globally.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vite, Lucide React

---

### Task 1: Align the Home page shell

**Files:**
- Modify: `frontend/src/pages/Home.tsx`
- Test: `frontend/src/pages/Home.tsx`

**Step 1: Write the failing test**

No dedicated automated UI test exists for page cosmetics. Use a manual verification target instead: the Home page should still render its sections while adopting the `RAExercises` visual treatment.

**Step 2: Run test to verify current state differs**

Run: `npm test` is not applicable here because no page-style assertion exists.
Expected: Manual inspection of the current Home page shows the older white/green design language instead of the lavender/slate `RAExercises` treatment.

**Step 3: Write minimal implementation**

- Replace the current hero with an `RAExercises`-style gradient hero block.
- Convert quick-start and feature sections to soft rounded cards with matching icon chips, heading colors, and muted descriptive text.
- Update feature cards to use the same section-level visual rhythm as the exercises page while preserving their links and content.

**Step 4: Run verification**

Run: `npm run build`
Expected: Frontend compiles successfully with the updated Home page.

**Step 5: Commit**

Do not commit yet if the worktree remains mixed with unrelated changes.

### Task 2: Align the Database Manager page shell

**Files:**
- Modify: `frontend/src/pages/DatabaseManager.tsx`
- Test: `frontend/src/pages/DatabaseManager.tsx`

**Step 1: Write the failing test**

No dedicated automated UI test exists for page cosmetics. Use manual verification that the page retains import and catalog behavior while moving to the new visual system.

**Step 2: Run test to verify current state differs**

Run: `npm test` is not applicable here because no style-focused test exists.
Expected: Manual inspection shows the old tan/green utility styling rather than the `RAExercises` page treatment.

**Step 3: Write minimal implementation**

- Replace the hero with a matching gradient study header.
- Restyle the catalog and import sections to use the same rounded translucent card shells and typography hierarchy as `RAExercises`.
- Update page-local icon tiles, loading state wrapper, delete action, file inputs, text inputs, and import buttons to fit the lavender/slate system while preserving shared components as-is.

**Step 4: Run verification**

Run: `npm run build`
Expected: Frontend compiles successfully with the updated Database Manager page.

**Step 5: Commit**

Do not commit yet if the worktree remains mixed with unrelated changes.

### Task 3: Align the RA ↔ SQL Reference page shell

**Files:**
- Modify: `frontend/src/pages/RASQLReference.tsx`
- Test: `frontend/src/pages/RASQLReference.tsx`

**Step 1: Write the failing test**

No dedicated automated UI test exists for page cosmetics. Use manual verification that the page keeps its reference workflow while adopting the `RAExercises` layout language.

**Step 2: Run test to verify current state differs**

Run: `npm test` is not applicable here because no style-focused test exists.
Expected: Manual inspection shows the old setup card and heading treatment instead of the new gradient/card system.

**Step 3: Write minimal implementation**

- Restyle the hero, setup sidebar, selected-database heading block, and translation tips section to match `RAExercises`.
- Update the page-local select control, inline database pill, and load-solutions action to use the same button/input language where feasible.
- Preserve query loading logic, collapsible sections, and shared data/result components.

**Step 4: Run verification**

Run: `npm run build`
Expected: Frontend compiles successfully with the updated reference page.

**Step 5: Commit**

Do not commit yet if the worktree remains mixed with unrelated changes.

### Task 4: Verify the combined redesign

**Files:**
- Modify: `frontend/src/pages/Home.tsx`
- Modify: `frontend/src/pages/DatabaseManager.tsx`
- Modify: `frontend/src/pages/RASQLReference.tsx`

**Step 1: Run the build**

Run: `npm run build`
Expected: PASS with no TypeScript or bundling errors.

**Step 2: Review for accidental shared-component drift**

Run: `git diff -- frontend/src/pages/Home.tsx frontend/src/pages/DatabaseManager.tsx frontend/src/pages/RASQLReference.tsx`
Expected: Changes are confined to the three target page files unless a narrowly scoped support edit proves necessary.

**Step 3: Manual smoke check**

Run: `npm run dev`
Expected: The three pages render with a consistent `RAExercises` visual language and their existing workflows still function.

**Step 4: Commit**

Do not commit automatically in the current dirty worktree.
