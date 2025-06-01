// ========== KONFIGURACJA GŁÓWNA ==========
// Główne zmienne stanu aplikacji
export let currentFolder = { id: null, name: 'Główny' }; 
export let folderStack = []; 
export let currentFileId = null;
export let innerFolders = new Map();

// Importy funkcji z poszczególnych modułów
import { loadFolderContents, enterFolder, navigateToIndex, buildPathTo } from './folderNavigation.js';
import { updateBreadcrumbs, updateTree, saveState, getFileIcon, formatFileSize, renderItems } from './uiComponents.js';
import { triggerFileInput, deleteFile } from './fileHandler.js';
import { createFolder, renameFolder, deleteFolder } from './folderHandler.js';
import { showCreateFolderModal, closeFolderModal, showFileDetails, saveMetadata, closeFileModal } from './modalHandler.js';
import { showTrashModal, closeTrashModal, restoreFile, permanentDeleteFile, emptyTrash } from './trashHandler.js';
import { showSyncModal, closeSyncModal } from './syncUi.js';
import { startFolderSync, disconnectProvider } from './syncCore.js';
import { authorizeGoogleDrive, checkGoogleDriveConnection, handleAuthCallback } from './googleDriveSync.js';

// ========== INICJALIZACJA ==========
document.addEventListener('DOMContentLoaded', async () => {
    // Sprawdź czy użytkownik jest zalogowany
    const token = localStorage.getItem('token');
    if (!token) return; // Nie wykonuj dalszego kodu jeśli nie ma tokenu
    
    // NOWE - Sprawdź czy to callback po autoryzacji Google Drive
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('code') && urlParams.has('state')) {
        console.log('Detected Google Drive callback');
        
        try {
            const result = await handleAuthCallback();
            
            if (result.success) {
                // Pokaż komunikat o sukcesie
                showAuthSuccessMessage();
                
                // Odśwież modalne okno synchronizacji jeśli jest otwarte
                const syncModal = document.getElementById('syncModal');
                if (syncModal && syncModal.style.display === 'block') {
                    // Przeładuj dane synchronizacji
                    const { loadAvailableProviders } = await import('./syncCore.js');
                    await loadAvailableProviders();
                    
                    // Odśwież interfejs
                    const syncUi = await import('./syncUi.js');
                    // Możesz dodać funkcję odświeżania interfejsu
                }
            } else {
                showAuthErrorMessage(result.error);
            }
        } catch (error) {
            console.error('Error handling auth callback:', error);
            showAuthErrorMessage(error.message);
        }
    }
  
    // Sprawdź czy istnieje zapisany stan w localStorage
    const savedState = localStorage.getItem('folderState');
    if (savedState) {
        try {
            // Przywróć poprzedni stan nawigacji
            const { current, stack, folderChildren } = JSON.parse(savedState);
            currentFolder = current;
            folderStack = stack;
            innerFolders = new Map(folderChildren);
            console.log("Folder state restored:", folderChildren);
        } catch (error) {
            console.error("Error restoring folder state:", error);
            localStorage.removeItem('folderState'); // Usuń niepoprawny stan
        }
    }
    
    // Załaduj zawartość folderu i zaktualizuj okruszki
    loadFolderContents();
    updateBreadcrumbs();
    updateTree();
});

// ========== FUNKCJE POMOCNICZE AUTORYZACJI ==========

function showAuthSuccessMessage() {
    // Sprawdź czy istnieje element do wyświetlania komunikatów
    let messageElement = document.getElementById('authMessage');
    
    if (!messageElement) {
        // Utwórz element jeśli nie istnieje
        messageElement = document.createElement('div');
        messageElement.id = 'authMessage';
        messageElement.className = 'auth-message success';
        document.body.insertBefore(messageElement, document.body.firstChild);
    }
    
    messageElement.innerHTML = `
        <div class="auth-message-content">
            <span class="auth-message-icon">✅</span>
            <span class="auth-message-text">Google Drive połączony pomyślnie!</span>
            <button class="auth-message-close" onclick="closeAuthMessage()">×</button>
        </div>
    `;
    
    messageElement.className = 'auth-message success';
    messageElement.style.display = 'block';
    
    // Automatycznie ukryj po 5 sekundach
    setTimeout(() => {
        closeAuthMessage();
    }, 5000);
}

function showAuthErrorMessage(error) {
    let messageElement = document.getElementById('authMessage');
    
    if (!messageElement) {
        messageElement = document.createElement('div');
        messageElement.id = 'authMessage';
        messageElement.className = 'auth-message error';
        document.body.insertBefore(messageElement, document.body.firstChild);
    }
    
    messageElement.innerHTML = `
        <div class="auth-message-content">
            <span class="auth-message-icon">❌</span>
            <span class="auth-message-text">Błąd autoryzacji: ${error}</span>
            <button class="auth-message-close" onclick="closeAuthMessage()">×</button>
        </div>
    `;
    
    messageElement.className = 'auth-message error';
    messageElement.style.display = 'block';
}

window.closeAuthMessage = function() {
    const messageElement = document.getElementById('authMessage');
    if (messageElement) {
        messageElement.style.display = 'none';
    }
};

// ========== EKSPORT FUNKCJI DO GLOBALNEGO ZAKRESU ==========
// Funkcje nawigacji
window.enterFolder = enterFolder;
window.navigateToIndex = navigateToIndex;
window.loadFolderContents = loadFolderContents;
window.buildPathTo = buildPathTo;

// Funkcje obsługi UI
window.renderItems = renderItems;

// Funkcje obsługi plików
window.triggerFileInput = triggerFileInput;
window.deleteFile = deleteFile;

// Funkcje obsługi folderów
window.createFolder = createFolder;
window.renameFolder = renameFolder;
window.deleteFolder = deleteFolder;

// Funkcje obsługi modali
window.showCreateFolderModal = showCreateFolderModal;
window.closeFolderModal = closeFolderModal;
window.showFileDetails = showFileDetails;
window.saveMetadata = saveMetadata;
window.closeFileModal = closeFileModal;

// Funkcje synchronizacji
window.showSyncModal = showSyncModal;
window.closeSyncModal = closeSyncModal;
window.startFolderSync = startFolderSync;
window.authorizeGoogleDrive = authorizeGoogleDrive;
window.disconnectProvider = disconnectProvider;

// Funkcje obsługi kosza
window.showTrashModal = showTrashModal;
window.closeTrashModal = closeTrashModal;
window.restoreFile = restoreFile;
window.permanentDeleteFile = permanentDeleteFile;
window.emptyTrash = emptyTrash;


window.disconnectSync = async function(provider) {
    try {
        await disconnectProvider(provider);
    } catch (error) {
        console.error('Disconnect error:', error);
        throw error;
    }
};

// Funkcje UI
window.view_image = function(image_preview_src) {
    // Get modal for image view
    var imgView = document.getElementById("image-view-id");
    
    // Get destination for image from preview
    var imgFromView = document.getElementById("image-zoom-id");

    imgView.style.display = "block";
    imgFromView.src = image_preview_src;
};

window.close_img_view = function() {
    // Get modal for image view
    var imgView = document.getElementById("image-view-id");
    imgView.style.display = "none";
};

// Dodatkowe funkcje
window.open_profile_edit = function() {
    window.location.pathname = '/EditProfilePage.html';
};

// Funkcja pomocnicza dla usuwania par synchronizacji (dla kompatybilności wstecznej)
window.removeSyncPair = async function(provider, syncPairId) {
    try {
        const { removeSyncPair } = await import('./syncCore.js');
        await removeSyncPair(provider, syncPairId);
    } catch (error) {
        console.error('Remove sync pair error:', error);
        throw error;
    }
};

window.logout = function() {
    localStorage.removeItem('token');
    
    // Usuń stan zalogowania FB przed przekierowaniem
    if (window.FB) {
        FB.getLoginStatus(function(response) {
            if (response && response.status === 'connected') {
                FB.logout(function() {
                    console.log('Wylogowano z Facebook');
                    window.location.href = '/index.html';
                });
            } else {
                window.location.href = '/index.html';
            }
        });
    } else {
        window.location.href = '/index.html';
    }
};