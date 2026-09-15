import sys
import os

sys.path.insert(
    0,
    os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..")
    )
)

from app import app


def test_home():

    client = app.test_client()

    response = client.get("/")

    assert response.status_code == 200

    data = response.get_json()

    assert data["status"] == "running"


def test_health():

    client = app.test_client()

    response = client.get("/health")

    assert response.status_code == 200

    data = response.get_json()

    assert data["status"] == "healthy"


def test_create_user_requires_json():

    client = app.test_client()

    response = client.post("/users")

    assert response.status_code == 400


def test_create_user_requires_name_and_email():

    client = app.test_client()

    response = client.post(
        "/users",
        json={
            "name": "Gurpreet"
        }
    )

    assert response.status_code == 400
