import os

import psycopg2
from psycopg2.extras import RealDictCursor


def get_database_config():

    return {
        "host": os.environ.get("DB_HOST", "localhost"),
        "port": int(os.environ.get("DB_PORT", "5432")),
        "dbname": os.environ.get("DB_NAME", "devopsdb"),
        "user": os.environ.get("DB_USER", "postgres"),
        "password": os.environ.get("DB_PASSWORD", "postgres"),
        "connect_timeout": 5
    }


def get_connection():

    config = get_database_config()

    return psycopg2.connect(**config)


def initialize_database():

    connection = get_connection()

    try:

        with connection.cursor() as cursor:

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

        connection.commit()

    finally:

        connection.close()


def test_database_connection():

    connection = get_connection()

    try:

        with connection.cursor() as cursor:

            cursor.execute("SELECT 1;")

            result = cursor.fetchone()

            if result[0] != 1:
                raise RuntimeError("Database health check failed")

    finally:

        connection.close()


def create_user(name, email):

    connection = get_connection()

    try:

        with connection.cursor(
            cursor_factory=RealDictCursor
        ) as cursor:

            try:

                cursor.execute("""
                    INSERT INTO users (name, email)
                    VALUES (%s, %s)
                    RETURNING id, name, email, created_at;
                """, (name, email))

                user = cursor.fetchone()

                connection.commit()

                return dict(user)

            except psycopg2.errors.UniqueViolation:

                connection.rollback()

                raise ValueError(
                    "A user with this email already exists"
                )

    finally:

        connection.close()


def get_users():

    connection = get_connection()

    try:

        with connection.cursor(
            cursor_factory=RealDictCursor
        ) as cursor:

            cursor.execute("""
                SELECT
                    id,
                    name,
                    email,
                    created_at
                FROM users
                ORDER BY id;
            """)

            users = cursor.fetchall()

            return [dict(user) for user in users]

    finally:

        connection.close()
