import pytest

@pytest.fixture(autouse=True)
def legacy_demo_fixtures(request, monkeypatch):
    # Existing domain tests exercise the seeded fixture; authentication is covered
    # by test_auth with independent accounts and real session cookies.
    if request.node.path.name != 'test_auth.py':
        from app import app
        monkeypatch.setitem(app.config, 'AUTH_TEST_DEMO', True)
