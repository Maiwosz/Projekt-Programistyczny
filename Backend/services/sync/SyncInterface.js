// Interface dla klas synchronizacji
class SyncInterface {
    constructor(userId) {
        if (this.constructor === SyncInterface) {
            throw new Error("Nie można tworzyć instancji klasy abstrakcyjnej");
        }
        this.userId = userId;
    }

    // Inicjalizacja połączenia z usługą synchronizacji
    async initialize() {
        throw new Error("Metoda initialize() musi być zaimplementowana");
    }

    // Sprawdzenie statusu połączenia
    async checkConnection() {
        throw new Error("Metoda checkConnection() musi być zaimplementowana");
    }

    // Rozłączenie z usługą synchronizacji
    async disconnect() {
        throw new Error("Metoda disconnect() musi być zaimplementowana");
    }

    // Pobieranie listy folderów z usługi zewnętrznej
    async getExternalFolders(parentId = null) {
        throw new Error("Metoda getExternalFolders() musi być zaimplementowana");
    }

    // Tworzenie pary synchronizacji między lokalnym folderem a zewnętrznym
    async createSyncPair(localFolderId, externalFolderId, syncDirection = 'bidirectional') {
        throw new Error("Metoda createSyncPair() musi być zaimplementowana");
    }

    // Usuwanie pary synchronizacji
    async removeSyncPair(syncPairId) {
        throw new Error("Metoda removeSyncPair() musi być zaimplementowana");
    }

    // Synchronizacja konkretnej pary folderów
    async syncFolder(syncPairId) {
        throw new Error("Metoda syncFolder() musi być zaimplementowana");
    }

    // Synchronizacja wszystkich aktywnych par dla danego providera
    async syncAllPairs() {
        throw new Error("Metoda syncAllPairs() musi być zaimplementowana");
    }

    // Pobranie URL potrzebnego do autoryzacji (jeśli wymagane)
    static getAuthUrl(userId) {
        throw new Error("Metoda getAuthUrl() musi być zaimplementowana");
    }

    // Obsługa callbacku po autoryzacji (jeśli wymagane)
    static async handleAuthCallback(userId, params) {
        throw new Error("Metoda handleAuthCallback() musi być zaimplementowana");
    }
}

module.exports = SyncInterface;