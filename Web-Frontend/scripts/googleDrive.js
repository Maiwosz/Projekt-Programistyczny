// scripts/googleDrive.js

// Stan połączenia Google Drive
let googleDriveStatus = {
    isConnected: false,
    client: null
};

// Inicjalizacja po załadowaniu strony
document.addEventListener('DOMContentLoaded', async () => {
	// Sprawdź parametry URL po powrocie z OAuth
    const urlParams = new URLSearchParams(window.location.search);
    const gdriveStatus = urlParams.get('gdrive');
    
    if (gdriveStatus === 'success') {
        // Usuń parametry z URL
        window.history.replaceState({}, document.title, window.location.pathname);
        // Pokaż komunikat sukcesu
        setTimeout(() => alert('Google Drive został pomyślnie połączony!'), 500);
    } else if (gdriveStatus === 'error') {
        const errorMsg = urlParams.get('msg');
        window.history.replaceState({}, document.title, window.location.pathname);
        alert('Błąd połączenia z Google Drive: ' + (errorMsg || 'Nieznany błąd'));
    }
	
    // Upewnij się, że modal jest ukryty na początku
    const modal = document.getElementById('googleDriveModal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Ukryj wszystkie sekcje modala na początku
    const sections = ['disconnected', 'connected', 'loading'];
    sections.forEach(s => {
        const element = document.getElementById(`gdrive-${s}`);
        if (element) {
            element.style.display = 'none';
        }
    });
    
    // Sprawdź status Google Drive
    await checkGoogleDriveStatus();
    
    // Dodaj event listener dla zamykania modala przy kliknięciu w tło
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeGoogleDriveModal();
            }
        });
    }
});

// Sprawdzenie statusu połączenia Google Drive
async function checkGoogleDriveStatus() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch('/api/google-drive/status', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const status = await response.json();
            // Poprawka: sprawdź czy status ma pole 'connected' zamiast 'isConnected'
            googleDriveStatus = {
                isConnected: status.connected || false,
                client: status
            };
            updateGoogleDriveStatus(googleDriveStatus);
        } else {
            // Brak połączenia
            googleDriveStatus = { isConnected: false, client: null };
            updateGoogleDriveStatus(googleDriveStatus);
        }
    } catch (error) {
        console.error('Błąd sprawdzania statusu Google Drive:', error);
        googleDriveStatus = { isConnected: false, client: null };
        updateGoogleDriveStatus(googleDriveStatus);
    }
}

// Aktualizacja statusu Google Drive w profilu
function updateGoogleDriveStatus(status) {
    const statusText = document.getElementById('gdriveStatus');
    const statusIndicator = document.getElementById('gdriveIndicator');
    
    if (statusText && statusIndicator) {
        if (status.isConnected) {
            statusText.textContent = 'Połączono';
            statusIndicator.textContent = '●';
            statusIndicator.className = 'gdrive-status-indicator connected';
        } else {
            statusText.textContent = 'Niepołączono';
            statusIndicator.textContent = '○';
            statusIndicator.className = 'gdrive-status-indicator disconnected';
        }
    }
}

// Pokazanie modala Google Drive
async function showGoogleDriveModal() {
    const modal = document.getElementById('googleDriveModal');
    if (!modal) {
        console.error('Modal Google Drive nie został znaleziony');
        return;
    }

    // Aktualizuj status przed pokazaniem
    await checkGoogleDriveStatus();
    
    // Pokaż modal
    modal.style.display = 'block';
    
    // Dodaj klasę animacji
    setTimeout(() => {
        modal.classList.add('show');
    }, 10);
    
    // Pokaż odpowiednią sekcję
    showGoogleDriveSection(googleDriveStatus.isConnected ? 'connected' : 'disconnected');
}

// Pokazanie odpowiedniej sekcji modala
function showGoogleDriveSection(section) {
    const sections = ['disconnected', 'connected', 'loading'];
    
    sections.forEach(s => {
        const element = document.getElementById(`gdrive-${s}`);
        if (element) {
            element.style.display = s === section ? 'block' : 'none';
        }
    });

    if (section === 'connected' && googleDriveStatus.client) {
        populateConnectedSection(googleDriveStatus.client);
    }
}

// Wypełnienie sekcji połączonego konta
function populateConnectedSection(client) {
    // Podstawowe informacje
    const emailSpan = document.getElementById('gdrive-email');
    const nameSpan = document.getElementById('gdrive-name');
    const lastSyncSpan = document.getElementById('gdrive-last-sync');
    const statusSpan = document.getElementById('gdrive-status');

    if (emailSpan) emailSpan.textContent = client.googleUser?.email || 'Brak danych';
    if (nameSpan) nameSpan.textContent = client.name || 'Brak nazwy';
    if (lastSyncSpan) lastSyncSpan.textContent = client.lastSync ? 
        new Date(client.lastSync).toLocaleString('pl-PL') : 'Nigdy';
    if (statusSpan) {
        statusSpan.textContent = client.connected ? 'Połączono' : 'Rozłączono';
        statusSpan.className = `status-indicator ${client.connected ? 'connected' : 'disconnected'}`;
    }

    // Statystyki
    const totalFilesSpan = document.getElementById('gdrive-total-files');
    const totalSizeSpan = document.getElementById('gdrive-total-size');
    const uploadedSpan = document.getElementById('gdrive-uploaded');
    const downloadedSpan = document.getElementById('gdrive-downloaded');

    if (totalFilesSpan) totalFilesSpan.textContent = client.stats?.totalFiles || '0';
    if (totalSizeSpan) totalSizeSpan.textContent = formatFileSize(client.stats?.totalSize || 0);
    if (uploadedSpan) uploadedSpan.textContent = client.stats?.filesUploaded || '0';
    if (downloadedSpan) downloadedSpan.textContent = client.stats?.filesDownloaded || '0';

    // POPRAWKA: Ustawienia - lepsze zabezpieczenie
    const autoSyncCheckbox = document.getElementById('auto-sync-enabled');
    const syncIntervalInput = document.getElementById('sync-interval');
    const syncDirectionSelect = document.getElementById('sync-direction');
    const maxFileSizeInput = document.getElementById('max-file-size');

    // POPRAWKA: Zabezpieczenie przed undefined syncSettings
    const syncSettings = client.syncSettings || {};
    const filters = syncSettings.filters || {};

    console.log('Ustawienia z serwera:', syncSettings); // DEBUG

    if (autoSyncCheckbox) {
        // POPRAWKA: Sprawdź czy syncSettings ma autoSync, jeśli nie - ustaw domyślną wartość
        const autoSyncValue = syncSettings.hasOwnProperty('autoSync') ? syncSettings.autoSync : false;
        autoSyncCheckbox.checked = Boolean(autoSyncValue);
        console.log('Ustawiono autoSync na:', autoSyncCheckbox.checked); // DEBUG
    }
    if (syncIntervalInput) syncIntervalInput.value = Math.floor((syncSettings.syncInterval || 300000) / 60000);
    if (syncDirectionSelect) syncDirectionSelect.value = syncSettings.syncDirection || 'bidirectional';
    if (maxFileSizeInput) maxFileSizeInput.value = Math.floor((filters.maxFileSize || 104857600) / 1048576);
}

// Połączenie z Google Drive
async function connectGoogleDrive() {
    const token = localStorage.getItem('token');
    if (!token) return;

    showGoogleDriveSection('loading');

    try {
        // Pobierz URL autoryzacji
        const response = await fetch('/api/google-drive/auth-url', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            // Przekieruj do Google OAuth
            window.location.href = data.authUrl;
        } else {
            const error = await response.json();
            alert(`Błąd: ${error.error}`);
            showGoogleDriveSection('disconnected');
        }
    } catch (error) {
        console.error('Błąd łączenia z Google Drive:', error);
        alert('Błąd łączenia z Google Drive');
        showGoogleDriveSection('disconnected');
    }
}

// Rozłączenie Google Drive
async function disconnectGoogleDrive() {
    if (!confirm('Czy na pewno chcesz odłączyć Google Drive?')) {
        return;
    }

    const token = localStorage.getItem('token');
    if (!token) return;

    showGoogleDriveSection('loading');

    try {
        const response = await fetch('/api/google-drive/disconnect', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            googleDriveStatus = { isConnected: false, client: null };
            updateGoogleDriveStatus(googleDriveStatus);
            showGoogleDriveSection('disconnected');
            alert('Google Drive został odłączony');
        } else {
            const error = await response.json();
            alert(`Błąd: ${error.error}`);
        }
    } catch (error) {
        console.error('Błąd rozłączania Google Drive:', error);
        alert('Błąd rozłączania Google Drive');
    }
}

// Zapisanie ustawień Google Drive
async function saveGoogleDriveSettings() {
    const token = localStorage.getItem('token');
    if (!token) return;

    const autoSyncCheckbox = document.getElementById('auto-sync-enabled');
    const syncIntervalInput = document.getElementById('sync-interval');
    const syncDirectionSelect = document.getElementById('sync-direction');
    const maxFileSizeInput = document.getElementById('max-file-size');

    const autoSync = autoSyncCheckbox ? autoSyncCheckbox.checked : false;
    const syncInterval = (syncIntervalInput?.value || 5) * 60000; // konwersja na ms
    const syncDirection = syncDirectionSelect?.value || 'bidirectional';
    const maxFileSize = (maxFileSizeInput?.value || 100) * 1048576; // konwersja na bajty

    const syncSettings = {
        autoSync: autoSync,
        syncInterval: syncInterval,
        syncDirection: syncDirection,
        filters: {
            maxFileSize: maxFileSize
        }
    };

    console.log('Zapisywane ustawienia:', syncSettings); // DEBUG

    try {
        const response = await fetch('/api/google-drive/settings', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ syncSettings })
        });

        if (response.ok) {
            const result = await response.json();
            console.log('Odpowiedź serwera:', result); // DEBUG
            alert('Ustawienia zostały zapisane');
            
            // POPRAWKA: Odśwież status po zapisaniu
            await checkGoogleDriveStatus();
            
            // POPRAWKA: Ponownie wypełnij sekcję z zaktualizowanymi danymi
            if (googleDriveStatus.client) {
                populateConnectedSection(googleDriveStatus.client);
            }
        } else {
            const error = await response.json();
            alert(`Błąd: ${error.error}`);
        }
    } catch (error) {
        console.error('Błąd zapisywania ustawień:', error);
        alert('Błąd zapisywania ustawień');
    }
}

// Ręczna synchronizacja
async function triggerManualSync() {
    const token = localStorage.getItem('token');
    if (!token) {
        alert('Brak tokena autoryzacji');
        return;
    }

    const button = event.target;
    const originalText = button.textContent;
    button.textContent = 'Synchronizuję...';
    button.disabled = true;

    try {
        console.log('Rozpoczynam ręczną synchronizację...'); // DEBUG
        
        const response = await fetch('/api/google-drive/sync', {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();
        console.log('Odpowiedź serwera:', result); // DEBUG

        if (response.ok) {
            if (result.success) {
                let message = 'Synchronizacja zakończona pomyślnie!';
                
                if (result.folder) {
                    message += `\nFolder: ${result.folder.name}`;
                }
                
                if (result.result && result.result.results) {
                    const results = result.result.results;
                    if (results.upload) {
                        message += `\nWysłano: ${results.upload.uploadedCount} plików`;
                        if (results.upload.errors && results.upload.errors.length > 0) {
                            message += ` (${results.upload.errors.length} błędów)`;
                        }
                    }
                    if (results.download) {
                        message += `\nPobrano: ${results.download.downloadedCount} plików`;
                        if (results.download.errors && results.download.errors.length > 0) {
                            message += ` (${results.download.errors.length} błędów)`;
                        }
                    }
                }
                
                alert(message);
                
                // Odśwież status po synchronizacji
                await checkGoogleDriveStatus();
                
                // Odśwież sekcję connected jeśli jest otwarta
                if (googleDriveStatus.client) {
                    populateConnectedSection(googleDriveStatus.client);
                }
                
            } else if (result.skipped) {
                alert(`Synchronizacja pominięta: ${result.message}`);
            } else {
                alert(`Błąd synchronizacji: ${result.error || 'Nieznany błąd'}`);
            }
        } else {
            // Obsługa błędów HTTP
            let errorMessage = `Błąd synchronizacji (${response.status}): `;
            
            if (result.error) {
                errorMessage += result.error;
                
                // Dodaj informacje debug jeśli są dostępne
                if (result.debug) {
                    console.log('Debug info:', result.debug);
                    errorMessage += `\n\nInformacje debug:\n`;
                    errorMessage += `User ID: ${result.debug.userId}\n`;
                    errorMessage += `Wszystkie foldery: ${result.debug.totalFolders}\n`;
                    errorMessage += `Aktywne foldery: ${result.debug.activeFolders}`;
                }
            } else {
                errorMessage += 'Nieznany błąd serwera';
            }
            
            alert(errorMessage);
        }
    } catch (error) {
        console.error('Błąd synchronizacji:', error);
        alert(`Błąd połączenia: ${error.message}`);
    } finally {
        button.textContent = originalText;
        button.disabled = false;
    }
}

// Zamknięcie modala
function closeGoogleDriveModal() {
    const modal = document.getElementById('googleDriveModal');
    if (modal) {
        modal.classList.remove('show');
        
        // Opóźnienie ukrycia dla animacji
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }
}

// Funkcja pomocnicza do formatowania rozmiaru pliku
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Globalne funkcje dla dostępu z HTML
window.showGoogleDriveModal = showGoogleDriveModal;
window.closeGoogleDriveModal = closeGoogleDriveModal;
window.connectGoogleDrive = connectGoogleDrive;
window.disconnectGoogleDrive = disconnectGoogleDrive;
window.saveGoogleDriveSettings = saveGoogleDriveSettings;
window.triggerManualSync = triggerManualSync;