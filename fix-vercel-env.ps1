# ============================================================
# Fix REACT_APP_BACKEND_URL no Vercel + redeploy do frontend
# Criado em 2026-06-10 — rodar na pasta raiz do projeto
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== Fix: REACT_APP_BACKEND_URL ===" -ForegroundColor Cyan
Write-Host ""

# 1. Confirma que vercel CLI existe
if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
    Write-Host "ERRO: Vercel CLI nao encontrado. Instale com: npm i -g vercel" -ForegroundColor Red
    exit 1
}

$NEW_VALUE = "https://instal-visual.com.br/_/backend"
$ENV_NAME  = "REACT_APP_BACKEND_URL"

Write-Host "1. Removendo env var antiga ($ENV_NAME)..." -ForegroundColor Yellow
# Remove de todos os environments para evitar conflito
vercel env rm $ENV_NAME production --yes 2>$null
vercel env rm $ENV_NAME preview  --yes 2>$null
vercel env rm $ENV_NAME development --yes 2>$null

Write-Host ""
Write-Host "2. Adicionando novo valor: $NEW_VALUE" -ForegroundColor Yellow

# Adiciona para production, preview e development
echo $NEW_VALUE | vercel env add $ENV_NAME production
echo $NEW_VALUE | vercel env add $ENV_NAME preview
echo $NEW_VALUE | vercel env add $ENV_NAME development

Write-Host ""
Write-Host "3. Listando envs para confirmar..." -ForegroundColor Yellow
vercel env ls | Select-String "REACT_APP_BACKEND"

Write-Host ""
Write-Host "4. Redeploy do frontend para producao..." -ForegroundColor Yellow
Set-Location frontend
vercel --prod --yes

Write-Host ""
Write-Host "=== CONCLUIDO ===" -ForegroundColor Green
Write-Host "Novo deploy em andamento. Aguarde ~2 min e verifique instal-visual.com.br"
Write-Host ""
