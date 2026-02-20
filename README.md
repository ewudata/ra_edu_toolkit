# RA Education Toolkit

An interactive educational platform designed for learning relational algebra, combining modern AI-driven interactivity with traditional database education to make learning more accessible, engaging, and conceptually clear.

## 🎯 Project Goals

This project provides a suite of LLM-powered learning tools that bridge the conceptual and practical gap between relational algebra and SQL through three major components:

- **Dual Query Translation**: A model that maps between relational algebra expressions and SQL queries using a dual-encoder architecture
- **Interactive Query Visualization**: A dynamic visualization engine that executes relational algebra expressions step by step and visually displays intermediate results
- **Personalized Learning and Feedback**: An adaptive tutor system that uses LLMs to generate tailored exercises, guided hints, and detailed explanations

## 🏗️ Project Architecture

```
ra_edu_toolkit/
├── backend/                    # FastAPI backend service
│   ├── main.py                # Application entry point
│   ├── api/routes/            # API routes
│   ├── core/                  # Core RA engine
│   └── services/              # Business logic services
├── frontend/                  # Streamlit frontend application
│   ├── app.py                # Main application
│   ├── pages/                # Multi-page application
│   ├── components/            # UI components
│   └── utils/                # Utility functions
├── datasets/                  # Sample datasets
├── assets/                    # Static resources
├── scripts/                   # Utility scripts
├── tests/                     # Test files
└── .github/workflows/        # CI/CD configuration
```

## 🚀 Quick Start

### Requirements

- Python 3.11+
- pip or conda

### Installation

```bash
# Clone the project
git clone <repository-url>
cd ra_edu_toolkit

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or
venv\Scripts\activate     # Windows

# Install backend dependencies
pip install -r requirements.txt

# Install frontend dependencies
pip install -r requirements-frontend.txt

# Set up environment configuration
cp .env.example .env
# Edit .env with your preferred settings
```

### Environment Configuration

The project uses environment variables for configuration. Copy `.env.example` to `.env` and customize as needed:

```bash
cp .env.example .env
```

**Environment Variables**:
- `BACKEND_BASE_URL` - Backend API base URL (default: `http://localhost:8000`)
- `BACKEND_HOST` - Backend host address (default: `0.0.0.0`)
- `BACKEND_PORT` - Backend port (default: `8000`)
- `FRONTEND_BASE_URL` - Frontend URL used for OAuth redirects (default: `http://localhost:8501`)
- `FRONTEND_HOST` - Frontend host address (default: `0.0.0.0`)
- `FRONTEND_PORT` - Frontend port (default: `8501`)
- `SUPABASE_URL` - Supabase project URL or project ref
- `SUPABASE_ANON_KEY` - Supabase anon key (OAuth + token verification)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (backend only)
- `OAUTH_STATE_SECRET` - Secret used to sign OAuth state tokens (backend only)
- `DEBUG` - Enable debug mode (default: `True`)
- `RELOAD` - Enable auto-reload (default: `True`)

For production, use `.env.production` as a template and set `DEBUG=False` and `RELOAD=False`.

For Google login and user dataset metadata:
1. Enable Google provider in Supabase Authentication.
2. Add redirect URL `http://localhost:8000/auth/google/callback` (or your backend URL).
3. Run `assets/supabase_user_datasets_setup.sql` in Supabase SQL editor.
4. Create private storage buckets:
   - `ra-default-datasets`
   - `ra-user-datasets` (or set `SUPABASE_USER_DATASETS_BUCKET`)
5. Seed shared default datasets in `public.default_datasets`:
   ```sql
   insert into public.default_datasets (dataset_name, bucket_name, object_prefix)
   values
     ('Sales', 'ra-default-datasets', 'Sales'),
     ('TestDB', 'ra-default-datasets', 'TestDB'),
     ('University', 'ra-default-datasets', 'University')
   on conflict (dataset_name) do update
     set bucket_name = excluded.bucket_name,
         object_prefix = excluded.object_prefix,
         enabled = true;
   ```
6. Upload CSV files and each dataset `catalog.json` to `ra-default-datasets` using the same prefixes.

Dataset behavior:
- `Sales`, `TestDB`, and `University` are shared datasets loaded from Supabase Storage.
- User-imported datasets are stored in Supabase Storage under user prefixes.
- Deleting a shared default dataset in UI hides it only for the current user.

### Starting Services

#### Method 1: Development Mode (Recommended)

Use the development server script to start both frontend and backend simultaneously:

```bash
python scripts/dev_server.py
```

This will start:
- Backend API: http://localhost:8000 (or your configured BACKEND_PORT)
- Frontend Application: http://localhost:8501 (or your configured FRONTEND_PORT)
- API Documentation: http://localhost:8000/docs

#### Method 2: Start Separately

**Start Backend Service**:
```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

**Start Frontend Application**:
```bash
streamlit run frontend/app.py --server.port 8501 --server.address 0.0.0.0
```

#### Method 3: Using VS Code Launch Configurations

Use the pre-configured VS Code launch configurations:
1. Open VS Code
2. Go to Run and Debug panel (F5)
3. Select "Start Backend Server" or "Start Frontend App"
4. Both configurations automatically load environment variables from `.env`

#### Method 4: Using CLI Tool

```bash
python scripts/run_cli.py "π{name}(σ{major = 'CS'}(Student))" University
```

## 📚 Features

### 🗄️ Database Manager
- Support for CSV/ZIP file import
- Support for SQL script import
- Database and table structure browsing
- Data preview and statistics
- Lazy-loaded table previews (loaded per database on demand) for faster page reruns

### 🧮 Relational Algebra Exercises
- Guided three-step practice flow
- Database-aware pre-defined questions
- Custom expression workspace
- Execution trace visualization

### 🧠 SQL Exercises
- Graded practice problem system
- Instant feedback and scoring
- Standard answer comparison
- Learning progress tracking

### 🔄 RA ↔ SQL Reference
- Side-by-side relational algebra and SQL solutions
- Expected schema and result previews
- Translation heuristics and learning tips

### 🎯 Execution Process Visualization
- Step-by-step execution tracking
- Intermediate result display
- Operation type statistics
- Performance analysis

## 🔧 Supported Relational Algebra Operations

- **Projection (π)**: `π{attr1,attr2}(R)` - Select specific attributes
- **Selection (σ)**: `σ{condition}(R)` - Filter rows based on conditions
- **Rename (ρ)**: `ρ{old->new}(R)` - Rename attributes
- **Join (⋈)**: `R ⋈ S` - Natural join
- **Cartesian Product (×)**: `R × S` - Cartesian product
- **Union (∪)**: `R ∪ S` - Union
- **Difference (−)**: `R − S` - Difference
- **Intersection (∩)**: `R ∩ S` - Intersection

## 📖 Usage Examples

### Basic Query Examples

```sql
-- Find names of computer science students
π{name}(σ{major = 'CS'}(Students))

-- Find students enrolled in specific courses
π{name}(Students ⋈ Takes ⋈ σ{course_id = 'CS101'}(Courses))

-- Find students with excellent grades
π{name}(σ{grade >= 'A'}(Students ⋈ Takes))
```

### API Usage Examples

```python
from frontend.utils.api_client import APIClient

# Initialize client
client = APIClient("http://localhost:8000")

# Get database list
databases = client.get_databases()

# Execute query
result = client.evaluate_query(
    database="University",
    query_id="custom",
    expression="π{name}(σ{major = 'CS'}(Students))"
)
```

## 🐳 Docker Deployment

### Build Images

```bash
# Build backend image
docker build -f Dockerfile.backend -t ra-toolkit-backend .

# Build frontend image
docker build -f Dockerfile.frontend -t ra-toolkit-frontend .
```

### Run Containers

```bash
# Start backend service with environment variables
docker run -d -p 8000:8000 \
  -e BACKEND_HOST=0.0.0.0 \
  -e BACKEND_PORT=8000 \
  -e DEBUG=false \
  --name backend ra-toolkit-backend

# Start frontend application with environment variables
docker run -d -p 8501:8501 \
  -e BACKEND_BASE_URL=http://backend:8000 \
  -e FRONTEND_HOST=0.0.0.0 \
  -e FRONTEND_PORT=8501 \
  --name frontend ra-toolkit-frontend
```

### Docker Compose (Alternative)

You can also use Docker Compose to manage multiple containers:

```bash
docker-compose up -d
```

## 🌐 Production Deployment

### Server Configuration

1. **Set up environment variables** on your server:
```bash
export BACKEND_BASE_URL=https://your-api-domain.com
export BACKEND_HOST=0.0.0.0
export BACKEND_PORT=8000
export FRONTEND_PORT=8501
export DEBUG=false
export RELOAD=false
```

2. **Or use a production .env file**:
```bash
cp .env.production .env
# Edit .env with production values
```

3. **Start services** with production settings:
```bash
# Backend with production settings
uvicorn backend.main:app --host 0.0.0.0 --port 8000

# Frontend with production settings
streamlit run frontend/app.py --server.port 8501
```

### GitHub Actions Deployment

The project includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that can be configured with secrets:
- `BACKEND_BASE_URL`
- `BACKEND_HOST`
- `BACKEND_PORT`
- `FRONTEND_PORT`
- `DEBUG`
- `RELOAD`

## 🧪 Testing

```bash
# Run all tests
pytest

# Run backend tests
pytest tests/test_backend/

# Run frontend tests
pytest tests/test_frontend/

# Generate test coverage report
pytest --cov=backend --cov=frontend
```

## 🔧 Development

### Code Formatting

```bash
# Format code
black backend/ frontend/ scripts/

# Sort imports
isort backend/ frontend/ scripts/

# Code linting
flake8 backend/ frontend/ scripts/
```

### Adding New Features

1. Add core logic in `backend/core/`
2. Add API endpoints in `backend/routes/`
3. Add UI components in `frontend/components/`
4. Add new pages in `frontend/pages/`
5. Update tests and documentation

### Environment Configuration in Development

The project supports multiple environment configurations:
- **`.env`** - Local development (automatically loaded)
- **`.env.example`** - Template for other developers
- **`.env.production`** - Production configuration template

All configurations load environment variables using `python-dotenv` and respect the `.env` file when present.

## 📄 API Documentation

After starting the backend service, visit http://localhost:8000/docs to view the complete API documentation.

Main endpoints:
- `GET /databases` - Get database list
- `POST /databases/import/zip` - Import database from ZIP
- `POST /databases/import/sql` - Import database from SQL
- `GET /databases/{database}/queries` - Get query list
- `POST /databases/{database}/queries/{query_id}/evaluate` - Evaluate query

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Making relational algebra learning simple and fun!** 🎓✨
