# ADR-0005: Fotos de check-in armazenadas no Supabase Storage com fallback base64

**Data:** 2026-05-08  
**Status:** Aceito  
**ID:** ARCH-005

---

## Contexto

Instaladores fazem check-in via celular em campo, com conexão potencialmente instável. A foto é obrigatória para evidência do serviço. Se o upload falhar, o check-in não pode ser bloqueado.

## Decisão

1. Frontend envia foto como base64 no body do request
2. Backend tenta upload para Supabase Storage (`checkin-photos` bucket)
3. **Se sucesso:** salva a URL pública no campo `checkin_photo_url`
4. **Se falha:** salva o base64 direto no campo `checkin_photo` (fallback)

```python
# db_supabase.py — upload_photo_to_storage()
def upload_photo_to_storage(base64_string, file_path, bucket="checkin-photos"):
    ...
    except Exception as exc:
        logger.warning(f"Storage upload failed [{file_path}]: {exc}")
        return None  # caller usa base64 como fallback
```

## Consequências

**Positivas:**
- Check-in nunca é bloqueado por falha de upload
- URL pública permite visualização sem autenticação adicional

**Negativas:**
- Base64 no banco aumenta muito o tamanho dos registros (uma foto JPEG de 2 MB = ~2.7 MB em base64)
- Não há job de migração que converta base64 legados para Storage
- `checkin_photo` e `checkin_photo_url` coexistem — consumers precisam checar os dois campos

**Recomendação:** Criar job periódico que migra registros com base64 em `checkin_photo` para Storage e preenche `checkin_photo_url`. Após migração, `checkin_photo` pode ser descontinuado.
