// scripts/googleDriveUI.js
// Interfejs użytkownika dla Google Drive

class GoogleDriveUI {
    constructor(api) {
        this.api = api;
        this.modal = null;
        this.elements = {};
        this.isInitialized = false;
    }

    // Inicjalizacja interfejsu
    async init() {
        if (this.isInitialized) return;

        this.bindElements();
        this.setupEventListeners();
        await this.refreshStatus();
        this.handleOAuthCallback();
        
        this.isInitialized = true;
        console.log('Google Drive UI zainicjalizowany');
    }

    // Powiązanie elementów DOM
    bindElements() {
        this.elements = {
            // Status w profilu
            statusText: document.getElementById('gdriveStatus'),
            statusIndicator: document.getElementById('gdriveIndicator'),
            configButton: document.getElementById('gdriveButton'),
            
            // Modal
            modal: document.getElementById('googleDriveModal'),
            
            // Sekcje modala
            disconnectedSection: document.getElementById('gdrive-disconnected'),
            connectedSection: document.getElementById('gdrive-connected'),
            loadingSection: document.getElementById('gdrive-loading'),
            
            // Informacje o połączeniu
            emailSpan: document.getElementById('gdrive-email'),
            nameSpan: document.getElementById('gdrive-name'),
            lastSyncSpan: document.getElementById('gdrive-last-sync'),
            statusSpan: document.getElementById('gdrive-status'),
            
            // Ustawienia synchronizacji
            autoSyncCheckbox: document.getElementById('auto-sync-enabled'),
            syncIntervalInput: document.getElementById('sync-interval'),
            syncDirectionSelect: document.getElementById('sync-direction'),
            maxFileSizeInput: document.getElementById('max-file-size')
        };

        this.modal = this.elements.modal;
    }

    // Ustawienie event listenerów
    setupEventListeners() {
        // Zamykanie modala przy kliknięciu w tło
        if (this.modal) {
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) {
                    this.closeModal();
                }
            });
        }

        // Escape key do zamykania modala
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isModalOpen()) {
                this.closeModal();
            }
        });
    }

    // Obsługa callback z OAuth
    handleOAuthCallback() {
		const urlParams = new URLSearchParams(window.location.search);
		const gdriveStatus = urlParams.get('gdrive');
		
		if (gdriveStatus === 'success') {
			// Wyczyść URL
			window.history.replaceState({}, document.title, window.location.pathname);
			
			this.showNotification('Google Drive został pomyślnie połączony!', 'success');
			
			// Odśwież status po krótkim opóźnieniu
			setTimeout(async () => {
				await this.refreshStatus();
				
				// Jeśli modal jest otwarty, pokaż sekcję connected
				if (this.isModalOpen()) {
					this.showSection('connected');
				}
			}, 1000);
			
		} else if (gdriveStatus === 'error') {
			const errorMsg = urlParams.get('msg');
			
			// Wyczyść URL
			window.history.replaceState({}, document.title, window.location.pathname);
			
			this.showNotification(
				'Błąd połączenia z Google Drive: ' + (errorMsg || 'Nieznany błąd'), 
				'error'
			);
			
			// Jeśli modal jest otwarty, pokaż sekcję disconnected
			if (this.isModalOpen()) {
				this.showSection('disconnected');
			}
		}
	}

    // === ZARZĄDZANIE STATUSEM ===

    async refreshStatus() {
        try {
            const status = await this.api.checkStatus();
            this.updateStatusDisplay(status);
            return status;
        } catch (error) {
            console.error('Błąd odświeżania statusu:', error);
            this.updateStatusDisplay({ isConnected: false });
        }
    }

    updateStatusDisplay(status) {
        if (!this.elements.statusText || !this.elements.statusIndicator) return;

        if (status.isConnected) {
            this.elements.statusText.textContent = 'Połączono';
            this.elements.statusIndicator.textContent = '●';
            this.elements.statusIndicator.className = 'gdrive-status-indicator connected';
        } else {
            this.elements.statusText.textContent = 'Niepołączono';
            this.elements.statusIndicator.textContent = '○';
            this.elements.statusIndicator.className = 'gdrive-status-indicator disconnected';
        }
    }

    // === ZARZĄDZANIE MODALEM ===

    async openModal() {
        if (!this.modal) {
            console.error('Modal Google Drive nie został znaleziony');
            return;
        }

        // Odśwież status przed otwarciem
        const status = await this.refreshStatus();
        
        // Pokaż modal
        this.modal.style.display = 'block';
        
        // Animacja
        setTimeout(() => {
            this.modal.classList.add('show');
        }, 10);
        
        // Pokaż odpowiednią sekcję
        this.showSection(status.isConnected ? 'connected' : 'disconnected');
    }

    closeModal() {
        if (!this.modal) return;

        this.modal.classList.remove('show');
        
        setTimeout(() => {
            this.modal.style.display = 'none';
        }, 300);
    }

    isModalOpen() {
        return this.modal && this.modal.style.display === 'block';
    }

    showSection(section) {
        const sections = ['disconnected', 'connected', 'loading'];
        
        sections.forEach(s => {
            const element = this.elements[`${s}Section`];
            if (element) {
                element.style.display = s === section ? 'block' : 'none';
            }
        });

        if (section === 'connected' && this.api.status.client) {
            this.populateConnectedSection(this.api.status.client);
        }
    }

    // === SEKCJA POŁĄCZONEGO KONTA ===

    populateConnectedSection(client) {
        // Podstawowe informacje
        if (this.elements.emailSpan) {
            this.elements.emailSpan.textContent = client.googleUser?.email || 'Brak danych';
        }
        if (this.elements.nameSpan) {
            this.elements.nameSpan.textContent = client.name || 'Brak nazwy';
        }
        if (this.elements.lastSyncSpan) {
            this.elements.lastSyncSpan.textContent = this.api.formatDate(client.lastSync);
        }
        if (this.elements.statusSpan) {
            this.elements.statusSpan.textContent = client.connected ? 'Połączono' : 'Rozłączono';
            this.elements.statusSpan.className = `status-indicator ${client.connected ? 'connected' : 'disconnected'}`;
        }

        // Wypełnienie ustawień synchronizacji
        this.populateSyncSettings(client.syncSettings || {});
    }

    populateSyncSettings(syncSettings) {
        if (this.elements.autoSyncCheckbox) {
            this.elements.autoSyncCheckbox.checked = Boolean(syncSettings.autoSync);
        }
        
        if (this.elements.syncIntervalInput) {
            this.elements.syncIntervalInput.value = this.api.formatSyncInterval(syncSettings.syncInterval || 300000);
        }
        
        if (this.elements.syncDirectionSelect) {
            this.elements.syncDirectionSelect.value = syncSettings.syncDirection || 'bidirectional';
        }
        
        if (this.elements.maxFileSizeInput) {
            const maxFileSize = syncSettings.filters?.maxFileSize || 104857600;
            this.elements.maxFileSizeInput.value = this.api.formatMaxFileSize(maxFileSize);
        }
    }

    // === AKCJE UŻYTKOWNIKA ===

    async connect() {
		this.showSection('loading');

		try {
			const authUrl = await this.api.getAuthUrl();
			
			// ZMIANA: Otwórz w tym samym oknie zamiast nowego
			window.location.href = authUrl;
			
		} catch (error) {
			console.error('Błąd łączenia z Google Drive:', error);
			this.showNotification(`Błąd łączenia: ${error.message}`, 'error');
			this.showSection('disconnected');
		}
	}

    async disconnect() {
        if (!confirm('Czy na pewno chcesz odłączyć Google Drive?')) {
            return;
        }

        this.showSection('loading');

        try {
            await this.api.disconnect();
            this.updateStatusDisplay({ isConnected: false });
            this.showSection('disconnected');
            this.showNotification('Google Drive został odłączony', 'success');
        } catch (error) {
            console.error('Błąd rozłączania:', error);
            this.showNotification(`Błąd rozłączania: ${error.message}`, 'error');
            this.showSection('connected');
        }
    }

    async saveSettings() {
        try {
            const settings = this.collectSettings();
            await this.api.updateSyncSettings(settings);
            
            this.showNotification('Ustawienia zostały zapisane', 'success');
            
            // Odśwież status
            await this.refreshStatus();
            
            // Ponownie wypełnij sekcję
            if (this.api.status.client) {
                this.populateConnectedSection(this.api.status.client);
            }
        } catch (error) {
            console.error('Błąd zapisywania ustawień:', error);
            this.showNotification(`Błąd zapisywania: ${error.message}`, 'error');
        }
    }

    collectSettings() {
        const autoSync = this.elements.autoSyncCheckbox ? this.elements.autoSyncCheckbox.checked : false;
        const syncInterval = this.api.parseSyncInterval(this.elements.syncIntervalInput?.value || 5);
        const syncDirection = this.elements.syncDirectionSelect?.value || 'bidirectional';
        const maxFileSize = this.api.parseMaxFileSize(this.elements.maxFileSizeInput?.value || 100);

        return {
            autoSync,
            syncInterval,
            syncDirection,
            filters: {
                maxFileSize
            }
        };
    }

    async triggerManualSync() {
        const button = event.target;
        const originalText = button.textContent;
        
        button.textContent = 'Synchronizuję...';
        button.disabled = true;

        try {
            const result = await this.api.triggerManualSync();
            
            if (result.success) {
                this.showNotification(result.message || 'Synchronizacja zakończona pomyślnie!', 'success');
                
                // Odśwież status
                await this.refreshStatus();
                
                // Odśwież sekcję connected
                if (this.api.status.client) {
                    this.populateConnectedSection(this.api.status.client);
                }
            } else {
                this.showNotification(`Błąd synchronizacji: ${result.message}`, 'error');
            }
        } catch (error) {
            console.error('Błąd synchronizacji:', error);
            this.showNotification(`Błąd synchronizacji: ${error.message}`, 'error');
        } finally {
            button.textContent = originalText;
            button.disabled = false;
        }
    }

    // === POWIADOMIENIA ===

    showNotification(message, type = 'info') {
        // Prosta implementacja powiadomień
        // Możesz zastąpić to bardziej zaawansowanym systemem
        if (type === 'error') {
            alert(`❌ ${message}`);
        } else if (type === 'success') {
            alert(`✅ ${message}`);
        } else {
            alert(`ℹ️ ${message}`);
        }
    }
}

// Globalna instancja UI
let googleDriveUI;

// Inicjalizacja po załadowaniu DOM
document.addEventListener('DOMContentLoaded', async () => {
    try {
        googleDriveUI = new GoogleDriveUI(googleDriveAPI);
        await googleDriveUI.init();
    } catch (error) {
        console.error('Błąd inicjalizacji Google Drive UI:', error);
    }
});

// Globalne funkcje dla dostępu z HTML
window.showGoogleDriveModal = () => {
    if (googleDriveUI) {
        googleDriveUI.openModal();
    }
};

window.closeGoogleDriveModal = () => {
    if (googleDriveUI) {
        googleDriveUI.closeModal();
    }
};

window.connectGoogleDrive = () => {
    if (googleDriveUI) {
        googleDriveUI.connect();
    }
};

window.disconnectGoogleDrive = () => {
    if (googleDriveUI) {
        googleDriveUI.disconnect();
    }
};

window.saveGoogleDriveSettings = () => {
    if (googleDriveUI) {
        googleDriveUI.saveSettings();
    }
};

window.triggerManualSync = () => {
    if (googleDriveUI) {
        googleDriveUI.triggerManualSync();
    }
};