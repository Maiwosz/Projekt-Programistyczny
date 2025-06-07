const GoogleDriveClient = require('../models/GoogleDriveClient');

class GoogleDriveSchedulerService {
    
    constructor(googleDriveSyncService) {
        // POPRAWKA: Sprawdź czy to instancja czy klasa
        this.googleDriveSyncService = googleDriveSyncService;
        this.activeSyncIntervals = new Map();
        this.isShuttingDown = false; // Flaga do graceful shutdown
    }
    
    // === ZARZĄDZANIE AUTOMATYCZNĄ SYNCHRONIZACJĄ ===
    
    async startAutoSync(userId) {
        console.log(`[SCHEDULER] Włączanie automatycznej synchronizacji dla userId: ${userId}`);
        
        try {
            const driveClient = await this._validateClient(userId);
            driveClient.syncSettings.autoSync = true;
            await driveClient.save();
            
            await this._startAutoSync(driveClient);
            console.log(`[SCHEDULER] Automatyczna synchronizacja włączona dla klienta: ${driveClient.clientId}`);
            
            return { success: true, message: 'Automatyczna synchronizacja włączona' };
        } catch (error) {
            console.error('[SCHEDULER] Błąd włączania automatycznej synchronizacji:', error);
            throw error;
        }
    }
    
    async stopAutoSync(userId) {
        try {
            const driveClient = await GoogleDriveClient.findOne({ user: userId });
            if (driveClient) {
                driveClient.syncSettings.autoSync = false;
                await driveClient.save();
                this._stopAutoSync(driveClient.clientId);
                console.log(`[SCHEDULER] Automatyczna synchronizacja wyłączona dla klienta: ${driveClient.clientId}`);
            }
            return { success: true, message: 'Automatyczna synchronizacja wyłączona' };
        } catch (error) {
            console.error('[SCHEDULER] Błąd wyłączania automatycznej synchronizacji:', error);
            throw error;
        }
    }
    
    async updateSyncSettings(userId, settings) {
        const driveClient = await GoogleDriveClient.findOne({ user: userId });
        if (!driveClient) {
            throw new Error('Połączenie z Google Drive nie istnieje');
        }
        
        Object.assign(driveClient.syncSettings, settings);
        await driveClient.save();
        
        // Restart automatycznej synchronizacji z nowymi ustawieniami
        this._stopAutoSync(driveClient.clientId);
        if (driveClient.syncSettings.autoSync) {
            await this._startAutoSync(driveClient);
        }
        
        return driveClient.syncSettings;
    }
    
    // === METODY PRYWATNE - AUTOMATYCZNA SYNCHRONIZACJA ===
    
    async _startAutoSync(driveClient) {
        if (this.isShuttingDown) {
            console.log(`[SCHEDULER] Aplikacja się wyłącza - nie uruchamiam synchronizacji dla ${driveClient.clientId}`);
            return;
        }
        
        this._stopAutoSync(driveClient.clientId); // Zatrzymaj jeśli już działa
        
        const syncInterval = driveClient.syncSettings.syncInterval || 300000; // Domyślnie 5 minut
        
        // POPRAWKA: Dodaj sprawdzenie przed każdą synchronizacją
        const interval = setInterval(async () => {
            if (this.isShuttingDown) {
                console.log(`[SCHEDULER] Aplikacja się wyłącza - zatrzymuję synchronizację dla ${driveClient.clientId}`);
                this._stopAutoSync(driveClient.clientId);
                return;
            }
            
            try {
                console.log(`[SCHEDULER] Uruchamianie automatycznej synchronizacji dla klienta: ${driveClient.clientId}`);
                
                // POPRAWKA: Sprawdź czy driveClient nadal istnieje i jest aktywny
                const currentClient = await GoogleDriveClient.findById(driveClient._id);
                if (!currentClient || !currentClient.syncSettings.autoSync || !currentClient.status.isConnected) {
                    console.log(`[SCHEDULER] Klient ${driveClient.clientId} nie jest już aktywny - zatrzymuję synchronizację`);
                    this._stopAutoSync(driveClient.clientId);
                    return;
                }
                
                // POPRAWKA: Użyj metody syncFolder z instancji, nie klasy
                if (typeof this.googleDriveSyncService.syncFolder === 'function') {
                    await this.googleDriveSyncService.syncFolder(driveClient.user);
                } else {
                    console.error('[SCHEDULER] googleDriveSyncService.syncFolder nie jest funkcją');
                }
                
                console.log(`[SCHEDULER] ✓ Automatyczna synchronizacja zakończona dla klienta: ${driveClient.clientId}`);
                
            } catch (error) {
                console.error(`[SCHEDULER] ✗ Błąd automatycznej synchronizacji dla klienta ${driveClient.clientId}:`, error.message);
                
                // POPRAWKA: Jeśli błąd jest krytyczny, zatrzymaj synchronizację
                if (error.message.includes('Brak aktywnego połączenia') || 
                    error.message.includes('unauthorized') ||
                    error.message.includes('forbidden')) {
                    console.log(`[SCHEDULER] Krytyczny błąd - zatrzymuję synchronizację dla ${driveClient.clientId}`);
                    this._stopAutoSync(driveClient.clientId);
                    
                    // Oznacz klienta jako nieaktywnego
                    try {
                        await GoogleDriveClient.findByIdAndUpdate(driveClient._id, {
                            'syncSettings.autoSync': false,
                            'status.isConnected': false,
                            'status.lastError': error.message
                        });
                    } catch (updateError) {
                        console.error('[SCHEDULER] Błąd aktualizacji statusu klienta:', updateError);
                    }
                }
            }
        }, syncInterval);
        
        this.activeSyncIntervals.set(driveClient.clientId, {
            interval,
            clientId: driveClient.clientId,
            userId: driveClient.user,
            syncInterval,
            startTime: new Date()
        });
        
        console.log(`[SCHEDULER] ✓ Automatyczna synchronizacja uruchomiona dla klienta ${driveClient.clientId} z interwałem ${syncInterval}ms`);
    }
    
    _stopAutoSync(clientId) {
        const syncData = this.activeSyncIntervals.get(clientId);
        if (syncData) {
            clearInterval(syncData.interval);
            this.activeSyncIntervals.delete(clientId);
            console.log(`[SCHEDULER] ✓ Automatyczna synchronizacja zatrzymana dla klienta ${clientId}`);
        }
    }
    
    // === METODY PRYWATNE - WALIDACJA ===
    
    async _validateClient(userId) {
        const driveClient = await GoogleDriveClient.findOne({ 
            user: userId,
            'status.isConnected': true 
        });
        
        if (!driveClient) {
            throw new Error('Brak aktywnego połączenia z Google Drive');
        }
        
        // POPRAWKA: Sprawdź czy token nie wygasł
        if (driveClient.credentials.expiry_date && 
            driveClient.credentials.expiry_date < Date.now()) {
            console.warn(`[SCHEDULER] Token wygasł dla klienta ${driveClient.clientId}`);
            // Oznacz jako nieaktywny
            driveClient.status.isConnected = false;
            driveClient.status.lastError = 'Token wygasł';
            await driveClient.save();
            throw new Error('Token Google Drive wygasł');
        }
        
        return driveClient;
    }
    
    // === METODY PUBLICZNE - ZARZĄDZANIE CYKLEM ŻYCIA ===
    
    async initializeAutoSync() {
        console.log('[SCHEDULER] Inicjalizacja automatycznej synchronizacji...');
        
        this.isShuttingDown = false;
        
        try {
            // POPRAWKA: Sprawdź połączenie z bazą danych
            const activeClients = await GoogleDriveClient.find({
                'status.isConnected': true,
                'syncSettings.autoSync': true
            });
            
            console.log(`[SCHEDULER] Znaleziono ${activeClients.length} aktywnych klientów Google Drive`);
            
            let successCount = 0;
            let errorCount = 0;
            
            for (const driveClient of activeClients) {
                try {
                    await this._startAutoSync(driveClient);
                    successCount++;
                } catch (error) {
                    console.error(`[SCHEDULER] Błąd inicjalizacji synchronizacji dla ${driveClient.clientId}:`, error.message);
                    errorCount++;
                }
            }
            
            console.log(`[SCHEDULER] ✓ Uruchomiono automatyczną synchronizację dla ${successCount} klientów (błędów: ${errorCount})`);
            
            return { 
                initialized: successCount,
                errors: errorCount,
                total: activeClients.length 
            };
            
        } catch (error) {
            console.error('[SCHEDULER] Błąd inicjalizacji automatycznej synchronizacji:', error);
            throw error;
        }
    }
    
    async shutdown() {
        console.log('[SCHEDULER] Zatrzymywanie wszystkich automatycznych synchronizacji...');
        
        this.isShuttingDown = true;
        
        // Zatrzymaj wszystkie automatyczne synchronizacje
        const stoppedCount = this.activeSyncIntervals.size;
        
        for (const [clientId, syncData] of this.activeSyncIntervals) {
            try {
                clearInterval(syncData.interval);
                console.log(`[SCHEDULER] ✓ Zatrzymano synchronizację dla klienta: ${clientId}`);
            } catch (error) {
                console.error(`[SCHEDULER] Błąd zatrzymywania synchronizacji dla ${clientId}:`, error);
            }
        }
        
        this.activeSyncIntervals.clear();
        console.log(`[SCHEDULER] ✓ Zatrzymano wszystkie automatyczne synchronizacje Google Drive (${stoppedCount})`);
        
        return { stopped: stoppedCount };
    }
    
    // === METODY INFORMACYJNE ===
    
    getActiveSchedules() {
        const schedules = [];
        for (const [clientId, syncData] of this.activeSyncIntervals) {
            schedules.push({
                clientId,
                userId: syncData.userId,
                isActive: true,
                syncInterval: syncData.syncInterval,
                startTime: syncData.startTime,
                uptime: Date.now() - syncData.startTime.getTime()
            });
        }
        return schedules;
    }
    
    isAutoSyncActive(clientId) {
        return this.activeSyncIntervals.has(clientId);
    }
    
    getActiveSyncCount() {
        return this.activeSyncIntervals.size;   
    }
    
    async getSyncStatus(userId) {
        try {
            const driveClient = await GoogleDriveClient.findOne({ user: userId });
            if (!driveClient) {
                return { 
                    connected: false, 
                    autoSync: false, 
                    scheduled: false 
                };
            }
            
            return {
                connected: driveClient.status.isConnected,
                autoSync: driveClient.syncSettings.autoSync,
                scheduled: this.isAutoSyncActive(driveClient.clientId),
                syncInterval: driveClient.syncSettings.syncInterval,
                lastSync: driveClient.status.lastSync,
                syncInProgress: driveClient.status.syncInProgress,
                lastError: driveClient.status.lastError,
                tokenExpiry: driveClient.credentials.expiry_date
            };
        } catch (error) {
            console.error('[SCHEDULER] Błąd pobierania statusu synchronizacji:', error);
            throw error;
        }
    }
    
    // POPRAWKA: Dodaj metodę do monitorowania zdrowia
    async healthCheck() {
        const activeSchedules = this.getActiveSchedules();
        const totalScheduled = activeSchedules.length;
        
        let healthyCount = 0;
        const issues = [];
        
        for (const schedule of activeSchedules) {
            try {
                const driveClient = await GoogleDriveClient.findOne({ 
                    clientId: schedule.clientId 
                });
                
                if (!driveClient) {
                    issues.push(`Klient ${schedule.clientId} nie istnieje w bazie danych`);
                    continue;
                }
                
                if (!driveClient.status.isConnected) {
                    issues.push(`Klient ${schedule.clientId} nie jest połączony`);
                    continue;
                }
                
                if (!driveClient.syncSettings.autoSync) {
                    issues.push(`Klient ${schedule.clientId} ma wyłączoną automatyczną synchronizację`);
                    continue;
                }
                
                healthyCount++;
                
            } catch (error) {
                issues.push(`Błąd sprawdzania klienta ${schedule.clientId}: ${error.message}`);
            }
        }
        
        return {
            isHealthy: issues.length === 0,
            totalScheduled,
            healthyCount,
            issues,
            isShuttingDown: this.isShuttingDown
        };
    }
}

module.exports = GoogleDriveSchedulerService;