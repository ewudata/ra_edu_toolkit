import os
import sys

sys.path.append(os.path.join(os.getcwd(), "frontend"))

from frontend.utils import auth


def test_build_frontend_redirect_includes_return_page():
    redirect = auth._build_frontend_redirect_url(
        "http://localhost:8501", "pages/1_🗄️_Database_Manager.py"
    )

    assert (
        redirect
        == "http://localhost:8501?return_page=pages%2F1_%F0%9F%97%84%EF%B8%8F_Database_Manager.py"
    )


def test_build_frontend_redirect_without_return_page_uses_base_url():
    redirect = auth._build_frontend_redirect_url("http://localhost:8501", None)

    assert redirect == "http://localhost:8501"
