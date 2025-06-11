// createSyncModal.js - Modal tworzenia synchronizacji Google Drive
let currentSyncFolderData = null;
let currentGoogleDrivePath = [];
let currentGoogleDriveFolderId = null;
let googleDriveFolders = [];

export async function showCreateSyncModal(folderId, folderName) {
    
    // Walidacja parametrów wejściowych
    if (!folderId || !folderName) {
        console.error('Nieprawidłowe parametry:', { folderId, folderName });
        alert('Błąd: Nieprawidłowe parametry folderu');
        return;
    }
    
    // Ustaw dane bieżącego folderu
    currentSyncFolderData = { id: folderId, name: folderName };
    currentGoogleDrivePath = [];
    currentGoogleDriveFolderId = null;
    googleDriveFolders = [];
    
    // Sprawdź czy użytkownik jest połączony z Google Drive
    const isConnected = await checkGoogleDriveConnection();
    if (!isConnected) {
        alert('Nie jesteś połączony z Google Drive. Połącz się najpierw z dyskiem Google.');
        return;
    }
    
    const modal = ensureCreateSyncModalExists();
    updateCreateSyncModalHeader(folderName);
    modal.style.display = 'block';
    
    await loadGoogleDriveFolders();
}

export function closeCreateSyncModal() {
    const modal = document.getElementById('createSyncModal');
    if (modal) {
        modal.style.display = 'none';
        resetModalState();
    }
}

// === SPRAWDZANIE POŁĄCZENIA Z GOOGLE DRIVE ===

async function checkGoogleDriveConnection() {
    try {
        const response = await apiRequest('/api/google-drive/status');
        const data = await response.json();
        return data.success && data.status.connected;
    } catch (error) {
        console.error('Błąd sprawdzania połączenia z Google Drive:', error);
        return false;
    }
}

// === TWORZENIE I ZARZĄDZANIE MODALEM ===

function ensureCreateSyncModalExists() {
    let modal = document.getElementById('createSyncModal');
    if (!modal) {
        modal = createSyncModalElement();
        document.body.appendChild(modal);
    }
    return modal;
}

function createSyncModalElement() {
    const modal = document.createElement('div');
    modal.id = 'createSyncModal';
    modal.className = 'modal create-sync-modal';
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3 id="createSyncModalTitle">Dodaj synchronizację Google Drive</h3>
                <button onclick="closeCreateSyncModal()" class="close-button">&times;</button>
            </div>
            
            <div class="create-sync-modal-body">
                <div class="sync-setup-section">
                    <h4>Ustawienia synchronizacji</h4>
                    
                    <div class="form-group">
                        <label for="syncFolderName">Folder serwera:</label>
                        <input type="text" id="syncFolderName" readonly class="readonly-input">
                    </div>
                    
                    <div class="form-group">
                        <label for="syncDirection">Kierunek synchronizacji:</label>
                        <select id="syncDirection">
                            <option value="bidirectional">Dwukierunkowa (zalecane)</option>
                            <option value="to-client">Tylko do Google Drive</option>
                            <option value="from-client">Tylko z Google Drive</option>
                        </select>
                    </div>
                </div>
                
                <div class="google-drive-section">
                    <h4>Wybierz folder Google Drive</h4>
                    
                    <div class="drive-navigation">
                        <div class="drive-breadcrumbs" id="driveBreadcrumbs">
                            <span class="breadcrumb-item active" onclick="navigateToGoogleDriveRoot()">
                                Mój dysk
                            </span>
                        </div>
                        
                        <div class="drive-actions">
                            <button onclick="createGoogleDriveFolder()" class="btn-secondary" id="createDriveFolderBtn">
                                Utwórz nowy folder
                            </button>
                            <button onclick="refreshGoogleDriveFolders()" class="btn-secondary">
                                Odśwież
                            </button>
                        </div>
                    </div>
                    
                    <div class="drive-folders" id="driveFolders">
                        <div class="loading">Ładowanie folderów...</div>
                    </div>
                    
                    <div class="selected-folder" id="selectedFolderInfo" style="display: none;">
                        <h5>Wybrany folder:</h5>
                        <div class="selected-folder-details">
                            <span id="selectedFolderName"></span>
                            <span id="selectedFolderPath" class="folder-path"></span>
                        </div>
                    </div>
                </div>
                
                <div class="create-folder-form" id="createFolderForm" style="display: none;">
                    <h5>Utwórz nowy folder</h5>
                    <div class="form-group">
                        <label for="newFolderName">Nazwa folderu:</label>
                        <input type="text" id="newFolderName" placeholder="Wprowadź nazwę folderu">
                    </div>
                    <div class="form-actions">
                        <button onclick="confirmCreateGoogleDriveFolder()" class="btn-primary">Utwórz</button>
                        <button onclick="cancelCreateGoogleDriveFolder()" class="btn-secondary">Anuluj</button>
                    </div>
                </div>
            </div>
            
            <div class="modal-footer">
                <button onclick="createSynchronization()" class="btn-primary" id="createSyncBtn" disabled>
                    Utwórz synchronizację
                </button>
                <button onclick="closeCreateSyncModal()" class="btn-secondary">Anuluj</button>
            </div>
        </div>
    `;
    
    return modal;
}

function updateCreateSyncModalHeader(folderName) {
    const title = document.getElementById('createSyncModalTitle');
    const folderInput = document.getElementById('syncFolderName');
    
    if (title) title.textContent = `Dodaj synchronizację Google Drive: ${folderName}`;
    if (folderInput) folderInput.value = folderName;
}

function resetModalState() {
    currentSyncFolderData = null;
    currentGoogleDrivePath = [];
    currentGoogleDriveFolderId = null;
    googleDriveFolders = [];
    
    const selectedFolderInfo = document.getElementById('selectedFolderInfo');
    const createSyncBtn = document.getElementById('createSyncBtn');
    const createFolderForm = document.getElementById('createFolderForm');
    
    if (selectedFolderInfo) selectedFolderInfo.style.display = 'none';
    if (createSyncBtn) createSyncBtn.disabled = true;
    if (createFolderForm) createFolderForm.style.display = 'none';
}

// === ŁADOWANIE I NAWIGACJA PO FOLDERACH GOOGLE DRIVE ===

async function loadGoogleDriveFolders(parentId = null) {
    const foldersContainer = document.getElementById('driveFolders');
    foldersContainer.innerHTML = '<div class="loading">Ładowanie folderów...</div>';
    
    try {
        const url = parentId ? `/api/google-drive/folders?parentId=${parentId}` : '/api/google-drive/folders';
        const response = await apiRequest(url);
        const data = await response.json();
        
        if (data.success) {
            googleDriveFolders = data.folders || [];
            renderGoogleDriveFolders();
        } else {
            throw new Error(data.message || 'Błąd ładowania folderów');
        }
    } catch (error) {
        console.error('Błąd ładowania folderów Google Drive:', error);
        showError(foldersContainer, `Błąd ładowania folderów: ${error.message}`);
    }
}

function renderGoogleDriveFolders() {
    const foldersContainer = document.getElementById('driveFolders');
    
    if (googleDriveFolders.length === 0) {
        foldersContainer.innerHTML = '<div class="empty-state">Brak folderów w tej lokalizacji</div>';
        return;
    }
    
    foldersContainer.innerHTML = googleDriveFolders.map(folder => createDriveFolderCard(folder)).join('');
}

function createDriveFolderCard(folder) {
    return `
        <div class="drive-folder-card" data-folder-id="${folder.id}" 
             onclick="enterGoogleDriveFolder('${folder.id}', '${escapeHtml(folder.name)}')">
            <div class="folder-icon">📁</div>
            <div class="folder-info">
                <div class="folder-name">${escapeHtml(folder.name)}</div>
                <div class="folder-meta">
                    <span class="folder-date">${formatDate(folder.modifiedTime)}</span>
                </div>
            </div>
            <div class="folder-actions">
                <button onclick="event.stopPropagation(); selectGoogleDriveFolder('${folder.id}', '${escapeHtml(folder.name)}')" 
                        class="btn-select">Wybierz</button>
            </div>
        </div>
    `;
}

// === NAWIGACJA PO FOLDERACH ===

async function enterGoogleDriveFolder(folderId, folderName) {
    // Dodaj do ścieżki
    currentGoogleDrivePath.push({ id: folderId, name: folderName });
    currentGoogleDriveFolderId = folderId;
    
    // Zaktualizuj breadcrumbs
    updateGoogleDriveBreadcrumbs();
    
    // Załaduj podfoldery
    await loadGoogleDriveFolders(folderId);
}

async function navigateToGoogleDriveRoot() {
    currentGoogleDrivePath = [];
    currentGoogleDriveFolderId = null;
    updateGoogleDriveBreadcrumbs();
    await loadGoogleDriveFolders();
}

async function navigateToGoogleDriveFolder(index) {
    // Usuń elementy ze ścieżki po podanym indeksie
    currentGoogleDrivePath = currentGoogleDrivePath.slice(0, index + 1);
    
    // Ustaw aktualny folder
    if (currentGoogleDrivePath.length > 0) {
        const lastFolder = currentGoogleDrivePath[currentGoogleDrivePath.length - 1];
        currentGoogleDriveFolderId = lastFolder.id;
    } else {
        currentGoogleDriveFolderId = null;
    }
    
    updateGoogleDriveBreadcrumbs();
    await loadGoogleDriveFolders(currentGoogleDriveFolderId);
}

function updateGoogleDriveBreadcrumbs() {
    const breadcrumbs = document.getElementById('driveBreadcrumbs');
    
    let breadcrumbsHtml = `
        <span class="breadcrumb-item ${currentGoogleDrivePath.length === 0 ? 'active' : ''}" 
              onclick="navigateToGoogleDriveRoot()">
            Mój dysk
        </span>
    `;
    
    currentGoogleDrivePath.forEach((folder, index) => {
        const isLast = index === currentGoogleDrivePath.length - 1;
        breadcrumbsHtml += `
            <span class="breadcrumb-separator">›</span>
            <span class="breadcrumb-item ${isLast ? 'active' : ''}" 
                  onclick="navigateToGoogleDriveFolder(${index})">
                ${escapeHtml(folder.name)}
            </span>
        `;
    });
    
    breadcrumbs.innerHTML = breadcrumbsHtml;
}

// === WYBIERANIE FOLDERU ===

function selectGoogleDriveFolder(folderId, folderName) {
    const selectedFolderInfo = document.getElementById('selectedFolderInfo');
    const selectedFolderName = document.getElementById('selectedFolderName');
    const selectedFolderPath = document.getElementById('selectedFolderPath');
    const createSyncBtn = document.getElementById('createSyncBtn');
    
    // Zapisz wybrany folder
    currentGoogleDriveFolderId = folderId;
    
    // Zbuduj pełną ścieżkę
    const fullPath = ['Mój dysk', ...currentGoogleDrivePath.map(f => f.name), folderName].join(' › ');
    
    // Zaktualizuj UI
    selectedFolderName.textContent = folderName;
    selectedFolderPath.textContent = fullPath;
    selectedFolderInfo.style.display = 'block';
    createSyncBtn.disabled = false;
    
    // Wizualne oznaczenie wybranego folderu
    document.querySelectorAll('.drive-folder-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    const selectedCard = document.querySelector(`[data-folder-id="${folderId}"]`);
    if (selectedCard) {
        selectedCard.classList.add('selected');
    }
}

// === TWORZENIE NOWEGO FOLDERU ===

function createGoogleDriveFolder() {
    const createFolderForm = document.getElementById('createFolderForm');
    const newFolderName = document.getElementById('newFolderName');
    
    createFolderForm.style.display = 'block';
    newFolderName.value = '';
    newFolderName.focus();
}

async function confirmCreateGoogleDriveFolder() {
    const newFolderName = document.getElementById('newFolderName').value.trim();
    
    if (!newFolderName) {
        alert('Wprowadź nazwę folderu');
        return;
    }
    
    try {
        const response = await apiRequest('/api/google-drive/folders', {
            method: 'POST',
            body: JSON.stringify({
                name: newFolderName,
                parentId: currentGoogleDriveFolderId
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            cancelCreateGoogleDriveFolder();
            await refreshGoogleDriveFolders();
            showSuccess('Folder utworzony pomyślnie');
        } else {
            throw new Error(data.message || 'Błąd tworzenia folderu');
        }
    } catch (error) {
        console.error('Błąd tworzenia folderu:', error);
        alert(`Błąd tworzenia folderu: ${error.message}`);
    }
}

function cancelCreateGoogleDriveFolder() {
    const createFolderForm = document.getElementById('createFolderForm');
    createFolderForm.style.display = 'none';
}

// === ODŚWIEŻANIE FOLDERÓW ===

async function refreshGoogleDriveFolders() {
    await loadGoogleDriveFolders(currentGoogleDriveFolderId);
}

// === TWORZENIE SYNCHRONIZACJI ===

async function createSynchronization() {
    // Sprawdź czy wszystkie wymagane dane są dostępne
    if (!currentSyncFolderData || !currentSyncFolderData.id) {
        console.error('Brak danych folderu serwera:', currentSyncFolderData);
        alert('Błąd: Brak danych folderu serwera. Spróbuj ponownie otworzyć modal.');
        return;
    }
    
    if (!currentGoogleDriveFolderId) {
        console.error('Brak ID folderu Google Drive:', currentGoogleDriveFolderId);
        alert('Wybierz folder Google Drive');
        return;
    }
    
    const syncDirection = document.getElementById('syncDirection')?.value;
    const selectedFolderName = document.getElementById('selectedFolderName')?.textContent;
    
    if (!syncDirection) {
        alert('Błąd: Nie można odczytać kierunku synchronizacji');
        return;
    }
    
    if (!selectedFolderName) {
        alert('Błąd: Nie można odczytać nazwy wybranego folderu');
        return;
    }
    
    // POPRAWKA: Zapisz dane przed zamknięciem modalu
    const folderDataForRefresh = {
        id: currentSyncFolderData.id,
        name: currentSyncFolderData.name
    };
    
    try {
        const response = await apiRequest('/api/google-drive/sync/folder', {
            method: 'POST',
            body: JSON.stringify({
                folderId: currentSyncFolderData.id,
                driveFolderId: currentGoogleDriveFolderId,
                driveFolderName: selectedFolderName,
                syncDirection: syncDirection
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showSuccess('Synchronizacja utworzona pomyślnie');
            closeCreateSyncModal();
            
            // POPRAWKA: Użyj zapisanych danych zamiast currentSyncFolderData
            const syncModal = document.getElementById('syncModal');
            if (syncModal && syncModal.style.display === 'block') {
                if (window.refreshSyncList) {
                    await window.refreshSyncList(folderDataForRefresh.id);
                } else {
                    console.warn('Funkcja refreshSyncList nie jest dostępna, próbuję alternatywny sposób');
                    window.dispatchEvent(new CustomEvent('syncCreated', { 
                        detail: { folderId: folderDataForRefresh.id } 
                    }));
                }
            }
        } else {
            throw new Error(data.message || 'Błąd tworzenia synchronizacji');
        }
    } catch (error) {
        console.error('Błąd tworzenia synchronizacji:', error);
        alert(`Błąd tworzenia synchronizacji: ${error.message}`);
    }
}

// === FUNKCJE POMOCNICZE ===

async function apiRequest(url, options = {}) {
    const defaultOptions = {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
        }
    };
    
    const response = await fetch(url, { ...defaultOptions, ...options });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
    }
    
    return response;
}

function showError(container, message) {
    container.innerHTML = `<div class="error">${message}</div>`;
}

function showSuccess(message) {
    // Można zastąpić bardziej zaawansowanym systemem powiadomień
    alert(message);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('pl-PL');
}

// === EKSPORT FUNKCJI GLOBALNYCH ===

window.closeCreateSyncModal = closeCreateSyncModal;
window.enterGoogleDriveFolder = enterGoogleDriveFolder;
window.navigateToGoogleDriveRoot = navigateToGoogleDriveRoot;
window.navigateToGoogleDriveFolder = navigateToGoogleDriveFolder;
window.selectGoogleDriveFolder = selectGoogleDriveFolder;
window.createGoogleDriveFolder = createGoogleDriveFolder;
window.confirmCreateGoogleDriveFolder = confirmCreateGoogleDriveFolder;
window.cancelCreateGoogleDriveFolder = cancelCreateGoogleDriveFolder;
window.refreshGoogleDriveFolders = refreshGoogleDriveFolders;
window.createSynchronization = createSynchronization;