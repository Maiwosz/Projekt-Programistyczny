console.log("sup");

// Utility function to get element class
const getElement = (selector) => {
	const element = document.querySelector(selector);
	if (element) return element;
	throw Error(`There is no ${selector} class`);
}

// Stuff used to make menu when screen width below 700px
// -----------------------------------------------------
// Get the class for elements from navigation bar ("Dodaj", "Profil", etc.)
const links = getElement(".nav-links");
// Get the class for navigation bar button that appears when screen width below 700px
const navButton = getElement(".nav-button");

// Add function to the navigation bar button
navButton.addEventListener("click", ()=> {
	links.classList.toggle("show-links");
})
// -----------------------------------------------------

// Functionalitiy for a button that shows file metadata
// -----------------------------------------------------
// Get the metadata section 
const mtData = getElement(".metadata");
// Get the button from class 
const mtButton = getElement(".mtbut");

// Add function to the navigation bar button
mtButton.addEventListener("click", ()=> {
	mtData.classList.toggle("show-metadata");
})
// -----------------------------------------------------


// Stuff for image view
// -----------------------------------------------------
// Get the image view element
var imgView = document.getElementById("image-view-id");

// Get all images present on the mainview page
// This probably needs to be changed later
var images = document.getElementsByTagName('img'); 

// Get the image (full display image) from image view element
var imgFromView = document.getElementById("image-zoom-id");

// Get the text element under image
var imgText = document.getElementById("name-id");
var imgData = document.getElementById("data-id");

// Add function below to all images
// i = 1 to exclude logo
for(var i = 1; i < images.length; i++) {
	images[i].onclick = function(){
		imgView.style.display = "block";
		imgFromView.src = this.src;
		imgText.innerHTML = "File name.";
		imgData.innerHTML = "File data.";
	}
}

// Get "button" that closes image view
var span = document.getElementsByClassName("close-button")[0];

// Add function that will allow to close image
span.onclick = function() {
	imgView.style.display = "none";
}

// -----------------------------------------------------


// ========== KONFIGURACJA GŁÓWNA ==========
let currentFolder = { id: null, name: 'Główny' }; // Obiekt przechowujący aktualny folder
let folderStack = []; // Historia nawigacji przechowująca całe obiekty folderów
let currentFileId = null;

// ========== INICJALIZACJA ==========
document.addEventListener('DOMContentLoaded', () => {
    // Sprawdź czy istnieje zapisany stan w localStorage
    const savedState = localStorage.getItem('folderState');
    if (savedState) {
        // Przywróć poprzedni stan nawigacji
        const { current, stack } = JSON.parse(savedState);
        currentFolder = current;
        folderStack = stack;
    }

    // Załaduj zawartość folderu i zaktualizuj okruszki
    loadFolderContents();
    updateBreadcrumbs();
});

// ========== FUNKCJE POMOCNICZE ==========

function getFileIcon(category) {
    // Obiekt zawierający szablony SVG dla różnych typów plików
    const icons = {
        image: /* html */`
                    <svg class="file-icon" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M8.5,13.5L11,16.5L14.5,12L19,18H5M21,19V5C21,3.89 20.1,3 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19Z"/>
                    </svg>`,
        video: /* html */`
                    <svg class="file-icon" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M17,10.5V7A1,1 0 0,0 16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5Z"/>
                    </svg>`,
        audio: /* html */`
                    <svg class="file-icon" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.84 14,18.7V20.77C18,19.86 21,16.28 21,12C21,7.72 18,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16C15.5,15.29 16.5,13.76 16.5,12M3,9V15H7L12,20V4L7,9H3Z"/>
                    </svg>`,
        document: /* html */`
                    <svg class="file-icon" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M13,9H18.5L13,3.5V9M6,2H14L20,8V20A2,2 0 0,1 18,22H6C4.89,22 4,21.1 4,20V4C4,2.89 4.89,2 6,2M15,18V16H6V18H15M18,14V12H6V14H18Z"/>
                    </svg>`,
        folder: /* html */`
                    <svg class="file-icon" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z"/>
                    </svg>`,
        other: /* html */`
                    <svg class="file-icon" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M13,9V3.5L18.5,9M6,2C4.89,2 4,2.89 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2H6Z"/>
                    </svg>`
    };

    // Zwróć ikonę odpowiadającą kategorii lub ikonę domyślną
    return icons[category] || icons.other;
}

function saveState() {
    // Przygotuj obiekt z aktualnym stanem nawigacji
    const state = {
        current: currentFolder,  // Bieżący folder
        stack: folderStack       // Historia folderów
    };

    // Zapisz stan jako ciąg JSON w localStorage
    localStorage.setItem('folderState', JSON.stringify(state));
}

// ========== OPERACJE NA FOLDERACH ==========

async function loadFolderContents() {
    try {
        // Buduj endpoint w zależności od tego czy jesteśmy w folderze głównym
        const endpoint = currentFolder.id
            ? `/api/folders/${currentFolder.id}/contents`
            : '/api/folders/contents';

        // Pobierz dane z API z nagłówkiem autoryzacyjnym
        const response = await fetch(endpoint, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        // Obsłuż błędy HTTP
        if (!response.ok) throw new Error(`Błąd HTTP: ${response.status}`);

        // Przetwórz odpowiedź JSON i zaktualizuj UI
        const data = await response.json();
        renderItems(data);
        saveState(); // Zapisz aktualny stan nawigacji
    } catch (error) {
        console.error('Błąd ładowania zawartości:', error);
        alert('Nie udało się załadować zawartości folderu');
    }
}

function renderItems(data) {
    let html = '';

    // Generuj HTML dla folderów
    data.subfolders.forEach(folder => {
        html += `
        <div class="item-card">
            <div class="item-actions">
                <!-- Przyciski akcji z funkcjami obsługi zdarzeń -->
                <button onclick="renameFolder('${folder._id}')" title="Zmień nazwę">✏️</button>
                <button onclick="deleteFolder('${folder._id}')" title="Usuń">🗑️</button>
            </div>
            <!-- Obszar klikalny z dynamicznie wstrzykniętymi danymi -->
            <div onclick="enterFolder('${folder._id}', '${folder.name.replace(/'/g, "\\'")}')" 
                 style="cursor: pointer; text-align: center;" class="file-clickable">
                <div class="file-preview">${getFileIcon('folder')}</div>
                <div class="file-name">
                    ${folder.name}
                    <!-- Opcjonalny opis folderu -->
                    ${folder.description ? `<p class="folder-description">${folder.description}</p>` : ''}
                </div>
            </div>
        </div>`;
    });

    // Generuj HTML dla plików
    data.files.forEach(file => {
        const isImage = file.category === 'image';
        html += `
        <div class="item-card">
            <div class="item-actions">
                <button onclick="deleteFile('${file._id}')" title="Usuń">🗑️</button>
            </div>
            <!-- Obszar klikalny z różną zawartością dla obrazków -->
            <div style="text-align: center;" onclick="showFileDetails('${file._id}')" class="file-clickable">
                ${isImage
                ? `<img class="thumbnail" src="/uploads/${file.path}" alt="${file.originalName}">`
                : `<div class="file-preview">${getFileIcon(file.category)}</div>`
            }
                <div class="file-name">
                    ${file.originalName}
                </div>
            </div>
        </div>`;
    });

    // Aktualizuj zawartość strony lub pokaż komunikat o pustym folderze
    document.getElementById('itemsList').innerHTML = html || '<p class="empty-info">Brak zawartości w tym folderze</p>';
}

function enterFolder(folderId, folderName) {
    // Zapisz aktualny folder w historii
    folderStack.push({ ...currentFolder });

    // Zaktualizuj bieżący folder na nowy
    currentFolder = { id: folderId, name: folderName };

    // Odśwież elementy interfejsu
    updateBreadcrumbs();
    loadFolderContents();
}

// ========== BREADCRUMBS ==========

function updateBreadcrumbs() {
    // Generuj łańcuch breadcrumbs z historii folderów
    const breadcrumbs = folderStack
        .map((folder, index) =>
            // Dla każdego folderu w historii utwórz klikalny element
            `<span class="breadcrumb-item" onclick="navigateToIndex(${index})">${folder.name}</span>`
        )
        .join(' / '); // Łącz elementy separatorem

    // Aktualizuj HTML breadcrumbs z obecnym folderem na końcu
    document.getElementById('breadcrumbs').innerHTML = `
        ${breadcrumbs ? breadcrumbs + ' / ' : ''}
        <span class="current-folder" style="color: #666; cursor: default;">${currentFolder.name}</span>
    `;
}

function navigateToIndex(index) {
    // Obetnij historię do wybranego indeksu
    const newStack = folderStack.slice(0, index);
    // Pobierz odpowiadający folder z historii lub folder główny
    const newCurrent = index >= 0 ? folderStack[index] : { id: null, name: 'Główny' };

    // Aktualizuj stan aplikacji
    folderStack = newStack;
    currentFolder = newCurrent || { id: null, name: 'Główny' };

    // Odśwież widok i zapisz stan
    loadFolderContents();
    updateBreadcrumbs();
    saveState();
}

// ========== OPERACJE NA PLIKACH ==========

async function deleteFile(fileId) {
    if (!confirm('Usunąć ten plik?')) return;

    try {
        // Wyślij żądanie DELETE do API
        await fetch(`/api/files/${fileId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        loadFolderContents(); // Odśwież listę plików
    } catch (error) {
        console.error('Błąd usuwania:', error);
        alert('Nie udało się usunąć pliku');
    }
}

async function showFileDetails(fileId) {
    try {
        currentFileId = fileId; // Zapamiętaj ID pliku
        // Pobierz metadane pliku z API
        const response = await fetch(`/api/files/${fileId}/metadata`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (!response.ok) throw new Error('Błąd pobierania danych');

        const fileData = await response.json();
        renderFileModal(fileData); // Renderuj modal z danymi
    } catch (error) {
        console.error('Błąd:', error);
        alert('Nie udało się załadować danych pliku');
    }
}

function renderFileModal(file) {
    const modal = document.getElementById('fileModal');
    const preview = document.getElementById('filePreviewLarge');
    // Określ typ pliku dla odpowiedniego podglądu
    const isImage = file.category === 'image';
    const isVideo = file.category === 'video';
    const isAudio = file.category === 'audio';

    // Resetuj zawartość modala
    preview.innerHTML = '';
    document.getElementById('metadataFields').innerHTML = '';

    // Generuj odpowiedni podgląd pliku
    if (isImage) {
        preview.innerHTML = `<img src="/uploads/${file.path}" alt="${file.originalName}">`;
    } else if (isVideo) {
        preview.innerHTML = `
            <video controls>
                <source src="/uploads/${file.path}" type="${file.mimetype}">
                Przeglądarka nie obsługuje odtwarzania wideo.
            </video>
        `;
    } else if (isAudio) {
        preview.innerHTML = `
            <audio controls>
                <source src="/uploads/${file.path}" type="${file.mimetype}">
                Przeglądarka nie obsługuje odtwarzania audio.
            </audio>
        `;
    } else {
        preview.innerHTML = getFileIcon(file.category); // Ikona domyślna
    }

    // Wypełnij podstawowe informacje
    document.getElementById('fileName').textContent = file.originalName;
    document.getElementById('fileType').textContent = file.mimetype;
    document.getElementById('fileSize').textContent = formatFileSize(file.size);
    document.getElementById('fileDate').textContent = new Date(file.createdAt).toLocaleString();

    // Obsłuż metadane
    const metadataFields = document.getElementById('metadataFields');
    if (file.metadata && Object.keys(file.metadata).length > 0) {
        // Generuj edytowalne pola tylko dla obrazów
        Object.entries(file.metadata).forEach(([key, value]) => {
            const field = document.createElement('div');
            field.className = 'metadata-field';
            field.innerHTML = `
                <label>${key}:</label>
                <input type="text" name="${key}" value="${value || ''}" 
                    ${file.mimetype.startsWith('image/') ? '' : 'readonly'}>
            `;
            metadataFields.appendChild(field);
        });
    } else {
        metadataFields.innerHTML = '<p>Brak dostępnych metadanych</p>';
    }

    modal.style.display = 'block'; // Pokaż modal
}

function formatFileSize(bytes) {
    // Konwertuj bajty na czytelny format
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function saveMetadata(event) {
    event.preventDefault(); // Blokuj domyślną akcję formularza

    // Przygotuj dane metadanych z formularza
    const formData = new FormData(event.target);
    const metadata = Object.fromEntries(formData.entries());

    try {
        // Wyślij zaktualizowane metadane
        const response = await fetch(`/api/files/${currentFileId}/metadata`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(metadata)
        });

        if (!response.ok) throw new Error('Błąd zapisu metadanych');

        closeFileModal();
        alert('Metadane zostały zaktualizowane');
    } catch (error) {
        console.error('Błąd:', error);
        alert('Nie udało się zapisać metadanych: ' + error.message);
    }
}

function closeFileModal() {
    // Ukryj modal i zresetuj ID pliku
    document.getElementById('fileModal').style.display = 'none';
    currentFileId = null;
}

