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
import hmac
import hashlib
import secrets
import base64

from db_supabase import db, get_client
from security import get_current_user
from models.user import User
from config import (
    GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI, GOOGLE_INSTALLER_REDIRECT_URI,
    GOOGLE_CALENDAR_SCOPES, FRONTEND_URL, SECRET_KEY
)

_OAUTH_STATE_TTL_SECONDS = 600  # 10 min


def _make_oauth_state(user_id: str) -> str:
    """Gera state assinado com HMAC: base64(user_id|timestamp|nonce|sig)."""
    nonce = secrets.token_hex(8)
    ts = str(int(datetime.now(timezone.utc).timestamp()))
    payload = f"{user_id}|{ts}|{nonce}"
    sig = hmac.new(SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()
    raw = f"{payload}|{sig}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _verify_oauth_state(state: str) -> str:
    """Valida state e retorna user_id. Levanta HTTPException em caso de falha."""
    try:
        raw = base64.urlsafe_b64decode(state.encode()).decode()
        user_id, ts, nonce, sig = raw.rsplit("|", 3)
    except Exception:
        raise HTTPException(status_code=400, detail="OAuth state inválido")

    payload = f"{user_id}|{ts}|{nonce}"
    expected = hmac.new(SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        raise HTTPException(status_code=400, detail="OAuth state inválido")

    age = int(datetime.now(timezone.utc).timestamp()) - int(ts)
    if age > _OAUTH_STATE_TTL_SECONDS:
        raise HTTPException(status_code=400, detail="OAuth state expirado — inicie o login novamente")

    return user_id

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
    token_doc = db.google_tokens.find_one({"user_id": user_id}, {"_id": 0})

    if not token_doc or not token_doc.get('token'):
        return None

    tokens = token_doc['token']
    if isinstance(tokens, str):
        import json
        tokens = json.loads(tokens)

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
            tokens['access_token'] = creds.token
            tokens['obtained_at'] = datetime.now(timezone.utc).isoformat()
            db.google_tokens.update_one(
                {"user_id": user_id},
                {"$set": {"token": tokens, "updated_at": datetime.now(timezone.utc).isoformat()}}
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
    
    # State assinado com HMAC — previne CSRF/linkagem forjada de conta Google
    state = _make_oauth_state(current_user.id)
    
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
        
        # Valida state HMAC — rejeita tentativas forjadas de CSRF
        user = None
        if state:
            verified_user_id = _verify_oauth_state(state)
            user = db.users.find_one({"id": verified_user_id}, {"_id": 0})
        
        if not user:
            user = db.users.find_one({"email": google_email}, {"_id": 0})
        
        if not user:
            # Close window with error
            return RedirectResponse(
                url=f"{FRONTEND_URL}/calendar?google_error=user_not_found"
            )
        
        # Store Google tokens in google_tokens table
        import uuid as _uuid
        token_data = {
            "access_token": tokens.get('access_token'),
            "refresh_token": tokens.get('refresh_token'),
            "expires_in": tokens.get('expires_in'),
            "token_type": tokens.get('token_type'),
            "scope": tokens.get('scope'),
            "google_email": google_email,
            "obtained_at": datetime.now(timezone.utc).isoformat()
        }
        existing_token = db.google_tokens.find_one({"user_id": user['id']})
        if existing_token:
            db.google_tokens.update_one(
                {"user_id": user['id']},
                {"$set": {"token": token_data, "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
        else:
            db.google_tokens.insert_one({
                "id": str(_uuid.uuid4()),
                "user_id": user['id'],
                "token": token_data,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            })
        
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
    token_doc = db.google_tokens.find_one({"user_id": current_user.id}, {"_id": 0})

    has_google = False
    google_email = None
    if token_doc and token_doc.get('token'):
        tokens = token_doc['token']
        if isinstance(tokens, str):
            import json
            tokens = json.loads(tokens)
        if isinstance(tokens, dict) and tokens.get('access_token'):
            has_google = True
            google_email = tokens.get('google_email')

    return {
        "connected": has_google,
        "google_email": google_email
    }


@router.delete("/auth/google/disconnect")
async def google_disconnect(current_user: User = Depends(get_current_user)):
    """Disconnect Google Calendar from user account."""
    db.google_tokens.delete_one({"user_id": current_user.id})

    return {"message": "Google Calendar desconectado com sucesso"}


# ============ INSTALLER GOOGLE AUTH ROUTES ============

@router.get("/calendar/installer/auth/google")
async def installer_google_auth(current_user: User = Depends(get_current_user)):
    """Initiates Google OAuth flow for installer calendar access."""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Google OAuth não configurado")

    # Store user_id with installer prefix to associate tokens later
    state = f"installer:{current_user.id}"

    auth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={GOOGLE_CLIENT_ID}&"
        f"redirect_uri={GOOGLE_INSTALLER_REDIRECT_URI}&"
        f"response_type=code&"
        f"scope={'%20'.join(GOOGLE_CALENDAR_SCOPES)}&"
        f"access_type=offline&"
        f"prompt=consent&"
        f"state={state}"
    )

    return {"authorization_url": auth_url}


@router.get("/calendar/installer/auth/google/callback")
async def installer_google_callback(code: str, state: str = None):
    """Handles Google OAuth callback for installers."""
    try:
        # Parse state to get installer user_id
        if not state or not state.startswith("installer:"):
            return RedirectResponse(
                url=f"{FRONTEND_URL}/installer/calendar?google_error=invalid_state"
            )

        user_id = state.replace("installer:", "")

        # Exchange code for tokens
        token_response = requests.post(
            'https://oauth2.googleapis.com/token',
            data={
                'code': code,
                'client_id': GOOGLE_CLIENT_ID,
                'client_secret': GOOGLE_CLIENT_SECRET,
                'redirect_uri': GOOGLE_INSTALLER_REDIRECT_URI,
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

        # Store Google token in installers table
        token_data = {
            "access_token": tokens.get('access_token'),
            "refresh_token": tokens.get('refresh_token'),
            "expires_in": tokens.get('expires_in'),
            "token_type": tokens.get('token_type'),
            "scope": tokens.get('scope'),
            "google_email": google_email,
            "obtained_at": datetime.now(timezone.utc).isoformat()
        }

        client = get_client()
        client.table("installers").update({
            "google_token": token_data
        }).eq("user_id", user_id).execute()

        logger.info(f"Installer {user_id} connected Google Calendar with email {google_email}")

        # Redirect back to installer calendar page with success
        return RedirectResponse(
            url=f"{FRONTEND_URL}/installer/calendar?google_connected=true"
        )

    except Exception as e:
        logger.error(f"Installer Google callback error: {str(e)}")
        return RedirectResponse(
            url=f"{FRONTEND_URL}/installer/calendar?google_error=auth_failed"
        )


@router.get("/calendar/installer/status")
async def installer_calendar_status(current_user: User = Depends(get_current_user)):
    """Check if installer has connected Google Calendar."""
    client = get_client()
    result = client.table("installers").select("google_token").eq("user_id", current_user.id).execute()

    has_google = False
    google_email = None

    if result.data and len(result.data) > 0:
        installer = result.data[0]
        google_token = installer.get('google_token')
        if google_token and isinstance(google_token, dict):
            if google_token.get('access_token'):
                has_google = True
                google_email = google_token.get('google_email')

    return {
        "connected": has_google,
        "google_email": google_email
    }


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


# ============ HELPER FUNCTIONS FOR INSTALLER CALENDAR SYNC ============

async def get_installer_google_credentials(user_id: str):
    """Get and refresh Google credentials for an installer."""
    client = get_client()
    result = client.table("installers").select("google_token").eq("user_id", user_id).execute()

    if not result.data or len(result.data) == 0:
        return None

    installer = result.data[0]
    tokens = installer.get('google_token')

    if not tokens or not isinstance(tokens, dict):
        return None

    if not tokens.get('access_token'):
        return None

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
            tokens['access_token'] = creds.token
            tokens['obtained_at'] = datetime.now(timezone.utc).isoformat()
            client.table("installers").update({
                "google_token": tokens
            }).eq("user_id", user_id).execute()
        except Exception as e:
            logger.error(f"Failed to refresh installer Google token for {user_id}: {str(e)}")
            return None

    return creds


async def sync_job_to_installer_calendar(job_id: str, current_user = None):
    """Sync a job to assigned installers' Google Calendars (standalone function, also exposed as endpoint)."""
    # If called without current_user (background task), skip permission checks
    # If called with current_user (endpoint), permission is already enforced by the endpoint
    try:
        client = get_client()

        # Fetch job from Supabase
        job_result = client.table("jobs").select("*").eq("id", job_id).execute()

        if not job_result.data or len(job_result.data) == 0:
            raise HTTPException(status_code=404, detail="Job não encontrado")

        job = job_result.data[0]
        assigned_installers = job.get("assigned_installers", [])

        if not assigned_installers:
            return {
                "message": "Nenhum instalador atribuído para sincronizar",
                "synced": 0
            }

        synced_count = 0
        errors = []

        # Get job details for calendar event
        job_title = job.get("title", "Job")
        job_code = job.get("holdprint_data", {}).get("code", job_id[:8])
        client_name = job.get("client_name", "Cliente")
        branch = job.get("branch", "")
        scheduled_date = job.get("scheduled_date")
        scheduled_time_end = job.get("scheduled_time_end")

        if not scheduled_date:
            return {
                "message": "Job não possui data agendada para sincronizar",
                "synced": 0
            }

        # Parse dates
        try:
            if isinstance(scheduled_date, str):
                start_dt = datetime.fromisoformat(scheduled_date.replace('Z', '+00:00'))
            else:
                start_dt = scheduled_date

            if scheduled_time_end:
                if isinstance(scheduled_time_end, str):
                    end_dt = datetime.fromisoformat(scheduled_time_end.replace('Z', '+00:00'))
                else:
                    end_dt = scheduled_time_end
            else:
                # Default to 2 hours duration if not specified
                end_dt = start_dt + timedelta(hours=2)
        except (ValueError, TypeError) as e:
            logger.error(f"Date parsing error: {str(e)}")
            return {
                "message": "Erro ao processar datas do job",
                "synced": 0
            }

        # For each assigned installer, sync to their Google Calendar
        for installer_id in assigned_installers:
            try:
                # Get installer details
                installer_result = client.table("installers").select("user_id, full_name, google_token").eq("id", installer_id).execute()

                if not installer_result.data:
                    # Try by user_id
                    installer_result = client.table("installers").select("user_id, full_name, google_token").eq("user_id", installer_id).execute()

                if not installer_result.data:
                    logger.warning(f"Installer {installer_id} not found")
                    continue

                installer = installer_result.data[0]
                installer_user_id = installer.get("user_id")
                installer_name = installer.get("full_name", "Instalador")
                google_token = installer.get("google_token")

                # Check if installer has Google Calendar connected
                if not google_token or not isinstance(google_token, dict) or not google_token.get("access_token"):
                    logger.info(f"Installer {installer_id} does not have Google Calendar connected")
                    continue

                # Get credentials for this installer
                installer_creds = await get_installer_google_credentials(installer_user_id)

                if not installer_creds:
                    logger.warning(f"Could not get credentials for installer {installer_user_id}")
                    continue

                # Create calendar event
                try:
                    service = build('calendar', 'v3', credentials=installer_creds)

                    event_body = {
                        'summary': f'Job #{job_code} - {client_name}',
                        'description': f'Filial: {branch}\nCliente: {client_name}\nTítulo: {job_title}',
                        'start': {
                            'dateTime': start_dt.isoformat(),
                            'timeZone': 'America/Sao_Paulo'
                        },
                        'end': {
                            'dateTime': end_dt.isoformat(),
                            'timeZone': 'America/Sao_Paulo'
                        }
                    }

                    event = service.events().insert(
                        calendarId='primary',
                        body=event_body,
                        sendUpdates='none'
                    ).execute()

                    google_event_id = event.get('id')
                    logger.info(f"Created calendar event {google_event_id} for installer {installer_user_id}")
                    synced_count += 1

                except Exception as e:
                    error_msg = f"Failed to create calendar event for installer {installer_id}: {str(e)}"
                    logger.error(error_msg)
                    errors.append(error_msg)

            except Exception as e:
                error_msg = f"Error processing installer {installer_id}: {str(e)}"
                logger.error(error_msg)
                errors.append(error_msg)

        return {
            "message": f"Sincronização concluída",
            "synced": synced_count,
            "total_assigned": len(assigned_installers),
            "errors": errors if errors else None
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"sync_job_to_installer_calendar error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erro ao sincronizar com Google Calendar: {str(e)}")


@router.post("/calendar/sync-installer/{job_id}")
async def sync_job_to_installer_calendar_endpoint(job_id: str, current_user: User = Depends(get_current_user)):
    """Endpoint wrapper for syncing a job to assigned installers' Google Calendars."""
    return await sync_job_to_installer_calendar(job_id, current_user)
