# RA Education Toolkit (Modular)

Includes:
- `raedu/ra_ast.py`  (AST node classes)
- `raedu/ra_parser.py` (Lark-based parser using `raedu/grammar/ra_grammar.lark`)
- `raedu/evaluator.py` (operator-by-operator evaluator with provenance)
- `raedu/stepper.py` (glue to produce step traces)
- `datasets/*.csv` (tiny demo relations)
- `run.py` (CLI)

Install:
```
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

Run:
```
python run.py "pi{name}(sigma{major = 'CS'}(Students))"
```

## Program Execution Flow

### 1. **Entry Point (run.py)**
- Program starts from `run.py`
- Takes a relational algebra expression as command line argument
- Calls `raedu.stepper.run()` function to process the expression

### 2. **Data Loading (stepper.py)**
- `_load_env()` automatically discovers every `.csv` file under `datasets/`
  - Each file is read into a DataFrame, columns are lower-cased, and provenance metadata is attached
  - The loader registers each relation by the file stem (e.g., `students.csv` → relation `students`)
  - Find additional tables by dropping more CSVs into the folder and rerunning the CLI—no code changes needed

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
