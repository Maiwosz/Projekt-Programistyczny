// ========== SYNCHRONIZACJA GOOGLE DRIVE ==========

import { checkProviderConnection } from './syncCore.js';

const PROVIDER_NAME = 'google-drive';

// ========== AUTORYZACJA ==========

export async function authorizeGoogleDrive() {
    try {
        const response = await fetch('/api/sync/google-drive/auth-url', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Błąd pobierania URL autoryzacji');
        }
        
        const data = await response.json();
        if (data.authUrl) {
            // Otwórz w tym samym oknie zamiast nowego
            window.location.href = data.authUrl;
        } else {
            throw new Error('Brak URL autoryzacji w odpowiedzi');
        }
    } catch (error) {
        console.error('Google Drive authorization error:', error);
        throw error;
    }
}

export async function handleAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');
    
    if (error) {
        console.error('Authorization error:', error);
        return { success: false, error: error };
    }
    
    if (code) {
        try {
            // Wyślij kod autoryzacyjny do backendu
            const response = await fetch('/api/sync/google-drive/callback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ code, state })
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                // Usuń parametry z URL
                const newUrl = window.location.pathname;
                window.history.replaceState(null, '', newUrl);
                
                // DODAJ TO: Wymuś odświeżenie stanu providerów
                if (window.refreshSyncState) {
                    await window.refreshSyncState();
                }
                
                return { success: true };
            } else {
                throw new Error(result.error || 'Błąd przetwarzania autoryzacji');
            }
        } catch (error) {
            console.error('Callback processing error:', error);
            return { success: false, error: error.message };
        }
    }
    
    return { success: false, error: 'Brak kodu autoryzacyjnego' };
}

export async function checkGoogleDriveConnection() {
    return await checkProviderConnection(PROVIDER_NAME);
}

// ========== ZARZĄDZANIE FOLDERAMI ==========

export async function loadGoogleDriveFolders(parentId = null) {
    try {
        const url = parentId 
            ? `/api/sync/${PROVIDER_NAME}/folders?parentId=${parentId}`
            : `/api/sync/${PROVIDER_NAME}/folders`;
            
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            
            // Obsługa błędów autoryzacji
            if (response.status === 401 || 
                error.error?.includes('invalid_grant') || 
                error.error?.includes('Autoryzacja wygasła')) {
                
                throw new AuthorizationError('Autoryzacja Google Drive wygasła. Połącz ponownie.');
            }
            
            throw new Error(error.error || 'Błąd ładowania folderów Google Drive');
        }
        
        const data = await response.json();
        return data.folders || [];
    } catch (error) {
        console.error('Error loading Google Drive folders:', error);
        throw error;
    }
}

// ========== KLASY BŁĘDÓW ==========

export class AuthorizationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AuthorizationError';
    }
}

// ========== FUNKCJE POMOCNICZE SPECIFICZNE DLA GOOGLE DRIVE ==========

export function isGoogleDriveAuthError(error) {
    return error instanceof AuthorizationError ||
           error.message?.includes('invalid_grant') ||
           error.message?.includes('Autoryzacja wygasła');
}

export function getGoogleDriveProviderName() {
    return PROVIDER_NAME;
}