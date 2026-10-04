"""Local PostgreSQL for NextStride dev (real PostgreSQL via pgserver, no Docker/paid services).

Usage:
  python scripts/pg_local.py start   # ensure server running + db exists, print DATABASE_URL
  python scripts/pg_local.py status  # check readiness
  python scripts/pg_local.py stop    # stop server (data kept in .pgdata/)

Data lives in <repo>/.pgdata (git-ignored). The server binds a free loopback
port, so this script writes the exact URL to .pgdata/DATABASE_URL.txt on start.
Server persists after this script exits (cleanup_mode=None).
"""
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PGDATA = os.path.join(REPO, ".pgdata")
URL_FILE = os.path.join(PGDATA, "DATABASE_URL.txt")
DB = os.environ.get("PGDB", "nextstride")


def start():
    import pgserver

    srv = pgserver.get_server(PGDATA, cleanup_mode=None)
    postgres_uri = srv.get_uri("postgres")
    try:
        pgserver.psql(["-d", postgres_uri, "-c", f"CREATE DATABASE {DB}"])
        print(f"database '{DB}' created")
    except Exception as e:
        print(f"createdb note (probably already exists): {e}")
    url = srv.get_uri(DB)
    with open(URL_FILE, "w") as f:
        f.write(url)
    print(f"DATABASE_URL={url}")
    print(f"(also written to .pgdata/DATABASE_URL.txt)")
    # Keep backend/.env in sync (local dev convenience; preserves other keys).
    env_path = os.path.join(REPO, "backend", ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            lines = f.read().splitlines()
        lines = [l if not l.startswith("DATABASE_URL=") else f"DATABASE_URL={url}" for l in lines]
        with open(env_path, "w") as f:
            f.write("\n".join(lines) + "\n")
        print("backend/.env DATABASE_URL updated")


def status():
    import pgserver

    try:
        with open(URL_FILE) as f:
            url = f.read().strip()
    except FileNotFoundError:
        print("not started (no DATABASE_URL.txt)")
        sys.exit(1)
    try:
        out = pgserver.psql(["-d", url, "-c", "select version();"])
        print("ready:")
        print(out)
    except Exception as e:
        print(f"not ready: {e}")
        sys.exit(1)


def stop():
    import pgserver

    srv = pgserver.get_server(PGDATA, cleanup_mode=None)
    try:
        srv.cleanup()
        print("stopped")
    except Exception as e:
        print(f"stop note: {e}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "start"
    {"start": start, "status": status, "stop": stop}[cmd]()
