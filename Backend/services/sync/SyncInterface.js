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

    // Pobranie folderów z usługi zewnętrznej i zapisanie w aplikacji
    async syncFoldersFrom() {
        throw new Error("Metoda syncFoldersFrom() musi być zaimplementowana");
    }

    // Wysłanie folderów z aplikacji do usługi zewnętrznej
    async syncFoldersTo() {
        throw new Error("Metoda syncFoldersTo() musi być zaimplementowana");
    }

    // Pobranie plików z usługi zewnętrznej i zapisanie w aplikacji
    async syncFilesFrom() {
        throw new Error("Metoda syncFilesFrom() musi być zaimplementowana");
    }

    // Wysłanie plików z aplikacji do usługi zewnętrznej
    async syncFilesTo() {
        throw new Error("Metoda syncFilesTo() musi być zaimplementowana");
    }

    // Pełna synchronizacja w obu kierunkach
    async fullSync() {
        throw new Error("Metoda fullSync() musi być zaimplementowana");
    }

    // Pobranie URL potrzebnego do autoryzacji (jeśli wymagane)
    getAuthUrl() {
        throw new Error("Metoda getAuthUrl() musi być zaimplementowana");
    }

    // Obsługa callbacku po autoryzacji (jeśli wymagane)
    async handleAuthCallback(params) {
        throw new Error("Metoda handleAuthCallback() musi być zaimplementowana");
    }
}

module.exports = SyncInterface;