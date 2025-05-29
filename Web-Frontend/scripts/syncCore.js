// ========== SYNCHRONIZACJA - ELEMENTY WSPÓLNE ==========

// Wspólne zmienne stanu
export let availableProviders = [];
export let syncPairs = [];

let logout;
if (typeof window !== 'undefined' && window.logout) {
    logout = window.logout;
}

// ========== API PODSTAWOWE ==========

function getAuthToken() {
    const token = localStorage.getItem('token');
    if (!token) {
        throw new Error('Brak tokenu autoryzacyjnego');
    }
    return token;
}

export async function loadAvailableProviders() {
    try {
        const response = await fetch('/api/sync/providers', {
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Błąd ładowania providerów');
        }
        
        const data = await response.json();
        availableProviders = data.providers || [];
        console.log('Loaded providers:', availableProviders); // Debug
        return availableProviders;
    } catch (error) {
        console.error('Error loading providers:', error);
        // Jeśli błąd autoryzacji, wyloguj użytkownika
        if (error.message === 'Brak tokenu autoryzacyjnego') {
            if (typeof logout === 'function') logout();
        }
        availableProviders = [];
        return [];
    }
}

export async function loadExistingSyncPairs() {
    try {
        const response = await fetch('/api/sync/pairs', {
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Błąd ładowania par synchronizacji');
        }
        
        const data = await response.json();
        syncPairs = data.syncPairs || [];
        console.log('Loaded sync pairs:', syncPairs); // Debug
        return syncPairs;
    } catch (error) {
        console.error('Error loading sync pairs:', error);
        if (error.message === 'Brak tokenu autoryzacyjnego') {
            if (typeof logout === 'function') logout();
        }
        syncPairs = [];
        return [];
    }
}

export async function getSyncPairDetails(syncPairId) {
    try {
        const response = await fetch(`/api/sync/pairs/${syncPairId}`, {
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Błąd ładowania szczegółów pary synchronizacji');
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error loading sync pair details:', error);
        if (error.message === 'Brak tokenu autoryzacyjnego') {
            if (typeof logout === 'function') logout();
        }
        throw error;
    }
}

export async function updateSyncPairSettings(syncPairId, settings) {
    try {
        const response = await fetch(`/api/sync/pairs/${syncPairId}/settings`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify(settings)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Błąd aktualizacji ustawień');
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error updating sync pair settings:', error);
        throw error;
    }
}

export async function checkProviderConnection(provider) {
    try {
        const response = await fetch(`/api/sync/${provider}/connection`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.connected;
        }
        
        return false;
    } catch (error) {
        console.error('Error checking provider connection:', error);
        return false;
    }
}

export async function createSyncPair(provider, localFolderId, externalFolderId, syncDirection) {
    try {
        const response = await fetch(`/api/sync/${provider}/pairs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                localFolderId: localFolderId,
                externalFolderId: externalFolderId,
                syncDirection: syncDirection
            })
        });
        
        if (response.ok) {
            const syncPair = await response.json();
            return syncPair;
        } else {
            const error = await response.json();
            throw new Error(error.error || 'Błąd tworzenia pary synchronizacji');
        }
    } catch (error) {
        console.error('Error creating sync pair:', error);
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
            return true;
        } else {
            const error = await response.json();
            throw new Error(error.error || 'Błąd usuwania pary synchronizacji');
        }
    } catch (error) {
        console.error('Error removing sync pair:', error);
        throw error;
    }
}

export async function startFolderSync(provider, syncPairId = null) {
    try {
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
            return result;
        } else {
            throw new Error(result.error || 'Błąd synchronizacji');
        }
    } catch (error) {
        console.error('Sync error:', error);
        throw error;
    }
}

export async function disconnectProvider(provider) {
    try {
        const response = await fetch(`/api/sync/${provider}/disconnect`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (response.ok) {
            return true;
        } else {
            const error = await response.json();
            throw new Error(error.error || 'Błąd rozłączania');
        }
    } catch (error) {
        console.error('Disconnect error:', error);
        throw error;
    }
}

// ========== FUNKCJE POMOCNICZE ==========

export function getProviderDisplayName(provider) {
    const names = {
        'google-drive': 'Google Drive',
        'desktop': 'Komputer',
        'mobile': 'Telefon'
    };
    return names[provider] || provider;
}

export function getSyncDirectionDisplayName(direction) {
    const names = {
        'bidirectional': 'Dwukierunkowa',
        'to-external': 'Tylko wysyłaj',
        'from-external': 'Tylko pobieraj'
    };
    return names[direction] || direction;
}

export function formatSyncResult(result) {
    if (result.results) {
        const successful = result.results.filter(r => !r.error).length;
        const failed = result.results.filter(r => r.error).length;
        return `Synchronizacja zakończona. Sukces: ${successful}, Błędy: ${failed}`;
    } else {
        const transferred = result.filesTransferred || 0;
        const errors = result.errors || [];
        if (errors.length === 0) {
            return `Synchronizacja zakończona. Przeniesiono plików: ${transferred}`;
        } else {
            return `Synchronizacja z błędami. Przeniesiono: ${transferred}, Błędy: ${errors.length}`;
        }
    }
}