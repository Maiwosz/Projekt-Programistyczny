@echo off
setlocal EnableDelayedExpansion

:: Konfiguracja kodowania
chcp 65001 >nul 2>&1

echo.
echo ===============================================
echo          ZATRZYMYWANIE PROCESOW APLIKACJI
echo ===============================================
echo.

:: Sprawdzenie uprawnieñ administratora
net session >nul 2>&1
if !errorlevel! neq 0 (
    echo [UWAGA] Wymagane sa uprawnienia administratora dla pelnej funkcjonalnosci!
    echo Probuje uruchomic z podwyzszymi uprawnieniami...
    echo.
    
    :: Próba uruchomienia z uprawnieniami administratora
    powershell -Command "try { Start-Process -Verb RunAs -FilePath '%~dpnx0' -Wait; exit 0 } catch { exit 1 }"
    
    if !errorlevel! equ 0 (
        echo Procesy zostaly zatrzymane pomyslnie.
        exit /b 0
    ) else (
        echo [UWAGA] Nie udalo sie uzyskac uprawnien administratora.
        echo Kontynuuje bez uprawnien - niektore procesy moga nie zostac zatrzymane.
        echo.
        timeout /t 3 /nobreak >nul
    )
)

:: Funkcja zatrzymywania procesów
echo Zatrzymywanie procesow MongoDB...
taskkill /IM "mongod.exe" /F >nul 2>&1
if !errorlevel! equ 0 (
    echo [OK] Proces MongoDB zostal zatrzymany
) else (
    echo [INFO] Proces MongoDB nie byl uruchomiony lub juz zostal zatrzymany
)

echo Zatrzymywanie procesow Node.js...
taskkill /IM "node.exe" /F >nul 2>&1
if !errorlevel! equ 0 (
    echo [OK] Procesy Node.js zostaly zatrzymane
) else (
    echo [INFO] Procesy Node.js nie byly uruchomione lub juz zostaly zatrzymane
)

:: Dodatkowe procesy które mog¹ byæ powi¹zane
echo Zatrzymywanie dodatkowych procesow...
taskkill /IM "npm.exe" /F >nul 2>&1
taskkill /IM "npx.exe" /F >nul 2>&1

:: Sprawdzenie czy procesy nadal dzia³aj¹
echo.
echo Weryfikacja procesow...
set "processesFound=0"

tasklist /FI "IMAGENAME eq mongod.exe" 2>nul | find /I "mongod.exe" >nul
if !errorlevel! equ 0 (
    echo [UWAGA] Proces MongoDB nadal dziala
    set "processesFound=1"
)

tasklist /FI "IMAGENAME eq node.exe" 2>nul | find /I "node.exe" >nul
if !errorlevel! equ 0 (
    echo [UWAGA] Procesy Node.js nadal dzialaja
    set "processesFound=1"
)

echo.
if !processesFound! equ 0 (
    echo ===============================================
    echo        WSZYSTKIE PROCESY ZATRZYMANE
    echo ===============================================
) else (
    echo ===============================================
    echo     NIEKTORE PROCESY NADAL SA URUCHOMIONE
    echo ===============================================
    echo.
    echo Jezeli procesy nadal dzialaja, mozesz sprobowac:
    echo 1. Uruchomic ten skrypt jako administrator
    echo 2. Recznie zatrzymac procesy w Menedzerze zadan
    echo 3. Zrestartowac komputer
)

echo.
pause