# Instrukcja

**UWAGA! Wszystkie zmiany wymagaj¹ zatwierdzenia przez prowadz¹cego.**

---

## ?? Spis Treœci
1. [Jak pobraæ projekt?](#jak-pobraæ-projekt)
2. [Struktura projektu](#struktura-projektu)
3. [Wymagania](#wymagania)
4. [Jak zainstalowaæ MongoDB i Node.js?](#jak-zainstalowaæ-mongodb-i-nodejs)
5. [Jak uruchomiæ projekt?](#jak-uruchomiæ-projekt)
6. [Jak wprowadzaæ zmiany?](#jak-wprowadzaæ-zmiany)
7. [Jak prosiæ o zatwierdzenie zmian?](#jak-prosiæ-o-zatwierdzenie-zmian)
8. [Jak sprawdzaæ czyjeœ zmiany?](#jak-sprawdzaæ-czyjeœ-zmiany)
9. [U¿ywanie graficznych interfejsów (GUI)](#u¿ywanie-graficznych-interfejsów-gui)
10. [Najczêstsze problemy](#najczêstsze-problemy)

---

## ?? Jak pobraæ projekt?

### Krok 1: Pobierz projekt na swój komputer

1. Otwórz folder, gdzie chcesz zapisaæ projekt (np. `Projekt Programistyczny`).
2. Kliknij prawym przyciskiem myszy w pustym miejscu i wybierz **"Otwórz w Terminalu"**.
   - Jeœli nie masz Gita, pobierz go tutaj: [Git SCM](https://git-scm.com/downloads)
   - Mo¿esz u¿yæ tak¿e **Git Bash**, **PowerShella** lub innej pow³oki.
3. Wpisz poni¿sz¹ komendê i naciœnij `Enter`:

   ```sh
   git clone https://github.com/Maiwosz/Projekt-Programistyczny.git
   ```

### Krok 2: WejdŸ do folderu projektu

1. W folderze projektu kliknij prawym przyciskiem myszy i wybierz **"Otwórz w Terminalu"**.
2. Alternatywnie, w terminalu wpisz:

   ```sh
   cd Projekt-Programistyczny
   ```

? **Wszystkie operacje musz¹ byæ wykonywane w folderze projektu!**

---

## ?? Struktura projektu

```
Projekt Programistyczny
-   README.md           # Instrukcja instalacji i u¿ycia
-   start.bat           # Skrypt uruchamiaj¹cy serwer backendowy
-   stop.bat            # Skrypt zatrzymuj¹cy serwer backendowy
-
+¦¦ Backend             # Katalog backendu (Node.js)
-   -   .env            # Konfiguracja œrodowiskowa (port, klucze, DB)
-   -   package.json    # Konfiguracja projektu Node.js
-   -   server.js       # G³ówny plik serwera API
-   L¦¦ node_modules    # Zainstalowane zale¿noœci NPM
-
L¦¦ Web-Frontend        # Katalog frontendu (strona WWW)
    -   index.html      # G³ówna strona aplikacji
    -   login.html      # Strona logowania
    -   register.html   # Strona rejestracji
    +¦¦ scripts         # Skrypty JavaScript
    -   L¦¦ auth.js     # Logika uwierzytelniania
    L¦¦ styles          # Arkusze styli CSS
        L¦¦ styles.css  # Globalne style aplikacji
```

---

## ?? Wymagania

?? **MongoDB Community Server** (wersja: 6.0, 7.0 lub 8.0)
   - Pobierz: [MongoDB Community](https://www.mongodb.com/try/download/community)

?? **Node.js** (minimalna wersja: 14.x lub nowsza)
   - Pobierz: [Node.js](https://nodejs.org/)

---

## ?? Jak zainstalowaæ MongoDB i Node.js?

### Instalacja MongoDB

1. Pobierz MongoDB z [oficjalnej strony](https://www.mongodb.com/try/download/community).
2. Uruchom instalator i wybierz opcjê **"Complete"**.
3. Zaznacz **"Install MongoDB Compass"**, jeœli chcesz GUI do zarz¹dzania baz¹ danych.
4. Po instalacji sprawdŸ wersjê:

   ```sh
   mongod --version
   ```

### Instalacja Node.js

1. Pobierz Node.js z [oficjalnej strony](https://nodejs.org/).
2. Wybierz opcjê **"Add to PATH"** podczas instalacji.
3. Po instalacji sprawdŸ wersjê:

   ```sh
   node -v
   ```

---

## ?? Jak uruchomiæ projekt?

1. W g³ównym folderze uruchom **`start.bat`**.
2. Skrypt sprawdzi wymagania i uruchomi stronê.
3. Aby zakoñczyæ pracê, u¿yj **`stop.bat`**, który wy³¹czy serwer.

---

## ?? Jak wprowadzaæ zmiany?

? **Zawsze pracuj na nowej ga³êzi!**

```sh
git checkout -b twoja-nazwa-galezi
```

1. WprowadŸ zmiany w kodzie.
2. Dodaj zmienione pliki:

   ```sh
   git add .
   ```

3. Zapisz zmiany lokalnie:

   ```sh
   git commit -m "Opis zmian"
   ```

4. Wyœlij zmiany na GitHub:

   ```sh
   git push origin twoja-nazwa-galezi
   ```

---

## ? Jak prosiæ o zatwierdzenie zmian?

1. WejdŸ na GitHub › zak³adka **"Pull Requests"**.
2. Kliknij **"New Pull Request"**.
3. Wybierz:
   - `base`: `master`
   - `compare`: `twoja-nazwa-galezi`
4. Kliknij **"Create Pull Request"** i opisz zmiany.
5. Czekaj na recenzjê prowadz¹cego.

---

## ?? Jak sprawdzaæ czyjeœ zmiany?

1. Otwórz **Pull Request** w zak³adce **"Pull Requests"**.
2. Kliknij **"Files changed"**, aby zobaczyæ modyfikacje.
3. Jeœli wszystko jest OK:
   - **Review** › **Approve** › **Submit Review**
4. Jeœli wymagane s¹ poprawki:
   - **Review** › **Request Changes** › Opisz problem › **Submit Review**

---

## ?? U¿ywanie graficznych interfejsów (GUI)

Mo¿esz u¿yæ narzêdzi GUI:
- [Git Extensions](https://gitextensions.github.io/)
- [GitHub Desktop](https://desktop.github.com/)
- [Sourcetree](https://www.sourcetreeapp.com/)

---

## ?? Najczêstsze problemy

**Permission denied przy `git push`**
- Musisz byæ dodany jako wspó³pracownik repozytorium.

**Zapomnia³em stworzyæ now¹ ga³¹Ÿ**
```sh
git checkout -b nowa-nazwa-galezi
git add . && git commit -m "Naprawa"
git push origin nowa-nazwa-galezi
```

**Konflikty przy mergowaniu**
- Rêcznie popraw pliki i wykonaj:
```sh
git add .
git commit -m "Rozwi¹zano konflikty"
