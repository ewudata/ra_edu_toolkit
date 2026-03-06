from pathlib import Path


def test_supabase_setup_sql_includes_query_mastery_table_and_policies():
    source = Path("assets/supabase_user_datasets_setup.sql").read_text(
        encoding="utf-8"
    )

    assert "create table if not exists public.query_mastery" in source
    assert "unique (user_id, database_name, query_id)" in source
    assert "create index if not exists query_mastery_user_idx" in source
    assert "drop trigger if exists trg_query_mastery_updated_at" in source
    assert 'create policy "query_mastery_select_own"' in source
    assert 'create policy "query_mastery_insert_own"' in source
    assert 'create policy "query_mastery_update_own"' in source
    assert 'create policy "query_mastery_delete_own"' in source
