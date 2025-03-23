@echo off
REM start.bat - Uruchamia ca�e �rodowisko
chcp 1250 >nul
title Uruchamianie aplikacji
color 0A

setlocal enabledelayedexpansion

REM 1. Lista mo�liwych �cie�ek instalacji MongoDB
set "mongod_paths[0]=C:\Program Files\MongoDB\Server\8.0\bin\mongod.exe"
set "mongod_paths[1]=C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe"
set "mongod_paths[2]=C:\Program Files\MongoDB\Server\6.0\bin\mongod.exe"
set "mongod_paths[3]=C:\mongodb\bin\mongod.exe"

REM 2. Szukaj MongoDB w �cie�kach systemowych i alternatywnych
set found=0
echo Szukam MongoDB w systemie...

REM Najpierw sprawd� �cie�ki zdefiniowane r�cznie
for /L %%i in (0,1,3) do (
    if exist "!mongod_paths[%%i]!" (
        set "MONGODB_PATH=!mongod_paths[%%i]!"
        set found=1
        goto :mongod_found
    )
)

REM Je�li nie znaleziono - sprawd� w PATH
where mongod >nul 2>&1
if %errorlevel% == 0 (
    set "MONGODB_PATH=mongod"
    set found=1
)

:mongod_found
if %found% == 0 (
    echo [ERROR] Nie znaleziono MongoDB!
    echo Mo�liwe przyczyny:
    echo 1. MongoDB nie jest zainstalowane
    echo 2. �cie�ka instalacji nie jest w PATH
    echo 3. Wersja MongoDB jest inna ni� 6.0/7.0/8.0
    echo.
    echo Pobierz instalator: https://www.mongodb.com/try/download/community
    echo LUB zmie� r�czne �cie�ki w skrypcie start.bat
    pause
    exit /b
)

REM 3. Weryfikacja dzia�ania MongoDB
echo Znaleziono MongoDB w: %MONGODB_PATH%
tasklist /FI "IMAGENAME eq mongod.exe" | find /I /N "mongod.exe">nul
if %errorlevel% equ 0 (
    echo MongoDB jest ju� uruchomione
) else (
    echo Uruchamiam MongoDB...
    if "%MONGODB_PATH%" == "mongod" (
        start "MongoDB" /MIN cmd /c "mongod --dbpath=C:\data\db"
    ) else (
        start "MongoDB" /MIN cmd /c "%MONGODB_PATH% --dbpath=C:\data\db"
    )
)
timeout /t 5 /nobreak >nul
REM 2. Sprawd� czy Node.js jest zainstalowany
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js nie jest zainstalowany!
    echo Pobierz instalator: https://nodejs.org/
    pause
    exit /b
)

REM 3. Utw�rz folder danych MongoDB je�li nie istnieje
if not exist "C:\data\db\" (
    echo Tworz� folder C:\data\db...
    mkdir "C:\data\db"
)

REM 4. Uruchom MongoDB w nowym oknie
start "MongoDB" /MIN cmd /c "mongod --dbpath=C:\data\db"
timeout /t 5 /nobreak >nul

REM 5. Przejd� do folderu backend i zainstaluj zale�no�ci
cd /d %~dp0Backend
if not exist "node_modules\" (
    echo Instaluj� zale�no�ci Node.js...
    npm install
)

REM 6. Uruchom serwer Node.js
echo Uruchamiam serwer aplikacji...
start "Server Node.js" cmd /c "node server.js"
timeout /t 2 /nobreak >nul

REM 7. Otw�rz przegl�dark�
start "" "http://localhost:3000"

echo [SUKCES] Aplikacja powinna by� dost�pna pod adresem http://localhost:3000
pause