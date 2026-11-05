@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist ".env" copy ".env.example" ".env" >nul
where node >nul 2>nul
if errorlevel 1 (
  echo O Node.js nao esta instalado. Baixe em https://nodejs.org ^(versao LTS^) e rode este arquivo de novo.
  pause
  exit /b 1
)
start "" cmd /c "timeout /t 3 >nul & start http://localhost:8800"
node server.js
pause
