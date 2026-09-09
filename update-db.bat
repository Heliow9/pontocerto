@echo off
setlocal
cd /d "%~dp0"
echo Atualizando estrutura do MySQL...
call npm run db:init
if errorlevel 1 (
  echo.
  echo Houve um erro ao atualizar o banco. Revise apps\api\.env
  pause
  exit /b 1
)
echo.
echo Banco atualizado com sucesso.
pause
endlocal
