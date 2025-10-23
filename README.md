# RA Education Toolkit (Modular)

Includes:
- `api/evaluate_ra/ra_ast.py`  (AST node classes)
- `api/evaluate_ra/ra_parser.py` (Lark-based parser using `api/evaluate_ra/grammar/ra_grammar.lark`)
- `api/evaluate_ra/evaluator.py` (operator-by-operator evaluator with provenance)
- `api/evaluate_ra/stepper.py` (glue to produce step traces)
- `api/app.py` (FastAPI application exposing selected APIs)
- `datasets/*.csv` (tiny demo relations)
- `run.py` (CLI)

Install:
```
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

Run (optionally specify a database subfolder from `datasets/`):
```
python run.py "pi{name}(sigma{major = 'CS'}(Students))" University
```

## Program Execution Flow

### 1. **Entry Point (run.py)**
- Program starts from `run.py`
- Takes a relational algebra expression as command line argument
- Calls `api.evaluate_ra.stepper.run()` function to process the expression

### 2. **Data Loading (stepper.py)**
- `run(expr, database=...)` selects a database subfolder under `datasets/`
  - Each CSV in that subfolder is read into pandas, columns are lower-cased, and provenance metadata attached
  - Relations are registered by filename stem (e.g., `student.csv` → relation `student`)
  - If you omit the database and only one subfolder exists, it is used automatically; otherwise you’ll be prompted to choose

### 3. **Syntax Parsing (ra_parser.py)**
- `parse()` function uses Lark parser:
  - Reads `ra_grammar.lark` grammar file
  - Parses relational algebra expression into parse tree
  - `_ToAST` transformer converts parse tree to AST nodes

### 4. **AST Construction (ra_ast.py)**
- Defines various relational algebra operation AST node types:
  - `Relation`: Relation table
  - `Projection`: Projection operation (π)
  - `Selection`: Selection operation (σ)
  - `Rename`: Rename operation (ρ)
  - `Join`: Join operation (⋈)
  - `Product`: Cartesian product (×)
  - `Union`: Union operation (∪)
  - `Difference`: Difference operation (−)
  - `Intersection`: Intersection operation (∩)
  - `Division`: Division operation (÷)

### 5. **Expression Evaluation (evaluator.py)**
- `eval()` function recursively executes AST:
  - Performs corresponding relational algebra operations based on node type
  - Uses pandas DataFrame for data processing
  - Records execution steps, metadata, and up to 10 output tuples for each operation
  - Supports condition expression evaluation (`_cond_eval`)

### 6. **Result Preview and Output**
- Generates execution trace information:
  - Final schema (`final_schema`)
  - Final row count (`final_rows`)
  - Preview of first 10 rows (`preview`)
- Output files:
  - `output/trace.json`: Complete execution trace
  - `output/result.csv`: Final result data
  - `ra_trace_viewer.html`: Standalone HTML snapshot of the latest trace

### 7. **Supported Syntax**
Grammar file defines standard relational algebra operators:
- `π{attr1,attr2}(R)`: Projection
- `σ{condition}(R)`: Selection
- `ρ{old->new}(R)`: Rename
- `R ⋈ S`: Natural join
- `R × S`: Cartesian product
- `R ∪ S`: Union
- `R − S`: Difference
- `R ∩ S`: Intersection
- `R ÷ S`: Division

All operator keywords (π, σ, ρ, join/product/union/etc.), relation names, and attribute names are matched case-insensitively; inputs are canonicalized internally so you can write expressions such as `Pi{Name}(students)` or `JOIN`/`join` interchangeably.

## FastAPI Backend

Launch the HTTP API alongside the CLI workflow with:
```
uvicorn api.app:app --reload
```

The server currently exposes:

- `GET /databases` — list the sample databases and their relations.
- `POST /databases/import/zip` — upload a `.zip` that contains one or more CSV files (one file per relation) and register it as a new database folder.
- `POST /databases/import/sql` — upload a `.sql` script; the server executes it in an in-memory SQLite database and exports every table to CSV.

`GET /databases` responds with a payload like:

```
[
  {
    "name": "TestDB",
    "tables": ["courses", "enroll", "students"],
    "table_count": 3
  },
  {
    "name": "University",
    "tables": ["advisor", "classroom", "course", ...],
    "table_count": 11
  }
]
```

Use the catalog endpoint to drive a frontend selector or any other integration that needs to know which demo datasets are available. Each entry mirrors the structure returned by `api.services.datasets.list_databases()`.

To import, send a multipart form request with the new database name and the file upload. Example:

```
curl -X POST \
  -F "name=NewDemo" \
  -F "file=@/path/to/demo.zip" \
  http://localhost:8000/databases/import/zip
```

The server validates archive contents (only `.csv` files, no nested directories) and persists them under `datasets/NewDemo/`. SQL uploads follow the same pattern but expect a UTF-8 encoded script file.
