@echo off
cd /d C:\Users\andre\Downloads\claude\Instal-supa\supabase\frontend

echo === Removendo REACT_APP_BACKEND_URL antigo ===
call vercel env rm REACT_APP_BACKEND_URL production --yes 2>nul
call vercel env rm REACT_APP_BACKEND_URL preview --yes 2>nul
call vercel env rm REACT_APP_BACKEND_URL development --yes 2>nul

echo.
echo === Adicionando valor correto ===
echo https://instal-visual.com.br/_/backend | call vercel env add REACT_APP_BACKEND_URL production
echo https://instal-visual.com.br/_/backend | call vercel env add REACT_APP_BACKEND_URL preview
echo https://instal-visual.com.br/_/backend | call vercel env add REACT_APP_BACKEND_URL development

echo.
echo === Verificando ===
call vercel env ls

echo.
echo === Redeploy para producao ===
call vercel --prod --yes

echo.
echo === CONCLUIDO ===
pause
