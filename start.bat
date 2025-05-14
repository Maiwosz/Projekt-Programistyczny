@echo off
chcp 1250 > nul
setlocal enabledelayedexpansion
set "SCRIPT_NAME=%~nx0"
set "SCRIPT_PATH=%~dp0"
set "ERROR_FLAG=0"

:: Sprawdź uprawnienia administratora
fltmc >nul 2>&1 || (
    echo [UWAGA] Wymagane są uprawnienia administratora!
    echo Automatyczna próba ponownego uruchomienia z elevacją...
    
    PowerShell -Command "Start-Process -Verb RunAs -FilePath 'cmd' -ArgumentList '/c', 'cd', '/d', '%SCRIPT_PATH%', '&&', 'call', '%SCRIPT_NAME%'" || (
        call :ERROR "Nie udało się uruchomić z uprawnieniami administratora!"
        exit /b 1
    )
    exit /b
)

:: =============================================
:: GŁÓWNA LOGIKA SKRYPTU
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
    echo Zainstaluj MongoDB i spróbuj ponownie
    echo Pobierz instalator: https://www.mongodb.com/try/download/community
    goto :END
)

echo --------------------------------------
echo Znaleziono MongoDB w: %mongo_path%
echo --------------------------------------

if not exist "C:\data\db\" (
    echo Tworzę folder C:\data\db...
    mkdir "C:\data\db" 2>nul || (
        call :ERROR "Nie można utworzyć folderu danych!"
        echo Sprawdź uprawnienia do dysku C:\
        goto :END
    )
)

tasklist | find /i "mongod.exe" >nul
if %errorlevel% == 0 (
    echo MongoDB jest już uruchomione!
    goto :START_NODE
)

echo Uruchamiam MongoDB...
start "MongoDB" /MIN cmd /c ""%mongo_path%" --dbpath=C:\data\db" || (
    call :ERROR "Nie udało się uruchomić MongoDB!"
    goto :END
)

echo Czekam na inicjalizację serwera (maksymalnie 15 sekund)...
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

call :ERROR "MongoDB nie uruchomiło się w ciągu 15 sekund!"
echo Sprawdź konfigurację MongoDB i porty sieciowe
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

echo Przechodzę do folderu Backend...
cd /d "%SCRIPT_PATH%Backend" 2>nul || (
    call :ERROR "Nie znaleziono folderu Backend!"
    echo Utwórz folder Backend w lokalizacji: "%SCRIPT_PATH%"
    goto :END
)

set "NODE_LOG=%CD%\node_errors.log"
echo Logi błędów Node.js będą zapisywane w: %NODE_LOG%

echo Instaluję zależności npm...
call npm install
call :CHECK_ERROR "Błąd podczas instalacji zależności npm!"

echo Uruchamiam serwer Node.js...
start "Serwer Node.js" cmd /c "node server.js > "%NODE_LOG%" 2>&1" || (
    call :ERROR "Nie udało się uruchomić serwera Node.js!"
    goto :END
)

echo Oczekiwanie na inicjalizację serwera...
ping -n 6 127.0.0.1 >nul

echo Sprawdzanie statusu serwera...
tasklist | find /i "node.exe" >nul || (
    call :ERROR "Serwer Node.js nie został uruchomiony! Sprawdź plik logu: %NODE_LOG%"
    goto :END
)



echo Otwieram przeglądarkę...
start "" "http://localhost:3000" || (
    echo [OSTRZEŻENIE] Nie udało się otworzyć przeglądarki
    echo Możesz ręcznie otworzyć adres: http://localhost:3000
)

:END
echo -------------------------------
if %ERROR_FLAG% == 0 (
    echo [SUKCES] Aplikacja powinna być dostępna pod adresem http://localhost:3000
) else (
    echo [NIEPOWODZENIE] Wystąpiły błędy podczas uruchamiania
)
echo -------------------------------
timeout /t 5 /nobreak >nul
exit /b %ERROR_FLAG%


:: Funkcja do wyświetlania komunikatów błędów
:ERROR
echo [BŁĄD] %~1
echo.
set "ERROR_FLAG=1"
goto :END

:: Funkcja sprawdzająca kod błędu
:CHECK_ERROR
if %ERRORLEVEL% neq 0 (
    call :ERROR "%~1"
    exit /b %ERRORLEVEL%
)