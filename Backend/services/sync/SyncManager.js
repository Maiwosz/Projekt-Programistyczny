const GoogleDriveSync = require('./providers/GoogleDriveSync');
const User = require('../../models/User');

class SyncManager {
    constructor() {
        this.providers = {
            'google-drive': GoogleDriveSync,
            // W przyszłości tutaj dodamy więcej providerów:
            // 'desktop': DesktopSync,
            // 'mobile': MobileSync,
        };
    }

    // Tworzy instancję providera synchronizacji dla określonego typu i użytkownika
    async getProvider(providerType, userId) {
        if (!this.providers[providerType]) {
            throw new Error(`Nieobsługiwany typ synchronizacji: ${providerType}`);
        }

        const ProviderClass = this.providers[providerType];
        const provider = new ProviderClass(userId);
        await provider.initialize();
        return provider;
    }

    // Sprawdza wszystkie aktywne połączenia synchronizacji użytkownika
    async getUserActiveProviders(userId) {
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('Użytkownik nie znaleziony');
        }

        const activeProviders = [];
        
        // Sprawdź Google Drive
        if (user.googleDriveEnabled && user.googleDriveTokens) {
            activeProviders.push('google-drive');
        }

        // W przyszłości dodamy sprawdzanie innych providerów
        // if (user.desktopSyncEnabled) {
        //     activeProviders.push('desktop');
        // }
        // 
        // if (user.mobileSyncEnabled) {
        //     activeProviders.push('mobile');
        // }

        return activeProviders;
    }

    // Wykonuje pełną synchronizację dla określonego użytkownika i providera
    async syncWithProvider(userId, providerType) {
        const provider = await this.getProvider(providerType, userId);
        return await provider.fullSync();
    }

    // Wykonuje pełną synchronizację dla wszystkich aktywnych providerów użytkownika
    async syncAll(userId) {
        const activeProviders = await this.getUserActiveProviders(userId);
        const results = {};

        for (const providerType of activeProviders) {
            try {
                const provider = await this.getProvider(providerType, userId);
                results[providerType] = await provider.fullSync();
            } catch (error) {
                console.error(`Błąd synchronizacji z ${providerType}:`, error);
                results[providerType] = { success: false, error: error.message };
            }
        }

        return results;
    }

    // Rozłącza provider synchronizacji
    async disconnectProvider(userId, providerType) {
        const provider = await this.getProvider(providerType, userId);
        return await provider.disconnect();
    }

    // Pobiera URL autoryzacji dla wybranego providera
    getAuthUrl(providerType, userId) {
        if (!this.providers[providerType]) {
            throw new Error(`Nieobsługiwany typ synchronizacji: ${providerType}`);
        }

        const ProviderClass = this.providers[providerType];
        return ProviderClass.getAuthUrl(userId);
    }

    // Obsługuje callback autoryzacji dla wybranego providera
    async handleAuthCallback(providerType, userId, params) {
        if (!this.providers[providerType]) {
            throw new Error(`Nieobsługiwany typ synchronizacji: ${providerType}`);
        }

        const ProviderClass = this.providers[providerType];
        return await ProviderClass.handleAuthCallback(userId, params);
    }
}

// Singleton - jedna instancja dla całej aplikacji
module.exports = new SyncManager();