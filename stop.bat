@echo off
REM stop.bat - Zatrzymuje wszystkie procesy
chcp 1250 >nul
taskkill /IM "mongod.exe" /F >nul 2>&1
taskkill /IM "node.exe" /F >nul 2>&1
echo Wszystkie procesy zosta³y zatrzymane
pause