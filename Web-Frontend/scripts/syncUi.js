// ========== SYNCHRONIZACJA - INTERFEJS UŻYTKOWNIKA ==========

import { 
    availableProviders, 
    syncPairs, 
    loadAvailableProviders, 
    loadExistingSyncPairs, 
    createSyncPair, 
    removeSyncPair, 
    startFolderSync, 
    disconnectProvider,
    getProviderDisplayName,
    getSyncDirectionDisplayName,
    formatSyncResult 
} from './syncCore.js';

import { 
    authorizeGoogleDrive, 
    loadGoogleDriveFolders, 
    AuthorizationError,
    isGoogleDriveAuthError,
    getGoogleDriveProviderName 
} from './googleDriveSync.js';

// ========== ZMIENNE STANU UI ==========
let currentSyncFolderId = null;
let currentSyncFolderName = null;
let currentProvider = null;
let currentExternalPath = [];
let selectedExternalFolder = null;
let syncTimerIntervals = new Map();

// ========== GŁÓWNE FUNKCJE MODALU ==========

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('code') && urlParams.has('state')) {
        console.log('Detected auth callback, processing...');
        
        const { handleAuthCallback } = await import('./googleDriveSync.js');
        const result = await handleAuthCallback();
        
        if (result.success) {
            showSyncStatus('Połączenie z Google Drive zostało nawiązane!', 'success');
            // Odśwież dane synchronizacji jeśli modal jest otwarty
            if (currentSyncFolderId) {
                await loadSyncData();
            }
        } else {
            showSyncStatus('Błąd autoryzacji: ' + (result.error || 'Nieznany błąd'), 'error');
        }
    }
});

// Dodaj globalną funkcję odświeżania stanu
window.refreshSyncState = async function() {
    console.log('Refreshing sync state...');
    await loadAvailableProviders();
    if (currentSyncFolderId) {
        await loadSyncData();
    }
};

export async function showSyncModal(folderId, folderName) {
    currentSyncFolderId = folderId;
    currentSyncFolderName = folderName;
    currentProvider = getGoogleDriveProviderName();
    
    // Ustaw dane w DOM
    const syncFolderNameElement = document.getElementById('syncFolderName');
    if (syncFolderNameElement) {
        syncFolderNameElement.textContent = folderName;
    }
    
    const syncFolderIdElement = document.getElementById('syncFolderId');
    if (syncFolderIdElement) {
        syncFolderIdElement.value = folderId;
    }
    
    document.getElementById('syncModal').style.display = 'block';
    await loadSyncData(); // Tylko jedno wywołanie
}

export function closeSyncModal() {
    const modal = document.getElementById('syncModal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Wyczyść timery
    syncTimerIntervals.forEach(interval => clearInterval(interval));
    syncTimerIntervals.clear();
    
    // Wyczyść stan
    currentSyncFolderId = null;
    currentSyncFolderName = null;
    currentProvider = null;
    currentExternalPath = [];
    selectedExternalFolder = null;
}

// ========== ZARZĄDZANIE DANYMI ==========

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
        
        // DODAJ TO: Uruchom timery po renderowaniu
        setTimeout(() => {
            startSyncTimers();
        }, 100);
        
    } catch (error) {
        console.error('Error loading sync data:', error);
        showSyncStatus('Błąd ładowania danych: ' + error.message, 'error');
    }
}

// ========== RENDEROWANIE INTERFEJSU ==========

function renderSyncInterface() {
    const syncOptions = document.getElementById('syncOptions');
    if (!syncOptions) {
        console.error('syncOptions element not found');
        return;
    }
    
    console.log('Rendering sync interface...');
    
    let html = '';
    
    // Zawsze pokaż zakładki providerów (nawet jeśli są puste)
    html += renderProviderTabs();
    
    // Jeśli nie ma providerów, pokaż sekcję połączenia
    if (availableProviders.length === 0) {
        html += '<div id="providerContent">' + renderNoProvidersSection() + '</div>';
    } else {
        // Ustaw domyślnego providera jeśli nie jest ustawiony
        if (currentProvider === null && availableProviders.length > 0) {
            currentProvider = availableProviders[0];
        }
        
        html += '<div id="providerContent"></div>';
    }
    
    syncOptions.innerHTML = html;
    
    // Załaduj zawartość providera
    if (currentProvider) {
        renderProviderContent();
    }
    
    // Wyczyść status jeśli wszystko OK
    if (availableProviders.length > 0) {
        // Nie czyść statusu automatycznie - może być ostrzeżenie o autoryzacji
    }
}

function renderNoProvidersSection() {
    return `
        <div class="no-providers">
            <p>Brak połączonych providerów synchronizacji.</p>
            <button onclick="authorizeGoogleDriveUI()" class="btn-primary">
                Połącz z Google Drive
            </button>
        </div>
    `;
}

function renderProviderTabs() {
    const googleDriveProvider = getGoogleDriveProviderName();
    const hasActiveGoogleDrive = availableProviders.includes(googleDriveProvider);
    
    let html = '<div class="provider-tabs">';
    
    // Zawsze pokaż zakładkę Google Drive
    const isGoogleDriveActive = currentProvider === googleDriveProvider || 
                               (currentProvider === null && hasActiveGoogleDrive);
    
    html += `
        <button class="provider-tab ${isGoogleDriveActive ? 'active' : ''}" 
                onclick="switchProvider('${googleDriveProvider}')">
            Google Drive
        </button>
    `;
    
    // Tutaj można dodać inne providery w przyszłości
    // html += `<button class="provider-tab" onclick="switchProvider('onedrive')">OneDrive</button>`;
    
    html += '</div>';
    
    return html;
}

async function renderProviderContent() {
    const content = document.getElementById('providerContent');
    if (!content) return;
    
    const hasActiveGoogleDrive = availableProviders.includes(getGoogleDriveProviderName());
    
    if (!hasActiveGoogleDrive) {
        content.innerHTML = renderNotConnectedContent();
        return;
    }
    
    content.innerHTML = await renderGoogleDriveContent();
    
    // Załaduj foldery jeśli jesteśmy w trybie dodawania
    const addNewSection = document.getElementById('addNewSyncSection');
    if (addNewSection && addNewSection.style.display !== 'none') {
        await loadAndDisplayFolders();
    }
}

function renderNotConnectedContent() {
    return `
        <div class="provider-not-connected">
            <h4>Google Drive</h4>
            <p>Aby korzystać z synchronizacji z Google Drive, musisz najpierw połączyć swoje konto.</p>
            <button onclick="authorizeGoogleDriveUI()" class="btn-primary">
                Połącz z Google Drive
            </button>
        </div>
    `;
}

async function renderGoogleDriveContent() {
    console.log('renderGoogleDriveContent called');
    console.log('currentSyncFolderId:', currentSyncFolderId);
    console.log('syncPairs:', syncPairs);
    
    // Znajdź synchronizacje dla tego folderu
    const folderSyncPairs = syncPairs.filter(pair => {
		// Sprawdź różne możliwe formaty ID
		const localFolderId = pair.localFolder?._id || pair.localFolder?.id || pair.localFolderId;
		const providerMatch = pair.provider === getGoogleDriveProviderName();
		const folderMatch = localFolderId === currentSyncFolderId || 
						   String(localFolderId) === String(currentSyncFolderId);
		
		console.log('Pair check:', {
			localFolderId,
			currentSyncFolderId,
			providerMatch,
			folderMatch,
			pair: pair
		});
		
		return providerMatch && folderMatch;
	});
		
    console.log('Filtered sync pairs:', folderSyncPairs);
    
    let html = '<h4>Google Drive</h4>';
    
    // Sekcja aktywnych synchronizacji
    if (folderSyncPairs.length > 0) {
        html += '<div class="active-syncs-section">';
        html += '<h5>Aktywne synchronizacje:</h5>';
        html += '<div class="sync-pairs-list">';
        
        folderSyncPairs.forEach(pair => {
			const lastSync = pair.lastSyncDate 
				? new Date(pair.lastSyncDate).toLocaleString()
				: 'Nigdy';
				
			const isAutoSyncEnabled = pair.autoSync && pair.autoSync.enabled;
			const autoSyncInterval = pair.autoSync ? pair.autoSync.intervalMinutes : 60;
			
			// Oblicz timer do następnej synchronizacji
			let nextSyncInfo = 'Nie';
			if (isAutoSyncEnabled && pair.autoSync.nextAutoSync) {
				nextSyncInfo = `Tak (co ${autoSyncInterval} min) - <span id="timer-${pair._id}" class="sync-timer">obliczanie...</span>`;
			} else if (isAutoSyncEnabled) {
				nextSyncInfo = `Tak (co ${autoSyncInterval} min) - wkrótce`;
			}
				
			html += `
				<div class="sync-pair-item">
					<div class="sync-pair-info">
						<div class="sync-folder-path">${pair.externalFolderName || pair.externalFolderId}</div>
						<small>Kierunek: ${getSyncDirectionDisplayName(pair.syncDirection)}</small><br>
						<small>Ostatnia sync: ${lastSync}</small><br>
						<small>Auto-sync: ${nextSyncInfo}</small>
					</div>
					<div class="sync-pair-actions">
						<button onclick="syncFolderNow('${pair.provider}', '${pair._id}')" class="btn-primary">
							Synchronizuj
						</button>
						<button onclick="showSyncPairSettings('${pair._id}')" class="btn-secondary">
							Ustawienia
						</button>
						<button onclick="removeSyncPairUI('${pair.provider}', '${pair._id}')" class="btn-danger">
							Usuń
						</button>
					</div>
				</div>
			`;
		});
        
        html += '</div></div>';
    }
    
    // Przycisk dodawania nowej synchronizacji
    html += `
        <div class="add-sync-section">
            <button onclick="toggleAddNewSync()" class="btn-primary" id="addSyncButton">
                Dodaj nową synchronizację
            </button>
        </div>
    `;
    
    // Sekcja dodawania nowej synchronizacji (ukryta domyślnie)
    html += `
        <div id="addNewSyncSection" class="add-new-sync" style="display: none;">
            <h5>Wybierz folder w Google Drive:</h5>
            <div class="folder-browser">
                <div class="folder-path">
                    <span id="currentPath">Główny folder</span>
                    <button id="backButton" onclick="navigateBack()" style="display: none;">← Wstecz</button>
                </div>
                <div id="folderList" class="folder-list">
                    <!-- Foldery będą załadowane dynamicznie -->
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
                        Tylko wysyłaj (do Google Drive)
                    </label>
                    <label>
                        <input type="radio" name="syncDirection" value="from-external">
                        Tylko pobieraj (z Google Drive)
                    </label>
                </div>
                
                <div class="add-sync-actions">
                    <button id="createPairButton" onclick="handleCreateSyncPair()" 
                            class="btn-primary" disabled>
                        Utwórz synchronizację
                    </button>
                    <button onclick="toggleAddNewSync()" class="btn-secondary">
                        Anuluj
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Przycisk rozłączenia (na dole)
    html += `
        <div class="provider-actions">
            <button onclick="disconnectProviderUI('${getGoogleDriveProviderName()}')" class="btn-secondary">
                Rozłącz Google Drive
            </button>
        </div>
    `;
    
    return html;
}

window.toggleAddNewSync = async function() {
    const addNewSection = document.getElementById('addNewSyncSection');
    const addButton = document.getElementById('addSyncButton');
    
    if (!addNewSection || !addButton) return;
    
    if (addNewSection.style.display === 'none') {
        // Pokaż sekcję dodawania
        addNewSection.style.display = 'block';
        addButton.textContent = 'Anuluj dodawanie';
        addButton.classList.remove('btn-primary');
        addButton.classList.add('btn-secondary');
        
        // Załaduj foldery
        await loadAndDisplayFolders();
    } else {
        // Ukryj sekcję dodawania
        addNewSection.style.display = 'none';
        addButton.textContent = 'Dodaj nową synchronizację';
        addButton.classList.remove('btn-secondary');
        addButton.classList.add('btn-primary');
        
        // Wyczyść stan
        currentExternalPath = [];
        selectedExternalFolder = null;
    }
};

async function loadAndDisplayFolders(parentId = null) {
    const folderList = document.getElementById('folderList');
    if (!folderList) return;
    
    folderList.innerHTML = 'Ładowanie folderów...';
    
    try {
        const folders = await loadGoogleDriveFolders(parentId);
        folderList.innerHTML = renderFolderList(folders);
    } catch (error) {
        handleFolderLoadError(error);
    }
}

function renderFolderList(folders) {
    if (folders.length === 0) {
        return '<div class="empty-folder">Brak folderów</div>';
    }
    
    return folders.map(folder => `
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
    `).join('');
}

function handleFolderLoadError(error) {
    const folderList = document.getElementById('folderList');
    
    if (isGoogleDriveAuthError(error)) {
        const index = availableProviders.indexOf(currentProvider);
        if (index > -1) availableProviders.splice(index, 1);
        
        showSyncStatus(error.message, 'warning');
        renderSyncInterface();
    } else {
        folderList.innerHTML = '<div class="error">Błąd ładowania folderów</div>';
        showSyncStatus('Błąd ładowania folderów: ' + error.message, 'error');
    }
}

// ========== FUNKCJE GLOBALNE UI ==========

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
        await createSyncPair(currentProvider, currentSyncFolderId, selectedExternalFolder.id, syncDirection);
        showSyncStatus('Para synchronizacji została utworzona', 'success');
        await loadSyncData();
    } catch (error) {
        showSyncStatus('Błąd: ' + error.message, 'error');
    }
};

window.syncFolderNow = async function(provider, syncPairId) {
    try {
        showSyncStatus('Rozpoczynam synchronizację...', 'info');
        
        const result = await startFolderSync(provider, syncPairId);
        const message = formatSyncResult(result);
        const type = result.errors && result.errors.length > 0 ? 'warning' : 'success';
        
        showSyncStatus(message, type);
        await loadSyncData();
    } catch (error) {
        showSyncStatus('Błąd synchronizacji: ' + error.message, 'error');
    }
};

window.removeSyncPairUI = async function(provider, syncPairId) {
    try {
        await removeSyncPair(provider, syncPairId);
        showSyncStatus('Para synchronizacji została usunięta', 'success');
        await loadSyncData();
    } catch (error) {
        showSyncStatus('Błąd: ' + error.message, 'error');
    }
};

window.disconnectProviderUI = async function(provider) {
    try {
        showSyncStatus('Rozłączanie...', 'info');
        
        await disconnectProvider(provider);
        showSyncStatus('Synchronizacja została rozłączona', 'success');
        await loadSyncData();
    } catch (error) {
        showSyncStatus('Błąd rozłączania: ' + error.message, 'error');
    }
};

window.authorizeGoogleDriveUI = async function() {
    try {
        showSyncStatus('Przekierowywanie do autoryzacji Google Drive...', 'info');
        await authorizeGoogleDrive();
    } catch (error) {
        showSyncStatus('Błąd autoryzacji: ' + error.message, 'error');
    }
};

// ========== FUNKCJE POMOCNICZE UI ==========

function updatePathDisplay() {
    const pathElement = document.getElementById('currentPath');
    const backButton = document.getElementById('backButton');
    
    if (!pathElement || !backButton) return;
    
    if (currentExternalPath.length === 0) {
        pathElement.textContent = 'Główny folder';
        backButton.style.display = 'none';
    } else {
        const pathNames = currentExternalPath.map(folder => folder.name);
        pathElement.textContent = 'Główny folder > ' + pathNames.join(' > ');
        backButton.style.display = 'inline-block';
    }
}

window.showSyncPairSettings = async function(syncPairId) {
    try {
        const { getSyncPairDetails } = await import('./syncCore.js');
        const syncPair = await getSyncPairDetails(syncPairId);
        
        const modal = document.createElement('div');
        modal.className = 'sync-settings-modal';
        modal.innerHTML = `
            <div class="sync-settings-content">
                <div class="sync-settings-header">
                    <h3>Ustawienia synchronizacji</h3>
                    <button onclick="closeSyncPairSettings()" class="close-btn">×</button>
                </div>
                <div class="sync-settings-body">
                    <div class="setting-group">
                        <label>Kierunek synchronizacji:</label>
                        <select id="settingsSyncDirection">
                            <option value="bidirectional" ${syncPair.syncDirection === 'bidirectional' ? 'selected' : ''}>Dwukierunkowa</option>
                            <option value="to-external" ${syncPair.syncDirection === 'to-external' ? 'selected' : ''}>Tylko wysyłaj</option>
                            <option value="from-external" ${syncPair.syncDirection === 'from-external' ? 'selected' : ''}>Tylko pobieraj</option>
                        </select>
                    </div>
                    
                    <div class="setting-group">
                        <label>
                            <input type="checkbox" id="settingsAutoSync" ${syncPair.autoSync?.enabled ? 'checked' : ''}>
                            Automatyczna synchronizacja
                        </label>
                        <div class="auto-sync-settings" style="display: ${syncPair.autoSync?.enabled ? 'block' : 'none'}">
                            <label>Interwał (minuty):</label>
                            <input type="number" id="settingsAutoSyncInterval" min="5" value="${syncPair.autoSync?.intervalMinutes || 60}">
                        </div>
                    </div>
                    
                    <div class="setting-group">
                        <label>
                            <input type="checkbox" id="settingsDeleteSync" ${syncPair.deleteSync?.enabled !== false ? 'checked' : ''}>
                            Synchronizuj usuwanie plików
                        </label>
                    </div>
                    
                    <!-- DODAJ TE SEKCJE -->
                    <div class="setting-group">
                        <label>
                            <input type="checkbox" id="settingsSyncSubfolders" ${syncPair.syncSubfolders !== false ? 'checked' : ''}>
                            Synchronizuj podfoldery
                        </label>
                    </div>
                    
                    <div class="setting-group">
                        <h4>Filtry plików</h4>
                        <div class="file-filters">
                            <label>Dozwolone rozszerzenia (np. .jpg,.png):</label>
                            <input type="text" id="settingsAllowedExtensions" 
                                   value="${(syncPair.fileFilters?.allowedExtensions || []).join(',')}"
                                   placeholder="Zostaw puste dla wszystkich">
                            
                            <label>Wykluczone rozszerzenia (np. .tmp,.log):</label>
                            <input type="text" id="settingsExcludedExtensions" 
                                   value="${(syncPair.fileFilters?.excludedExtensions || []).join(',')}"
                                   placeholder="Pliki do pominięcia">
                            
                            <label>Maksymalny rozmiar pliku (MB):</label>
                            <input type="number" id="settingsMaxFileSize" 
                                   value="${syncPair.fileFilters?.maxFileSize ? Math.round(syncPair.fileFilters.maxFileSize / 1024 / 1024) : ''}"
                                   placeholder="Bez limitu" min="1">
                            
                            <label>Minimalny rozmiar pliku (KB):</label>
                            <input type="number" id="settingsMinFileSize" 
                                   value="${syncPair.fileFilters?.minFileSize ? Math.round(syncPair.fileFilters.minFileSize / 1024) : ''}"
                                   placeholder="Bez limitu" min="1">
                        </div>
                    </div>
                    
                    <div class="sync-settings-actions">
                        <button onclick="saveSyncPairSettings('${syncPairId}')" class="btn-primary">Zapisz</button>
                        <button onclick="closeSyncPairSettings()" class="btn-secondary">Anuluj</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Obsługa zmiany auto-sync
        document.getElementById('settingsAutoSync').addEventListener('change', function() {
            const autoSyncSettings = document.querySelector('.auto-sync-settings');
            autoSyncSettings.style.display = this.checked ? 'block' : 'none';
        });
        
    } catch (error) {
        showSyncStatus('Błąd ładowania ustawień: ' + error.message, 'error');
    }
};

window.closeSyncPairSettings = function() {
    const modal = document.querySelector('.sync-settings-modal');
    if (modal) {
        modal.remove();
    }
};

window.saveSyncPairSettings = async function(syncPairId) {
    try {
        // DODAJ: Funkcja pomocnicza do parsowania rozszerzeń
        const parseExtensions = (value) => {
            if (!value || !value.trim()) return [];
            return value.split(',')
                       .map(ext => ext.trim())
                       .filter(ext => ext.length > 0)
                       .map(ext => ext.startsWith('.') ? ext : '.' + ext);
        };
        
        // DODAJ: Funkcja pomocnicza do parsowania rozmiaru
        const parseFileSize = (value, multiplier) => {
            const num = parseInt(value);
            return isNaN(num) || num <= 0 ? undefined : num * multiplier;
        };
        
        const settings = {
            syncDirection: document.getElementById('settingsSyncDirection').value,
            autoSync: {
                enabled: document.getElementById('settingsAutoSync').checked,
                intervalMinutes: parseInt(document.getElementById('settingsAutoSyncInterval').value) || 60
            },
            deleteSync: {
                enabled: document.getElementById('settingsDeleteSync').checked
            },
            // DODAJ TE USTAWIENIA
            syncSubfolders: document.getElementById('settingsSyncSubfolders').checked,
            fileFilters: {
                allowedExtensions: parseExtensions(document.getElementById('settingsAllowedExtensions').value),
                excludedExtensions: parseExtensions(document.getElementById('settingsExcludedExtensions').value),
                maxFileSize: parseFileSize(document.getElementById('settingsMaxFileSize').value, 1024 * 1024), // MB to bytes
                minFileSize: parseFileSize(document.getElementById('settingsMinFileSize').value, 1024) // KB to bytes
            }
        };
        
        const { updateSyncPairSettings } = await import('./syncCore.js');
        await updateSyncPairSettings(syncPairId, settings);
        
        showSyncStatus('Ustawienia zostały zapisane', 'success');
        closeSyncPairSettings();
        await loadSyncData(); // Odśwież dane
        
    } catch (error) {
        showSyncStatus('Błąd zapisywania ustawień: ' + error.message, 'error');
    }
};

function showSyncStatus(message, type = 'info') {
    const statusElement = document.getElementById('syncStatusInfo');
    if (!statusElement) return;
    
    // Wyczyść poprzednie klasy typu
    statusElement.classList.remove('sync-status-info', 'sync-status-success', 'sync-status-warning', 'sync-status-error');
    
    // Dodaj odpowiednią klasę
    statusElement.classList.add(`sync-status-${type}`);
    statusElement.textContent = message;
    statusElement.style.display = 'block';
    
    // Ukryj automatycznie po 5 sekundach dla success/info
    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            statusElement.style.display = 'none';
        }, 5000);
    }
}

function startSyncTimers() {
    // Wyczyść istniejące timery
    syncTimerIntervals.forEach(interval => clearInterval(interval));
    syncTimerIntervals.clear();
    
    // Znajdź wszystkie pary z włączonym auto-sync
    const autoSyncPairs = syncPairs.filter(pair => 
        pair.autoSync && 
        pair.autoSync.enabled && 
        pair.autoSync.nextAutoSync &&
        pair.localFolder && 
        (pair.localFolder._id === currentSyncFolderId || pair.localFolder.id === currentSyncFolderId)
    );
    
    autoSyncPairs.forEach(pair => {
        const timerId = `timer-${pair._id}`;
        const timerElement = document.getElementById(timerId);
        
        if (timerElement) {
            // Uruchom timer dla tej pary
            const interval = setInterval(() => {
                updateSyncTimer(pair._id, pair.autoSync.nextAutoSync);
            }, 1000);
            
            syncTimerIntervals.set(pair._id, interval);
            
            // Natychmiastowe pierwsze wywołanie
            updateSyncTimer(pair._id, pair.autoSync.nextAutoSync);
        }
    });
}

function updateSyncTimer(pairId, nextSyncDate) {
    const timerElement = document.getElementById(`timer-${pairId}`);
    if (!timerElement) return;
    
    const now = new Date();
    const nextSync = new Date(nextSyncDate);
    const timeDiff = nextSync - now;
    
    if (timeDiff <= 0) {
        timerElement.textContent = 'już teraz';
        timerElement.style.color = '#ff6b35';
        return;
    }
    
    const minutes = Math.floor(timeDiff / (1000 * 60));
    const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
    
    if (minutes > 60) {
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        timerElement.textContent = `za ${hours}h ${remainingMinutes}min`;
    } else if (minutes > 0) {
        timerElement.textContent = `za ${minutes}min ${seconds}s`;
    } else {
        timerElement.textContent = `za ${seconds}s`;
        timerElement.style.color = '#ff6b35';
    }
}