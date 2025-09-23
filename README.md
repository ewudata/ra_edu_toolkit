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