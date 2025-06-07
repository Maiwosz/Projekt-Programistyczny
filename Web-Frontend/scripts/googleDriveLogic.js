// scripts/googleDriveLogic.js
// Logika biznesowa dla Google Drive

class GoogleDriveAPI {
    constructor() {
        this.baseUrl = '/api/google-drive';
        this.status = {
            isConnected: false,
            client: null,
            lastSync: null
        };
    }

    // Pobierz token autoryzacji z localStorage
    getToken() {
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('Brak tokena autoryzacji');
        }
        return token;
    }

    // Wykonaj zapytanie HTTP z obsługą błędów
    async makeRequest(endpoint, options = {}) {
        const token = this.getToken();
        
        const defaultOptions = {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        };

        const finalOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        };

        const response = await fetch(`${this.baseUrl}${endpoint}`, finalOptions);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || data.error || `HTTP ${response.status}`);
        }

        return data;
    }

    // === STATUS I POŁĄCZENIE ===

    async checkStatus() {
        try {
            const response = await this.makeRequest('/status');
            
            this.status = {
                isConnected: response.status.connected || false,
                client: response.status,
                lastSync: response.status.lastSync
            };

            return this.status;
        } catch (error) {
            console.error('Błąd sprawdzania statusu:', error);
            this.status = {
                isConnected: false,
                client: null,
                lastSync: null
            };
            return this.status;
        }
    }

    async getAuthUrl() {
		const response = await this.makeRequest('/auth-url');
		return response.authUrl;
	}


    async disconnect() {
        await this.makeRequest('/disconnect', { method: 'POST' });
        
        this.status = {
            isConnected: false,
            client: null,
            lastSync: null
        };

        return { success: true };
    }

    // === USTAWIENIA SYNCHRONIZACJI ===

    async getSyncSettings() {
        const response = await this.makeRequest('/sync/settings');
        return response.syncSettings;
    }

    async updateSyncSettings(settings) {
        const response = await this.makeRequest('/sync/settings', {
            method: 'PUT',
            body: JSON.stringify(settings)
        });
        
        return response.syncSettings;
    }

    // === SYNCHRONIZACJA ===

    async triggerManualSync(folderId = null) {
        const body = folderId ? { folderId } : {};
        
        const response = await this.makeRequest('/sync/manual', {
            method: 'POST',
            body: JSON.stringify(body)
        });

        return response;
    }

    async startAutoSync() {
        const response = await this.makeRequest('/sync/auto/start', {
            method: 'POST'
        });

        return response;
    }

    async stopAutoSync() {
        const response = await this.makeRequest('/sync/auto/stop', {
            method: 'POST'
        });

        return response;
    }

    // === OPERACJE NA FOLDERACH ===

    async listFolders(parentId = 'root') {
        const response = await this.makeRequest(`/folders?parentId=${parentId}`);
        return response.folders;
    }

    async createFolder(name, parentId = 'root') {
        const response = await this.makeRequest('/folders', {
            method: 'POST',
            body: JSON.stringify({ name, parentId })
        });

        return response.folder;
    }

    // === DIAGNOSTYKA ===

    async getDiagnostics() {
        const response = await this.makeRequest('/diagnostics');
        return response.diagnostics;
    }

    // === POMOCNICZE ===

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatDate(dateString) {
        if (!dateString) return 'Nigdy';
        return new Date(dateString).toLocaleString('pl-PL');
    }

    formatSyncInterval(milliseconds) {
        return Math.floor(milliseconds / 60000); // konwersja na minuty
    }

    parseSyncInterval(minutes) {
        return minutes * 60000; // konwersja na milisekundy
    }

    formatMaxFileSize(bytes) {
        return Math.floor(bytes / 1048576); // konwersja na MB
    }

    parseMaxFileSize(megabytes) {
        return megabytes * 1048576; // konwersja na bajty
    }
}

// Instancja API do użycia w innych plikach
const googleDriveAPI = new GoogleDriveAPI();

// Export dla modułów
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GoogleDriveAPI, googleDriveAPI };
}