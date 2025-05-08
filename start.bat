@echo off
chcp 1250 > nul
setlocal enabledelayedexpansion
set "SCRIPT_NAME=%~nx0"
set "SCRIPT_PATH=%~dp0"
set "ERROR_FLAG=0"

:: Sprawd� uprawnienia administratora
fltmc >nul 2>&1 || (
    echo [UWAGA] Wymagane s� uprawnienia administratora!
    echo Automatyczna pr�ba ponownego uruchomienia z elevacj�...
    
    PowerShell -Command "Start-Process -Verb RunAs -FilePath 'cmd' -ArgumentList '/c', 'cd', '/d', '%SCRIPT_PATH%', '&&', 'call', '%SCRIPT_NAME%'" || (
        call :ERROR "Nie uda�o si� uruchomi� z uprawnieniami administratora!"
        exit /b 1
    )
    exit /b
)

:: =============================================
:: G��WNA LOGIKA SKRYPTU
:: =============================================

echo -------------------------------
echo Wyszukiwanie MongoDB w systemie...
echo -------------------------------

set "mongod_paths[0]=C:\Program Files\MongoDB\Server\8.0\bin\mongod.exe"
set "mongod_paths[1]=C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe"
set "mongod_paths[2]=C:\Program Files\MongoDB\Server\6.0\bin\mongod.exe"
set "mongod_paths[3]=C:\mongodb\bin\mongod.exe"
set "found=0"

for /L %%i in (0,1,3) do (
    if exist "!mongod_paths[%%i]!" (
        set "mongo_path=!mongod_paths[%%i]!"
        set "found=1"
        goto :MONGO_FOUND
    )
)

where mongod >nul 2>&1 && (
    set "mongo_path=mongod"
    set "found=1"
)

:MONGO_FOUND
if %found% == 0 (
    call :ERROR "Nie znaleziono MongoDB!"
    echo Zainstaluj MongoDB i spr�buj ponownie
    echo Pobierz instalator: https://www.mongodb.com/try/download/community
    goto :END
)

echo --------------------------------------
echo Znaleziono MongoDB w: %mongo_path%
echo --------------------------------------

if not exist "C:\data\db\" (
    echo Tworz� folder C:\data\db...
    mkdir "C:\data\db" 2>nul || (
        call :ERROR "Nie mo�na utworzy� folderu danych!"
        echo Sprawd� uprawnienia do dysku C:\
        goto :END
    )
)

tasklist | find /i "mongod.exe" >nul
if %errorlevel% == 0 (
    echo MongoDB jest ju� uruchomione!
    goto :START_NODE
)

echo Uruchamiam MongoDB...
start "MongoDB" /MIN cmd /c ""%mongo_path%" --dbpath=C:\data\db" || (
    call :ERROR "Nie uda�o si� uruchomi� MongoDB!"
    goto :END
)

echo Czekam na inicjalizacj� serwera (maksymalnie 15 sekund)...
set "counter=0"
:MONGO_STATUS_CHECK
timeout /t 1 /nobreak >nul
tasklist | find /i "mongod.exe" >nul
if %errorlevel% == 0 (
    echo Status MongoDB: URUCHOMIONE (potwierdzono po %counter% sekundach)
    goto :START_NODE
)
set /a "counter+=1"
if %counter% leq 15 (
    echo Czekam na MongoDB... (%counter%/15)
    goto :MONGO_STATUS_CHECK
)

call :ERROR "MongoDB nie uruchomi�o si� w ci�gu 15 sekund!"
echo Sprawd� konfiguracj� MongoDB i porty sieciowe
goto :END

:START_NODE
echo -------------------------------
echo Weryfikacja Node.js...
echo -------------------------------

where node >nul 2>&1 || (
    call :ERROR "Node.js nie jest zainstalowany!"
    echo Pobierz instalator: https://nodejs.org/
    goto :END
)

echo Znaleziono Node.js w systemie
echo -------------------------------

echo Przechodz� do folderu Backend...
cd /d "%SCRIPT_PATH%Backend" 2>nul || (
    call :ERROR "Nie znaleziono folderu Backend!"
    echo Utw�rz folder Backend w lokalizacji: "%SCRIPT_PATH%"
    goto :END
)

set "NODE_LOG=%CD%\node_errors.log"
echo Logi b��d�w Node.js b�d� zapisywane w: %NODE_LOG%

echo Instaluj� zale�no�ci npm...
call npm install
call :CHECK_ERROR "B��d podczas instalacji zale�no�ci npm!"

echo Uruchamiam serwer Node.js...
start "Serwer Node.js" cmd /c "node server.js > "%NODE_LOG%" 2>&1" || (
    call :ERROR "Nie uda�o si� uruchomi� serwera Node.js!"
    goto :END
)

echo Oczekiwanie na inicjalizacj� serwera...
ping -n 6 127.0.0.1 >nul

echo Sprawdzanie statusu serwera...
tasklist | find /i "node.exe" >nul || (
    call :ERROR "Serwer Node.js nie zosta� uruchomiony! Sprawd� plik logu: %NODE_LOG%"
    goto :END
)



echo Otwieram przegl�dark�...
start "" "http://localhost:3000" || (
    echo [OSTRZE�ENIE] Nie uda�o si� otworzy� przegl�darki
    echo Mo�esz r�cznie otworzy� adres: http://localhost:3000
)

:END
echo -------------------------------
if %ERROR_FLAG% == 0 (
    echo [SUKCES] Aplikacja powinna by� dost�pna pod adresem http://localhost:3000
) else (
    echo [NIEPOWODZENIE] Wyst�pi�y b��dy podczas uruchamiania
)
echo -------------------------------
timeout /t 5 /nobreak >nul
exit /b %ERROR_FLAG%


:: Funkcja do wy�wietlania komunikat�w b��d�w
:ERROR
echo [B��D] %~1
echo.
set "ERROR_FLAG=1"
goto :END

:: Funkcja sprawdzaj�ca kod b��du
:CHECK_ERROR
if %ERRORLEVEL% neq 0 (
    call :ERROR "%~1"
    exit /b %ERRORLEVEL%
)