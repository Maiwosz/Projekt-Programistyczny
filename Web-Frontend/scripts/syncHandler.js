// ========== SYNCHRONIZACJA - OBSŁUGA MODALU I API ==========

let currentSyncFolderId = null;
let currentSyncFolderName = null;
let availableProviders = [];
let currentProvider = null;
let syncPairs = [];
let currentExternalPath = [];
let selectedExternalFolder = null;

// ========== FUNKCJE WYWOŁYWANE Z HTML ==========

export async function showSyncModal(folderId, folderName) {
    console.log('showSyncModal called with:', folderId, folderName);
    
    currentSyncFolderId = folderId;
    currentSyncFolderName = folderName;
    
    // Ustaw dane w modalu
    const folderNameElement = document.getElementById('syncFolderName');
    const folderIdElement = document.getElementById('syncFolderId');
    
    if (folderNameElement) folderNameElement.textContent = folderName;
    if (folderIdElement) folderIdElement.value = folderId;
    
    // Pokaż modal
    const modal = document.getElementById('syncModal');
    if (modal) {
        modal.style.display = 'block';
        console.log('Modal shown');
    } else {
        console.error('Modal element not found');
        return;
    }
    
    // Załaduj dane
    showSyncStatus('Ładowanie danych synchronizacji...', 'info');
    await loadSyncData();
}

export function closeSyncModal() {
    const modal = document.getElementById('syncModal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Wyczyść stan
    currentSyncFolderId = null;
    currentSyncFolderName = null;
    currentProvider = null;
    currentExternalPath = [];
    selectedExternalFolder = null;
}

export async function authorizeGoogleDrive() {
    try {
        showSyncStatus('Przekierowywanie do autoryzacji Google Drive...', 'info');
        
        const response = await fetch('/api/sync/google-drive/auth-url', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Błąd pobierania URL autoryzacji');
        }
        
        const data = await response.json();
        if (data.authUrl) {
            window.open(data.authUrl, '_blank');
            showSyncStatus('Autoryzuj w nowym oknie, następnie odśwież tę stronę', 'info');
        } else {
            throw new Error('Brak URL autoryzacji w odpowiedzi');
        }
    } catch (error) {
        console.error('Authorization error:', error);
        showSyncStatus('Błąd autoryzacji: ' + error.message, 'error');
    }
}
export async function disconnectSync(provider) {
    try {
        showSyncStatus('Rozłączanie...', 'info');
        
        const response = await fetch(`/api/sync/${provider}/disconnect`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (response.ok) {
            showSyncStatus('Synchronizacja została rozłączona', 'success');
            await loadSyncData();
        } else {
            const error = await response.json();
            throw new Error(error.error || 'Błąd rozłączania');
        }
    } catch (error) {
        console.error('Disconnect error:', error);
        showSyncStatus('Błąd rozłączania: ' + error.message, 'error');
    }
}

export async function startFolderSync(provider, syncPairId = null) {
    try {
        showSyncStatus('Rozpoczynam synchronizację...', 'info');
        
        let url;
        if (syncPairId) {
            url = `/api/sync/${provider}/pairs/${syncPairId}/sync`;
        } else {
            url = `/api/sync/${provider}/sync-all`;
        }
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            if (result.results) {
                const successful = result.results.filter(r => !r.error).length;
                const failed = result.results.filter(r => r.error).length;
                showSyncStatus(`Synchronizacja zakończona. Sukces: ${successful}, Błędy: ${failed}`, 'success');
            } else {
                const transferred = result.filesTransferred || 0;
                const errors = result.errors || [];
                if (errors.length === 0) {
                    showSyncStatus(`Synchronizacja zakończona. Przeniesiono plików: ${transferred}`, 'success');
                } else {
                    showSyncStatus(`Synchronizacja z błędami. Przeniesiono: ${transferred}, Błędy: ${errors.length}`, 'warning');
                }
            }
            await loadSyncData();
        } else {
            throw new Error(result.error || 'Błąd synchronizacji');
        }
    } catch (error) {
        console.error('Sync error:', error);
        showSyncStatus('Błąd synchronizacji: ' + error.message, 'error');
    }
}

// ========== FUNKCJE WEWNĘTRZNE ==========

async function loadSyncData() {
    try {
        console.log('Loading sync data...');
        
        // Sprawdź dostępnych providerów
        await loadAvailableProviders();
        console.log('Available providers:', availableProviders);
        
        // Załaduj istniejące pary synchronizacji
        await loadExistingSyncPairs();
        console.log('Sync pairs:', syncPairs);
        
        // Renderuj interfejs  
        renderSyncInterface();
        
    } catch (error) {
        console.error('Error loading sync data:', error);
        showSyncStatus('Błąd ładowania danych: ' + error.message, 'error');
    }
}

async function loadAvailableProviders() {
    try {
        const response = await fetch('/api/sync/providers', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            availableProviders = data.providers || [];
        } else {
            console.warn('Failed to load providers, using empty array');
            availableProviders = [];
        }
    } catch (error) {
        console.error('Error loading providers:', error);
        availableProviders = [];
    }
}

async function loadExistingSyncPairs() {
    try {
        const response = await fetch('/api/sync/pairs', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            syncPairs = data.syncPairs || [];
        } else {
            console.warn('Failed to load sync pairs, using empty array');
            syncPairs = [];
        }
    } catch (error) {
        console.error('Error loading sync pairs:', error);
        syncPairs = [];
    }
}

async function loadExternalFolders(provider, parentId = null) {
    try {
        const url = parentId 
            ? `/api/sync/${provider}/folders?parentId=${parentId}`
            : `/api/sync/${provider}/folders`;
            
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.folders || [];
        } else {
            const error = await response.json();
            throw new Error(error.error || 'Błąd ładowania folderów');
        }
    } catch (error) {
        console.error('Error loading external folders:', error);
        showSyncStatus('Błąd ładowania folderów: ' + error.message, 'error');
        return [];
    }
}

async function createSyncPair(provider, externalFolderId, syncDirection) {
    try {
        const response = await fetch(`/api/sync/${provider}/pairs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                localFolderId: currentSyncFolderId,
                externalFolderId: externalFolderId,
                syncDirection: syncDirection
            })
        });
        
        if (response.ok) {
            const syncPair = await response.json();
            showSyncStatus('Para synchronizacji została utworzona', 'success');
            await loadSyncData();
            return syncPair;
        } else {
            const error = await response.json();
            throw new Error(error.error || 'Błąd tworzenia pary synchronizacji');
        }
    } catch (error) {
        console.error('Error creating sync pair:', error);
        showSyncStatus('Błąd: ' + error.message, 'error');
        throw error;
    }
}

export async function removeSyncPair(provider, syncPairId) {
    try {
        const response = await fetch(`/api/sync/${provider}/pairs/${syncPairId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (response.ok) {
            showSyncStatus('Para synchronizacji została usunięta', 'success');
            await loadSyncData();
        } else {
            const error = await response.json();
            throw new Error(error.error || 'Błąd usuwania pary synchronizacji');
        }
    } catch (error) {
        console.error('Error removing sync pair:', error);
        showSyncStatus('Błąd: ' + error.message, 'error');
    }
}

function renderSyncInterface() {
    const syncOptions = document.getElementById('syncOptions');
    if (!syncOptions) {
        console.error('syncOptions element not found');
        return;
    }
    
    console.log('Rendering sync interface...');
    
    // Sprawdź czy folder już ma pary synchronizacji
    const folderSyncPairs = syncPairs.filter(pair => 
        pair.localFolder && pair.localFolder._id === currentSyncFolderId
    );
    
    let html = '';
    
    if (folderSyncPairs.length > 0) {
        html += '<h4>Aktywne synchronizacje:</h4>';
        html += '<div class="sync-pairs-list">';
        
        folderSyncPairs.forEach(pair => {
            const lastSync = pair.lastSyncDate 
                ? new Date(pair.lastSyncDate).toLocaleString()
                : 'Nigdy';
                
            html += `
                <div class="sync-pair-item">
                    <div class="sync-pair-info">
                        <strong>${getProviderDisplayName(pair.provider)}</strong><br>
                        <span class="sync-folder-path">${pair.externalFolderName || pair.externalFolderId}</span><br>
                        <small>Kierunek: ${getSyncDirectionDisplayName(pair.syncDirection)}</small><br>
                        <small>Ostatnia sync: ${lastSync}</small>
                    </div>
                    <div class="sync-pair-actions">
                        <button onclick="startFolderSync('${pair.provider}', '${pair._id}')" class="btn-primary">
                            Synchronizuj teraz
                        </button>
                        <button onclick="removeSyncPair('${pair.provider}', '${pair._id}')" class="btn-danger">
                            Usuń
                        </button>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
    }
    
    // Pokaż opcje dodawania nowych synchronizacji
    html += '<h4>Dodaj nową synchronizację:</h4>';
    
    if (availableProviders.length === 0) {
        html += `
            <div class="no-providers">
                <p>Brak połączonych providerów synchronizacji.</p>
                <button onclick="authorizeGoogleDrive()" class="btn-primary">
                    Połącz z Google Drive
                </button>
            </div>
        `;
    } else {
        html += '<div class="provider-tabs">';
        availableProviders.forEach((provider, index) => {
            const isActive = provider === currentProvider || (currentProvider === null && index === 0);
            html += `
                <button class="provider-tab ${isActive ? 'active' : ''}" 
                        onclick="switchProvider('${provider}')">
                    ${getProviderDisplayName(provider)}
                </button>
            `;
        });
        html += '</div>';
        
        // Ustaw domyślnego providera
        if (currentProvider === null && availableProviders.length > 0) {
            currentProvider = availableProviders[0];
        }
        
        if (currentProvider) {
            html += '<div id="providerContent"></div>';
        }
    }
    
    syncOptions.innerHTML = html;
    
    // Załaduj zawartość providera
    if (currentProvider) {
        renderProviderContent();
    }
    
    // Wyczyść status jeśli wszystko OK
    if (availableProviders.length > 0 || folderSyncPairs.length > 0) {
        clearSyncStatus();
    }
}

async function renderProviderContent() {
    const content = document.getElementById('providerContent');
    if (!content) return;
    
    let html = `
        <div class="provider-setup">
            <h5>Wybierz folder w ${getProviderDisplayName(currentProvider)}:</h5>
            <div class="folder-browser">
                <div class="folder-path">
                    <span id="currentPath">Główny folder</span>
                    <button id="backButton" onclick="navigateBack()" style="display: none;">← Wstecz</button>
                </div>
                <div id="folderList" class="folder-list">
                    Ładowanie folderów...
                </div>
            </div>
            
            <div class="sync-settings">
                <h5>Ustawienia synchronizacji:</h5>
                <div class="sync-direction">
                    <label>
                        <input type="radio" name="syncDirection" value="bidirectional" checked>
                        Dwukierunkowa (zalecane)
                    </label>
                    <label>
                        <input type="radio" name="syncDirection" value="to-external">
                        Tylko wysyłaj (do ${getProviderDisplayName(currentProvider)})
                    </label>
                    <label>
                        <input type="radio" name="syncDirection" value="from-external">
                        Tylko pobieraj (z ${getProviderDisplayName(currentProvider)})
                    </label>
                </div>
                
                <button id="createPairButton" onclick="handleCreateSyncPair()" 
                        class="btn-primary" disabled>
                    Utwórz synchronizację
                </button>
            </div>
        </div>
        
        <div class="provider-actions">
            <button onclick="disconnectSync('${currentProvider}')" class="btn-secondary">
                Rozłącz ${getProviderDisplayName(currentProvider)}
            </button>
        </div>
    `;
    
    content.innerHTML = html;
    
    // Załaduj foldery
    await loadAndDisplayFolders();
}

async function loadAndDisplayFolders(parentId = null) {
    const folderList = document.getElementById('folderList');
    if (!folderList) return;
    
    folderList.innerHTML = 'Ładowanie folderów...';
    
    try {
        const folders = await loadExternalFolders(currentProvider, parentId);
        
        let html = '';
        
        if (folders.length === 0) {
            html = '<div class="empty-folder">Brak folderów</div>';
        } else {
            folders.forEach(folder => {
                html += `
                    <div class="folder-item" onclick="selectExternalFolder('${folder.id}', '${folder.name.replace(/'/g, "\\'")}')">
                        <div class="folder-icon">📁</div>
                        <div class="folder-info">
                            <div class="folder-name">${folder.name}</div>
                        </div>
                        <div class="folder-actions">
                            <button onclick="event.stopPropagation(); navigateToFolder('${folder.id}', '${folder.name.replace(/'/g, "\\'")}')" 
                                    class="btn-small">Otwórz</button>
                        </div>
                    </div>
                `;
            });
        }
        
        folderList.innerHTML = html;
        
    } catch (error) {
        console.error('Error displaying folders:', error);
        folderList.innerHTML = '<div class="error">Błąd ładowania folderów</div>';
    }
}

// ========== FUNKCJE GLOBALNE ==========

window.switchProvider = function(provider) {
    currentProvider = provider;
    currentExternalPath = [];
    selectedExternalFolder = null;
    
    // Zaktualizuj aktywną zakładkę
    document.querySelectorAll('.provider-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target.classList.add('active');
    
    renderProviderContent();
};

window.navigateToFolder = async function(folderId, folderName) {
    currentExternalPath.push({ id: folderId, name: folderName });
    updatePathDisplay();
    await loadAndDisplayFolders(folderId);
};

window.navigateBack = async function() {
    if (currentExternalPath.length > 0) {
        currentExternalPath.pop();
        const parentId = currentExternalPath.length > 0 
            ? currentExternalPath[currentExternalPath.length - 1].id 
            : null;
        updatePathDisplay();
        await loadAndDisplayFolders(parentId);
    }
};

window.selectExternalFolder = function(folderId, folderName) {
    selectedExternalFolder = { id: folderId, name: folderName };
    
    // Oznacz wybrany folder
    document.querySelectorAll('.folder-item').forEach(item => {
        item.classList.remove('selected');
    });
    event.currentTarget.classList.add('selected');
    
    // Włącz przycisk tworzenia pary
    const createButton = document.getElementById('createPairButton');
    if (createButton) {
        createButton.disabled = false;
    }
};

window.handleCreateSyncPair = async function() {
    if (!selectedExternalFolder) {
        showSyncStatus('Wybierz folder do synchronizacji', 'warning');
        return;
    }
    
    const syncDirection = document.querySelector('input[name="syncDirection"]:checked')?.value || 'bidirectional';
    
    try {
        await createSyncPair(currentProvider, selectedExternalFolder.id, syncDirection);
    } catch (error) {
        // Błąd już wyświetlony przez createSyncPair
    }
};

function updatePathDisplay() {
    const pathDisplay = document.getElementById('currentPath');
    const backButton = document.getElementById('backButton');
    
    if (!pathDisplay) return;
    
    if (currentExternalPath.length === 0) {
        pathDisplay.textContent = 'Główny folder';
        if (backButton) backButton.style.display = 'none';
    } else {
        const pathStr = currentExternalPath.map(p => p.name).join(' / ');
        pathDisplay.textContent = 'Główny folder / ' + pathStr;
        if (backButton) backButton.style.display = 'inline-block';
    }
}

function showSyncStatus(message, type = 'info') {
    const statusDiv = document.getElementById('syncStatusInfo');
    if (statusDiv) {
        statusDiv.innerHTML = `
            <div class="sync-status-message ${type}">
                ${message}
            </div>
        `;
        statusDiv.style.display = 'block';
        console.log('Status shown:', message, type);
    }
}

function clearSyncStatus() {
    const statusDiv = document.getElementById('syncStatusInfo');
    if (statusDiv) {
        statusDiv.style.display = 'none';
    }
}

function getProviderDisplayName(provider) {
    const names = {
        'google-drive': 'Google Drive',
        'desktop': 'Komputer',
        'mobile': 'Telefon'
    };
    return names[provider] || provider;
}

export async function checkGoogleDriveConnection() {
    try {
        const response = await fetch('/api/sync/google-drive/connection', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.connected || false;
        } else {
            return false;
        }
    } catch (error) {
        console.error('Error checking Google Drive connection:', error);
        return false;
    }
}

function getSyncDirectionDisplayName(direction) {
    const names = {
        'bidirectional': 'Dwukierunkowa',
        'to-external': 'Tylko wysyłaj',
        'from-external': 'Tylko pobieraj'
    };
    return names[direction] || direction;
}