"""
Job Photos routes
Upload, listar e deletar fotos de um job (nível de job, não de item-checkin).
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel
import logging
import uuid

from db_supabase import db, upload_photo_to_storage
from security import get_current_user, require_role
from models.user import User, UserRole
from services.image import compress_base64_image

router = APIRouter()
logger = logging.getLogger(__name__)


class JobPhotoUpload(BaseModel):
    photo_base64: str
    caption: Optional[str] = None
    exif_lat: Optional[float] = None
    exif_long: Optional[float] = None
    exif_datetime: Optional[str] = None
    exif_device: Optional[str] = None
    file_name: Optional[str] = None
    file_size_bytes: Optional[int] = None


@router.get("/jobs/{job_id}/photos")
def list_job_photos(
    job_id: str,
    current_user: User = Depends(get_current_user)
):
    photos = db.job_photos.find({"job_id": job_id})
    return photos


@router.post("/jobs/{job_id}/photos")
def upload_job_photo(
    job_id: str,
    payload: JobPhotoUpload,
    current_user: User = Depends(get_current_user)
):
    job = db.jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")

    compressed = compress_base64_image(payload.photo_base64, max_size_kb=300, max_dimension=1200)

    photo_id = str(uuid.uuid4())
    file_path = f"job-photos/{job_id}/{photo_id}.jpg"
    photo_url = upload_photo_to_storage(compressed, file_path)

    exif_dt = None
    if payload.exif_datetime:
        try:
            exif_dt = datetime.fromisoformat(payload.exif_datetime.replace("Z", "+00:00")).isoformat()
        except Exception:
            exif_dt = None

    doc = {
        "id": photo_id,
        "job_id": job_id,
        "uploaded_by": str(current_user.id),
        "uploaded_by_name": getattr(current_user, "full_name", None) or getattr(current_user, "name", None) or current_user.email,
        "photo_url": photo_url,
        "photo_base64": None if photo_url else compressed,
        "caption": payload.caption,
        "exif_lat": payload.exif_lat,
        "exif_long": payload.exif_long,
        "exif_datetime": exif_dt,
        "exif_device": payload.exif_device,
        "file_name": payload.file_name,
        "file_size_bytes": payload.file_size_bytes,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    db.job_photos.insert_one(doc)
    return doc


@router.delete("/jobs/{job_id}/photos/{photo_id}")
def delete_job_photo(
    job_id: str,
    photo_id: str,
    current_user: User = Depends(get_current_user)
):
    require_role(current_user, [UserRole.ADMIN, UserRole.MANAGER])
    photo = db.job_photos.find_one({"id": photo_id, "job_id": job_id})
    if not photo:
        raise HTTPException(status_code=404, detail="Foto não encontrada")
    db.job_photos.delete_one({"id": photo_id})
    return {"success": True}
