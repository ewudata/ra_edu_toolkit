from backend.routes import auth


def test_google_callback_preserves_existing_query_params_in_redirect(monkeypatch):
    monkeypatch.setattr(
        auth,
        "exchange_google_oauth_code",
        lambda code, ctx: (
            {"access_token": "token-123", "user": {"email": "user@example.com"}},
            "http://localhost:8501/?return_page=pages%2F1_db.py",
        ),
    )

    response = auth.google_callback(
        code="abc",
        ctx="xyz",
        error=None,
        error_description=None,
    )

    assert response.status_code == 302
    assert response.headers["location"] == (
        "http://localhost:8501/?return_page=pages%2F1_db.py"
        "&auth_token=token-123&auth_email=user%40example.com"
    )


def test_google_callback_root_redirect_still_targets_root(monkeypatch):
    monkeypatch.setattr(
        auth,
        "exchange_google_oauth_code",
        lambda code, ctx: (
            {"access_token": "token-123", "user": {"email": "user@example.com"}},
            "http://localhost:8501",
        ),
    )

    response = auth.google_callback(
        code="abc",
        ctx="xyz",
        error=None,
        error_description=None,
    )

    assert response.status_code == 302
    assert response.headers["location"] == (
        "http://localhost:8501?auth_token=token-123&auth_email=user%40example.com"
    )
