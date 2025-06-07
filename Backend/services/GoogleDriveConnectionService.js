const { google } = require('googleapis');
const GoogleDriveClient = require('../models/GoogleDriveClient');
const SyncService = require('./SyncService');

/**
 * Serwis odpowiedzialny za zarządzanie połączeniem z Google Drive
 * - Autoryzacja OAuth2
 * - Zarządzanie tokenami
 * - Status połączenia
 */
class GoogleDriveConnectionService {
    
    constructor() {
        this.oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );
    }
    
    // === AUTORYZACJA ===
    
    getAuthUrl(userId) {
        const scopes = process.env.GOOGLE_API_SCOPE.split(',');
        return this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            state: userId,
            prompt: 'consent',
            include_granted_scopes: true
        });
    }
    
    async handleAuthCallback(code, userId, connectionName) {
        try {
            const { tokens } = await this.oauth2Client.getToken(code);
            this.oauth2Client.setCredentials(tokens);
            
            const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
            const userInfo = await oauth2.userinfo.get();
            
            const driveClient = await this._findOrCreateClient(userId, tokens, userInfo.data, connectionName);
            
            if (!driveClient.clientId) {
                throw new Error('ClientId nie został ustawiony');
            }
            
            return driveClient;
            
        } catch (error) {
            console.error('Błąd autoryzacji Google Drive:', error);
            throw new Error('Błąd podczas autoryzacji z Google Drive: ' + error.message);
        }
    }
    
    // === STATUS POŁĄCZENIA ===
    
    async getConnectionStatus(userId) {
        const driveClient = await this._getClient(userId);
        if (!driveClient) {
            return { connected: false };
        }
        
        return {
            connected: driveClient.status.isConnected,
            name: driveClient.name,
            googleUser: driveClient.googleUser,
            lastSync: driveClient.status.lastSync,
            syncSettings: driveClient.syncSettings
        };
    }
    
    async disconnect(userId) {
        const driveClient = await this._getClient(userId);
        if (driveClient) {
            await GoogleDriveClient.findOneAndDelete({ user: userId });
        }
        return { success: true };
    }
    
    // === ZARZĄDZANIE TOKENAMI ===
    
    async getDriveInstance(userId) {
        const driveClient = await this._validateClient(userId);
        
        if (driveClient.isTokenExpired()) {
            await this._refreshToken(driveClient);
        }
        
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );
        
        oauth2Client.setCredentials(driveClient.credentials);
        return google.drive({ version: 'v3', auth: oauth2Client });
    }
    
    async getValidatedClient(userId) {
        return await this._validateClient(userId);
    }
    
    // === USTAWIENIA SYNCHRONIZACJI ===
    
    async updateSyncSettings(userId, settings) {
        const driveClient = await this._validateClient(userId);
        
        Object.assign(driveClient.syncSettings, settings);
        await driveClient.save();
        
        return driveClient.syncSettings;
    }
    
    // === METODY PRYWATNE ===
    
    async _findOrCreateClient(userId, tokens, userInfo, connectionName) {
        let driveClient = await GoogleDriveClient.findOne({ user: userId });
        
        if (driveClient) {
            return await this._updateExistingClient(driveClient, tokens, userInfo, connectionName);
        } else {
            return await this._createNewClient(userId, tokens, userInfo, connectionName);
        }
    }
    
    async _updateExistingClient(driveClient, tokens, userInfo, connectionName) {
        driveClient.credentials = tokens;
        driveClient.googleUser = userInfo;
        driveClient.name = connectionName || driveClient.name;
        driveClient.status.isConnected = true;
        driveClient.status.lastError = null;
        await driveClient.save();
        return driveClient;
    }
    
    async _createNewClient(userId, tokens, userInfo, connectionName) {
        // Zarejestruj klienta w systemie synchronizacji
        const client = await SyncService.registerClient(userId, {
            type: 'google-drive',
            name: connectionName || 'Google Drive',
            metadata: { googleUserId: userInfo.id }
        });
        
        // Utwórz GoogleDriveClient
        const driveClient = new GoogleDriveClient({
            user: userId,
            clientId: client.clientId,
            name: connectionName || 'Google Drive',
            credentials: tokens,
            googleUser: userInfo
        });
        
        await driveClient.save();
        return driveClient;
    }
    
    async _getClient(userId) {
        return await GoogleDriveClient.findOne({ user: userId });
    }
    
    async _validateClient(userId) {
        const driveClient = await GoogleDriveClient.findOne({ 
            user: userId,
            'status.isConnected': true 
        });
        
        if (!driveClient) {
            throw new Error('Brak aktywnego połączenia z Google Drive');
        }
        
        return driveClient;
    }
    
    async _refreshToken(driveClient) {
        try {
            const oauth2Client = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                process.env.GOOGLE_REDIRECT_URI
            );
            
            oauth2Client.setCredentials(driveClient.credentials);
            const { credentials } = await oauth2Client.refreshAccessToken();
            
            driveClient.credentials = credentials;
            await driveClient.save();
        } catch (error) {
            driveClient.status.isConnected = false;
            driveClient.status.lastError = 'Token refresh failed';
            await driveClient.save();
            throw new Error('Błąd odświeżania tokena Google Drive');
        }
    }
}

module.exports = new GoogleDriveConnectionService();