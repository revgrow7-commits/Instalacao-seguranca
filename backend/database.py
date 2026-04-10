"""
Database connection module.
Supports both MongoDB and Supabase based on USE_SUPABASE environment variable.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Check which database to use
USE_SUPABASE = os.environ.get('USE_SUPABASE', 'false').lower() == 'true'

if USE_SUPABASE:
    # Use Supabase (PostgreSQL)
    from database_supabase import get_supabase_db, get_supabase_client
    
    db = get_supabase_db()
    client = get_supabase_client()
    
    print("🔌 Database: Supabase (PostgreSQL)")
else:
    # Use MongoDB (default)
    from motor.motor_asyncio import AsyncIOMotorClient
    
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ.get('DB_NAME', 'industria_visual_db')]
    
    print("🔌 Database: MongoDB")

