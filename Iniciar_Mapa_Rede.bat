@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo O Node.js nao esta instalado. Baixe em https://nodejs.org ^(versao LTS^) e rode este arquivo de novo.
  pause
  exit /b 1
)
if not exist ".env" copy ".env.example" ".env" >nul
echo.
echo MAPA SASI NA REDE LOCAL
echo Outras pessoas da rede abrem o endereco que aparecer abaixo e digitam o usuario e a senha que voce escolher agora.
echo A senha so vale enquanto esta janela estiver aberta ^(nao fica gravada^). Evite os simbolos ^& %% ^^ ^< ^> ^|
echo.
set /p MAPA_USUARIO=Usuario:
set /p MAPA_SENHA=Senha:
if "%MAPA_USUARIO%"=="" goto vazio
if "%MAPA_SENHA%"=="" goto vazio
set HOST=0.0.0.0
echo.
echo Se o Windows perguntar sobre o Firewall para o Node.js, clique em "Permitir acesso" ^(marque tambem a rede publica se a sua rede aparecer como publica^).
echo.
start "" cmd /c "timeout /t 3 >nul & start http://localhost:8800"
node server.js
pause
exit /b 0
:vazio
echo Usuario e senha sao obrigatorios para abrir na rede.
pause
exit /b 1
