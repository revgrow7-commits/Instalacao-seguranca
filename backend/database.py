"""
Database connection module.
Uses Supabase (PostgreSQL) as the database.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Import from Supabase module
from db_supabase import db, client, get_client

print("🔌 Database: Supabase (PostgreSQL)")


