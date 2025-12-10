#!/usr/bin/env python3
"""
Script para criar usuário admin inicial
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
import os
from dotenv import load_dotenv
from datetime import datetime, timezone
import uuid

# Load environment
load_dotenv()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def create_admin():
    # Connect to MongoDB
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]
    
    # Check if admin exists
    existing = await db.users.find_one({"email": "admin@industriavisual.com"})
    if existing:
        print("❌ Admin já existe!")
        return
    
    # Create admin user
    admin_id = str(uuid.uuid4())
    admin = {
        "id": admin_id,
        "email": "admin@industriavisual.com",
        "name": "Administrador",
        "role": "admin",
        "password_hash": pwd_context.hash("admin123"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_active": True
    }
    
    await db.users.insert_one(admin)
    print("✅ Admin criado com sucesso!")
    print(f"   Email: admin@industriavisual.com")
    print(f"   Senha: admin123")
    print(f"   ID: {admin_id}")
    
    # Create a manager for testing
    manager_id = str(uuid.uuid4())
    manager = {
        "id": manager_id,
        "email": "gerente@industriavisual.com",
        "name": "Gerente Teste",
        "role": "manager",
        "password_hash": pwd_context.hash("gerente123"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_active": True
    }
    await db.users.insert_one(manager)
    print("✅ Gerente de teste criado!")
    print(f"   Email: gerente@industriavisual.com")
    print(f"   Senha: gerente123")
    
    # Create an installer for testing
    installer_user_id = str(uuid.uuid4())
    installer_id = str(uuid.uuid4())
    
    installer_user = {
        "id": installer_user_id,
        "email": "instalador@industriavisual.com",
        "name": "Instalador Teste",
        "role": "installer",
        "password_hash": pwd_context.hash("instalador123"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_active": True
    }
    await db.users.insert_one(installer_user)
    
    installer = {
        "id": installer_id,
        "user_id": installer_user_id,
        "full_name": "Instalador Teste",
        "phone": "(51) 99999-9999",
        "branch": "POA",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.installers.insert_one(installer)
    print("✅ Instalador de teste criado!")
    print(f"   Email: instalador@industriavisual.com")
    print(f"   Senha: instalador123")
    print(f"   Filial: POA")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(create_admin())