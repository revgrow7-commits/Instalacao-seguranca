"""
Calendar routes - Migrated from server.py
Handles Google Calendar integration and related authentication.
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import RedirectResponse
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
import logging
import requests

from database import db
from security import get_current_user
from models.user import User
from config import (
    GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, 
    GOOGLE_REDIRECT_URI, GOOGLE_CALENDAR_SCOPES,
    FRONTEND_URL
)

# Google imports
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build

router = APIRouter()
logger = logging.getLogger(__name__)


# ============ MODELS ============

class GoogleCalendarEventCreate(BaseModel):
    """Create Google Calendar event request."""
    title: str
    description: Optional[str] = None
    start_datetime: str  # ISO format
    end_datetime: str  # ISO format
    location: Optional[str] = None
    attendees: Optional[List[str]] = None  # List of email addresses
    send_notifications: Optional[bool] = True  # Send email invites to attendees


# ============ HELPER FUNCTIONS ============

async def get_google_credentials(user_id: str):
    """Get and refresh Google credentials for a user."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "google_tokens": 1})
    
    if not user or not user.get('google_tokens'):
        return None
    
    tokens = user['google_tokens']
    
    creds = Credentials(
        token=tokens.get('access_token'),
        refresh_token=tokens.get('refresh_token'),
        token_uri='https://oauth2.googleapis.com/token',
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=GOOGLE_CALENDAR_SCOPES
    )
    
    # Refresh if expired
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(GoogleRequest())
            # Update stored token
            await db.users.update_one(
                {"id": user_id},
                {"$set": {
                    "google_tokens.access_token": creds.token,
                    "google_tokens.obtained_at": datetime.now(timezone.utc).isoformat()
                }}
            )
        except Exception as e:
            logger.error(f"Failed to refresh Google token: {str(e)}")
            return None
    
    return creds


# ============ GOOGLE AUTH ROUTES ============

@router.get("/auth/google/login")
async def google_login(current_user: User = Depends(get_current_user)):
    """Initiates Google OAuth flow for calendar access."""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Google OAuth não configurado")
    
    # Store user_id in state to associate tokens later
    state = f"{current_user.id}"
    
    auth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={GOOGLE_CLIENT_ID}&"
        f"redirect_uri={GOOGLE_REDIRECT_URI}&"
        f"response_type=code&"
        f"scope={'%20'.join(GOOGLE_CALENDAR_SCOPES)}&"
        f"access_type=offline&"
        f"prompt=consent&"
        f"state={state}"
    )
    
    return {"authorization_url": auth_url}


@router.get("/auth/google/callback")
async def google_callback(code: str, state: str = None):
    """Handles Google OAuth callback."""
    try:
        # Exchange code for tokens
        token_response = requests.post(
            'https://oauth2.googleapis.com/token',
            data={
                'code': code,
                'client_id': GOOGLE_CLIENT_ID,
                'client_secret': GOOGLE_CLIENT_SECRET,
                'redirect_uri': GOOGLE_REDIRECT_URI,
                'grant_type': 'authorization_code'
            }
        )
        
        if token_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Falha ao obter tokens do Google")
        
        tokens = token_response.json()
        
        # Get user email from Google
        userinfo_response = requests.get(
            'https://www.googleapis.com/oauth2/v2/userinfo',
            headers={'Authorization': f'Bearer {tokens["access_token"]}'}
        )
        
        if userinfo_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Falha ao obter informações do usuário")
        
        google_user = userinfo_response.json()
        google_email = google_user.get('email')
        
        # Find user by state (user_id) or by google email
        user = None
        if state:
            user = await db.users.find_one({"id": state}, {"_id": 0})
        
        if not user:
            user = await db.users.find_one({"email": google_email}, {"_id": 0})
        
        if not user:
            # Close window with error
            return RedirectResponse(
                url=f"{FRONTEND_URL}/calendar?google_error=user_not_found"
            )
        
        # Store Google tokens for this user
        await db.users.update_one(
            {"id": user['id']},
            {"$set": {
                "google_tokens": {
                    "access_token": tokens.get('access_token'),
                    "refresh_token": tokens.get('refresh_token'),
                    "expires_in": tokens.get('expires_in'),
                    "token_type": tokens.get('token_type'),
                    "scope": tokens.get('scope'),
                    "obtained_at": datetime.now(timezone.utc).isoformat()
                },
                "google_email": google_email
            }}
        )
        
        # Redirect back to calendar page with success
        return RedirectResponse(
            url=f"{FRONTEND_URL}/calendar?google_connected=true"
        )
        
    except Exception as e:
        logger.error(f"Google callback error: {str(e)}")
        return RedirectResponse(
            url=f"{FRONTEND_URL}/calendar?google_error=auth_failed"
        )


@router.get("/auth/google/status")
async def google_auth_status(current_user: User = Depends(get_current_user)):
    """Check if user has connected Google Calendar."""
    user = await db.users.find_one({"id": current_user.id}, {"_id": 0, "google_tokens": 1, "google_email": 1})
    
    has_google = False
    if user and user.get('google_tokens'):
        tokens = user.get('google_tokens')
        if isinstance(tokens, dict) and tokens.get('access_token'):
            has_google = True
    
    return {
        "connected": has_google,
        "google_email": user.get('google_email') if has_google else None
    }


@router.delete("/auth/google/disconnect")
async def google_disconnect(current_user: User = Depends(get_current_user)):
    """Disconnect Google Calendar from user account."""
    await db.users.update_one(
        {"id": current_user.id},
        {"$unset": {"google_tokens": "", "google_email": ""}}
    )
    
    return {"message": "Google Calendar desconectado com sucesso"}


# ============ CALENDAR EVENTS ROUTES ============

@router.get("/calendar/events")
async def get_google_calendar_events(current_user: User = Depends(get_current_user)):
    """Get events from user's Google Calendar."""
    google_creds = await get_google_credentials(current_user.id)
    if not google_creds:
        raise HTTPException(status_code=401, detail="Google Calendar não conectado")
    
    try:
        service = build('calendar', 'v3', credentials=google_creds)
        
        # Get events from now to 30 days ahead
        now = datetime.now(timezone.utc).isoformat()
        end = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        
        events_result = service.events().list(
            calendarId='primary',
            timeMin=now,
            timeMax=end,
            maxResults=50,
            singleEvents=True,
            orderBy='startTime'
        ).execute()
        
        events = events_result.get('items', [])
        
        return {"events": events}
        
    except Exception as e:
        logger.error(f"Error fetching Google Calendar events: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erro ao buscar eventos: {str(e)}")


@router.post("/calendar/events")
async def create_google_calendar_event(
    event_data: GoogleCalendarEventCreate,
    current_user: User = Depends(get_current_user)
):
    """Create an event in user's Google Calendar with optional email invites."""
    google_creds = await get_google_credentials(current_user.id)
    if not google_creds:
        raise HTTPException(status_code=401, detail="Google Calendar não conectado")
    
    try:
        service = build('calendar', 'v3', credentials=google_creds)
        
        event_body = {
            'summary': event_data.title,
            'description': event_data.description or '',
            'start': {
                'dateTime': event_data.start_datetime,
                'timeZone': 'America/Sao_Paulo'
            },
            'end': {
                'dateTime': event_data.end_datetime,
                'timeZone': 'America/Sao_Paulo'
            }
        }
        
        if event_data.location:
            event_body['location'] = event_data.location
        
        # Add attendees for email invitations
        if event_data.attendees and len(event_data.attendees) > 0:
            event_body['attendees'] = [{'email': email} for email in event_data.attendees]
            logger.info(f"Adding {len(event_data.attendees)} attendees to calendar event")
        
        # Create the event with sendUpdates parameter for email notifications
        event = service.events().insert(
            calendarId='primary',
            body=event_body,
            sendUpdates='all' if event_data.send_notifications and event_data.attendees else 'none'
        ).execute()
        
        attendees_count = len(event_data.attendees) if event_data.attendees else 0
        return {
            "message": "Evento criado com sucesso no Google Calendar",
            "event_id": event.get('id'),
            "html_link": event.get('htmlLink'),
            "attendees_notified": attendees_count if event_data.send_notifications else 0
        }
        
    except Exception as e:
        logger.error(f"Error creating Google Calendar event: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erro ao criar evento: {str(e)}")


@router.delete("/calendar/events/{event_id}")
async def delete_google_calendar_event(
    event_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete an event from user's Google Calendar."""
    google_creds = await get_google_credentials(current_user.id)
    if not google_creds:
        raise HTTPException(status_code=401, detail="Google Calendar não conectado")
    
    try:
        service = build('calendar', 'v3', credentials=google_creds)
        service.events().delete(calendarId='primary', eventId=event_id).execute()
        
        return {"message": "Evento removido do Google Calendar"}
        
    except Exception as e:
        logger.error(f"Error deleting Google Calendar event: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erro ao remover evento: {str(e)}")
