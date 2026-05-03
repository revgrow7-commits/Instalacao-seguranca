#!/usr/bin/env python3
"""
Script para criar usuario admin inicial no Supabase.
Uso: python init_admin.py
"""
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from db_supabase import db
from security import get_password_hash


def create_admin():
    email = os.environ.get("ADMIN_EMAIL", "mktindustriavisual@gmail.com")
    password = os.environ.get("ADMIN_INITIAL_PASSWORD") or (
        sys.argv[1] if len(sys.argv) > 1 else None
    )
    if not password:
        print("ERRO: defina ADMIN_INITIAL_PASSWORD ou passe a senha como argumento.")
        print("  Exemplo: python init_admin.py 'MinhaSenhaSegura@2026'")
        sys.exit(1)

    existing = db.users.find({"email": email})
    if existing:
        print(f"Admin ja existe: {existing[0].get('id')}")
        return

    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    db.users.insert_one({
        "id": user_id,
        "email": email,
        "name": "Admin Marketing",
        "full_name": "Admin Marketing",
        "password_hash": get_password_hash(password),
        "role": "admin",
        "branch": "POA",
        "is_active": True,
        "created_at": now
    })

    print(f"Admin criado!")
    print(f"  Email: {email}")
    print(f"  ID: {user_id}")


if __name__ == "__main__":
    create_admin()
