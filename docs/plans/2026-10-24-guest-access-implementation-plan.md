# Guest access implementation plan

Date: 2026-10-24
Status: Implemented and verified locally. Deployment and review/configuration of the actual AI service remain operational steps.

## Goal and scope

Offer two ways to use RALT: practice with shared default datasets without signing in, or sign in with Google to retain the existing saved-progress and personal-dataset features.

Guest mode is a request without authentication, not a Supabase anonymous account. Do not create an auth user, assign a shared guest user ID, or save guest attempts/mastery in Supabase. Existing signed-in data and authentication remain in place.

Recommended first-release decisions:

| Capability | Guest | Signed in |
| --- | --- | --- |
| Browse enabled default datasets and schemas | Yes | Yes |
| Browse catalog exercises, static hints, and solutions | Yes | Yes |
| Evaluate RA/SQL and check translations | Yes, default datasets only | Yes, accessible datasets |
| Record attempts and mastery | No | Existing behavior |
| Saved progress dashboard and mastery filters | No | Existing behavior |
| Import personal datasets or hide/delete datasets | No | Existing behavior |
| AI hints, walkthroughs, and AI error explanations | Sign-in required | Explicit request after data-sharing disclosure |
| Browser-saved guest progress or export/import | Out of scope | Existing behavior |

Confirmed user decision: AI help requires login, including AI hints, walkthroughs, and AI error explanations. Guests still receive answer checking, normal parser/evaluation errors, static catalog hints, and solutions. Enforce this requirement in the backend and prevent guest-triggered AI calls in the frontend, including automatic error-help requests.

Confirmed user decision: AI privacy controls also apply to signed-in users. Login provides access control, not permission to automatically share answers with a model service. Require an explicit AI-help action after explaining the service and information shared, minimize request content, remove full-prompt logging, and verify the deployed model service's data handling. Students can decline AI while continuing ordinary practice and answer checking.

Guest drafts/results live only in mounted page memory. Reloading or leaving a practice page may discard them. A default-dataset preference may remain in sessionStorage, but guest answers and mastery must not be persisted there. Do not silently import earlier guest attempts into an account after login.

## Relevant existing behavior

- `frontend/src/App.tsx` wraps every main page in `ProtectedRoute`/`AuthGate`.
- `backend/services/auth.py` rejects missing Authorization headers for all protected routes.
- `backend/services/datasets.py` already accepts an optional user ID; without one, it resolves bundled/configured defaults rather than user imports. Sales and University are the bundled defaults. Honor the configured default resolver instead of hard-coding these names in the UI.
- Dataset, schema, catalog, and SQL snapshot caches already include the user ID or an empty guest namespace. Preserve that separation.
- `backend/routes/evaluation.py` records catalog RA attempts and mastery. Its translation checker currently returns correctness without saving translation attempts; preserve this behavior rather than expanding progress tracking in this change.
- `RAExercises.tsx` automatically loads mastery. Both exercise pages automatically request AI help in some error/incorrect-answer paths.
- `backend/services/llm.py` sends prompts to a configurable model endpoint and logs full prompts through application loggers. Its request builder does not explicitly include login email or user ID, but free-text answers, dataset names, schemas, and sample rows can still contain identifying information. The endpoint may be self-hosted or externally operated; verify the actual deployment before describing it to students.
- `RASQLReference.tsx` saves editor text in sessionStorage. Logout clears stored keys, but guest-enabled pages will also need their mounted state and pending requests cleared.
- `backend/core/evaluator.py` prints condition text and row environments on some errors. Remove this content logging from guest-reachable execution paths.

## 1. Define optional authentication without weakening required authentication

Files: `backend/services/auth.py`; new focused backend tests.

Add an optional-user dependency that reuses existing token verification and returns either the verified user or `None`.

- No Authorization header: guest.
- A supplied malformed, empty, expired, or invalid credential: return 401; never silently treat it as guest.
- Verification/configuration/service failures: retain appropriate error handling; do not convert them to guest access.
- Retain `require_current_user` on every account-only route.
- Never accept user identity from a request body, URL parameter, or client-provided guest ID.

Do not change Supabase RLS policies or make private Storage buckets public. Guest requests go through FastAPI, which can retrieve approved shared defaults using its existing server-side configuration. Service credentials remain server-only.

## 2. Open only shared browsing and evaluation routes

Files: `backend/routes/databases.py`, `backend/routes/queries.py`, `backend/routes/evaluation.py`, and dataset helpers if needed.

Use the optional-user dependency on the following routes. Derive `user_id` from the verified user, or use `None` for guests, throughout the call chain.

| Route | Guest behavior |
| --- | --- |
| `GET /databases/` | List configured/enabled shared defaults only |
| `GET /databases/{database}/schema` | Read a default schema and row previews |
| `GET /databases/{database}/queries/` | List default catalog questions |
| `GET /databases/{database}/queries/{query_id}` | Read default exercise details |
| `POST /databases/{database}/queries/{query_id}/evaluate` | Grade an RA answer without persistence |
| `POST /databases/{database}/queries/{query_id}/check-translation` | Check either translation direction without persistence |
| `POST /databases/{database}/evaluate` | Evaluate custom RA on a default dataset |
| `POST /databases/{database}/evaluate-sql` | Evaluate custom SQL on a default dataset |

Keep these routes authenticated:

- ZIP and SQL dataset import.
- Dataset deletion, including hiding a default for an account.
- Query mastery and operator-progress reads.
- All routes in both LLM routers.

Guests requesting an uploaded/private dataset by guessed name must receive a generic 404. No user-dataset metadata or private Storage prefix may be consulted for a guest. Confirm the existing resolver provides this guarantee and put any needed guard in a shared helper, not separate inconsistent endpoint checks.

If a personal dataset shadows a shared default name, a guest must always resolve the shared version. A signed-in request must retain current per-user resolution. Cache warm-up order must not affect this rule.

## 3. Separate grading from progress persistence

Files: `backend/routes/evaluation.py`; tests around learning progress.

Compute evaluation, expected results, correctness, and traces for guests exactly as for members using the same shared default data. Guard `record_query_attempt` and `upsert_query_mastery` behind the presence of a verified user. Do not call these functions at all for guests, even with an empty ID.

Preserve existing signed-in attempt/mastery semantics. Keep translation and custom evaluation behavior unchanged apart from optional authentication. No schema migration, progress backfill, or removal of existing data is required.

## 4. Provide the two entry choices and a restricted guest interface

Files: `frontend/src/App.tsx`, `components/AuthGate.tsx`, `components/ProtectedRoute.tsx`, `components/Layout.tsx`, `pages/Home.tsx`, `pages/DatabaseManager.tsx`, `pages/RAExercises.tsx`, `pages/RASQLReference.tsx`.

- Make Home public, with “Continue without signing in” and “Sign in and save progress” choices. The guest choice opens default-dataset browsing or the exercise workspace. No separate guest cookie/account is needed.
- Allow direct guest links to `/databases`, `/ra-exercises`, and `/ra-sql-reference` once auth bootstrap finishes. Existing signed-in cookies still restore normally.
- Keep `/progress` inside `ProtectedRoute`. A guest visiting it sees an explanation and login option without mounting the dashboard or sending progress requests.
- Retain a loading boundary during auth bootstrap, so account data is not requested before authentication has resolved.
- In the header, show “Guest · progress not saved” and a sign-in action for guests. Retain the current member identity and logout controls.
- Database Manager remains usable for schema and preview browsing. Hide import/delete/hide controls for guests and explain that uploads require sign-in.
- In RA Exercises, skip mastery requests, use the All filter, and hide mastery filters/badges and the My Progress link for guests. Do not represent missing progress as a failed load or completed history.
- Gate all AI controls by login in both practice pages. Remove automatic AI follow-ups for everyone, including calls after parser errors, evaluation errors, and incorrect translation answers. Signed-in users explicitly request AI help after the data-sharing disclosure described below. Guests retain ordinary errors and static hints; no AI request should be attempted and then fail with 401.
- Guest answer/result state stays in memory. Skip reading/writing the existing reference draft sessionStorage payload in guest mode. Keep existing member persistence.
- Do not make the API client synthesize successful progress responses to conceal forbidden calls. Components should request only capabilities available in their mode.

Suggested user copy:

- Guest: “Use default datasets without an account. Your progress is not saved.”
- Sign-in: “Save your progress across devices and upload datasets.”
- AI controls: “Sign in to use AI help.”

## 5. Make sign-in, logout, and expiry safe mode transitions

Files: `frontend/src/lib/auth.tsx`, `lib/auth-context.ts`, `lib/api.ts`, `App.tsx`, and page effects.

Introduce a lightweight session-boundary revision or equivalent reset mechanism. Change it on login/account change, logout, and unrecoverable session expiry, not on normal token refresh. Remount/reset the workspace at those boundaries.

- Clear stored editor state, working dataset selection, mastery, uploaded-dataset lists, schema previews, results, AI output, and pending UI messages when leaving an account.
- Cancel requests or ignore responses started under an earlier session boundary. An old private-dataset response must never populate the new guest interface.
- Ensure late token-refresh responses cannot restore a session after logout. Only apply refresh results belonging to the still-active session.
- On logout, return to Home in guest mode; refresh the defaults list before allowing a dataset selection.
- If a token expires, use the existing refresh flow first. If refresh fails, show that sign-in ended and progress will no longer be saved. Do not replay the failed authenticated submission as a guest request.
- On login, load the account's existing progress and datasets. Earlier guest attempts are not uploaded retrospectively.
- Preserve OAuth return-to-origin behavior and keep normal refresh from erasing active drafts.

## 6. Bound public evaluation and align logging with the privacy copy

Files: evaluation request validation/execution helpers, `backend/services/sql.py`, `backend/core/evaluator.py`, deployment configuration, README.

Public computation needs basic limits as part of the release:

- Set configurable request/expression length and preview-row limits. Do not truncate intermediate grading inputs and accidentally change correctness.
- Rate-limit public evaluation at the deployed reverse proxy or a shared server limiter. Return 429 and show a useful retry message. Verify limits work across deployed workers; do not trust arbitrary forwarded headers.
- Bound execution time and result/intermediate size. Use a SQLite progress handler for SQL cancellation and an execution strategy that can actually stop expensive RA work; a browser fetch timeout alone is insufficient. Test ordinary course exercises against these limits.
- Keep SQL execution read-only and disallow file attachment and extension loading. Verify via SQLite authorization/connection controls rather than SQL keyword matching alone.
- Remove expression/row-environment prints from evaluation for all users. Do not add request-body logging, guest identifiers, or practice-history analytics.
- Inspect deployment access/error logs for accidental answer capture. Operational connection metadata such as IP addresses may still exist; avoid promising total anonymity or “nothing reaches the server.”

These are scoped controls for the newly public endpoints, not a redesign of authentication or the evaluation engine.

AI privacy controls apply to all signed-in users as part of this release. Files: `backend/services/llm.py`, `backend/routes/llm.py`, both practice pages, affected AI tests, deployment configuration, and README.

- Keep every AI endpoint authenticated. Require an explicit “Ask AI for help” or walkthrough action; ordinary checking must never invoke the model service automatically.
- Before first AI use, identify the actual model service/operator and explain which answer, schema, and diagnostic information is sent. Give the student a clear choice to continue or decline. Do not infer agreement from Google login. Show the explanation again if the service or scope of sharing changes materially.
- Build prompts from an explicit allowlist of necessary fields instead of serializing entire evaluation/error context objects. Exclude account emails, user IDs, auth tokens, practice history, storage paths, and dataset-owner identifiers. Omit raw result rows and sample/missing/extra rows; use counts, schema differences, and operation summaries when sufficient. Walkthroughs should continue using the exercise and canonical solution without attaching student answers.
- For targeted hints or error explanations, send only the current answer and the diagnostic context needed for that request. Explain that answers and user-imported names/schemas may themselves contain sensitive information; excluding account identifiers does not guarantee anonymity. Minimize such content before sending and avoid claims of perfect automatic redaction.
- Remove full system/user prompt logging from both application loggers for every AI helper. Keep operational metrics such as duration, model, and success/failure without answer content or account identifiers. Review error handling, gateways, and model-serving logs as well; changing application logging does not remove existing logs or prevent independent provider logging.
- Verify the actual deployed endpoint, operator, retention, training use, and available privacy settings. Configure an appropriate service or a model operated on controlled infrastructure. Document verified behavior and limitations; do not promise zero retention or no training without evidence. Confirm that old prompt logs are handled under the actual retention policy; deletion of existing logs is a separate operational action.
- Declining AI must preserve standard errors, deterministic answer checking, static hints, solutions, and signed-in progress tracking. No database migration is anticipated for the disclosure UI; avoid creating new per-student AI-history records.

## 7. Verify behavior and privacy boundaries

Add backend request-level tests using actual auth header parsing with token verification stubbed as needed. Existing signed-in tests that override only `require_current_user` will need fixtures compatible with the new optional dependency. Always clear dependency overrides and caches in fixture teardown.

Required cases:

1. No-token requests can list defaults, read schema/catalog/details, evaluate catalog/custom RA, evaluate SQL, and check both translation directions.
2. Patch progress writes, auth-user creation, and user-dataset lookup to fail if called: guest practice still succeeds for correct, incorrect, and malformed answers without those calls.
3. Guests cannot import, delete/hide defaults, read mastery/operator progress, call AI, or access private datasets by name.
4. Invalid or expired supplied tokens return 401, and token-verification outages do not become guest access.
5. Member and guest requests with the same dataset name cannot share private cached schemas, catalogs, or SQL snapshots. Test both cache warm-up orders.
6. Existing signed-in attempts, mastery, uploads, hidden defaults, refresh, and OAuth return behavior remain intact. Do not accidentally add translation-attempt tracking.
7. Public evaluation limits, cancellation, SQL file-operation rejection, and redacted error logging work as intended.
8. Capture outgoing AI payloads with a stub model service: only approved fields are present, no account identifiers/tokens/history or raw row samples are included, and each helper sends the minimum context it needs. Test user-imported datasets as well as defaults.
9. Use sentinel answer values to verify prompt/answer contents do not appear in application logs on success or failure. Ensure provider error messages do not introduce content logging.

Update affected frontend source-contract tests, especially `test_react_route_auth_gating.py`, which currently requires every main page to be protected. Add assertions for guest-aware mastery and AI behavior rather than preserving outdated route expectations. Some current auth-source assertions already describe older code, so record baseline failures before implementation and distinguish them from regressions.

Exercise actual browser flows as well as source assertions:

- Fresh browser: both choices visible; guest can complete default exercises without auth/progress/AI calls or persisted answer drafts.
- Direct guest links and page reloads work; page-leave/reload draft loss matches the displayed message.
- Sign in, use a personal dataset, then sign out while requests are in flight: private content disappears and cannot reappear from late responses.
- Session expiry displays an explanation, does not silently resubmit, and allows a later explicit guest attempt.
- Normal token refresh preserves member editor state.
- Guest results are not imported after signing in.
- Signed-in correct/incorrect answers and parser/evaluation failures cause no AI request until the student explicitly chooses AI help. Declining the disclosure leaves ordinary learning features usable. Disclosure appears again after a material service/sharing change.
- Update existing AI UI tests to require explicit requests rather than preserve automatic help behavior; ensure authenticated AI endpoints still reject guests and normal token refresh does not trigger an AI request.
- Mobile and keyboard navigation expose both entry choices and the guest notice clearly.

Validation commands, from the repository root:

```sh
.venv/bin/python -m pytest tests/test_backend tests/test_frontend
npm --prefix frontend run build
npm --prefix frontend run lint
```

Capture pre-existing failures before edits. See the local implementation validation below for results.

## 8. Release and completion criteria

Update README with the capability matrix, guest data handling, account administrator visibility, AI disclosure and verified service data handling, prompt-logging changes, public evaluation limits, and whether defaults use bundled files or configured remote storage. Bundled default guest practice should work without a Google sign-in or Supabase user session; it should not require auth configuration merely to evaluate local defaults.

Deploy the backend permission changes before the guest-enabled frontend, verify the full guest/member matrix in staging, then enable the interface. A two-phase rollout may keep guest endpoints disabled through configuration until public evaluation controls are verified. Existing private buckets and RLS remain unchanged.

Done means a student can open RALT, choose guest access, browse defaults, evaluate answers, and leave without creating an account or saving practice history. Signed-in users retain saved progress and personal datasets, and AI help is an explicit informed choice with minimized payloads and no full-prompt application logging. Guessed names, stale UI state, or cache collisions cannot expose personal datasets to guests.

Deferred: browser-saved guest progress, export/import, anonymous Supabase accounts, encrypted progress, public AI access, teacher analytics, migration/deletion of old account data, and broader auth transport changes.

## Local implementation validation

- Backend: all 85 tests pass, including guest access, private dataset/cache isolation, progress-write prevention, invalid credentials, public execution limits, disclosure version enforcement, and prompt/log minimization.
- Frontend: production TypeScript/Vite build and ESLint both pass.
- Browser regression script: `tests/browser/guest-access.cjs` passes using real local guest endpoints and synthetic member/AI API responses. It checks real RA grading/errors, no guest auth/mastery/AI requests, protected progress, guest draft handling, mobile overflow, explicit AI requests, declining sharing, changed disclosures, logout, failed-refresh expiry, and a refresh arriving after logout.
- The wider Python suite, excluding two uncollectable legacy modules, reports 137 passed and 22 failed. Every remaining failure also reproduces on the original HEAD; no new failures were introduced. Five original failures were resolved while updating affected tests. Most remaining failures reference removed Streamlit files or outdated React copy/layout assumptions.
- A default full-suite run still cannot collect `tests/test_frontend/test_auth_return_to_origin.py` and `tests/test_frontend/test_query_difficulty.py`, which import removed `frontend.utils` modules. These collection errors also predate implementation.
- Existing Supabase data and RLS/bucket policies were not changed. No production deployment, external AI request, log deletion, or provider retention/training verification was performed. AI remains unavailable until its operator supplies reviewed service/policy configuration as documented in README and `.env.example`.


### AI disclosure presentation update (2026-10-25)

Replaced the long browser confirmation with a compact in-app dialog. It identifies the AI service and sharing purpose in one sentence, keeps the complete data/policy text and policy link under an expandable Privacy details section, and offers Not now / Continue to AI. Not now, Escape, navigation, and logout cancel pending disclosure requests without an AI call or an error banner. The same policy is remembered during the signed-in session, including routine token refresh; a changed policy or a new sign-in requires acknowledgement again. Backend disclosure enforcement is unchanged.

Verified with frontend build/lint, seven auth/route regression tests, and browser checks covering collapsed/expanded details, keyboard focus, quiet cancellation, mobile layout, session-level acceptance, changed policies, token rotation, and logout/expiry behavior. Member/AI browser responses are synthetic; no external AI requests are made by these checks.
