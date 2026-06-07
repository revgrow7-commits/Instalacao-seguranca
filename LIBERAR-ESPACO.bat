@echo off
chcp 65001 >nul
echo ==========================================================
echo  Liberar espaco em disco - Instal-Visual
echo ==========================================================
echo.
echo Este script remove APENAS coisas recriaveis:
echo   1. Pastas node_modules/build de 4 worktrees antigas de
echo      agentes em .claude\worktrees (copias duplicadas do
echo      projeto - potencialmente varios GB)
echo   2. Pasta build local do frontend (regeravel com build)
echo   3. Caches do yarn e do npm
echo.
echo NAO toca em codigo-fonte, fotos, documentos ou videos.
echo.
pause

set BASE=%~dp0.claude\worktrees

for %%W in (magical-bose-4fb289 vigilant-haslett-9b7ba4 elegant-lumiere-f6de12 angry-greider-ef2a08) do (
  if exist "%BASE%\%%W\frontend\node_modules" (
    echo Removendo worktree %%W: frontend\node_modules ...
    rd /s /q "%BASE%\%%W\frontend\node_modules"
  )
  if exist "%BASE%\%%W\frontend\build" (
    echo Removendo worktree %%W: frontend\build ...
    rd /s /q "%BASE%\%%W\frontend\build"
  )
  if exist "%BASE%\%%W\node_modules" (
    echo Removendo worktree %%W: node_modules ...
    rd /s /q "%BASE%\%%W\node_modules"
  )
)

if exist "%~dp0frontend\build" (
  echo Removendo frontend\build local ...
  rd /s /q "%~dp0frontend\build"
)

echo.
echo Limpando caches do yarn e npm (ignora erro se nao instalados)...
call yarn cache clean 2>nul
call npm cache clean --force 2>nul

echo.
echo ==========================================================
echo  Concluido! Verifique o espaco livre no disco C:.
echo  Dica extra: esvazie a Lixeira do Windows para liberar
echo  o que ja foi excluido por outros programas.
echo ==========================================================
pause
