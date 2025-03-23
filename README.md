# Instrukcja

**UWAGA! Wszystkie zmiany wymagaj� zatwierdzenia przez prowadz�cego.**

---

## ?? Spis Tre�ci
1. [Jak pobra� projekt?](#jak-pobra�-projekt)
2. [Struktura projektu](#struktura-projektu)
3. [Wymagania](#wymagania)
4. [Jak zainstalowa� MongoDB i Node.js?](#jak-zainstalowa�-mongodb-i-nodejs)
5. [Jak uruchomi� projekt?](#jak-uruchomi�-projekt)
6. [Jak wprowadza� zmiany?](#jak-wprowadza�-zmiany)
7. [Jak prosi� o zatwierdzenie zmian?](#jak-prosi�-o-zatwierdzenie-zmian)
8. [Jak sprawdza� czyje� zmiany?](#jak-sprawdza�-czyje�-zmiany)
9. [U�ywanie graficznych interfejs�w (GUI)](#u�ywanie-graficznych-interfejs�w-gui)
10. [Najcz�stsze problemy](#najcz�stsze-problemy)

---

## ?? Jak pobra� projekt?

### Krok 1: Pobierz projekt na sw�j komputer

1. Otw�rz folder, gdzie chcesz zapisa� projekt (np. `Projekt Programistyczny`).
2. Kliknij prawym przyciskiem myszy w pustym miejscu i wybierz **"Otw�rz w Terminalu"**.
   - Je�li nie masz Gita, pobierz go tutaj: [Git SCM](https://git-scm.com/downloads)
   - Mo�esz u�y� tak�e **Git Bash**, **PowerShella** lub innej pow�oki.
3. Wpisz poni�sz� komend� i naci�nij `Enter`:

   ```sh
   git clone https://github.com/Maiwosz/Projekt-Programistyczny.git
   ```

### Krok 2: Wejd� do folderu projektu

1. W folderze projektu kliknij prawym przyciskiem myszy i wybierz **"Otw�rz w Terminalu"**.
2. Alternatywnie, w terminalu wpisz:

   ```sh
   cd Projekt-Programistyczny
   ```

? **Wszystkie operacje musz� by� wykonywane w folderze projektu!**

---

## ?? Struktura projektu

```
Projekt Programistyczny
-   README.md           # Instrukcja instalacji i u�ycia
-   start.bat           # Skrypt uruchamiaj�cy serwer backendowy
-   stop.bat            # Skrypt zatrzymuj�cy serwer backendowy
-
+�� Backend             # Katalog backendu (Node.js)
-   -   .env            # Konfiguracja �rodowiskowa (port, klucze, DB)
-   -   package.json    # Konfiguracja projektu Node.js
-   -   server.js       # G��wny plik serwera API
-   L�� node_modules    # Zainstalowane zale�no�ci NPM
-
L�� Web-Frontend        # Katalog frontendu (strona WWW)
    -   index.html      # G��wna strona aplikacji
    -   login.html      # Strona logowania
    -   register.html   # Strona rejestracji
    +�� scripts         # Skrypty JavaScript
    -   L�� auth.js     # Logika uwierzytelniania
    L�� styles          # Arkusze styli CSS
        L�� styles.css  # Globalne style aplikacji
```

---

## ?? Wymagania

?? **MongoDB Community Server** (wersja: 6.0, 7.0 lub 8.0)
   - Pobierz: [MongoDB Community](https://www.mongodb.com/try/download/community)

?? **Node.js** (minimalna wersja: 14.x lub nowsza)
   - Pobierz: [Node.js](https://nodejs.org/)

---

## ?? Jak zainstalowa� MongoDB i Node.js?

### Instalacja MongoDB

1. Pobierz MongoDB z [oficjalnej strony](https://www.mongodb.com/try/download/community).
2. Uruchom instalator i wybierz opcj� **"Complete"**.
3. Zaznacz **"Install MongoDB Compass"**, je�li chcesz GUI do zarz�dzania baz� danych.
4. Po instalacji sprawd� wersj�:

   ```sh
   mongod --version
   ```

### Instalacja Node.js

1. Pobierz Node.js z [oficjalnej strony](https://nodejs.org/).
2. Wybierz opcj� **"Add to PATH"** podczas instalacji.
3. Po instalacji sprawd� wersj�:

   ```sh
   node -v
   ```

---

## ?? Jak uruchomi� projekt?

1. W g��wnym folderze uruchom **`start.bat`**.
2. Skrypt sprawdzi wymagania i uruchomi stron�.
3. Aby zako�czy� prac�, u�yj **`stop.bat`**, kt�ry wy��czy serwer.

---

## ?? Jak wprowadza� zmiany?

? **Zawsze pracuj na nowej ga��zi!**

```sh
git checkout -b twoja-nazwa-galezi
```

1. Wprowad� zmiany w kodzie.
2. Dodaj zmienione pliki:

   ```sh
   git add .
   ```

3. Zapisz zmiany lokalnie:

   ```sh
   git commit -m "Opis zmian"
   ```

4. Wy�lij zmiany na GitHub:

   ```sh
   git push origin twoja-nazwa-galezi
   ```

---

## ? Jak prosi� o zatwierdzenie zmian?

1. Wejd� na GitHub � zak�adka **"Pull Requests"**.
2. Kliknij **"New Pull Request"**.
3. Wybierz:
   - `base`: `master`
   - `compare`: `twoja-nazwa-galezi`
4. Kliknij **"Create Pull Request"** i opisz zmiany.
5. Czekaj na recenzj� prowadz�cego.

---

## ?? Jak sprawdza� czyje� zmiany?

1. Otw�rz **Pull Request** w zak�adce **"Pull Requests"**.
2. Kliknij **"Files changed"**, aby zobaczy� modyfikacje.
3. Je�li wszystko jest OK:
   - **Review** � **Approve** � **Submit Review**
4. Je�li wymagane s� poprawki:
   - **Review** � **Request Changes** � Opisz problem � **Submit Review**

---

## ?? U�ywanie graficznych interfejs�w (GUI)

Mo�esz u�y� narz�dzi GUI:
- [Git Extensions](https://gitextensions.github.io/)
- [GitHub Desktop](https://desktop.github.com/)
- [Sourcetree](https://www.sourcetreeapp.com/)

---

## ?? Najcz�stsze problemy

**Permission denied przy `git push`**
- Musisz by� dodany jako wsp�pracownik repozytorium.

**Zapomnia�em stworzy� now� ga���**
```sh
git checkout -b nowa-nazwa-galezi
git add . && git commit -m "Naprawa"
git push origin nowa-nazwa-galezi
```

**Konflikty przy mergowaniu**
- R�cznie popraw pliki i wykonaj:
```sh
git add .
git commit -m "Rozwi�zano konflikty"
