"""NextStride backend orchestrator (initial working version).

PRD Sections 26-27: owns auth, situation lifecycle, AI orchestration,
validation, persistence, versioning, reassessment, feedback.

Run:  python backend/server.py
Then: http://localhost:8000

Stdlib only — no third-party dependencies.
"""
import hashlib
import json
import os
import secrets
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import models
import ai_service

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

SESSIONS = {}  # token -> user_id (in-memory; sessions reset on restart for MVP)

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json",
}


def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000).hex()
    return f"{salt}${digest}"


def verify_password(password, stored):
    try:
        salt, digest = stored.split("$", 1)
    except ValueError:
        return False
    return hash_password(password, salt) == stored


def public_user(user):
    return {"id": user["id"], "name": user["name"], "email": user["email"]}


class Handler(BaseHTTPRequestHandler):
    server_version = "NextStride/0.1"

    # -- helpers ---------------------------------------------------------
    def log_message(self, *args):
        pass  # keep MVP output clean; see data/*.json for state

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode() or "{}")
        except json.JSONDecodeError:
            return {}

    def _auth_user(self):
        header = self.headers.get("Authorization", "")
        token = header[7:] if header.startswith("Bearer ") else ""
        user_id = SESSIONS.get(token)
        if not user_id:
            return None, None
        for u in models.load_users():
            if u["id"] == user_id:
                return u, token
        return None, None

    def _find_situation(self, sid, user_id):
        for s in models.load_situations():
            if s["id"] == sid and s["user_id"] == user_id:
                return s
        return None

    # -- static frontend -------------------------------------------------
    def _serve_static(self, path):
        rel = "index.html" if path in ("/", "") else path.lstrip("/")
        full = os.path.normpath(os.path.join(FRONTEND_DIR, rel))
        if not full.startswith(FRONTEND_DIR) or not os.path.isfile(full):
            return False
        ext = os.path.splitext(full)[1].lower()
        with open(full, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", CONTENT_TYPES.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        return True

    # -- routing ----------------------------------------------------------
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/health":
            return self._send_json(200, {"status": "ok", "product": "NextStride", "version": "0.1.0"})

        if path == "/api/auth/me":
            user, _ = self._auth_user()
            if not user:
                return self._send_json(401, {"error": "Not authenticated"})
            return self._send_json(200, {"user": public_user(user)})

        if path.startswith("/api/situations"):
            user, _ = self._auth_user()
            if not user:
                return self._send_json(401, {"error": "Not authenticated"})
            parts = [p for p in path.split("/") if p]
            # /api/situations/<id>  or  /api/situations/<id>/recommendations
            if len(parts) == 3 and parts[2] != "situations":
                s = self._find_situation(parts[2], user["id"])
                if not s:
                    return self._send_json(404, {"error": "Situation not found"})
                return self._send_json(200, {"situation": s})
            if len(parts) == 4 and parts[3] == "recommendations":
                s = self._find_situation(parts[2], user["id"])
                if not s:
                    return self._send_json(404, {"error": "Situation not found"})
                return self._send_json(200, {"recommendations": s.get("recommendations", [])})
            return self._send_json(404, {"error": "Unknown endpoint"})

        if not path.startswith("/api/"):
            if self._serve_static(path):
                return
            return self._send_json(404, {"error": "Not found"})
        return self._send_json(404, {"error": "Unknown endpoint"})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        body = self._read_json()

        if path == "/api/auth/register":
            name, email, password = body.get("name", "").strip(), body.get("email", "").strip().lower(), body.get("password", "")
            if not name or not email or len(password) < 6:
                return self._send_json(400, {"error": "Name, valid email, and 6+ character password required"})
            users = models.load_users()
            if any(u["email"] == email for u in users):
                return self._send_json(409, {"error": "Email already registered"})
            user = {"id": uuid.uuid4().hex[:12], "name": name, "email": email,
                    "password_hash": hash_password(password), "created_at": int(time.time())}
            users.append(user)
            models.save_users(users)
            token = secrets.token_hex(24)
            SESSIONS[token] = user["id"]
            return self._send_json(201, {"user": public_user(user), "token": token})

        if path == "/api/auth/login":
            email, password = body.get("email", "").strip().lower(), body.get("password", "")
            for u in models.load_users():
                if u["email"] == email and verify_password(password, u["password_hash"]):
                    token = secrets.token_hex(24)
                    SESSIONS[token] = u["id"]
                    return self._send_json(200, {"user": public_user(u), "token": token})
            return self._send_json(401, {"error": "Invalid email or password"})

        if path == "/api/auth/logout":
            user, token = self._auth_user()
            if token in SESSIONS:
                del SESSIONS[token]
            return self._send_json(200, {"ok": True})

        # Authenticated situation endpoints
        user, _ = self._auth_user()
        if not user:
            return self._send_json(401, {"error": "Not authenticated"})

        if path == "/api/situations":
            text = body.get("text", "").strip()
            if not text:
                return self._send_json(400, {"error": "Situation text is required"})
            context = ai_service.understand_situation(text)
            situation = {
                "id": uuid.uuid4().hex[:12],
                "user_id": user["id"],
                "text": text,
                "context": context,
                "confirmed": False,
                "recommendations": [],
                "reassessments": [],
                "feedback": None,
                "created_at": int(time.time()),
            }
            situations = models.load_situations()
            situations.append(situation)
            models.save_situations(situations)
            return self._send_json(201, {"situation": situation})

        parts = [p for p in path.split("/") if p]
        if len(parts) == 4 and parts[0] == "api" and parts[1] == "situations":
            sid, action = parts[2], parts[3]
            situations = models.load_situations()
            s = next((x for x in situations if x["id"] == sid and x["user_id"] == user["id"]), None)
            if not s:
                return self._send_json(404, {"error": "Situation not found"})

            if action == "prioritize":
                rec = ai_service.generate_recommendation(s["text"], s["context"])
                s["confirmed"] = True
                s["recommendations"].append({**rec, "created_at": int(time.time())})
                models.save_situations(situations)
                return self._send_json(201, {"recommendation": rec, "situation": s})

            if action == "reassess":
                update_text = body.get("update_text", "").strip()
                if not update_text:
                    return self._send_json(400, {"error": "update_text is required"})
                prev = s["recommendations"][-1] if s["recommendations"] else None
                new_context, rec = ai_service.reassess_situation(s["text"], s["context"], prev or {"version": 0}, update_text)
                s["context"] = new_context
                s["recommendations"].append({**rec, "created_at": int(time.time())})
                s["reassessments"].append({"update_text": update_text, "created_at": int(time.time())})
                models.save_situations(situations)
                return self._send_json(201, {"recommendation": rec, "situation": s})

            if action == "feedback":
                s["feedback"] = {"helpful": bool(body.get("helpful")), "note": (body.get("note") or "")[:1000],
                                 "created_at": int(time.time())}
                models.save_situations(situations)
                return self._send_json(201, {"feedback": s["feedback"]})

        return self._send_json(404, {"error": "Unknown endpoint"})

    def do_PATCH(self):
        parsed = urlparse(self.path)
        parts = [p for p in parsed.path.split("/") if p]
        user, _ = self._auth_user()
        if not user:
            return self._send_json(401, {"error": "Not authenticated"})
        if len(parts) == 3 and parts[0] == "api" and parts[1] == "situations":
            body = self._read_json()
            situations = models.load_situations()
            s = next((x for x in situations if x["id"] == parts[2] and x["user_id"] == user["id"]), None)
            if not s:
                return self._send_json(404, {"error": "Situation not found"})
            if "text" in body and body["text"].strip():
                s["text"] = body["text"].strip()
                s["context"] = ai_service.understand_situation(s["text"])
                s["confirmed"] = False
            if "confirmed" in body:
                s["confirmed"] = bool(body["confirmed"])
            models.save_situations(situations)
            return self._send_json(200, {"situation": s})
        return self._send_json(404, {"error": "Unknown endpoint"})


def run(host="127.0.0.1", port=8000):
    models._ensure_files()
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"NextStride MVP running at http://{host}:{port}")
    print("Press Ctrl+C to stop.")
    server.serve_forever()


if __name__ == "__main__":
    run()
