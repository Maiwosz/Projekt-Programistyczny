const GoogleDriveSync = require('./providers/GoogleDriveSync');
const User = require('../../models/User');
const SyncPair = require('../../models/SyncPair');

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

        return activeProviders;
    }

    // Pobiera listę folderów z zewnętrznego providera
    async getExternalFolders(providerType, userId, parentId = null) {
        const provider = await this.getProvider(providerType, userId);
        return await provider.getExternalFolders(parentId);
    }

    // Tworzy parę synchronizacji
    async createSyncPair(providerType, userId, localFolderId, externalFolderId, syncDirection = 'bidirectional') {
        const provider = await this.getProvider(providerType, userId);
        return await provider.createSyncPair(localFolderId, externalFolderId, syncDirection);
    }

    // Usuwa parę synchronizacji
    async removeSyncPair(providerType, userId, syncPairId) {
        const provider = await this.getProvider(providerType, userId);
        return await provider.removeSyncPair(syncPairId);
    }

    // Synchronizuje konkretną parę folderów
    async syncFolder(providerType, userId, syncPairId) {
        const provider = await this.getProvider(providerType, userId);
        return await provider.syncFolder(syncPairId);
    }

    // Synchronizuje wszystkie aktywne pary dla użytkownika i providera
    async syncAllPairs(providerType, userId) {
        const provider = await this.getProvider(providerType, userId);
        return await provider.syncAllPairs();
    }

    // Pobiera wszystkie pary synchronizacji użytkownika
    async getUserSyncPairs(userId, providerType = null) {
        const query = { user: userId, isActive: true };
        if (providerType) {
            query.provider = providerType;
        }

        return await SyncPair.find(query)
            .populate('localFolder', 'name')
            .sort({ createdAt: -1 });
    }

    // Rozłącza provider synchronizacji
    async disconnectProvider(userId, providerType) {
        const provider = await this.getProvider(providerType, userId);
        return await provider.disconnect();
    }

    // Pobiera URL autoryzacji dla wybranego providera
    getAuthUrl(providerType, state) {
		if (!this.providers[providerType]) {
			throw new Error(`Nieobsługiwany typ synchronizacji: ${providerType}`);
		}

		const ProviderClass = this.providers[providerType];
		return ProviderClass.getAuthUrl(state); // Przekaż state do providera
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