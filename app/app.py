import logging

from flask import Flask, jsonify, request
from db import (
    initialize_database,
    test_database_connection,
    create_user,
    get_users,
)

app = Flask(__name__)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s"
)

logger = logging.getLogger(__name__)


@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "application": "8Byte DevOps Assignment",
        "status": "running",
        "endpoints": {
            "health": "/health",
            "database_health": "/health/db",
            "users": "/users"
        }
    }), 200


@app.route("/health", methods=["GET"])
def health():
    """
    ALB health check endpoint.

    Intentionally does not depend on PostgreSQL so the ALB
    can determine whether the application process itself
    is healthy.
    """
    return jsonify({
        "status": "healthy"
    }), 200


@app.route("/health/db", methods=["GET"])
def database_health():
    try:
        test_database_connection()

        return jsonify({
            "status": "healthy",
            "database": "connected"
        }), 200

    except Exception:
        logger.exception("Database health check failed")

        return jsonify({
            "status": "unhealthy",
            "database": "disconnected"
        }), 503


@app.route("/users", methods=["POST"])
def add_user():

    data = request.get_json(silent=True)

    if not data:
        return jsonify({
            "error": "JSON request body required"
        }), 400

    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip()

    if not name or not email:
        return jsonify({
            "error": "name and email are required"
        }), 400

    try:
        user = create_user(name, email)

        logger.info("User created successfully")

        return jsonify({
            "message": "User created successfully",
            "user": user
        }), 201

    except ValueError as error:

        return jsonify({
            "error": str(error)
        }), 409

    except Exception:

        logger.exception("Failed to create user")

        return jsonify({
            "error": "Internal server error"
        }), 500


@app.route("/users", methods=["GET"])
def list_users():

    try:

        users = get_users()

        return jsonify({
            "count": len(users),
            "users": users
        }), 200

    except Exception:

        logger.exception("Failed to retrieve users")

        return jsonify({
            "error": "Internal server error"
        }), 500


if __name__ == "__main__":

    try:
        initialize_database()
        logger.info("Database initialized successfully")

    except Exception:
        logger.exception("Database initialization failed")

    app.run(
        host="0.0.0.0",
        port=8080
    )
