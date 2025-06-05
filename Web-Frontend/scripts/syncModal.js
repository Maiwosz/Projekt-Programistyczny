// syncModal.js - zaktualizowany z przyciskiem dodawania synchronizacji

import { showCreateSyncModal } from './createSyncModal.js';

let currentSyncData = null;
let currentEditingSync = null;

// Funkcja otwierająca modal synchronizacji
async function showSyncModal(folderId, folderName) {
    document.getElementById('syncFolderName').textContent = folderName;
    document.getElementById('syncModal').style.display = 'flex';
    
    // Pokaż loading
    document.getElementById('syncLoading').style.display = 'block';
    document.getElementById('syncList').style.display = 'none';
    document.getElementById('noSyncData').style.display = 'none';
    
    // Sprawdź czy addSyncSection istnieje i ukryj
    const addSyncSection = document.getElementById('addSyncSection');
    if (addSyncSection) {
        addSyncSection.style.display = 'none';
    }
    
    try {
        const response = await fetch(`/api/sync/folders/${folderId}/sync`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (response.status === 404) {
            // Brak synchronizacji dla tego folderu
            document.getElementById('syncLoading').style.display = 'none';
            document.getElementById('noSyncData').style.display = 'block';
            
            // Sprawdź czy Google Drive jest dostępne
            await checkGoogleDriveAvailability(folderId, folderName);
            return;
        }
        
        if (!response.ok) {
            throw new Error('Błąd podczas pobierania danych synchronizacji');
        }
        
        const syncData = await response.json();
        currentSyncData = syncData;
        
        renderSyncList(syncData);
        
        // Sprawdź czy można dodać Google Drive sync
        await checkGoogleDriveAvailability(folderId, folderName);
        
        // Upewnij się, że addSyncSection istnieje
        ensureAddSyncSectionExists();
        
    } catch (error) {
        console.error('Błąd:', error);
        alert('Nie udało się załadować danych synchronizacji: ' + error.message);
        closeSyncModal();
    }
}

// Nowa funkcja pomocnicza do tworzenia sekcji addSync
function ensureAddSyncSectionExists() {
    const syncModal = document.getElementById('syncModal');
    let addSyncSection = document.getElementById('addSyncSection');

    if (!addSyncSection) {
        addSyncSection = document.createElement('div');
        addSyncSection.id = 'addSyncSection';
        addSyncSection.style.display = 'none';
        
        // Znajdź miejsce do wstawienia - przed modal-footer
        const modalFooter = syncModal.querySelector('.modal-footer');
        if (modalFooter) {
            modalFooter.parentNode.insertBefore(addSyncSection, modalFooter);
        } else {
            // Jeśli nie ma modal-footer, dodaj na końcu modal-content
            const modalContent = syncModal.querySelector('.modal-content');
            if (modalContent) {
                modalContent.appendChild(addSyncSection);
            } else {
                // Fallback - dodaj bezpośrednio do syncModal
                syncModal.appendChild(addSyncSection);
            }
        }
    }
}

// Funkcja sprawdzająca dostępność Google Drive
async function checkGoogleDriveAvailability(folderId, folderName) {
    try {
        const response = await fetch('/api/google-drive/status', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const status = await response.json();
        
        if (status.connected) {
            // Sprawdź czy już nie ma synchronizacji z Google Drive
            const hasGoogleDriveSync = currentSyncData?.clients?.some(
                clientConfig => clientConfig.client.type === 'google-drive'
            );
            
            if (!hasGoogleDriveSync) {
                showAddSyncSection(folderId, folderName);
            }
        }
        
    } catch (error) {
        console.error('Błąd sprawdzania statusu Google Drive:', error);
    }
}

// Funkcja pokazująca sekcję dodawania synchronizacji
function showAddSyncSection(folderId, folderName) {
    ensureAddSyncSectionExists(); // Upewnij się, że element istnieje
    
    const addSyncSection = document.getElementById('addSyncSection');
    addSyncSection.innerHTML = `
        <div class="add-sync-header">
            <h4>Dodaj nową synchronizację</h4>
        </div>
        <div class="add-sync-options">
            <button onclick="addGoogleDriveSync('${folderId}', '${folderName}')" class="add-sync-button">
                <span class="sync-icon">📁</span>
                Dodaj synchronizację z Google Drive
            </button>
        </div>
    `;
    addSyncSection.style.display = 'block';
}

// Funkcja dodająca synchronizację z Google Drive
function addGoogleDriveSync(folderId, folderName) {
    showCreateSyncModal(folderId, folderName);
}

function renderSyncList(syncData) {
    const syncList = document.getElementById('syncList');
    
    if (!syncData.clients || syncData.clients.length === 0) {
        document.getElementById('syncLoading').style.display = 'none';
        document.getElementById('noSyncData').style.display = 'block';
        return;
    }
    
    let html = '';
    
    syncData.clients.forEach((clientConfig, index) => {
        // Bezpieczne odczytywanie danych klienta
        const client = clientConfig.client || {};
        const clientName = client.name || clientConfig.clientId || 'Nieznany klient';
        const clientType = client.type || 'unknown';
        const isActive = clientConfig.isActive !== undefined ? clientConfig.isActive : true;
        const direction = clientConfig.syncDirection || 'bidirectional';
        const lastSeen = client.lastSeen || clientConfig.lastSyncDate || null;
        
        // Debug: wyloguj dane klienta aby zobaczyć strukturę
        console.log('Client config:', clientConfig);
        
        html += `
            <div class="sync-item" onclick="showSyncDetails(${index})">
                <div class="sync-header">
                    <div>
                        <div class="sync-client-name">${clientName}</div>
                        <span class="sync-client-type ${clientType}">${clientType}</span>
                    </div>
                    <div class="sync-status ${isActive ? 'active' : 'inactive'}">
                        ${isActive ? '● Aktywna' : '○ Nieaktywna'}
                    </div>
                </div>
                
                <div class="sync-details">
                    <div><strong>Kierunek:</strong> 
                        <span class="sync-direction ${direction}">${getSyncDirectionLabel(direction)}</span>
                    </div>
                    <div><strong>Ścieżka klienta:</strong> ${clientConfig.clientFolderPath || 'Brak'}</div>
                    <div><strong>Nazwa folderu:</strong> ${clientConfig.clientFolderName || 'Brak nazwy'}</div>
                    <div><strong>Ostatnia aktywność:</strong> ${formatDate(lastSeen)}</div>
                </div>
            </div>
        `;
    });
    
    syncList.innerHTML = html;
    
    document.getElementById('syncLoading').style.display = 'none';
    document.getElementById('syncList').style.display = 'block';
}

function getSyncDirectionLabel(direction) {
    const labels = {
        'bidirectional': 'Dwukierunkowa',
        'to-client': 'Do klienta',
        'from-client': 'Od klienta'
    };
    return labels[direction] || direction;
}

function showSyncDetails(clientIndex) {
    if (!currentSyncData || !currentSyncData.clients[clientIndex]) {
        alert('Błąd: Nie można załadować szczegółów synchronizacji');
        return;
    }
    
    currentEditingSync = {
        ...currentSyncData.clients[clientIndex],
        index: clientIndex
    };
    
    renderSyncDetailsModal(currentEditingSync);
    document.getElementById('syncDetailsModal').style.display = 'flex';
}

function renderSyncDetailsModal(syncConfig) {
    const client = syncConfig.client;
    const content = document.getElementById('syncDetailsContent');
    
    // Przygotuj listę rozszerzeń dla filtrów
    const allowedExtensions = syncConfig.filters?.allowedExtensions || [];
    const excludedExtensions = syncConfig.filters?.excludedExtensions || [];
    
    content.innerHTML = `
        <div class="sync-form-group">
            <label>Klient:</label>
            <input type="text" value="${client.name} (${client.type})" disabled>
        </div>
        
        <div class="sync-form-group">
            <label for="clientFolderName">Nazwa folderu w kliencie:</label>
            <input type="text" id="clientFolderName" value="${syncConfig.clientFolderName}">
        </div>
        
        <div class="sync-form-group">
            <label for="clientFolderPath">Ścieżka w kliencie:</label>
            <input type="text" id="clientFolderPath" value="${syncConfig.clientFolderPath || ''}" 
                   placeholder="np. /home/user/documents">
        </div>
        
        <div class="sync-form-group">
            <label for="syncDirection">Kierunek synchronizacji:</label>
            <select id="syncDirection">
                <option value="bidirectional" ${syncConfig.syncDirection === 'bidirectional' ? 'selected' : ''}>
                    Dwukierunkowa
                </option>
                <option value="to-client" ${syncConfig.syncDirection === 'to-client' ? 'selected' : ''}>
                    Tylko do klienta
                </option>
                <option value="from-client" ${syncConfig.syncDirection === 'from-client' ? 'selected' : ''}>
                    Tylko od klienta
                </option>
            </select>
        </div>
        
        <div class="sync-form-group">
            <label>
                <input type="checkbox" id="isActive" ${syncConfig.isActive ? 'checked' : ''}> 
                Synchronizacja aktywna
            </label>
        </div>
        
        <div class="sync-filters">
            <h4>Filtry plików</h4>
            
            <div class="sync-form-group">
                <label for="maxFileSize">Maksymalny rozmiar pliku (MB):</label>
                <input type="number" id="maxFileSize" 
                       value="${syncConfig.filters?.maxFileSize ? Math.round(syncConfig.filters.maxFileSize / (1024*1024)) : ''}" 
                       placeholder="Bez limitu">
            </div>
            
            <div class="sync-form-group">
                <label>Dozwolone rozszerzenia (oddzielone przecinkami):</label>
                <textarea id="allowedExtensions" 
                          placeholder="np. .jpg, .png, .pdf">${allowedExtensions.join(', ')}</textarea>
                <small>Pozostaw puste, aby dozwolić wszystkie rozszerzenia</small>
            </div>
            
            <div class="sync-form-group">
                <label>Wykluczone rozszerzenia (oddzielone przecinkami):</label>
                <textarea id="excludedExtensions" 
                          placeholder="np. .tmp, .log">${excludedExtensions.join(', ')}</textarea>
                <small>Mają priorytet nad dozwolonymi rozszerzeniami</small>
            </div>
        </div>
        
        <div style="margin-top: 20px; padding: 10px; background: #f8f9fa; border-radius: 4px;">
            <strong>Informacje o kliencie:</strong><br>
            <small>ID: ${client.clientId}</small><br>
            <small>Ostatnia aktywność: ${formatDate(client.lastSeen)}</small><br>
            <small>Status: ${client.isActive ? 'Aktywny' : 'Nieaktywny'}</small>
        </div>
    `;
}

async function saveSyncChanges() {
    if (!currentEditingSync || !currentSyncData) {
        alert('Błąd: Brak danych do zapisania');
        return;
    }
    
    try {
        // Zbierz dane z formularza
        const updatedConfig = {
            clientFolderName: document.getElementById('clientFolderName').value,
            clientFolderPath: document.getElementById('clientFolderPath').value,
            syncDirection: document.getElementById('syncDirection').value,
            isActive: document.getElementById('isActive').checked,
            filters: {}
        };
        
        // Filtry
        const maxFileSize = document.getElementById('maxFileSize').value;
        if (maxFileSize) {
            updatedConfig.filters.maxFileSize = parseInt(maxFileSize) * 1024 * 1024; // Konwersja MB na bajty
        }
        
        const allowedExtensions = document.getElementById('allowedExtensions').value
            .split(',')
            .map(ext => ext.trim())
            .filter(ext => ext.length > 0);
        
        const excludedExtensions = document.getElementById('excludedExtensions').value
            .split(',')
            .map(ext => ext.trim())
            .filter(ext => ext.length > 0);
        
        if (allowedExtensions.length > 0) {
            updatedConfig.filters.allowedExtensions = allowedExtensions;
        }
        
        if (excludedExtensions.length > 0) {
            updatedConfig.filters.excludedExtensions = excludedExtensions;
        }
        
        // Przygotuj dane do wysłania
        const requestData = {
            folderId: currentSyncData.folder._id,
            clientConfigs: [{
                clientId: currentEditingSync.client.clientId,
                ...updatedConfig
            }]
        };
        
        const response = await fetch('/api/sync/folders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            throw new Error('Błąd podczas zapisywania zmian');
        }
        
        alert('Zmiany zostały zapisane');
        closeSyncDetailsModal();
        
        // Odśwież listę synchronizacji
        showSyncModal(currentSyncData.folder._id, currentSyncData.folder.name);
        
    } catch (error) {
        console.error('Błąd:', error);
        alert('Nie udało się zapisać zmian: ' + error.message);
    }
}

async function deleteSyncConfig() {
    if (!currentEditingSync || !currentSyncData) {
        alert('Błąd: Brak danych do usunięcia');
        return;
    }
    
    if (!confirm('Czy na pewno chcesz usunąć tę synchronizację?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/sync/folders/${currentSyncData.folder._id}?clientId=${currentEditingSync.client.clientId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Błąd podczas usuwania synchronizacji');
        }
        
        alert('Synchronizacja została usunięta');
        closeSyncDetailsModal();
        closeSyncModal();
        
    } catch (error) {
        console.error('Błąd:', error);
        alert('Nie udało się usunąć synchronizacji: ' + error.message);
    }
}

function closeSyncModal() {
    document.getElementById('syncModal').style.display = 'none';
    currentSyncData = null;
}

function closeSyncDetailsModal() {
    document.getElementById('syncDetailsModal').style.display = 'none';
    currentEditingSync = null;
}

function formatDate(dateString) {
    if (!dateString) return 'Nigdy';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Przed chwilą';
    if (diffMins < 60) return `${diffMins} min temu`;
    if (diffHours < 24) return `${diffHours} godz. temu`;
    if (diffDays < 7) return `${diffDays} dni temu`;
    
    return date.toLocaleDateString('pl-PL');
}

// Eksportuj funkcje włącznie z nową funkcją
export { 
    showSyncModal, 
    closeSyncModal, 
    showSyncDetails, 
    closeSyncDetailsModal, 
    saveSyncChanges, 
    deleteSyncConfig,
    addGoogleDriveSync
};