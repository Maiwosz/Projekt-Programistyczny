// Import dependencies
import { saveState } from './uiComponents.js';

// Keep track of sync status for folders
let syncStatus = {};

// Check if user has Google Drive connected
export async function checkGoogleDriveConnection() {
    try {
        const response = await fetch('/api/sync/providers', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        if (!response.ok) throw new Error('Błąd pobierania statusu synchronizacji');
        
        const data = await response.json();
        return data.providers.includes('google-drive');
    } catch (error) {
        console.error('Błąd sprawdzania połączenia z Google Drive:', error);
        return false;
    }
}

// Get detailed sync status for Google Drive
export async function getGoogleDriveSyncStatus() {
    try {
        const response = await fetch('/api/sync/google-drive/status', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        if (!response.ok) throw new Error('Błąd pobierania statusu synchronizacji');
        
        return await response.json();
    } catch (error) {
        console.error('Błąd pobierania statusu Google Drive:', error);
        return { connected: false, error: error.message };
    }
}

// Sync specific folder with Google Drive
export async function syncFolderWithGoogleDrive(folderId) {
    try {
        // Assuming your backend API needs the folder ID
        const response = await fetch(`/api/sync/google-drive/folder/${folderId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (!response.ok) throw new Error('Błąd synchronizacji folderu');
        
        const result = await response.json();
        // Update sync status for this folder
        syncStatus[folderId] = {
            lastSync: new Date(),
            provider: 'google-drive',
            status: 'synced'
        };
        saveState();
        return result;
    } catch (error) {
        console.error('Błąd synchronizacji z Google Drive:', error);
        throw error;
    }
}

// Get Google Drive auth URL
export async function getGoogleDriveAuthUrl() {
    try {
        const response = await fetch('/api/sync/google-drive/auth', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        if (!response.ok) throw new Error('Błąd generowania URL autoryzacji');
        
        const data = await response.json();
        return data.url;
    } catch (error) {
        console.error('Błąd pobierania URL autoryzacji Google Drive:', error);
        throw error;
    }
}

// Disconnect Google Drive
export async function disconnectGoogleDrive() {
    try {
        const response = await fetch('/api/sync/google-drive', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        if (!response.ok) throw new Error('Błąd odłączania Google Drive');
        
        return await response.json();
    } catch (error) {
        console.error('Błąd odłączania Google Drive:', error);
        throw error;
    }
}

// Show sync modal for folder
export function showSyncModal(folderId, folderName) {
    // Get sync modal element
    const syncModal = document.getElementById('syncModal');
    const folderTitleEl = document.getElementById('syncFolderName');
    const syncOptionsEl = document.getElementById('syncOptions');
    const syncStatusEl = document.getElementById('syncStatusInfo');
    
    // Set folder information
    document.getElementById('syncFolderId').value = folderId;
    folderTitleEl.textContent = folderName;
    
    // Clear previous options
    syncOptionsEl.innerHTML = '';
    syncStatusEl.innerHTML = '';
    
    // Check if Google Drive is connected
    checkGoogleDriveConnection().then(isConnected => {
        if (isConnected) {
            // Show Google Drive sync options
            getGoogleDriveSyncStatus().then(status => {
                if (status.connected) {
                    syncStatusEl.innerHTML = `
                        <div class="sync-status-connected">
                            <p>✅ Google Drive połączony</p>
                            <p>Ostatnia synchronizacja: ${status.lastSync ? new Date(status.lastSync).toLocaleString() : 'Brak'}</p>
                        </div>
                    `;
                    
                    syncOptionsEl.innerHTML = `
                        <button onclick="startFolderSync('${folderId}', 'google-drive')" class="sync-button">
                            Synchronizuj z Google Drive
                        </button>
                        <button onclick="disconnectSync('google-drive')" class="disconnect-button">
                            Odłącz Google Drive
                        </button>
                    `;
                } else {
                    syncStatusEl.innerHTML = `
                        <div class="sync-status-warning">
                            <p>⚠️ Konto Google Drive wymaga autoryzacji</p>
                        </div>
                    `;
                    
                    syncOptionsEl.innerHTML = `
                        <button onclick="authorizeGoogleDrive()" class="auth-button">
                            Połącz z Google Drive
                        </button>
                    `;
                }
            });
        } else {
            // Show option to connect Google Drive
            syncStatusEl.innerHTML = `
                <div class="sync-status-disconnected">
                    <p>❌ Brak połączenia z Google Drive</p>
                </div>
            `;
            
            syncOptionsEl.innerHTML = `
                <button onclick="authorizeGoogleDrive()" class="auth-button">
                    Połącz z Google Drive
                </button>
            `;
        }
        
        // Add information about future sync options
        syncOptionsEl.innerHTML += `
            <div class="future-sync-info">
                <p><i>Synchronizacja z aplikacją desktop i mobile będzie dostępna wkrótce.</i></p>
            </div>
        `;
    });
    
    // Display the modal
    syncModal.style.display = 'block';
}

// Close sync modal
export function closeSyncModal() {
    document.getElementById('syncModal').style.display = 'none';
}

// Start folder synchronization
export async function startFolderSync(folderId, provider) {
    try {
        // Currently only Google Drive is supported
        if (provider === 'google-drive') {
            await syncFolderWithGoogleDrive(folderId);
            alert('Synchronizacja z Google Drive zakończona pomyślnie');
            closeSyncModal();
        } else {
            alert('Ten provider synchronizacji nie jest jeszcze obsługiwany');
        }
    } catch (error) {
        alert('Błąd synchronizacji: ' + error.message);
    }
}

// Authorize Google Drive
export async function authorizeGoogleDrive() {
    try {
        const authUrl = await getGoogleDriveAuthUrl();
        // Open authorization URL in a new window
        window.open(authUrl, '_blank', 'width=600,height=700');
        alert('Po autoryzacji zamknij okno i odśwież stronę');
    } catch (error) {
        alert('Błąd autoryzacji Google Drive: ' + error.message);
    }
}

// Disconnect sync provider
export async function disconnectSync(provider) {
    try {
        if (provider === 'google-drive') {
            await disconnectGoogleDrive();
            alert('Google Drive zostało odłączone');
            closeSyncModal();
        } else {
            alert('Ten provider synchronizacji nie jest jeszcze obsługiwany');
        }
    } catch (error) {
        alert('Błąd odłączania synchronizacji: ' + error.message);
    }
}