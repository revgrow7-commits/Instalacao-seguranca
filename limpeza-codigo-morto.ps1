# =====================================================================
# Limpeza de código morto — Indústria Visual (instal-visual.com.br)
# Gerado pela auditoria de 2026-06-11.
#
# COMO USAR: abra o PowerShell na raiz do repositório e rode:
#   .\limpeza-codigo-morto.ps1
#
# Tudo aqui é recuperável via git (git checkout <sha> -- <arquivo>).
# Cada arquivo abaixo foi verificado por grep: ZERO referências externas.
# =====================================================================

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "== 1/4 Backend: arquivos mortos ==" -ForegroundColor Cyan
# database.py        -> shim nunca importado (so faz print + re-export)
# database_supabase.py -> implementacao alternativa nunca importada;
#                         contem URL hardcoded do projeto ERRADO (otyrrvkixegiqsthmaaj)
# migrate_to_supabase.py / run_migration_supabase.py -> scripts one-off ja executados
git rm --ignore-unmatch backend/database.py
git rm --ignore-unmatch backend/database_supabase.py
git rm --ignore-unmatch backend/migrations/migrate_to_supabase.py
git rm --ignore-unmatch backend/migrations/run_migration_supabase.py

Write-Host "== 2/4 Frontend: componentes nunca importados ==" -ForegroundColor Cyan
git rm --ignore-unmatch frontend/src/components/BrowserCheck.jsx
git rm --ignore-unmatch frontend/src/components/NotificationPermissionModal.jsx
git rm --ignore-unmatch frontend/src/components/CameraPermissionGuide.jsx
git rm --ignore-unmatch frontend/src/components/LocationPermissionGuide.jsx

Write-Host "== 3/4 Frontend: componentes shadcn/ui orfaos (23) + hook use-toast ==" -ForegroundColor Cyan
# O app usa 'sonner' direto para toasts; toast/toaster/use-toast sao um cluster morto.
# command.jsx NAO esta na lista: e usado por combobox/multi-combobox.
$uiMortos = @(
  "accordion","alert","aspect-ratio","avatar","breadcrumb","carousel",
  "context-menu","form","hover-card","input-otp","menubar","navigation-menu",
  "pagination","radio-group","resizable","scroll-area","sheet","slider",
  "sonner","toast","toaster","toggle","toggle-group"
)
foreach ($c in $uiMortos) { git rm --ignore-unmatch "frontend/src/components/ui/$c.jsx" }
git rm --ignore-unmatch frontend/src/hooks/use-toast.js

Write-Host "== 4/4 Artefatos de teste antigos e lixo local ==" -ForegroundColor Cyan
git rm -r --ignore-unmatch test_reports
git rm --ignore-unmatch test_result.md

# Lixo LOCAL (gitignorado — só ocupa disco; .claude\worktrees tem 4 cópias do repo!)
if (Test-Path ".claude\worktrees") { Remove-Item ".claude\worktrees" -Recurse -Force }
if (Test-Path "frontend\build")    { Remove-Item "frontend\build" -Recurse -Force }
if (Test-Path "backend\supabase\.temp") { Remove-Item "backend\supabase\.temp" -Recurse -Force }

# OPCIONAL (descomente se quiser): docs antigos de troubleshooting
# git rm --ignore-unmatch CAMERA_TROUBLESHOOTING.md CAMERA_ANDROID_CHROME.md INSTRUCOES_LIMPAR_CACHE.md

Write-Host ""
Write-Host "Pronto. Revise com 'git status' e confirme com:" -ForegroundColor Green
Write-Host "  git commit -m 'chore: remove codigo morto (auditoria 2026-06-11)'"
Write-Host "Depois valide o build: cd frontend; npm run build"
