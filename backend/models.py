"""JSON file persistence for the NextStride MVP.

Conceptual model from PRD Section 24:
users -> situations -> situation_contexts -> responsibilities ->
conflicts -> recommendations -> reassessments -> feedback.

For the initial working version we persist to data/*.json so the project
runs without PostgreSQL. The record shapes mirror the future Prisma tables
and can be migrated later.
"""
import json
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")

USERS_FILE = os.path.join(DATA_DIR, "users.json")
SITUATIONS_FILE = os.path.join(DATA_DIR, "situations.json")


def _ensure_files():
    os.makedirs(DATA_DIR, exist_ok=True)
    for path, default in ((USERS_FILE, []), (SITUATIONS_FILE, [])):
        if not os.path.exists(path):
            with open(path, "w", encoding="utf-8") as f:
                json.dump(default, f)


def _load(path, default):
    _ensure_files()
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def _save(path, data):
    _ensure_files()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def load_users():
    return _load(USERS_FILE, [])


def save_users(users):
    _save(USERS_FILE, users)


def load_situations():
    return _load(SITUATIONS_FILE, [])


def save_situations(situations):
    _save(SITUATIONS_FILE, situations)
