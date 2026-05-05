import logging
import resend
from datetime import datetime
from config import RESEND_API_KEY, RESEND_FROM_EMAIL

logger = logging.getLogger(__name__)


def _format_brt(dt_val) -> str:
    """Converte datetime (UTC) para string BRT legível."""
    if not dt_val:
        return ""
    if isinstance(dt_val, str):
        try:
            dt_val = datetime.fromisoformat(dt_val.replace("Z", "+00:00"))
        except ValueError:
            return dt_val
    from zoneinfo import ZoneInfo
    brt = dt_val.astimezone(ZoneInfo("America/Sao_Paulo"))
    return brt.strftime("%d/%m/%Y às %H:%M")


def send_reschedule_email(
    to_email: str,
    installer_name: str,
    job_title: str,
    job_client: str,
    old_date,
    new_date,
) -> bool:
    """Envia email de reagendamento via Resend. Retorna True se enviado."""
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY não configurado — email não enviado")
        return False

    resend.api_key = RESEND_API_KEY

    old_str = _format_brt(old_date) if old_date else "não definida"
    new_str = _format_brt(new_date)

    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#1a1a2e;color:#e0e0e0;border-radius:8px;padding:24px">
      <h2 style="color:#e91e8c;margin-top:0">📅 Job Reagendado</h2>
      <p>Olá, <strong>{installer_name}</strong>!</p>
      <p>O seguinte job foi reagendado:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:6px 0;color:#aaa">Job</td><td><strong>{job_title}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#aaa">Cliente</td><td>{job_client}</td></tr>
        <tr><td style="padding:6px 0;color:#aaa">Data anterior</td><td><s>{old_str}</s></td></tr>
        <tr><td style="padding:6px 0;color:#aaa">Nova data</td><td style="color:#e91e8c"><strong>{new_str}</strong></td></tr>
      </table>
      <p style="font-size:12px;color:#666">Indústria Visual — instal-visual.com.br</p>
    </div>
    """

    try:
        resend.Emails.send({
            "from": RESEND_FROM_EMAIL,
            "to": [to_email],
            "subject": f"Job Reagendado: {job_title}",
            "html": html,
        })
        logger.info(f"Email de reagendamento enviado para {to_email}")
        return True
    except Exception as e:
        logger.error(f"Erro ao enviar email de reagendamento para {to_email}: {e}")
        return False
