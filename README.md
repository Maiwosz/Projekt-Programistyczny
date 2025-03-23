# Instrukcja

**UWAGA! Wszystkie zmiany wymagają zatwierdzenia przez właściciela repozytorium.**

---

## Spis Treści
1. [Jak pobrać projekt?](#jak-pobrać-projekt)
2. [Struktura projektu](#struktura-projektu)
3. [Wymagania](#wymagania)
4. [Jak zainstalować MongoDB i Node.js?](#jak-zainstalować-mongodb-i-nodejs)
5. [Jak uruchomić projekt?](#jak-uruchomić-projekt)
6. [Jak wprowadzać zmiany?](#jak-wprowadzać-zmiany)
7. [Jak prosić o zatwierdzenie zmian?](#jak-prosić-o-zatwierdzenie-zmian)
8. [Jak sprawdzać czyjeś zmiany?](#jak-sprawdzać-czyjeś-zmiany)
9. [Używanie graficznych interfejsów (GUI)](#używanie-graficznych-interfejsów-gui)
10. [Najczęstsze problemy](#najczęstsze-problemy)

---

## Jak pobrać projekt?

### Krok 1: Pobierz projekt na swój komputer

1. Otwórz folder, gdzie chcesz zapisać projekt (np. `Projekt Programistyczny`).
2. Kliknij prawym przyciskiem myszy w pustym miejscu i wybierz **"Otwórz w Terminalu"**.
   - Jeśli nie masz Gita, pobierz go tutaj: [Git SCM](https://git-scm.com/downloads)
   - Możesz użyć także **Git Bash**, **PowerShella** lub innej powłoki.
3. Wpisz poniższą komendę i naciśnij `Enter`:

   ```sh
   git clone https://github.com/Maiwosz/Projekt-Programistyczny.git
   ```

### Krok 2: Wejdź do folderu projektu

1. W folderze projektu kliknij prawym przyciskiem myszy i wybierz **"Otwórz w Terminalu"**.
2. Alternatywnie, w terminalu wpisz:

   ```sh
   cd Projekt-Programistyczny
   ```

**Wszystkie operacje muszą być wykonywane w folderze projektu!**

---

## Struktura projektu

```
.
├── README.md               # Instrukcja instalacji i użycia
├── start.bat               # Skrypt uruchamiający serwer backendowy
├── stop.bat                # Skrypt zatrzymujący serwer backendowy
├── Backend/                # Katalog backendu (Node.js)
│   ├── .env                # Konfiguracja środowiskowa
│   ├── package.json        # Konfiguracja projektu Node.js
│   ├── server.js           # Główny plik serwera API
│   └── node_modules/       # Zainstalowane zależności NPM
└── Web-Frontend/           # Katalog frontendu (strona WWW)
    ├── index.html          # Główna strona aplikacji
    ├── login.html          # Strona logowania
    ├── register.html       # Strona rejestracji
    ├── scripts/            # Katalog skryptów JS
    │   └── auth.js         # Logika uwierzytelniania
    └── styles/             # Katalog stylów CSS
        └── styles.css      # Globalne style aplikacji
```

---

## Wymagania

**MongoDB Community Server** (wersja: 6.0, 7.0 lub 8.0)  
Pobierz: [MongoDB Community](https://www.mongodb.com/try/download/community)

**Node.js** (minimalna wersja: 14.x lub nowsza)  
Pobierz: [Node.js](https://nodejs.org/)

---

## Jak zainstalować MongoDB i Node.js?

### Instalacja MongoDB

1. Pobierz MongoDB z [oficjalnej strony](https://www.mongodb.com/try/download/community).
2. Uruchom instalator i wybierz opcję **"Complete"**.
3. Zaznacz **"Install MongoDB Compass"**, jeśli chcesz GUI do zarządzania bazą danych.
4. Po instalacji sprawdź wersję:

   ```sh
   mongod --version
   ```

### Instalacja Node.js

1. Pobierz Node.js z [oficjalnej strony](https://nodejs.org/).
2. Wybierz opcję **"Add to PATH"** podczas instalacji.
3. Po instalacji sprawdź wersję:

   ```sh
   node -v
   ```

---

## Jak uruchomić projekt?

1. W głównym folderze uruchom **`start.bat`**.
2. Skrypt sprawdzi wymagania i uruchomi stronę.
3. Aby zakończyć pracę, użyj **`stop.bat`**, który wyłączy serwer.

---

## Jak wprowadzać zmiany?

**Zawsze pracuj na nowej gałęzi!**

```sh
git checkout -b twoja-nazwa-galezi
```

1. Wprowadź zmiany w kodzie.
2. Dodaj zmienione pliki:

   ```sh
   git add .
   ```

3. Zapisz zmiany lokalnie:

   ```sh
   git commit -m "Opis zmian"
   ```

4. Wyślij zmiany na GitHub:

   ```sh
   git push origin twoja-nazwa-galezi
   ```

---

## Jak prosić o zatwierdzenie zmian?

1. Wejdź na GitHub › zakładka **"Pull Requests"**.
2. Kliknij **"New Pull Request"**.
3. Wybierz:
   - `base`: `master`
   - `compare`: `twoja-nazwa-galezi`
4. Kliknij **"Create Pull Request"** i opisz zmiany.
5. Czekaj na recenzję prowadzącego.

---

## Jak sprawdzać czyjeś zmiany?

1. Otwórz **Pull Request** w zakładce **"Pull Requests"**.
2. Kliknij **"Files changed"**, aby zobaczyć modyfikacje.
3. Jeśli wszystko jest OK:
   - **Review** › **Approve** › **Submit Review**
4. Jeśli wymagane są poprawki:
   - **Review** › **Request Changes** › Opisz problem › **Submit Review**

---

## Używanie graficznych interfejsów (GUI)

Możesz użyć narzędzi GUI:
- [Git Extensions](https://gitextensions.github.io/)
- [GitHub Desktop](https://desktop.github.com/)
- [Sourcetree](https://www.sourcetreeapp.com/)

---

## Najczęstsze problemy

**Permission denied przy `git push`**  
Musisz być dodany jako współpracownik repozytorium.

**Zapomniałem stworzyć nową gałąź**  
```sh
git checkout -b nowa-nazwa-galezi
git add . && git commit -m "Naprawa"
git push origin nowa-nazwa-galezi
```

**Konflikty przy mergowaniu**  
Ręcznie popraw pliki i wykonaj:
```sh
git add .
git commit -m "Rozwiązano konflikty"
