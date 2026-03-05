from pathlib import Path


def test_google_login_button_label_and_target_are_updated():
    source = Path("frontend/utils/auth.py").read_text(encoding="utf-8")

    assert "Log in with Google" in source
    assert "Continue with Google" not in source
    assert 'target="_self"' in source
