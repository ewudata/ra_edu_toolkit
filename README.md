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
```

### Starting Services

#### Method 1: Development Mode (Recommended)

Use the development server script to start both frontend and backend simultaneously:

```bash
python scripts/dev_server.py
```

This will start:
- Backend API: http://localhost:8000
- Frontend Application: http://localhost:8501
- API Documentation: http://localhost:8000/docs

#### Method 2: Start Separately

**Start Backend Service**:
```bash
uvicorn backend.main:app --reload
```

**Start Frontend Application**:
```bash
streamlit run frontend/app.py
```

#### Method 3: Using CLI Tool

```bash
python scripts/run_cli.py "π{name}(σ{major = 'CS'}(Student))" University
```

## 📚 Features

### 🔍 Query Editor
- Interactive relational algebra query writing
- Real-time syntax checking and error hints
- Query result preview and download
- Step-by-step execution process visualization

### 📊 Database Manager
- Support for CSV/ZIP file import
- Support for SQL script import
- Database and table structure browsing
- Data preview and statistics

### 📚 Query Exercises
- Graded practice problem system
- Instant feedback and scoring
- Standard answer comparison
- Learning progress tracking

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
# Start backend service
docker run -d -p 8000:8000 --name backend ra-toolkit-backend

# Start frontend application
docker run -d -p 8501:8501 --name frontend ra-toolkit-frontend
```

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
2. Add API endpoints in `backend/api/routes/`
3. Add UI components in `frontend/components/`
4. Add new pages in `frontend/pages/`
5. Update tests and documentation

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