from pathlib import Path


def test_ra_sql_translation_preserves_relation_alias_when_wrapping_renamed_subquery():
    source = Path("frontend/src/lib/raSqlTranslation.ts").read_text(encoding="utf-8")

    assert "const aliasOverride = node.relationAlias" in source
    assert "node.sub.type === 'rename' && node.sub.relationAlias ? node.sub.relationAlias : undefined" in source
    assert "return wrapSubquery(sql, aliasCounter, aliasOverride);" in source


def test_ra_sql_translation_uses_explicit_natural_join_aliases():
    source = Path("frontend/src/lib/raSqlTranslation.ts").read_text(encoding="utf-8")

    assert "this.matchKeyword('natural_join')" in source
    assert "this.matchKeyword('natjoin')" in source
    assert "this.matchKeyword('njoin')" in source
    assert "this.matchKeyword('join')" not in source
