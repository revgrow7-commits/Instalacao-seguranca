"""
Vercel Serverless Entry Point
This file exports the FastAPI app for Vercel Functions.
"""
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import the FastAPI app
from server import app

# Vercel handler
handler = app
