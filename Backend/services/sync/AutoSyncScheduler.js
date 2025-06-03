const SyncManager = require('./SyncManager');
const SyncPair = require('../../models/SyncPair');

class AutoSyncScheduler {
    constructor() {
        this.intervalId = null;
        this.isRunning = false;
        this.checkIntervalMs = 60000; // Sprawdzaj co minutę
    }

    start() {
        if (this.isRunning) {
            console.log('AutoSyncScheduler już działa');
            return;
        }

        console.log('Uruchamianie AutoSyncScheduler...');
        this.isRunning = true;
        
        this.intervalId = setInterval(() => {
            this.checkAndRunAutoSync().catch(error => {
                console.error('Błąd w AutoSyncScheduler:', error);
            });
        }, this.checkIntervalMs);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        console.log('AutoSyncScheduler zatrzymany');
    }

    async checkAndRunAutoSync() {
        try {
            const now = new Date();
            
            // Znajdź wszystkie pary synchronizacji z włączoną automatyczną synchronizacją
            const syncPairs = await SyncPair.find({
                'autoSync.enabled': true,
                isActive: true,
                $or: [
                    { 'autoSync.nextAutoSync': { $lte: now } },
                    { 'autoSync.nextAutoSync': { $exists: false } }
                ]
            }).populate('localFolder', 'name');

            console.log(`Znaleziono ${syncPairs.length} par do automatycznej synchronizacji`);

            for (const syncPair of syncPairs) {
                try {
                    await this.runAutoSync(syncPair);
                } catch (error) {
                    console.error(`Błąd automatycznej synchronizacji dla pary ${syncPair._id}:`, error);
                    
                    // Zaplanuj następną próbę za 5 minut w przypadku błędu
                    syncPair.autoSync.nextAutoSync = new Date(now.getTime() + 5 * 60000);
                    await syncPair.save();
                }
            }
        } catch (error) {
            console.error('Błąd podczas sprawdzania automatycznej synchronizacji:', error);
        }
    }

    async runAutoSync(syncPair) {
        const now = new Date();
        
        console.log(`Rozpoczynam automatyczną synchronizację dla: ${syncPair.localFolder.name} (${syncPair.provider})`);
        
        try {
            // Wykonaj synchronizację
            const result = await SyncManager.syncFolder(syncPair.provider, syncPair.user, syncPair._id);
            
            // Aktualizuj statystyki
            syncPair.autoSync.lastAutoSync = now;
            syncPair.autoSync.nextAutoSync = new Date(now.getTime() + syncPair.autoSync.intervalMinutes * 60000);
            
            await syncPair.save();
            
            console.log(`Automatyczna synchronizacja zakończona pomyślnie. Plików przesłanych: ${result.filesTransferred}`);
            
            if (result.errors && result.errors.length > 0) {
                console.warn('Ostrzeżenia podczas synchronizacji:', result.errors);
            }
            
        } catch (error) {
            console.error(`Błąd automatycznej synchronizacji:`, error);
            throw error;
        }
    }

    // Metoda do włączenia automatycznej synchronizacji dla pary
    async enableAutoSync(syncPairId, intervalMinutes = 60) {
        try {
            const syncPair = await SyncPair.findById(syncPairId);
            if (!syncPair) {
                throw new Error('Para synchronizacji nie znaleziona');
            }

            const now = new Date();
            syncPair.autoSync.enabled = true;
            syncPair.autoSync.intervalMinutes = intervalMinutes;
            syncPair.autoSync.nextAutoSync = new Date(now.getTime() + intervalMinutes * 60000);
            
            await syncPair.save();
            
            console.log(`Włączono automatyczną synchronizację dla pary ${syncPairId} (co ${intervalMinutes} minut)`);
            return { success: true };
        } catch (error) {
            throw new Error(`Błąd włączania automatycznej synchronizacji: ${error.message}`);
        }
    }

    // Metoda do wyłączenia automatycznej synchronizacji dla pary
    async disableAutoSync(syncPairId) {
        try {
            const syncPair = await SyncPair.findById(syncPairId);
            if (!syncPair) {
                throw new Error('Para synchronizacji nie znaleziona');
            }

            syncPair.autoSync.enabled = false;
            syncPair.autoSync.nextAutoSync = null;
            
            await syncPair.save();
            
            console.log(`Wyłączono automatyczną synchronizację dla pary ${syncPairId}`);
            return { success: true };
        } catch (error) {
            throw new Error(`Błąd wyłączania automatycznej synchronizacji: ${error.message}`);
        }
    }

    // Metoda do zmiany interwału synchronizacji
    async updateSyncInterval(syncPairId, intervalMinutes) {
        try {
            const syncPair = await SyncPair.findById(syncPairId);
            if (!syncPair) {
                throw new Error('Para synchronizacji nie znaleziona');
            }

            const now = new Date();
            syncPair.autoSync.intervalMinutes = intervalMinutes;
            
            if (syncPair.autoSync.enabled) {
                syncPair.autoSync.nextAutoSync = new Date(now.getTime() + intervalMinutes * 60000);
            }
            
            await syncPair.save();
            
            console.log(`Zaktualizowano interwał synchronizacji dla pary ${syncPairId} na ${intervalMinutes} minut`);
            return { success: true };
        } catch (error) {
            throw new Error(`Błąd aktualizacji interwału synchronizacji: ${error.message}`);
        }
    }

    // Metoda do otrzymania statusu automatycznej synchronizacji
    async getAutoSyncStatus() {
        try {
            const totalPairs = await SyncPair.countDocuments({ 
                'autoSync.enabled': true,
                isActive: true 
            });

            const nextSync = await SyncPair.findOne({
                'autoSync.enabled': true,
                isActive: true,
                'autoSync.nextAutoSync': { $exists: true }
            }).sort({ 'autoSync.nextAutoSync': 1 }).select('autoSync.nextAutoSync');

            return {
                isRunning: this.isRunning,
                totalActivePairs: totalPairs,
                nextScheduledSync: nextSync ? nextSync.autoSync.nextAutoSync : null
            };
        } catch (error) {
            throw new Error(`Błąd pobierania statusu automatycznej synchronizacji: ${error.message}`);
        }
    }
}

// Singleton
module.exports = new AutoSyncScheduler();