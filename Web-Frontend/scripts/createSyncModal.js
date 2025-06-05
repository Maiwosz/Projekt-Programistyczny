// createSyncModal.js - nowy plik w folderze scripts/

let currentFolderForSync = null;
let googleDriveFolders = [];
let selectedDriveFolder = null;
let currentParent = 'root'; // Dodaj śledzenie aktualnego folderu nadrzędnego
let folderHistory = []; // Historia nawigacji

// Funkcja otwierająca modal dodawania synchronizacji
async function showCreateSyncModal(folderId, folderName) {
    currentFolderForSync = { id: folderId, name: folderName };
    
    // Sprawdź połączenie z Google Drive
    try {
        const response = await fetch('/api/google-drive/status', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const status = await response.json();
        
        if (!status.connected) {
            alert('Aby utworzyć synchronizację z Google Drive, musisz najpierw połączyć swoje konto. Przejdź do ustawień profilu.');
            return;
        }
        
        // Otwórz modal i załaduj foldery Google Drive
        document.getElementById('createSyncModal').style.display = 'flex';
        document.getElementById('syncLocalFolderName').textContent = folderName;
        
        loadGoogleDriveFolders();
        
    } catch (error) {
        console.error('Błąd sprawdzania statusu Google Drive:', error);
        alert('Nie udało się sprawdzić połączenia z Google Drive');
    }
}

// Funkcja ładująca foldery z Google Drive
async function loadGoogleDriveFolders(parentId = 'root') {
    const loadingDiv = document.getElementById('driveFoldersLoading');
    const foldersList = document.getElementById('driveFoldersList');
    
    console.log('Ładowanie folderów dla parentId:', parentId);
    
    loadingDiv.style.display = 'block';
    foldersList.style.display = 'none';
    
    try {
        const response = await fetch(`/api/google-drive/folders?parentId=${encodeURIComponent(parentId)}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Błąd podczas pobierania folderów z Google Drive');
        }
        
        const data = await response.json();
        console.log('Otrzymane foldery:', data.folders);
        
        googleDriveFolders = data.folders || [];
        renderDriveFolders(googleDriveFolders, parentId);
        
    } catch (error) {
        console.error('Błąd ładowania folderów Google Drive:', error);
        loadingDiv.style.display = 'none';
        foldersList.innerHTML = `<div class="error-message">Błąd: ${error.message}</div>`;
        foldersList.style.display = 'block';
    }
}

// Funkcja renderująca foldery Google Drive
function renderDriveFolders(folders, currentParentId) {
    const foldersList = document.getElementById('driveFoldersList');
    const loadingDiv = document.getElementById('driveFoldersLoading');
    const breadcrumbs = document.getElementById('driveBreadcrumbs');
    
    currentParent = currentParentId; // Zapisz aktualny folder
    
    let html = '';
    
    // Dodaj opcję powrotu do folderu nadrzędnego (jeśli nie jesteśmy w root)
    if (currentParentId !== 'root') {
        html += `
            <div class="drive-folder-item back-folder" onclick="goBackInDrive()">
                <span>📁 ← Wróć do folderu nadrzędnego</span>
            </div>
        `;
    }
    
    // Dodaj opcję wyboru aktualnego folderu
    const currentFolderName = currentParentId === 'root' ? 'Główny folder (Root)' : 'Aktualny folder';
    const isCurrentSelected = selectedDriveFolder?.id === currentParentId;
    
    html += `
        <div class="drive-folder-item current-folder ${isCurrentSelected ? 'selected' : ''}" 
             onclick="selectDriveFolder('${currentParentId}', '${currentFolderName}')">
            <span>📂 Wybierz ten folder (${currentFolderName})</span>
            ${isCurrentSelected ? '<span class="selected-indicator">✓</span>' : ''}
        </div>
    `;
    
    // Renderuj foldery podrzędne
    folders.forEach(folder => {
        const isSelected = selectedDriveFolder?.id === folder.id;
        // Escapuj apostrofy w nazwie folderu
        const escapedName = folder.name.replace(/'/g, "\\'").replace(/"/g, '\\"');
        
        html += `
            <div class="drive-folder-item ${isSelected ? 'selected' : ''}" 
                 data-folder-id="${folder.id}">
                <span class="folder-name" onclick="event.stopPropagation(); openDriveFolder('${folder.id}', '${escapedName}')">
                    📁 ${folder.name}
                </span>
                <div class="folder-actions">
                    <button class="select-folder-btn" onclick="event.stopPropagation(); selectDriveFolder('${folder.id}', '${escapedName}')">
                        ${isSelected ? '✓ Wybrany' : 'Wybierz'}
                    </button>
                </div>
                ${isSelected ? '<span class="selected-indicator">✓</span>' : ''}
            </div>
        `;
    });
    
    if (folders.length === 0 && currentParentId === 'root') {
        html += '<div class="no-folders">Brak folderów w Google Drive</div>';
    }
    
    foldersList.innerHTML = html;
    loadingDiv.style.display = 'none';
    foldersList.style.display = 'block';
    
    // Zaktualizuj breadcrumbs
    updateBreadcrumbs(currentParentId);
}

// Nowa funkcja aktualizacji breadcrumbs
function updateBreadcrumbs(currentParentId) {
    const breadcrumbs = document.getElementById('driveBreadcrumbs');
    
    if (currentParentId === 'root') {
        breadcrumbs.innerHTML = '📁 Google Drive / Główny folder';
    } else {
        // W pełnej implementacji tutaj byłaby pełna ścieżka
        breadcrumbs.innerHTML = '📁 Google Drive / ... / Aktualny folder';
    }
}

// Funkcja otwierająca folder w Google Drive
function openDriveFolder(folderId, folderName) {
    // Dodaj do historii nawigacji
    folderHistory.push({
        id: currentParent,
        name: currentParent === 'root' ? 'Root' : 'Parent'
    });
    
    console.log('Otwieranie folderu:', folderId, folderName);
    loadGoogleDriveFolders(folderId);
}
// Funkcja powrotu do folderu nadrzędnego
function goBackInDrive() {
    if (folderHistory.length > 0) {
        const parent = folderHistory.pop();
        loadGoogleDriveFolders(parent.id);
    } else {
        loadGoogleDriveFolders('root');
    }
}

// Funkcja wybierania folderu Google Drive
function selectDriveFolder(folderId, folderName) {
    console.log('Wybieranie folderu:', folderId, folderName);
    
    selectedDriveFolder = { 
        id: folderId, 
        name: folderName 
    };
    
    // Usuń poprzednie zaznaczenia
    const allFolderItems = document.querySelectorAll('.drive-folder-item');
    allFolderItems.forEach(item => {
        item.classList.remove('selected');
        const indicator = item.querySelector('.selected-indicator');
        if (indicator) {
            indicator.remove();
        }
        // Aktualizuj przyciski
        const selectBtn = item.querySelector('.select-folder-btn');
        if (selectBtn) {
            selectBtn.textContent = 'Wybierz';
            selectBtn.classList.remove('selected');
        }
    });
    
    // Zaznacz wybrany element
    const selectedItem = document.querySelector(`[data-folder-id="${folderId}"]`) || 
                        document.querySelector(`[onclick*="selectDriveFolder('${folderId}'"]`);
    
    if (selectedItem) {
        selectedItem.classList.add('selected');
        selectedItem.innerHTML += '<span class="selected-indicator">✓</span>';
        
        const selectBtn = selectedItem.querySelector('.select-folder-btn');
        if (selectBtn) {
            selectBtn.textContent = '✓ Wybrany';
            selectBtn.classList.add('selected');
        }
    }
    
    // Pokaż informacje o wybranym folderze
    document.getElementById('createSyncButton').style.display = 'block';
    document.getElementById('selectedDriveFolderInfo').innerHTML = 
        `<strong>Wybrany folder:</strong> ${folderName} <span style="color: #666;">(ID: ${folderId})</span>`;
    
    console.log('Folder wybrany:', selectedDriveFolder);
}

// Funkcja tworząca synchronizację
async function createSyncConfiguration() {
    if (!currentFolderForSync || !selectedDriveFolder) {
        alert('Wybierz folder na Google Drive');
        return;
    }
    
    // ZAPISZ DANE PRZED ZAMKNIĘCIEM MODALA
    const folderData = {
        id: currentFolderForSync.id,
        name: currentFolderForSync.name
    };
    
    try {
        // Zbierz ustawienia z formularza
        const syncDirection = document.getElementById('newSyncDirection').value;
        const isActive = document.getElementById('newSyncActive').checked;
        const clientFolderName = document.getElementById('newSyncFolderName').value || currentFolderForSync.name;
        
        // Filtry - POPRAWIONE TWORZENIE OBIEKTU
        const filters = {};
        
        const maxFileSize = document.getElementById('newSyncMaxFileSize').value;
        if (maxFileSize && maxFileSize.trim() !== '') {
            filters.maxFileSize = parseInt(maxFileSize) * 1024 * 1024; // MB na bajty
        }
        
        const allowedExtensions = document.getElementById('newSyncAllowedExt').value;
        if (allowedExtensions && allowedExtensions.trim() !== '') {
            filters.allowedExtensions = allowedExtensions
                .split(',')
                .map(ext => ext.trim())
                .filter(ext => ext.length > 0);
        }
        
        const excludedExtensions = document.getElementById('newSyncExcludedExt').value;
        if (excludedExtensions && excludedExtensions.trim() !== '') {
            filters.excludedExtensions = excludedExtensions
                .split(',')
                .map(ext => ext.trim())
                .filter(ext => ext.length > 0);
        }
        
        // Przygotuj dane do wysłania z prawidłowym driveFolderId
        const requestData = {
            folderId: folderData.id,
            driveFolderId: selectedDriveFolder.id, // KRYTYCZNE: użyj ID wybranego folderu
            syncDirection: syncDirection,
            isActive: isActive,
            clientFolderName: clientFolderName,
            filters: Object.keys(filters).length > 0 ? filters : null
        };
        
        console.log('Wysyłam dane synchronizacji:', requestData); // DEBUG
        console.log('Wybrany folder Google Drive:', selectedDriveFolder); // DEBUG
        
        // Wyślij żądanie utworzenia synchronizacji
        const response = await fetch('/api/google-drive/setup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Błąd podczas tworzenia synchronizacji');
        }
        
        const result = await response.json();
        console.log('Odpowiedź serwera:', result); // DEBUG
        
        alert('Synchronizacja z Google Drive została utworzona pomyślnie!');
        closeCreateSyncModal();
        
        // Odśwież modal synchronizacji używając zapisanych danych
        if (document.getElementById('syncModal').style.display === 'flex') {
            showSyncModal(folderData.id, folderData.name);
        }
        
    } catch (error) {
        console.error('Błąd tworzenia synchronizacji:', error);
        alert('Nie udało się utworzyć synchronizacji: ' + error.message);
    }
}

// Funkcja zamykająca modal
function closeCreateSyncModal() {
    document.getElementById('createSyncModal').style.display = 'none';
    currentFolderForSync = null;
    googleDriveFolders = [];
    selectedDriveFolder = null;
    currentParent = 'root';
    folderHistory = []; // Wyczyść historię nawigacji
    
    // Resetuj formularz
    document.getElementById('newSyncDirection').value = 'bidirectional';
    document.getElementById('newSyncActive').checked = true;
    document.getElementById('newSyncFolderName').value = '';
    document.getElementById('newSyncMaxFileSize').value = '';
    document.getElementById('newSyncAllowedExt').value = '';
    document.getElementById('newSyncExcludedExt').value = '';
    document.getElementById('createSyncButton').style.display = 'none';
    document.getElementById('selectedDriveFolderInfo').innerHTML = '';
}

export { 
    showCreateSyncModal, 
    closeCreateSyncModal, 
    createSyncConfiguration,
    loadGoogleDriveFolders,
    selectDriveFolder,
    openDriveFolder,
    goBackInDrive
};