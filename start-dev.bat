@echo off
setlocal
cd /d "%~dp0"
echo Iniciando Ponto Certo SaaS...
start "Ponto Certo API" cmd /k "npm run dev:api"
timeout /t 2 /nobreak >nul
start "Ponto Certo WEB" cmd /k "npm run dev:web"
echo.
echo API: http://localhost:3333
echo WEB: http://localhost:5173
echo.
echo Para o app Expo, execute em outro terminal: npm run dev:mobile
endlocal
