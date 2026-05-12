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


def send_vendedor_report_email(
    to_email: str,
    vendedor_name: str,
    visita: dict,
) -> bool:
    """Envia resumo da visita técnica ao vendedor via Resend."""
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY não configurado — email não enviado")
        return False

    resend.api_key = RESEND_API_KEY

    client_name = visita.get("client_name", "—")
    client_address = visita.get("client_address", "—")
    branch = visita.get("branch", "—")
    tipos = ", ".join(visita.get("tipos_servico") or []) or "—"
    scheduled = _format_brt(visita.get("scheduled_date")) or "A definir"
    visita_id = visita.get("id", "")
    link = f"https://instal-visual.com.br/visitas-tecnicas/{visita_id}" if visita_id else "https://instal-visual.com.br"

    html = f"""
    <div style="font-family:sans-serif;max-width:560px;margin:auto;background:#1a1a2e;color:#e0e0e0;border-radius:8px;overflow:hidden">
      <div style="background:#e94560;padding:20px 24px">
        <h2 style="color:#fff;margin:0;font-size:18px">📋 Nova Visita Técnica</h2>
        <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:13px">Relatório de pré-visita</p>
      </div>
      <div style="padding:24px">
        <p>Olá, <strong>{vendedor_name}</strong>!</p>
        <p>Uma visita técnica foi criada para o seu cliente. Aqui está o resumo:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr style="border-bottom:1px solid rgba(255,255,255,0.08)">
            <td style="padding:8px 4px;color:#aaa;width:140px">Cliente</td>
            <td style="padding:8px 4px"><strong>{client_name}</strong></td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.08)">
            <td style="padding:8px 4px;color:#aaa">Endereço</td>
            <td style="padding:8px 4px">{client_address}</td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.08)">
            <td style="padding:8px 4px;color:#aaa">Filial</td>
            <td style="padding:8px 4px">{branch}</td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.08)">
            <td style="padding:8px 4px;color:#aaa">Tipos de serviço</td>
            <td style="padding:8px 4px">{tipos}</td>
          </tr>
          <tr>
            <td style="padding:8px 4px;color:#aaa">Data agendada</td>
            <td style="padding:8px 4px;color:#e94560"><strong>{scheduled}</strong></td>
          </tr>
        </table>
        <a href="{link}" style="display:inline-block;background:#e94560;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;margin-top:8px">
          Ver detalhes da visita
        </a>
        <p style="font-size:11px;color:#666;margin-top:24px">Indústria Visual — instal-visual.com.br</p>
      </div>
    </div>
    """

    try:
        resend.Emails.send({
            "from": RESEND_FROM_EMAIL,
            "to": [to_email],
            "subject": f"Nova Visita Técnica — {client_name}",
            "html": html,
        })
        logger.info(f"Email de VT enviado ao vendedor {to_email}")
        return True
    except Exception as e:
        logger.error(f"Erro ao enviar email ao vendedor {to_email}: {e}")
        return False


def send_installer_invite_email(
    to_email: str,
    installer_name: str,
    visita: dict,
) -> bool:
    """Envia convite de visita técnica ao instalador via Resend."""
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY não configurado — email não enviado")
        return False

    resend.api_key = RESEND_API_KEY

    client_name = visita.get("client_name", "—")
    client_address = visita.get("client_address", "—")
    tipos = ", ".join(visita.get("tipos_servico") or []) or "—"
    scheduled = _format_brt(visita.get("scheduled_date")) or "A definir"
    obs = visita.get("observacoes_admin") or ""
    visita_id = visita.get("id", "")
    link = f"https://instal-visual.com.br/visita/{visita_id}" if visita_id else "https://instal-visual.com.br"

    obs_block = f"""
    <tr style="border-bottom:1px solid rgba(255,255,255,0.08)">
      <td style="padding:8px 4px;color:#aaa">Observações</td>
      <td style="padding:8px 4px">{obs}</td>
    </tr>""" if obs else ""

    html = f"""
    <div style="font-family:sans-serif;max-width:560px;margin:auto;background:#1a1a2e;color:#e0e0e0;border-radius:8px;overflow:hidden">
      <div style="background:#2563eb;padding:20px 24px">
        <h2 style="color:#fff;margin:0;font-size:18px">📍 Convite — Visita Técnica</h2>
        <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:13px">Você foi selecionado para esta visita</p>
      </div>
      <div style="padding:24px">
        <p>Olá, <strong>{installer_name}</strong>!</p>
        <p>Você foi selecionado para realizar uma visita técnica. Confirme sua participação no portal:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr style="border-bottom:1px solid rgba(255,255,255,0.08)">
            <td style="padding:8px 4px;color:#aaa;width:140px">Cliente</td>
            <td style="padding:8px 4px"><strong>{client_name}</strong></td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.08)">
            <td style="padding:8px 4px;color:#aaa">Local</td>
            <td style="padding:8px 4px">{client_address}</td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.08)">
            <td style="padding:8px 4px;color:#aaa">Serviços</td>
            <td style="padding:8px 4px">{tipos}</td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.08)">
            <td style="padding:8px 4px;color:#aaa">Data prevista</td>
            <td style="padding:8px 4px;color:#60a5fa"><strong>{scheduled}</strong></td>
          </tr>
          {obs_block}
        </table>
        <a href="{link}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;margin-top:8px">
          Ver visita e confirmar
        </a>
        <p style="font-size:11px;color:#666;margin-top:24px">Indústria Visual — instal-visual.com.br</p>
      </div>
    </div>
    """

    try:
        resend.Emails.send({
            "from": RESEND_FROM_EMAIL,
            "to": [to_email],
            "subject": f"Convite — Visita Técnica em {client_name}",
            "html": html,
        })
        logger.info(f"Email de convite enviado ao instalador {to_email}")
        return True
    except Exception as e:
        logger.error(f"Erro ao enviar email ao instalador {to_email}: {e}")
        return False


def send_visita_notificacao_geral(visita: dict) -> int:
    """Notifica todos os managers (vendedores) e instaladores sobre nova visita técnica.

    Envia o template completo com todos os campos preenchidos.
    Retorna o número de emails enviados com sucesso.
    """
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY não configurado — emails não enviados")
        return 0

    from db_supabase import db  # import local para evitar circular import
    resend.api_key = RESEND_API_KEY

    all_users = db.users.find({"is_active": True}) or []
    recipients = [u for u in all_users if u.get("role") in ("manager", "installer")]
    if not recipients:
        logger.warning("Nenhum destinatário ativo para notificação de VT")
        return 0

    # ── Campos do template ──────────────────────────────────────────────────
    client_name  = visita.get("client_name", "—")
    address      = visita.get("client_address", "—")
    branch       = visita.get("branch", "—")
    tipos        = ", ".join(visita.get("tipos_servico") or []) or "—"
    ferramentas  = ", ".join(visita.get("ferramentas") or []) or "—"
    scheduled    = _format_brt(visita.get("scheduled_date")) or "A definir"
    sched_end    = _format_brt(visita.get("scheduled_time_end")) or "—"
    vendedor     = visita.get("vendedor_nome") or "—"
    instalador   = visita.get("installer_nome") or "—"
    nivel_map    = {"1": "🟢 Simples", "2": "🟡 Moderado", "3": "🟠 Complexo", "4": "🔴 Crítico"}
    nivel        = nivel_map.get(str(visita.get("nivel_dificuldade") or ""), "—")
    altura_val   = visita.get("altura_estimada_m")
    altura       = f"{altura_val} m" if altura_val is not None else "—"
    km_ida       = visita.get("km_ida") or 0
    km_volta     = visita.get("km_volta") or 0
    valor_km     = visita.get("valor_por_km") or 1.50
    total_km     = (float(km_ida) + float(km_volta)) * float(valor_km)
    aprovacao    = visita.get("aprovacao_status") or "PENDENTE"
    obs          = visita.get("observacoes_admin") or "—"
    visita_id    = visita.get("id", "")
    numero_vt    = visita.get("numero_vt") or visita_id[:8].upper()
    link         = (f"https://instal-visual.com.br/visitas-tecnicas/{visita_id}"
                    if visita_id else "https://instal-visual.com.br")
    tipo_sup     = ", ".join(visita.get("tipo_superficie") or []) or "—"
    forma_inst   = ", ".join(visita.get("forma_instalacao") or []) or "—"

    def _bool(val):
        if val is None:
            return "—"
        return "✅ Sim" if val else "❌ Não"

    def _row(label, value, accent=False):
        color = "#e94560" if accent else "#e0e0e0"
        return (
            f'<tr style="border-bottom:1px solid rgba(255,255,255,0.05)">'
            f'<td style="padding:7px 4px;color:#888;font-size:12px;width:175px">{label}</td>'
            f'<td style="padding:7px 4px;color:{color};font-size:13px"><strong>{value}</strong></td>'
            f"</tr>"
        )

    def _section(icon, title):
        return (
            f'<tr><td colspan="2" style="padding:14px 4px 4px;font-size:10px;font-weight:700;'
            f'color:#e94560;letter-spacing:.1em;text-transform:uppercase">{icon}&nbsp;{title}</td></tr>'
        )

    rows = "".join([
        _section("🏷️", "Identificação"),
        _row("Cliente",     client_name),
        _row("Endereço",    address),
        _row("Filial",      branch),
        _row("Vendedor",    vendedor),
        _row("Instalador",  instalador),
        _section("📅", "Agendamento"),
        _row("Data agendada",       scheduled,  accent=True),
        _row("Previsão de término", sched_end),
        _section("🔧", "Serviços"),
        _row("Tipos de serviço", tipos),
        _row("Ferramentas",      ferramentas),
        _section("⚠️", "Avaliação Técnica"),
        _row("Nível de dificuldade",   nivel),
        _row("Altura estimada",        altura),
        _row("Remoção prevista na OS", _bool(visita.get("remocao_prevista_os"))),
        _row("Remoção a realizar",     _bool(visita.get("remocao_a_realizar"))),
        _row("Tipo de superfície",     tipo_sup),
        _row("Forma de instalação",    forma_inst),
        _row("Estacionamento",         _bool(visita.get("tem_estacionamento"))),
        _row("Ponto de energia",       _bool(visita.get("tem_ponto_energia"))),
        _row("EPI para altura",        _bool(visita.get("epi_altura"))),
        _section("🚗", "Deslocamento"),
        _row("KM Ida",         f"{km_ida} km"),
        _row("KM Volta",       f"{km_volta} km"),
        _row("Total a pagar",  f"R$ {total_km:.2f}", accent=True),
        _section("✅", "Resultado"),
        _row("Status de aprovação", aprovacao),
        _row("Observações",         obs),
    ])

    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;
                margin:auto;background:#13131f;color:#e0e0e0;border-radius:10px;overflow:hidden;
                border:1px solid rgba(255,255,255,0.07)">
      <div style="background:linear-gradient(135deg,#e94560 0%,#b52d47 100%);padding:24px 28px">
        <p style="margin:0 0 2px;font-size:11px;font-weight:700;letter-spacing:.12em;
                  color:rgba(255,255,255,0.6);text-transform:uppercase">Indústria Visual</p>
        <h2 style="color:#fff;margin:0;font-size:22px;font-weight:700">📋 Nova Visita Técnica</h2>
        <p style="color:rgba(255,255,255,0.75);margin:6px 0 0;font-size:13px">
          VT&nbsp;#{numero_vt} &middot; {branch}
        </p>
      </div>
      <div style="padding:24px 28px">
        <table style="width:100%;border-collapse:collapse">{rows}</table>
        <div style="margin-top:28px;text-align:center">
          <a href="{link}"
             style="display:inline-block;background:#e94560;color:#fff;padding:12px 32px;
                    border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">
            Ver Visita Técnica →
          </a>
        </div>
        <p style="font-size:11px;color:#444;margin-top:28px;text-align:center">
          Indústria Visual &middot; instal-visual.com.br
        </p>
      </div>
    </div>
    """

    subject = f"Nova Visita Técnica — {client_name} ({branch})"
    sent = 0
    for user in recipients:
        email_addr = user.get("email")
        if not email_addr:
            continue
        try:
            resend.Emails.send({
                "from": RESEND_FROM_EMAIL,
                "to": [email_addr],
                "subject": subject,
                "html": html,
            })
            logger.info("Notificação VT → %s (%s)", email_addr, user.get("role"))
            sent += 1
        except Exception as exc:
            logger.error("Erro ao notificar %s: %s", email_addr, exc)

    logger.info("Nova VT %s: %d/%d notificações enviadas", visita_id, sent, len(recipients))
    return sent


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
