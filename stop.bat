@echo off

:: SprawdŸ uprawnienia administratora
NET SESSION >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo.
    echo [UWAGA] Wymagane sa uprawnienia administratora!
    echo Uruchom ten skrypt jako administrator.
    echo.
    echo Automatyczna proba ponownego uruchomienia z uprawnieniami...
    timeout /t 2 /nobreak >nul
    
    :: Uruchom ponownie z podniesionymi uprawnieniami via PowerShell
    PowerShell -Command "Start-Process -Verb RunAs -FilePath '%~dpnx0'" 
    exit /b
)

REM stop.bat - Zatrzymuje wszystkie procesy
chcp 1250 >nul
taskkill /IM "mongod.exe" /F >nul 2>&1
taskkill /IM "node.exe" /F >nul 2>&1
echo Wszystkie procesy zosta³y zatrzymane
pause