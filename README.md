# RA Education Toolkit

An interactive platform for learning relational algebra and SQL with a FastAPI backend and a React/Vite frontend.

## Project Goals

The toolkit focuses on three learning workflows:

- Translate between relational algebra and SQL.
- Execute relational algebra expressions step by step and inspect intermediate results.
- Practice guided exercises with feedback, hints, and progress tracking.

## Project Architecture

```text
ra_edu_toolkit/
├── backend/                    # FastAPI backend service
├── frontend/                   # React + Vite frontend
├── datasets/                   # Sample datasets
├── assets/                     # Static resources and SQL setup files
├── scripts/                    # Utility scripts
├── tests/                      # Test suite
└── .github/workflows/          # CI/CD configuration
```

## Quick Start

### Requirements

- Python 3.11+
- Node.js 20+
- npm

### Installation

```bash
git clone <repository-url>
cd ra_edu_toolkit

python3 -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt

cd frontend
npm install
cd ..

cp .env.example .env
```

Important: use the project virtual environment when starting the backend. The backend code uses modern Python typing syntax and will fail under older system Python versions.

### Environment Configuration

Copy `.env.example` to `.env` and update values as needed:

```bash
cp .env.example .env
```

Key variables:

- `BACKEND_BASE_URL` - Backend API base URL, default `http://localhost:8000`
- `BACKEND_HOST` - Backend bind host, default `0.0.0.0`
- `BACKEND_PORT` - Backend port, default `8000`
- `FRONTEND_BASE_URL` - Frontend URL used for OAuth redirects, default `http://localhost:5173`
- `FRONTEND_PORT` - Frontend dev server port, default `5173`
- `CORS_ORIGINS` - Comma-separated allowed frontend origins for the backend
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `SUPABASE_USER_DATASETS_BUCKET` - User dataset storage bucket name
- `OAUTH_STATE_SECRET` - Secret used to sign OAuth state tokens
- `DEBUG` - Enable debug mode
- `RELOAD` - Enable backend auto-reload

For production, use `.env.production` as a starting point and set `DEBUG=False` and `RELOAD=False`.

### Guest access and saved accounts

Home offers **Continue without signing in** and **Sign in and save progress**.

| Feature | Guest | Signed in |
| --- | --- | --- |
| Shared default datasets, schemas, exercises, and answer checking | Yes | Yes |
| Personal dataset imports and management | No | Yes |
| Saved attempts, mastery, and progress dashboard | No | Yes |
| AI hints, walkthroughs, and error explanations | No | Optional, explicitly requested |

Guests do not create Supabase accounts. Their attempts and mastery are not saved, and answer drafts are held only in page memory; leaving or refreshing a practice page may discard them. A dataset selection may remain in browser session storage. Guest work is not imported into an account after sign-in. Bundled default practice works without Supabase credentials; remote defaults require the existing server configuration.

Answers still reach the backend for checking. Application code does not log answer bodies or full AI prompts, but deployment proxies and model services have their own logging settings. Operational connection metadata may still exist. Signed-in email and saved practice records remain accessible to authorized system administrators. Logout and unrecoverable session expiry clear account workspace state.

### AI privacy configuration

Every AI endpoint requires authentication and the current data-sharing disclosure version. AI calls occur only after an explicit help action; checking an answer or encountering an error does not call AI automatically. Before first use for an account on a browser, a compact in-app dialog identifies the service and shared content, with the full policy under “Privacy details.” Students choose “Not now” or “Continue to AI”; Not now and Escape dismiss quietly without an AI request. Acceptance is remembered in browser local storage for that account and policy version, across reloads, token refresh, and later sign-ins. Another account on the same browser must make its own choice. Only the policy version is stored under the account identifier; no answers, tokens, or practice history are saved by this preference. Clearing site storage resets it. If browser storage is blocked, the choice can only be remembered until the page reloads. Declining preserves normal answer checking, static help, and saved progress. A material service/policy/model change requires renewed acknowledgement.

AI requests contain only the relevant exercise/schema, current answer when needed, and selected diagnostic summaries. Account identifiers, practice history, and raw sample/missing/extra result rows are excluded. Free-text answers, exercise content, and user-imported names/schemas may themselves contain identifying information; this is not a guarantee of anonymity. Walkthroughs use canonical exercise solutions without the student's answer.

AI is **unavailable by default until the deployment operator completes the privacy configuration**, in addition to configuring `LLM_ENABLED`, `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`:

- `LLM_SERVICE_NAME`: the actual service/operator students will send requests to.
- `LLM_DATA_POLICY`: a plain-language description of verified retention, training use, and operator access.
- `LLM_PRIVACY_URL`: optional supporting policy URL.
- `LLM_PRIVACY_REVIEWED=true`: set only after checking the deployed service and its logging/privacy settings.

These values are operator declarations, not an automated verification of the provider. Do not claim zero retention or no training without evidence. Update them when the service or policy changes. Removing application prompt logging does not remove older logs or disable independent provider/proxy logging; handle existing logs under the deployment's retention policy. Never put API keys or internal credentials in disclosure text.

### Public evaluation limits

Guest evaluation defaults to 60 requests per minute per connection address and 600 globally per host, using a private SQLite counter shared by workers on that host. Only a minute-scoped hash is stored; expired counters are removed on the next request. Configure `RA_RATE_LIMIT_DB` for a shared writable local path when needed. Multiple containers/hosts need a shared edge/gateway limiter; separate local SQLite files do not coordinate them. Only trust forwarded addresses from a configured proxy; otherwise visitors behind the same proxy share its connection limit.

Evaluation bodies are limited to 64 KiB, expressions/SQL to 10,000 characters, SQL results to 50,000 rows / approximately 8 MiB of cell text, and API row previews to 500 rows. Correctness compares complete results before preview truncation. Public RA runs in a separate process that is terminated after `RA_EVALUATION_TIMEOUT_SECONDS` (default 5 seconds); SQL uses an execution deadline and a read-only authorizer that rejects attachments, writes, and extension loading. `RA_MAX_INTERMEDIATE_ROWS` bounds Cartesian/join allocations (default 100,000); Linux RA workers also use `RA_WORKER_MEMORY_MB` (default 2048). Normal course exercises should be checked against any changed limits before release.

No Supabase schema migration or public bucket/RLS grants are needed for guest access. Deploy the backend before the guest-enabled frontend, verify the deployment's limits and AI policy, and retain private user buckets.

### Supabase Setup

For Google login, user dataset metadata, and query mastery tracking:

1. Enable Google provider in Supabase Authentication.
2. Add redirect URL `http://localhost:8000/auth/google/callback` or your deployed backend callback URL.
3. Run `assets/supabase_user_datasets_setup.sql` in the Supabase SQL editor.
4. Create private storage buckets:
   - `ra-default-datasets`
   - `ra-user-datasets` or the bucket named in `SUPABASE_USER_DATASETS_BUCKET`
5. Seed shared default datasets in `public.default_datasets`:

```sql
insert into public.default_datasets (dataset_name, bucket_name, object_prefix)
values
  ('Sales', 'ra-default-datasets', 'Sales'),
  ('University', 'ra-default-datasets', 'University')
on conflict (dataset_name) do update
  set bucket_name = excluded.bucket_name,
      object_prefix = excluded.object_prefix,
      enabled = true;
```

6. Upload CSV files and each dataset `catalog.json` to `ra-default-datasets` using the same prefixes.

Dataset behavior:

- `Sales` and `University` are shared datasets loaded from the bundled `datasets/` directory by default for fast local catalog and schema access. Set `RA_USE_REMOTE_DEFAULT_DATASETS=true` to load shared defaults from Supabase Storage instead.
- User-imported datasets are stored in Supabase Storage under user prefixes.
- Deleting a shared default dataset in the UI hides it only for the current user.

## Starting Services

### Method 1: Development Script

Start both services from the project root with the virtual environment active:

```bash
source .venv/bin/activate
python scripts/dev_server.py
```

This starts:

- Backend API: `http://localhost:8000`
- Frontend app: `http://localhost:5173`
- API docs: `http://localhost:8000/docs`

### Method 2: Start Separately

Start the backend:

```bash
source .venv/bin/activate
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Start the frontend:

```bash
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

Notes:

- The Vite dev server proxies `/api` requests to `http://localhost:8000`.
- If `localhost` binds to IPv6 on your machine and fails, use `127.0.0.1` explicitly as shown above.

### Method 3: CLI Tool

```bash
source .venv/bin/activate
python scripts/run_cli.py "π{name}(σ{major = 'CS'}(Student))" University
```

## Features

### Database Manager

- CSV and ZIP dataset import
- SQL script import
- Schema browsing
- Data preview and statistics
- Lazy-loaded table previews

### Relational Algebra Exercises

- Guided three-step practice flow
- Database-aware predefined questions
- Custom expression workspace
- Execution trace visualization

### SQL Exercises

- Graded practice problems
- Instant feedback and scoring
- Standard answer comparison
- Learning progress tracking

### RA ↔ SQL Reference

- Side-by-side relational algebra and SQL solutions
- Expected schema and result previews
- Translation heuristics and learning tips

### Execution Process Visualization

- Step-by-step execution tracking
- Intermediate result display
- Operation statistics
- Performance-oriented trace inspection

## Supported Relational Algebra Operations

- `Projection (π)`: `π{attr1,attr2}(R)`
- `Selection (σ)`: `σ{condition}(R)`
- `Rename (ρ)`: `ρ{old->new}(R)`
- `Natural Join (⋈)`: `R ⋈ S` aliases: `⋈`, `natural_join`, `natjoin`, `njoin`
- `Cartesian Product (×)`: `R × S`
- `Union (∪)`: `R ∪ S`
- `Difference (−)`: `R − S`
- `Intersection (∩)`: `R ∩ S`

## Usage Examples

### Query Examples

```text
π{name}(σ{major = 'CS'}(Students))
π{name}(Students ⋈ Takes ⋈ σ{course_id = 'CS101'}(Courses))
π{name}(σ{grade >= 'A'}(Students ⋈ Takes))
```

### Frontend API Client

```ts
import { api } from './frontend/src/lib/api'

const databases = await api.getDatabases()
const result = await api.evaluateQuery(
  'University',
  'custom',
  "π{name}(σ{major = 'CS'}(Students))",
)
```

In local development, the frontend uses the Vite proxy and calls `/api` by default. For deployed builds, set `VITE_BACKEND_URL` at build time if the frontend should call a different backend origin.

## Docker Deployment

### Build Images

```bash
docker build -f Dockerfile.backend -t ra-toolkit-backend .
docker build -f Dockerfile.frontend -t ra-toolkit-frontend .
```

### Run Containers

Backend:

```bash
docker run -d -p 8000:8000 \
  -e BACKEND_HOST=0.0.0.0 \
  -e BACKEND_PORT=8000 \
  -e DEBUG=false \
  --name ra-backend ra-toolkit-backend
```

Frontend:

```bash
docker run -d -p 8080:80 \
  --name ra-frontend ra-toolkit-frontend
```

Notes:

- The production frontend image is a static Nginx container and listens on port `80` inside the container.
- If the frontend must call a non-default backend origin, rebuild the frontend image with `--build-arg VITE_BACKEND_URL=https://your-api-domain`.

### Docker Compose

The included [docker-compose.yaml](/Users/danl/Library/CloudStorage/GoogleDrive-danl@ewu.edu/My%20Drive/RelationalAlgebra/ra_edu_toolkit/docker-compose.yaml:1) is configured for the existing GHCR images and maps:

- Frontend to host port `8508`
- Backend to host port `8507`

Start it with:

```bash
docker-compose up -d
```

## Production Deployment

Set production environment variables for the backend:

```bash
export BACKEND_BASE_URL=https://your-api-domain.com
export BACKEND_HOST=0.0.0.0
export BACKEND_PORT=8000
export FRONTEND_BASE_URL=https://your-frontend-domain.com
export DEBUG=false
export RELOAD=false
```

Or copy the production template:

```bash
cp .env.production .env
```

Then start the backend:

```bash
source .venv/bin/activate
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

For the frontend, serve the built static assets through Nginx or deploy the `Dockerfile.frontend` image.

## Testing

```bash
pytest
pytest tests/test_backend/
pytest tests/test_frontend/
pytest --cov=backend --cov=frontend
```

## Development

### Formatting and Linting

```bash
black backend/ frontend/ scripts/
isort backend/ frontend/ scripts/
flake8 backend/ frontend/ scripts/
```

Browser regression checks (start the backend on port 8000 and Vite on port 5173 first):

```bash
node tests/browser/guest-access.cjs
```

The script uses the repository's installed Playwright runtime when available. Otherwise set `PLAYWRIGHT_MODULE` to an installed `playwright` package directory and install its Chromium browser. Set `RALT_TEST_URL` to test another local frontend URL. Guest checks use the real backend; member, expiry, and AI-sharing checks use synthetic API responses and never contact Supabase or an AI provider.

Frontend-specific checks:

```bash
cd frontend
npm run lint
```

### Adding New Features

1. Add backend logic in `backend/`.
2. Add or update API routes in `backend/routes/`.
3. Add frontend components in `frontend/src/components/`.
4. Add frontend pages in `frontend/src/pages/`.
5. Update tests and documentation.

## API Documentation

After starting the backend, visit `http://localhost:8000/docs`.

Main endpoints:

- `GET /databases`
- `POST /databases/import/zip`
- `POST /databases/import/sql`
- `GET /databases/{database}/queries`
- `POST /databases/{database}/queries/{query_id}/evaluate`

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
