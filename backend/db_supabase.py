"""
Supabase Database Module - Native Implementation
Industria Visual PWA

This module provides direct Supabase access with a simplified interface.
All JSONB columns are handled natively — no json.dumps on write, no json.loads on read.
"""

import os
import json
import logging
from typing import Any, Dict, List, Optional, Union
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from supabase import create_client, Client

logger = logging.getLogger(__name__)

# Configuration — env-driven only. instal-visual.com.br usa qfsxtwkltfraounsjjah;
# o projeto otyrrvkixegiqsthmaaj é do somos-industriavisual.com.br (banco separado).
SUPABASE_URL = (os.environ.get('SUPABASE_URL') or '').strip()
SUPABASE_KEY = (os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_ANON_KEY') or '').strip()

# Global client
_client: Optional[Client] = None


def get_client() -> Client:
    """Get or create Supabase client"""
    global _client
    if _client is None:
        if not SUPABASE_URL:
            raise RuntimeError(
                "SUPABASE_URL não definida. Configure a env var no Vercel ou no .env local. "
                "Em produção deve ser https://qfsxtwkltfraounsjjah.supabase.co (instal-visual.com.br)."
            )
        if not SUPABASE_KEY:
            raise RuntimeError(
                "SUPABASE_SERVICE_KEY (ou SUPABASE_ANON_KEY como fallback) não definida."
            )
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info(f"Supabase connected: {SUPABASE_URL}")
    return _client


# JSONB columns — supabase-py handles these natively as Python list/dict.
# No json.dumps on write, no json.loads on read.
JSONB_FIELDS = frozenset([
    'items', 'holdprint_data', 'products_with_area', 'item_assignments',
    'archived_items', 'products_installed', 'breakdown', 'keys',
    'assigned_installers', 'checklists', 'scopes', 'token', 'google_token',
    'justification', 'installation_config', 'subscription', 'keywords',
    'planejado_snapshot'
])

# Registry of actual Supabase table columns (from 001_schema_completo.sql)
TABLE_COLUMNS = {
    "users": frozenset([
        "id", "email", "name", "full_name", "password_hash", "role", "phone",
        "branch", "is_active", "created_at"
    ]),
    "installers": frozenset([
        "id", "user_id", "full_name", "phone", "branch", "is_active", "avatar_url",
        "coins", "level", "total_area_installed", "total_jobs", "google_token", "google_calendar_id", "created_at"
    ]),
    "jobs": frozenset([
        "id", "holdprint_job_id", "title", "client_name", "client_address", "status",
        "branch", "area_m2", "assigned_installers", "scheduled_date", "scheduled_time_end", "items",
        "holdprint_data", "products_with_area", "total_products", "total_quantity",
        "item_assignments", "archived_items", "archived", "archived_at", "archived_by",
        "archived_by_name", "exclude_from_metrics", "no_installation", "notes",
        "cancelled_at", "justification", "justified_at", "installation_config",
        "completed_at", "finalized_at", "created_at",
        "reschedule_history",
        "deleted", "deleted_at", "deleted_by", "deleted_by_name"
    ]),
    "checkins": frozenset([
        "id", "job_id", "installer_id", "status", "checkin_at", "checkout_at",
        "duration_minutes", "checkin_photo", "checkout_photo",
        "checkin_photo_url", "checkout_photo_url",
        "gps_lat", "gps_long", "checkout_gps_lat", "checkout_gps_long",
        "notes", "created_at", "is_archived"
    ]),
    "item_checkins": frozenset([
        "id", "job_id", "installer_id", "item_index", "status", "checkin_at",
        "checkout_at", "duration_minutes", "net_duration_minutes", "total_pause_minutes",
        "checkin_photo", "checkout_photo", "checkin_photo_url", "checkout_photo_url",
        "gps_lat", "gps_long", "gps_accuracy",
        "checkout_gps_lat", "checkout_gps_long", "checkout_gps_accuracy", "product_name",
        "family_name", "installed_m2", "complexity_level", "height_category",
        "scenario_category", "notes", "productivity_m2_h", "is_archived",
        "products_installed", "is_late", "created_at",
        "exif_lat", "exif_long", "exif_datetime", "exif_device", "exif_address", "exif_offset",
        "checkout_exif_lat", "checkout_exif_long", "checkout_exif_datetime", "checkout_exif_device",
        "checkout_exif_address", "checkout_exif_offset",
        "exif_checkin_at", "exif_checkout_at", "exif_duration_minutes", "photos_count",
        "fotos_inicio", "fotos_conclusao"
    ]),
    "item_pause_logs": frozenset([
        "id", "checkin_id", "job_id", "item_index", "installer_id",
        "reason", "paused_at", "resumed_at", "duration_minutes",
        "auto_generated", "created_at"
    ]),
    "installed_products": frozenset([
        "id", "checkin_id", "job_id", "installer_id", "family_id", "family_name",
        "product_name", "quantity", "width_m", "height_m", "area_m2",
        "complexity_level", "height_category", "scenario_category", "duration_minutes",
        "productivity_m2_h", "created_at"
    ]),
    "product_families": frozenset(["id", "name", "keywords", "created_at"]),
    "productivity_history": frozenset([
        "id", "family_id", "family_name", "installer_id", "date", "total_m2",
        "total_minutes", "items_count", "productivity_m2_h", "created_at"
    ]),
    # [GAMIFICATION REMOVIDA 2026-06-11] tabelas gamification_balances/coin_transactions/
    # rewards/reward_requests continuam no banco (dados históricos) mas sem uso no código.
    "location_alerts": frozenset([
        "id", "item_checkin_id", "job_id", "installer_id", "event_type", "checkin_lat",
        "checkin_long", "checkout_lat", "checkout_long", "distance_meters",
        "max_allowed_meters", "action_taken", "created_at"
    ]),
    "job_photos": frozenset([
        "id", "job_id", "uploaded_by", "uploaded_by_name", "photo_url", "photo_base64",
        "caption", "exif_lat", "exif_long", "exif_datetime", "exif_device",
        "file_name", "file_size_bytes", "created_at"
    ]),
    "item_checkin_photos": frozenset([
        "id", "checkin_id", "job_id", "installer_id", "tipo",
        "photo_url", "photo_base64",
        "exif_lat", "exif_long", "exif_datetime", "exif_device",
        "file_name", "file_size_bytes", "ordem", "created_at",
    ]),
    "password_resets": frozenset(["id", "user_id", "token", "expires_at", "created_at"]),
    "login_attempts": frozenset(["id", "identifier", "created_at"]),
    "google_tokens": frozenset(["id", "user_id", "token", "created_at", "updated_at"]),
    "job_justifications": frozenset([
        "id", "job_id", "job_title", "job_code", "type", "type_label", "reason",
        "submitted_by", "submitted_by_name", "submitted_by_email", "created_at"
    ]),
    "push_subscriptions": frozenset([
        "id", "user_id", "subscription", "is_active", "endpoint", "keys",
        "subscribed_at", "created_at"
    ]),
    "system_config": frozenset([
        "id", "key", "value", "total_imported", "total_skipped",
        "total_errors", "status", "sync_type", "updated_at"
    ]),
    "scheduler_sync_status": frozenset([
        "id", "sync_type", "last_sync_at", "total_imported", "total_skipped",
        "total_errors", "updated_at"
    ]),
    "vendedores": frozenset([
        "id", "nome", "is_active", "created_at", "created_by"
    ]),
    "tipos_servico": frozenset([
        "id", "nome", "is_active", "created_at", "created_by"
    ]),
    "ferramentas_vt": frozenset([
        "id", "nome", "is_active", "created_at", "created_by"
    ]),
    "visitas_tecnicas": frozenset([
        # ── Identificação e dados básicos ──────────────────────────────────
        "id", "numero_vt", "titulo", "client_name", "client_address", "branch",
        "installer_id", "scheduled_date", "scheduled_time_end",
        # ── Cobrança (valor_total é GENERATED ALWAYS — omitir de writes) ──
        "valor_por_km", "km_ida", "km_volta",
        # ── Estado operacional ─────────────────────────────────────────────
        "status", "observacoes_admin",
        # ── Relatório final ────────────────────────────────────────────────
        "relatorio_descricao", "relatorio_situacao", "relatorio_fotos",
        "relatorio_assinatura_confirmada", "relatorio_chegada", "relatorio_saida",
        "relatorio_enviado_em",
        # ── Auditoria ──────────────────────────────────────────────────────
        "created_by", "created_at", "updated_at",
        # ── Expansão (migration 013 + 028) ─────────────────────────────────
        "job_id", "vendedor_nome", "vendedor_email", "tipos_servico", "ferramentas",
        "remocao_prevista_os", "remocao_a_realizar", "altura_estimada_m",
        "nivel_dificuldade", "aprovacao_status",
        # ── Confirmação pelo instalador (migration 016) ─────────────────────
        "confirmado_em", "confirmado_por", "planejado_snapshot",
        "rejeitado_em", "rejeitado_motivo", "observacoes_instalador",
        # ── Checklist de vistoria (migration 018) ─────────────────────────
        "tem_estacionamento", "restricao_horario_inicio", "restricao_horario_fim",
        "tipo_superficie", "tipo_superficie_outro", "condicao_superficie",
        "material_remocao", "tem_ponto_energia", "medida_largura_m",
        "medida_altura_m", "forma_instalacao", "epi_altura",
        "escada_tamanho", "andaime_torres",
        # ── Instalador externo / Visual Connect (migration 029) ───────────
        "installer_nome", "installer_email",
    ]),
}

# Keep backward-compatible name for any external references
JSON_TEXT_FIELDS = JSONB_FIELDS


def _filter_columns(table_name: str, data: dict) -> dict:
    """Filter dict to only include columns that exist in the actual Supabase table."""
    allowed = TABLE_COLUMNS.get(table_name)
    if not allowed:
        return data
    rejected = set(data.keys()) - allowed
    if rejected:
        logger.error(f"_filter_columns: dropping unknown fields from '{table_name}': {sorted(rejected)}")
    return {k: v for k, v in data.items() if k in allowed}


def _serialize(value: Any) -> Any:
    """Serialize value for Supabase. Datetimes become ISO strings. Everything else passes through."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _deserialize(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Handle legacy data: if a JSONB field came back as string, parse it."""
    if not doc:
        return doc
    for field in JSONB_FIELDS:
        val = doc.get(field)
        if isinstance(val, str):
            try:
                doc[field] = json.loads(val)
            except (json.JSONDecodeError, TypeError):
                pass
    return doc


def _apply_filter(builder, key: str, value: Any):
    """Apply a single filter condition to a query builder."""
    if isinstance(value, dict):
        for op, op_val in value.items():
            if op == '$in':
                builder = builder.in_(key, op_val)
            elif op == '$gt':
                builder = builder.gt(key, op_val)
            elif op == '$gte':
                builder = builder.gte(key, op_val)
            elif op == '$lt':
                builder = builder.lt(key, op_val)
            elif op == '$lte':
                builder = builder.lte(key, op_val)
            elif op == '$ne':
                if op_val is None:
                    builder = builder.not_.is_(key, 'null')
                elif isinstance(op_val, bool):
                    # Semântica Mongo: $ne inclui linhas com campo NULL.
                    # neq SQL exclui NULL (NULL <> true → NULL → linha some).
                    # IS NOT TRUE/FALSE inclui NULL e o booleano oposto.
                    builder = builder.not_.is_(key, 'true' if op_val else 'false')
                else:
                    builder = builder.neq(key, op_val)
            elif op == '$exists':
                if op_val:
                    builder = builder.not_.is_(key, 'null')
                else:
                    builder = builder.is_(key, 'null')
            elif op == '$regex':
                builder = builder.ilike(key, f'%{op_val}%')
            elif op == '$contains':
                builder = builder.contains(key, op_val)
    elif value is not None:
        if key in JSONB_FIELDS and isinstance(value, str):
            # "Find rows where this JSONB array contains this string"
            builder = builder.contains(key, [value])
        else:
            builder = builder.eq(key, value)
    return builder


def _build_or_filter(or_conditions: list) -> str:
    """Build a PostgREST OR filter string from $or conditions.

    Each condition is a dict like {"field": "value"} or {"field": {"$in": [...]}}.
    Returns a string like: 'field.eq.val1,field.eq.val2'
    """
    parts = []
    for condition in or_conditions:
        for key, val in condition.items():
            if isinstance(val, dict):
                for op, op_val in val.items():
                    if op == '$in':
                        parts.append(f"{key}.in.({','.join(str(v) for v in op_val)})")
                    elif op == '$gte':
                        parts.append(f"{key}.gte.{op_val}")
                    elif op == '$lte':
                        parts.append(f"{key}.lte.{op_val}")
                    elif op == '$ne':
                        if isinstance(op_val, bool):
                            # Inclui NULL (ver _apply_filter): IS NOT TRUE/FALSE
                            parts.append(f"{key}.not.is.{str(op_val).lower()}")
                        else:
                            parts.append(f"{key}.neq.{op_val}")
                    elif op == '$contains':
                        parts.append(f"{key}.cs.{json.dumps(op_val)}")
            elif isinstance(val, list):
                parts.append(f"{key}.cs.{json.dumps(val)}")
            elif key in JSONB_FIELDS and isinstance(val, str):
                # JSONB array contains scalar value
                parts.append(f'{key}.cs.["{val}"]')
            elif val is not None:
                parts.append(f"{key}.eq.{val}")
    return ",".join(parts)


class SupabaseTable:
    """Wrapper for Supabase table operations"""

    def __init__(self, table_name: str):
        self.table_name = table_name
        self._client = get_client()

    def _table(self):
        return self._client.table(self.table_name)

    def _select_columns(self, projection: Dict[str, Any]) -> str:
        """Traduz uma projeção estilo MongoDB para a lista de colunas do PostgREST.

        - Inclusão (`{campo: 1}`): seleciona só os campos pedidos.
        - Exclusão (`{campo: 0}`): o PostgREST não tem exclusão nativa, então
          subtraímos os campos do registro de colunas (`TABLE_COLUMNS`). Sem o
          registro da tabela, não há como excluir com segurança → cai em '*'.
          (Sem isto, uma projeção de exclusão era silenciosamente ignorada e o
          select trazia '*' — inclusive colunas pesadas como fotos base64.)
        - `_id` é sempre ignorado (não existe no Supabase).
        """
        if not projection:
            return '*'
        include = [k for k, v in projection.items() if v and k != '_id']
        if include:
            return ','.join(include)
        exclude = {k for k, v in projection.items() if not v and k != '_id'}
        if exclude:
            allowed = TABLE_COLUMNS.get(self.table_name)
            if allowed:
                cols = [c for c in allowed if c not in exclude]
                if cols:
                    return ','.join(cols)
        return '*'

    # ============ FIND OPERATIONS ============

    def find_one(self, query: Dict[str, Any], projection: Dict[str, Any] = None) -> Optional[Dict]:
        """Find single document"""
        try:
            columns = self._select_columns(projection)

            builder = self._table().select(columns)
            for key, value in query.items():
                builder = _apply_filter(builder, key, value)

            result = builder.limit(1).execute()
            if result.data:
                return _deserialize(result.data[0])
            return None

        except Exception as e:
            # Resultados vazios legítimos retornam data=[] (não lançam exceção).
            # Qualquer exceção aqui é erro real (query/RLS/conexão) e deve ser
            # propagada, em vez de virar um None silencioso que mascara o bug.
            logger.exception("find_one error on %s: %s", self.table_name, e)
            raise

    def find(
        self,
        query: Dict[str, Any] = None,
        projection: Dict[str, Any] = None,
        sort: List[tuple] = None,
        limit: int = None,
        skip: int = None
    ) -> List[Dict]:
        """Find multiple documents"""
        try:
            query = dict(query) if query else {}

            columns = self._select_columns(projection)

            builder = self._table().select(columns)

            # Extract $or before applying standard filters
            or_conditions = query.pop('$or', None)

            # Apply standard filters
            for key, value in query.items():
                builder = _apply_filter(builder, key, value)

            # Handle $or using PostgREST native or filter (single query)
            if or_conditions:
                or_filter = _build_or_filter(or_conditions)
                if or_filter:
                    builder = builder.or_(or_filter)

            # Non-$or path
            if sort:
                for field, direction in sort:
                    builder = builder.order(field, desc=(direction == -1))
            if limit:
                builder = builder.limit(limit)
            if skip:
                builder = builder.offset(skip)

            result = builder.execute()
            return [_deserialize(doc) for doc in (result.data or [])]

        except Exception as e:
            # Resultados vazios legítimos retornam data=[] (não lançam exceção).
            # Qualquer exceção aqui é erro real (query/RLS/conexão) e deve ser
            # propagada para virar um 500 visível, em vez de "[]" que mascara o bug.
            logger.exception("find error on %s: %s", self.table_name, e)
            raise

    # ============ INSERT OPERATIONS ============

    def insert_one(self, document: Dict[str, Any]) -> Dict:
        """Insert single document"""
        try:
            document.pop('_id', None)
            clean_doc = {k: _serialize(v) for k, v in document.items() if v is not None}
            clean_doc = _filter_columns(self.table_name, clean_doc)

            result = self._table().insert(clean_doc).execute()
            return {'inserted_id': result.data[0]['id'] if result.data else None}

        except Exception as e:
            logger.error(f"insert_one error on {self.table_name}: {e}")
            raise

    def insert_many(self, documents: List[Dict[str, Any]]) -> Dict:
        """Insert multiple documents"""
        try:
            clean_docs = []
            for doc in documents:
                doc.pop('_id', None)
                clean = {k: _serialize(v) for k, v in doc.items() if v is not None}
                clean_docs.append(_filter_columns(self.table_name, clean))

            result = self._table().insert(clean_docs).execute()
            return {'inserted_count': len(result.data) if result.data else 0}

        except Exception as e:
            logger.error(f"insert_many error on {self.table_name}: {e}")
            raise

    # ============ UPDATE OPERATIONS ============

    def update_one(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False) -> Dict:
        """Update single document"""
        try:
            # Operadores podem coexistir ($set + $inc + $push); cada um é tratado
            # de forma independente. Antes era if/elif, que descartava silenciosamente
            # o $inc/$push quando vinham junto com $set (landmine corrigida).
            has_set = '$set' in update
            has_inc = '$inc' in update
            has_push = '$push' in update
            is_operator_update = has_set or has_inc or has_push

            # $inc ATÔMICO (M4): incremento feito no banco via RPC, sem race condition.
            inc_aplicado_via_rpc = self._apply_inc_atomico(query, update['$inc']) if has_inc else False

            update_data = {}
            if has_set:
                update_data.update(update['$set'])
            if has_push:
                existing = self.find_one(query)
                if existing:
                    for field, push_val in update['$push'].items():
                        current = existing.get(field, []) or []
                        if isinstance(current, str):
                            try:
                                current = json.loads(current)
                            except (json.JSONDecodeError, TypeError):
                                current = []
                        current.append(push_val)
                        update_data[field] = current
            if has_inc and not inc_aplicado_via_rpc:
                # Fallback não-atômico (RPC indisponível, ex.: migration 039 ainda
                # não aplicada): read-then-write — mantém o deploy não-quebrável.
                existing = self.find_one(query)
                if existing:
                    for field, inc_val in update['$inc'].items():
                        update_data[field] = (existing.get(field, 0) or 0) + inc_val
            if not is_operator_update:
                update_data = update

            clean_update = {k: _serialize(v) for k, v in update_data.items() if v is not None}
            clean_update = _filter_columns(self.table_name, clean_update)

            if not clean_update:
                # Se o $inc já foi aplicado atomicamente via RPC, a operação foi
                # bem-sucedida mesmo sem nenhum outro campo a escrever.
                if has_inc and inc_aplicado_via_rpc:
                    return {'modified_count': 1, 'matched_count': 1}
                return {'modified_count': 0, 'matched_count': 0}

            builder = self._table().update(clean_update)

            for key, value in query.items():
                if not key.startswith('$'):
                    builder = builder.eq(key, value)

            result = builder.execute()

            return {
                'modified_count': len(result.data) if result.data else 0,
                'matched_count': len(result.data) if result.data else 0
            }

        except Exception as e:
            logger.error(f"update_one error on {self.table_name}: {e}")
            raise

    def _apply_inc_atomico(self, query: Dict[str, Any], increments: Dict[str, Any]) -> bool:
        """Aplica $inc de forma ATÔMICA via RPC Postgres (M4 — sem race condition).

        Requer query por 'id' (caso de uso atual). Retorna True se aplicado via RPC;
        False se a RPC não estiver disponível (o caller faz fallback read-then-write).
        """
        record_id = query.get('id')
        if record_id is None:
            logger.warning("$inc sem 'id' em %s — usando fallback nao-atomico", self.table_name)
            return False
        try:
            for field, delta in increments.items():
                self._client.rpc('increment_field', {
                    'p_table': self.table_name,
                    'p_id': str(record_id),
                    'p_field': field,
                    'p_delta': delta,
                }).execute()
            return True
        except Exception as e:
            logger.warning("RPC increment_field indisponivel em %s (%s) — fallback nao-atomico", self.table_name, e)
            return False

    def update_many(self, query: Dict[str, Any], update: Dict[str, Any]) -> Dict:
        """Update TODOS os documentos que casam com o filtro.

        - $set / update direto: um único UPDATE set-based com o filtro (atinge todas
          as linhas que casam de uma vez), com suporte a operadores via _apply_filter.
        - $inc / $push: o novo valor depende do registro atual, então a semântica é
          por-linha — itera sobre cada registro casado aplicando update_one por id
          (garante incremento/append corretos em múltiplas linhas).
        """
        try:
            has_inc = '$inc' in update
            has_push = '$push' in update

            if has_inc or has_push:
                matched = self.find(query)
                modified = 0
                for doc in matched:
                    doc_id = doc.get('id')
                    if doc_id is None:
                        continue
                    res = self.update_one({'id': doc_id}, update)
                    modified += res.get('modified_count', 0)
                return {'modified_count': modified, 'matched_count': len(matched)}

            has_set = '$set' in update
            update_data = update['$set'] if has_set else update
            clean_update = {k: _serialize(v) for k, v in update_data.items() if v is not None}
            clean_update = _filter_columns(self.table_name, clean_update)
            if not clean_update:
                return {'modified_count': 0, 'matched_count': 0}

            builder = self._table().update(clean_update)
            for key, value in query.items():
                if not key.startswith('$'):
                    builder = _apply_filter(builder, key, value)
            result = builder.execute()
            n = len(result.data) if result.data else 0
            return {'modified_count': n, 'matched_count': n}

        except Exception as e:
            logger.error(f"update_many error on {self.table_name}: {e}")
            raise

    def find_one_and_update(
        self,
        query: Dict[str, Any],
        update: Dict[str, Any],
        return_document: str = 'after',
        projection: Dict[str, Any] = None
    ) -> Optional[Dict]:
        """Find and update, returning the document"""
        try:
            self.update_one(query, update)
            return self.find_one(query)
        except Exception as e:
            logger.error(f"find_one_and_update error on {self.table_name}: {e}")
            return None

    # ============ DELETE OPERATIONS ============

    def delete_one(self, query: Dict[str, Any]) -> Dict:
        """Delete single document"""
        try:
            builder = self._table().delete()
            for key, value in query.items():
                builder = builder.eq(key, value)

            result = builder.execute()
            return {'deleted_count': len(result.data) if result.data else 0}

        except Exception as e:
            logger.error(f"delete_one error on {self.table_name}: {e}")
            raise

    def delete_many(self, query: Dict[str, Any]) -> Dict:
        """Delete TODOS os documentos que casam com o filtro (DELETE set-based,
        com suporte a operadores via _apply_filter). Filtro vazio apaga todas as
        linhas da tabela — comportamento usado pela rota de reset de dados de teste."""
        try:
            builder = self._table().delete()
            for key, value in query.items():
                if not key.startswith('$'):
                    builder = _apply_filter(builder, key, value)
            result = builder.execute()
            return {'deleted_count': len(result.data) if result.data else 0}
        except Exception as e:
            logger.error(f"delete_many error on {self.table_name}: {e}")
            raise

    # ============ COUNT OPERATIONS ============

    def count_documents(self, query: Dict[str, Any] = None) -> int:
        """Count documents matching query"""
        try:
            builder = self._table().select('id', count='exact')

            if query:
                for key, value in query.items():
                    builder = _apply_filter(builder, key, value)

            result = builder.execute()
            return result.count if hasattr(result, 'count') and result.count else len(result.data or [])

        except Exception as e:
            logger.error(f"count_documents error on {self.table_name}: {e}")
            return 0

    # ============ AGGREGATION (LIMITED) ============

    def aggregate(self, pipeline: List[Dict]) -> List[Dict]:
        """Basic aggregation support"""
        return self.find({})


class SupabaseDB:
    """Database wrapper providing table access"""

    def __init__(self):
        self._tables: Dict[str, SupabaseTable] = {}

    def __getattr__(self, name: str) -> SupabaseTable:
        if name.startswith('_'):
            raise AttributeError(name)
        if name not in self._tables:
            self._tables[name] = SupabaseTable(name)
        return self._tables[name]


# Create singleton instance
db = SupabaseDB()
# client is resolved lazily via get_client() — do NOT call at module level
# (would raise RuntimeError if SUPABASE_URL env var is absent at import time)


def upload_photo_to_storage(
    base64_string: str,
    file_path: str,
    bucket: str = "checkin-photos"
) -> Optional[str]:
    """Upload a base64-encoded JPEG to Supabase Storage.

    Returns the public URL on success, or None if the upload fails so the
    caller can fall back to keeping the base64 value in the DB.
    """
    if not base64_string:
        return None
    try:
        import base64 as _b64
        raw = base64_string.split(',', 1)[-1] if ',' in base64_string else base64_string
        file_bytes = _b64.b64decode(raw)
        c = get_client()
        c.storage.from_(bucket).upload(
            file_path,
            file_bytes,
            file_options={"content-type": "image/jpeg", "upsert": "true"},
        )
        return c.storage.from_(bucket).get_public_url(file_path)
    except Exception as exc:
        logger.warning(f"Storage upload failed [{file_path}]: {exc}")
        return None
