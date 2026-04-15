from pathlib import Path

import pandas as pd

from backend.core import evaluator, stepper


def _load_university_env():
    root = Path(__file__).resolve().parents[2] / "datasets" / "University"
    env = {}
    for csv_path in root.glob("*.csv"):
        relation = csv_path.stem.lower()
        df = pd.read_csv(csv_path).copy()
        df.columns = [c.lower() for c in df.columns]
        df["_prov"] = [[(relation, int(i))] for i in range(len(df))]
        env[relation] = df
    return env


def test_qualified_attributes_work_in_selection_and_projection():
    ast = stepper.parse(
        "pi{s1.dept_name}(sigma{s1.dept_name = s2.dept_name AND s1.id != s2.id}(rho s1(student) x rho s2(student)))"
    )
    result = evaluator.eval(ast, _load_university_env(), [])

    assert [c for c in result.columns if c != "_prov"] == ["dept_name"]
    assert result[["dept_name"]].to_dict(orient="records") == [
        {"dept_name": "Comp. Sci."},
        {"dept_name": "Physics"},
        {"dept_name": "Elec. Eng."},
    ]


def test_qualified_projection_can_resolve_right_side_product_columns():
    ast = stepper.parse(
        "pi{s1.id, s2.id}(sigma{s1.dept_name = s2.dept_name AND s1.id != s2.id}(rho s1(student) x rho s2(student)))"
    )
    result = evaluator.eval(ast, _load_university_env(), [])

    assert [c for c in result.columns if c != "_prov"] == ["id", "id_r"]
    assert {"id": 128, "id_r": 12345} in result[["id", "id_r"]].to_dict(orient="records")


def test_qualified_rename_sources_are_accepted_as_syntactic_sugar():
    ast = stepper.parse(
        "pi{student_name, student_major}(rho{st.name->student_name, st.dept_name->student_major}(rho st(student)))"
    )
    result = evaluator.eval(ast, _load_university_env(), [])

    assert [c for c in result.columns if c != "_prov"] == ["student_name", "student_major"]
    assert {"student_name": "Zhang", "student_major": "Comp. Sci."} in result[
        ["student_name", "student_major"]
    ].to_dict(orient="records")
