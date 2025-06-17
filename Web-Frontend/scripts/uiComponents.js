import { currentFolder, folderStack, innerFolders } from './main.js';
import { buildPathTo } from './folderNavigation.js';

export function getFileIcon(category) {
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

export function saveState() {
    // Przygotuj obiekt z aktualnym stanem nawigacji
    const state = {
        current: currentFolder,  // Bieżący folder
        stack: folderStack,       // Historia folderów
        folderChildren: Array.from(innerFolders.entries())
    };

    // Zapisz stan jako ciąg JSON w localStorage
    localStorage.setItem('folderState', JSON.stringify(state));
}

export function renderItems(data) {
    let html = '';
    let html_dirs = '';
    let currentInnerFolders = [];

    // Generuj HTML dla folderów
    data.subfolders.forEach(folder => {
        html_dirs += ` 
        <div class="item-card" data-folder-id="${folder._id}">
            <div class="item-actions">
                <!-- Przyciski akcji z funkcjami obsługi zdarzeń -->
                <button onclick="downloadFolder('${folder._id}')" title="Pobierz" class="item-download-folder">⬇️</button>
                <button class="item-button" onclick="renameFolder('${folder._id}')" title="Zmień nazwę">✏️</button>
                <button class="item-button" onclick="showSyncModal('${folder._id}', '${folder.name.replace(/'/g, "\\'")}')" title="Synchronizacja">🔄</button>
                <button class="item-button" onclick="deleteFolder('${folder._id}')" title="Usuń">🗑️</button>
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
        folder.id = folder._id;
        folder.name.replace(/'/g, "\\'");
        currentInnerFolders.push(folder);
    });

    innerFolders.set(currentFolder.id, currentInnerFolders);

    // Generuj HTML dla plików
    data.files.forEach(file => {
        const isImage = file.category === 'image';
        html += `
        <div class="item-card">
            <div class="item-actions">
                <button onclick="downloadFile('${file._id}')" title="Pobierz" class="item-download-item">⬇️</button>
                <button onclick="renameFile('${file._id}')" title="Zmień nazwę" class="item-button">✏️</button>
                <button onclick="deleteFile('${file._id}')" title="Usuń" class="item-button">🗑️</button>
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
    document.getElementById('dirsList').innerHTML = html_dirs || '<p class="empty-info">Brak folderów</p>';
    updateTree();
}

export function updateBreadcrumbs() {
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

export function formatFileSize(bytes) {
    // Konwertuj bajty na czytelny format
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function renderTree(parentFolder = null, depth = 0) {
    const folders = innerFolders.get(parentFolder) || [];
    const container = document.createElement("div");

    if (parentFolder === null) {
        const isActive = null === currentFolder.id;
        const inCurrentPath = true; // Folder Główny jest folderem nadrzędnym każdego folderu

        const folderDiv = document.createElement("div");
        folderDiv.className = "folder" + (isActive ? " active" : "");
        folderDiv.textContent = 'Główny';
        folderDiv.style.marginLeft = `${depth * 20}px`;
        folderDiv.onclick = () => { window.navigateToIndex(0); }
        container.appendChild(folderDiv);
    }

    for (const folder of folders) {
        const isActive = folder.id === currentFolder.id;
        const inCurrentPath = folderStack.some(f => f.id === folder.id);

        const folderDiv = document.createElement("div");
        folderDiv.className = "folder" + (isActive ? " active" : "");
        folderDiv.textContent = folder.name;
        folderDiv.style.marginLeft = `${(depth + 1) * 20}px`;

        folderDiv.onclick = () => {
            const indexInStack = folderStack.findIndex(f => f.id === folder.id);

            if (indexInStack !== -1) {
                window.navigateToIndex(indexInStack); // nadrzędny
            } else {
                const path = buildPathTo(folder.id); // budujemy poprawną ścieżkę
                const fullPath = [{ id: null, name: "Główny" }, ...path];
                if (fullPath.length) {
                    // Wyczyść obecny stos folderów
                    folderStack.length = 0;
                    // Dodaj wszystkie foldery z ścieżki oprócz ostatniego
                    const pathWithoutLast = fullPath.slice(0, -1);
                    pathWithoutLast.forEach(item => folderStack.push(item));

                    // Ustaw aktualny folder na ostatni element ścieżki
                    currentFolder.id = fullPath[fullPath.length - 1].id;
                    currentFolder.name = fullPath[fullPath.length - 1].name;
                    updateBreadcrumbs();
                    window.loadFolderContents();
                    updateTree();
                } else {
                    console.warn('Nie znaleziono ścieżki do folderu:', folder);
                }
            }
        };

        container.appendChild(folderDiv);

        // rozwijamy tylko ścieżkę do aktywnego folderu
        if (inCurrentPath || isActive) {
            container.appendChild(renderTree(folder.id, depth + 1));
        }
    }

    return container;
}

export function updateTree() {
    const treeContainer = document.getElementById("folderTree");
    treeContainer.innerHTML = '';
    treeContainer.appendChild(renderTree());
}

export function updateSyncIndicator(folderId, isSync) {
    const folderCards = document.querySelectorAll(`[data-folder-id="${folderId}"]`);
    folderCards.forEach(card => {
        const indicator = card.querySelector('.sync-indicator');
        if (isSync && !indicator) {
            const syncEl = document.createElement('p');
            syncEl.className = 'sync-indicator';
            syncEl.textContent = '🔄 Synchronizowany';
            card.querySelector('.file-name').appendChild(syncEl);
        } else if (!isSync && indicator) {
            indicator.remove();
        }
    });
}

export function setupDropdown(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    const button = dropdown.querySelector('.dropdown-button');
    const content = dropdown.querySelector('.dropdown-content');

    button.addEventListener('click', () => {
        const isOpen = content.classList.contains('show');
        closeAllDropdowns();
        if (!isOpen) {
            content.classList.add('show');
        }
    });

    function updateButtonText() {
        const checkboxes = content.querySelectorAll('input[type="checkbox"]');
        const selected = Array.from(checkboxes).filter(chk => chk.checked);
        const labelSpan = button.querySelector('.label');

        if (selected.length === 0) {
            labelSpan.textContent = button.dataset.placeholder.replace('▼', '').trim() || "Wybierz opcje";
        } else if (selected.length === 1) {
            labelSpan.textContent = selected[0].parentElement.textContent.trim();
        } else {
            labelSpan.textContent = `${selected.length} wybrane`;
        }
    }

    // Delegacja eventu zamiast podpinania do każdego checkboxa osobno
    content.addEventListener('change', (event) => {
        if (event.target.matches('input[type="checkbox"]')) {
            updateButtonText();
        }
    });

    button.dataset.placeholder = button.textContent;
    updateButtonText();
}

function closeAllDropdowns() {
    document.querySelectorAll('.dropdown-content.show').forEach(dropdown => {
        dropdown.classList.remove('show');
    });
}

document.addEventListener('click', (event) => {
    if (!event.target.closest('.dropdown')) {
        closeAllDropdowns();
    }
});

