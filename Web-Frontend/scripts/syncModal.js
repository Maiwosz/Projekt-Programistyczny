// syncModal.js - Główny interfejs synchronizacji
let currentFolderData = null;

export async function refreshSyncList(folderId) {
    if (folderId && currentFolderData && currentFolderData.id === folderId) {
        await loadSyncs(folderId);
    }
}

export async function showSyncModal(folderId, folderName) {
    // Walidacja parametrów wejściowych
    if (!folderId || !folderName) {
        console.error('Nieprawidłowe parametry folderu:', { folderId, folderName });
        alert('Błąd: Nieprawidłowe dane folderu');
        return;
    }
    
    currentFolderData = { id: folderId, name: folderName };
    
    const modal = ensureModalExists();
    updateModalHeader(folderName);
    modal.style.display = 'block';
    
    await loadSyncs(folderId);
}

export function closeSyncModal() {
    const modal = document.getElementById('syncModal');
    if (modal) {
        modal.style.display = 'none';
        // Resetuj stan modalu
        currentFolderData = null;
    }
}

// === TWORZENIE I ZARZĄDZANIE MODALEM ===

function ensureModalExists() {
    let modal = document.getElementById('syncModal');
    if (!modal) {
        modal = createSyncModal();
        document.body.appendChild(modal);
    }
    return modal;
}

function createSyncModal() {
    const modal = document.createElement('div');
    modal.id = 'syncModal';
    modal.className = 'modal sync-modal';
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3 id="syncModalTitle">Synchronizacje</h3>
                <button onclick="window.closeSyncModal()" class="close-button">&times;</button>
            </div>
            
            <div class="sync-modal-body">
                <div id="syncList" class="sync-list">
                    <div class="loading">Ładowanie synchronizacji...</div>
                </div>
                
                <div class="sync-actions">
                    <button onclick="window.addGoogleDriveSync()" class="btn-primary" id="addGoogleDriveSyncBtn">
                        Dodaj nową synchronizację
                    </button>
                </div>
            </div>
            
            <div class="modal-footer">
                <button onclick="window.closeSyncModal()" class="btn-secondary">Zamknij</button>
            </div>
        </div>
    `;
    
    return modal;
}

export function addGoogleDriveSync() {
    if (currentFolderData && currentFolderData.id && currentFolderData.name) {
        if (window.showCreateGoogleDriveSync) {
            window.showCreateGoogleDriveSync(currentFolderData.id, currentFolderData.name);
        } else {
            console.error('showCreateGoogleDriveSync nie jest zdefiniowane w window');
            alert('Błąd: Funkcja synchronizacji nie jest dostępna');
        }
    } else {
        console.error('Brak danych folderu:', currentFolderData);
        alert('Błąd: Brak danych folderu');
    }
}

function updateModalHeader(folderName) {
    const title = document.getElementById('syncModalTitle');
    if (title) title.textContent = `Synchronizacje: ${folderName}`;
}

// === ŁADOWANIE I WYŚWIETLANIE SYNCHRONIZACJI ===

async function loadSyncs(folderId) {
    const syncList = document.getElementById('syncList');
    if (!syncList) {
        console.error('Element syncList nie został znaleziony');
        return;
    }
    
    syncList.innerHTML = '<div class="loading">Ładowanie synchronizacji...</div>';
    
    try {
        const response = await apiRequest(`/api/sync/folders/${folderId}/info`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            const syncs = data.syncFolder ? data.syncFolder.clients : [];
            renderSyncList(syncs);
        } else {
            throw new Error(data.error || 'Nieznany błąd serwera');
        }
        
    } catch (error) {
        console.error('Błąd ładowania synchronizacji:', error);
        showError(syncList, `Błąd ładowania: ${error.message}`);
    }
}

function renderSyncList(syncs) {
    const syncList = document.getElementById('syncList');
    if (!syncList) return;
    
    if (syncs.length === 0) {
        syncList.innerHTML = `
            <div class="empty-state">
                <p>Brak synchronizacji dla tego folderu</p>
                <p style="font-size: 14px; color: #666; margin-top: 10px;">
                    Kliknij przycisk "Dodaj nową synchronizację" aby utworzyć pierwszą synchronizację.
                </p>
            </div>
        `;
        return;
    }
    
    syncList.innerHTML = syncs.map(sync => createSyncCard(sync)).join('');
}

function createSyncCard(sync) {
    const statusClass = sync.isActive ? 'status-active' : 'status-inactive';
    const statusText = sync.isActive ? 'Aktywna' : 'Nieaktywna';
    
    // POPRAWKA: Użyj sync._id lub sync.id w zależności od struktury danych
    const syncId = sync._id || sync.id || sync.clientId;
    
    return `
        <div class="sync-card" data-sync-id="${syncId}">
            <div class="sync-header">
                <div class="sync-title">
                    <h4 class="sync-name">${escapeHtml(sync.clientName || sync.name || 'Nienazwana synchronizacja')}</h4>
                    <span class="sync-type">${getClientTypeLabel(sync.clientType || sync.type)}</span>
                </div>
                <span class="sync-status ${statusClass}">${statusText}</span>
            </div>
            
            <div class="sync-info">
                <div class="sync-detail">
                    <span class="label">Kierunek:</span>
                    <span class="value">${getSyncDirectionLabel(sync.syncDirection)}</span>
                </div>
                <div class="sync-detail">
                    <span class="label">Ścieżka:</span>
                    <span class="value" title="${escapeHtml(sync.clientFolderPath || '')}">
                        ${escapeHtml(sync.clientFolderPath) || '<em>Nie ustawiona</em>'}
                    </span>
                </div>
                <div class="sync-detail">
                    <span class="label">Ostatnia synchronizacja:</span>
                    <span class="value">${formatDate(sync.lastSyncDate)}</span>
                </div>
            </div>
            
            <div class="sync-actions">
                <button onclick="window.viewSyncDetails('${syncId}')" class="btn-details" title="Szczegóły">
                    <span>📋</span> Szczegóły
                </button>
                <button onclick="window.deleteSync('${syncId}')" class="btn-delete" title="Usuń">
                    <span>🗑️</span> Usuń
                </button>
            </div>
        </div>
    `;
}

// === WYŚWIETLANIE SZCZEGÓŁÓW SYNCHRONIZACJI Z MOŻLIWOŚCIĄ EDYCJI ===

export async function viewSyncDetails(syncId) {
    if (!currentFolderData) {
        alert('Błąd: Brak danych folderu');
        return;
    }
    
    try {
        const response = await apiRequest(`/api/sync/folders/${currentFolderData.id}/info`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.syncFolder) {
            
            // POPRAWKA: Szukaj po różnych możliwych polach ID
            const sync = data.syncFolder.clients.find(c => {
                const clientId = c._id || c.id || c.clientId;
                return clientId === syncId || 
                       c._id?.toString() === syncId || 
                       c.id?.toString() === syncId ||
                       c.clientId?.toString() === syncId;
            });
            
            if (sync) {
                showSyncDetailsModal(sync);
            } else {
                console.error('Synchronizacja nie znaleziona. Dostępne ID:', 
                    data.syncFolder.clients.map(c => ({
                        _id: c._id,
                        id: c.id,
                        clientId: c.clientId,
                        name: c.clientName || c.name
                    }))
                );
                throw new Error('Synchronizacja nie znaleziona');
            }
        } else {
            throw new Error(data.error || 'Nieznany błąd serwera');
        }
        
    } catch (error) {
        console.error('Błąd ładowania szczegółów:', error);
        alert(`Błąd ładowania szczegółów: ${error.message}`);
    }
}

function showSyncDetailsModal(sync) {
    // Utwórz modal szczegółów jeśli nie istnieje
    let detailsModal = document.getElementById('syncDetailsModal');
    if (!detailsModal) {
        detailsModal = createSyncDetailsModal();
        document.body.appendChild(detailsModal);
    }
    
    // Wypełnij dane
    populateSyncDetails(sync);
    
    detailsModal.style.display = 'block';
}

function createSyncDetailsModal() {
    const modal = document.createElement('div');
    modal.id = 'syncDetailsModal';
    modal.className = 'modal sync-details-modal';
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Szczegóły synchronizacji</h3>
                <button onclick="window.closeSyncDetailsModal()" class="close-button">&times;</button>
            </div>
            
            <div class="sync-details-body">
                <div id="syncDetailsContent">
                    <!-- Zawartość będzie wstawiona dynamicznie -->
                </div>
            </div>
            
            <div class="modal-footer">
                <button onclick="window.closeSyncDetailsModal()" class="btn-secondary">Zamknij</button>
            </div>
        </div>
    `;
    
    return modal;
}

function populateSyncDetails(sync) {
    const content = document.getElementById('syncDetailsContent');
    if (!content) return;
    
    // POPRAWKA: Użyj prawidłowego ID
    const syncId = sync._id || sync.id || sync.clientId;
    
    content.innerHTML = `
        <div class="details-section">
            <h4>Podstawowe informacje</h4>
            <div class="details-grid">
                <div class="detail-item">
                    <label>Nazwa:</label>
                    <span>${escapeHtml(sync.clientName || sync.name || 'Nienazwana synchronizacja')}</span>
                </div>
                <div class="detail-item">
                    <label>Typ klienta:</label>
                    <span>${getClientTypeLabel(sync.clientType || sync.type)}</span>
                </div>
                <div class="detail-item">
                    <label>Ścieżka klienta:</label>
                    <span>${escapeHtml(sync.clientFolderPath) || '<em>Nie ustawiona</em>'}</span>
                </div>
                <div class="detail-item">
                    <label>ID synchronizacji:</label>
                    <span class="sync-id">${syncId}</span>
                </div>
            </div>
        </div>
        
        <div class="details-section">
            <h4>Ustawienia edytowalne</h4>
            <div class="edit-form">
                <div class="form-group">
                    <label for="edit-direction-${syncId}">Kierunek synchronizacji:</label>
                    <select id="edit-direction-${syncId}" class="form-select">
                        <option value="bidirectional" ${sync.syncDirection === 'bidirectional' ? 'selected' : ''}>
                            Dwukierunkowa (serwer ↔ klient)
                        </option>
                        <option value="to-client" ${sync.syncDirection === 'to-client' ? 'selected' : ''}>
                            Tylko do klienta (serwer → klient)
                        </option>
                        <option value="from-client" ${sync.syncDirection === 'from-client' ? 'selected' : ''}>
                            Tylko z klienta (klient → serwer)
                        </option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label for="edit-status-${syncId}">Status:</label>
                    <select id="edit-status-${syncId}" class="form-select">
                        <option value="true" ${sync.isActive ? 'selected' : ''}>Aktywna</option>
                        <option value="false" ${!sync.isActive ? 'selected' : ''}>Nieaktywna</option>
                    </select>
                </div>
            </div>
        </div>
        
        <div class="details-section">
            <h4>Historia synchronizacji</h4>
            <div class="details-grid">
                <div class="detail-item">
                    <label>Ostatnia synchronizacja:</label>
                    <span>${formatDate(sync.lastSyncDate)}</span>
                </div>
            </div>
        </div>
        
        <div class="details-actions">
            <button onclick="window.saveSync('${syncId}')" class="btn-primary">
                <span>💾</span> Zapisz zmiany
            </button>
        </div>
    `;
}

export function closeSyncDetailsModal() {
    const modal = document.getElementById('syncDetailsModal');
    if (modal) modal.style.display = 'none';
}

// === ZAPISYWANIE ZMIAN SYNCHRONIZACJI ===

export async function saveSync(syncId) {
    if (!currentFolderData) {
        alert('Błąd: Brak danych folderu');
        return;
    }
    
    const syncDirection = document.getElementById(`edit-direction-${syncId}`)?.value;
    const isActiveValue = document.getElementById(`edit-status-${syncId}`)?.value;
    
    if (!syncDirection || isActiveValue === null || isActiveValue === undefined) {
        alert('Błąd: Nie można odczytać danych z formularza');
        return;
    }
    
    const isActive = isActiveValue === 'true';
    
    try {
        // ZMIANA: Nowy endpoint dla aktualizacji ustawień synchronizacji
        const response = await apiRequest(`/api/sync/folders/${currentFolderData.id}/settings/${syncId}`, {
            method: 'PUT',
            body: JSON.stringify({ 
                syncDirection, 
                isActive 
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            // Odśwież główną listę synchronizacji
            await loadSyncs(currentFolderData.id);
            
            // Zamknij modal szczegółów
            closeSyncDetailsModal();
            
            showSuccess('Synchronizacja zaktualizowana pomyślnie');
        } else {
            throw new Error(data.error || 'Nieznany błąd serwera');
        }
        
    } catch (error) {
        console.error('Błąd zapisywania:', error);
        alert(`Błąd zapisywania: ${error.message}`);
    }
}

// === USUWANIE SYNCHRONIZACJI ===

export async function deleteSync(syncId) {
    if (!currentFolderData) {
        alert('Błąd: Brak danych folderu');
        return;
    }
    
    // Znajdź nazwę synchronizacji dla potwierdzenia
    const syncCard = document.querySelector(`[data-sync-id="${syncId}"]`);
    const syncName = syncCard?.querySelector('.sync-name')?.textContent || 'tę synchronizację';
    
    if (!confirm(`Czy na pewno chcesz usunąć synchronizację "${syncName}"?\n\nTa operacja jest nieodwracalna.`)) {
        return;
    }
    
    try {
        // Najpierw pobierz dane synchronizacji aby znaleźć prawdziwy clientId
        const response = await apiRequest(`/api/sync/folders/${currentFolderData.id}/info`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.success || !data.syncFolder) {
            throw new Error(data.error || 'Nie można pobrać danych synchronizacji');
        }
        
        // Znajdź synchronizację po syncId
        const sync = data.syncFolder.clients.find(c => {
            const clientSyncId = c._id || c.id || c.clientId;
            return clientSyncId === syncId || 
                   c._id?.toString() === syncId || 
                   c.id?.toString() === syncId ||
                   c.clientId?.toString() === syncId;
        });
        
        if (!sync) {
            throw new Error('Synchronizacja nie znaleziona');
        }
        
        // POPRAWKA: Użyj prawdziwego clientId - backend oczekuje clientId, nie syncId
        const clientId = sync.client?._id || sync.client || sync.clientId;
        
        // POPRAWKA: Backend oczekuje parametru clientId, nie syncId
        const deleteUrl = `/api/sync/folders/${currentFolderData.id}?clientId=${encodeURIComponent(clientId)}`;
        
        const deleteResponse = await apiRequest(deleteUrl, {
            method: 'DELETE'
        });
        
        if (!deleteResponse.ok) {
            const errorText = await deleteResponse.text();
            console.error('Błąd odpowiedzi:', errorText);
            throw new Error(`HTTP ${deleteResponse.status}: ${deleteResponse.statusText}`);
        }
        
        const deleteData = await deleteResponse.json();
        
        if (deleteData.success) {
            await loadSyncs(currentFolderData.id);
            showSuccess('Synchronizacja została usunięta');
        } else {
            throw new Error(deleteData.error || 'Nieznany błąd serwera');
        }
        
    } catch (error) {
        console.error('Błąd usuwania:', error);
        alert(`Błąd usuwania: ${error.message}`);
    }
}

// === FUNKCJE POMOCNICZE ===

async function apiRequest(url, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) {
        throw new Error('Brak tokenu autoryzacji');
    }
    
    const defaultOptions = {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    };
    
    return fetch(url, { ...defaultOptions, ...options });
}

function showError(container, message) {
    if (!container) return;
    container.innerHTML = `
        <div class="error-state">
            <span class="error-icon">⚠️</span>
            <p>${escapeHtml(message)}</p>
            <button onclick="window.location.reload()" class="btn-retry">Odśwież stronę</button>
        </div>
    `;
}

function showSuccess(message) {
    // Prosta implementacja - można zastąpić bardziej zaawansowanym systemem
    const notification = document.createElement('div');
    notification.className = 'success-notification';
    notification.innerHTML = `
        <span class="success-icon">✅</span>
        <span>${escapeHtml(message)}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

function getClientTypeLabel(type) {
    const labels = {
        'desktop': 'Aplikacja desktopowa',
        'mobile': 'Aplikacja mobilna', 
        'web': 'Przeglądarka',
        'server-integration': 'Integracja serwera',
        'google-drive': 'Google Drive',
        'dropbox': 'Dropbox',
        'onedrive': 'OneDrive'
    };
    return labels[type] || type || 'Nieznany typ';
}

function getSyncDirectionLabel(direction) {
    const labels = {
        'bidirectional': 'Dwukierunkowa (↔)',
        'to-client': 'Do klienta (→)',
        'from-client': 'Z klienta (←)'
    };
    return labels[direction] || direction || 'Nieznany kierunek';
}

function formatDate(dateString) {
    if (!dateString) return 'Nigdy';
    
    try {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
            return 'Dzisiaj, ' + date.toLocaleTimeString('pl-PL', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        } else if (diffDays === 1) {
            return 'Wczoraj, ' + date.toLocaleTimeString('pl-PL', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        } else if (diffDays < 7) {
            return `${diffDays} dni temu`;
        } else {
            return date.toLocaleString('pl-PL', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    } catch (error) {
        console.error('Błąd formatowania daty:', error);
        return 'Błędna data';
    }
}

function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.addEventListener('syncCreated', async (event) => {
    const { folderId } = event.detail;
    if (folderId && currentFolderData && currentFolderData.id === folderId) {
        await loadSyncs(folderId);
    }
});

// Eksportuj funkcje do globalnego dostępu
window.closeSyncDetailsModal = closeSyncDetailsModal;
window.viewSyncDetails = viewSyncDetails;
window.saveSync = saveSync;
window.refreshSyncList = refreshSyncList;