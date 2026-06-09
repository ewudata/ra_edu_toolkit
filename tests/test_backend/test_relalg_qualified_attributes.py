from pathlib import Path

import pandas as pd
import pytest

from backend.core import ra_ast as AST
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


def test_theta_join_uses_alias_qualified_conditions():
    ast = stepper.parse(
        "pi{student_name, advisor_name}((rho{name->student_name}(rho st(student)) ⋈{st.id = adv.s_id} rho adv(advisor)) ⋈{adv.i_id = inst.id} rho{name->advisor_name}(rho inst(instructor)))"
    )
    result = evaluator.eval(ast, _load_university_env(), [])

    assert [c for c in result.columns if c != "_prov"] == ["student_name", "advisor_name"]
    rows = result[["student_name", "advisor_name"]].to_dict(orient="records")
    assert len(rows) == 9
    assert {"student_name": "Zhang", "advisor_name": "Katz"} in rows
    assert {"student_name": "Shankar", "advisor_name": "Srinivasan"} in rows


def test_natural_join_accepts_clear_text_aliases():
    for alias in ("natural_join", "natjoin", "njoin"):
        ast = stepper.parse(f"student {alias} takes")

        assert isinstance(ast, AST.Join)
        assert ast.theta is None


def test_textual_operator_aliases_are_case_insensitive():
    ast = stepper.parse("Pi{name}(sIgMa{dept_name = 'Comp. Sci.'}(RhO st(student)))")

    assert isinstance(ast, AST.Projection)
    assert isinstance(ast.sub, AST.Selection)
    assert isinstance(ast.sub.sub, AST.Rename)


def test_binary_textual_operator_aliases_are_case_insensitive():
    cases = [
        ("student NaTuRaL_jOiN takes", AST.Join),
        ("student NaTjOiN takes", AST.Join),
        ("student NjOiN takes", AST.Join),
        ("student CrOsS takes", AST.Product),
        ("student UnIoN student", AST.Union),
        ("student DiFf student", AST.Difference),
        ("student InTeRsEcT student", AST.Intersection),
        ("student DiV student", AST.Division),
    ]

    for expression, node_type in cases:
        assert isinstance(stepper.parse(expression), node_type)


def test_bare_join_is_not_a_natural_join_alias():
    with pytest.raises(Exception):
        stepper.parse("student join takes")


def test_natural_join_with_no_common_columns_and_empty_right_side_returns_no_rows():
    ast = stepper.parse(
        "pi{instructor_name}(rho{id->i_id, name->instructor_name}(instructor) ⋈ sigma{semester = 'Spring' AND year = 2010}(teaches))"
    )
    result = evaluator.eval(ast, _load_university_env(), [])

    assert [c for c in result.columns if c != "_prov"] == ["instructor_name"]
    assert result[["instructor_name"]].to_dict(orient="records") == []
