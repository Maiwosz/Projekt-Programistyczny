// ========== KONFIGURACJA GŁÓWNA ==========
// Główne zmienne stanu aplikacji
export let currentFolder = { id: null, name: 'Główny' };
export let folderStack = [];
export let currentFileId = null; // już nieużywane?
export let innerFolders = new Map();
export var userTags = [];

// Importy funkcji z poszczególnych modułów
import { loadFolderContents, enterFolder, navigateToIndex, buildPathTo } from './folderNavigation.js';
import { updateBreadcrumbs, updateTree, saveState, getFileIcon, formatFileSize, renderItems, setupDropdown, toggleSharing, toggleFileSharing } from './uiComponents.js';
import { triggerFileInput, renameFile, deleteFile } from './fileHandler.js';
import { createFolder, renameFolder, deleteFolder } from './folderHandler.js';
import { showCreateFolderModal, closeFolderModal, showFileDetails, saveMetadata, closeFileModal } from './modalHandler.js';
import { showTrashModal, closeTrashModal, restoreFile, permanentDeleteFile, emptyTrash } from './trashHandler.js';
import { loadUserTags, renderTagsList, createTag, deleteTag, renderFileTags, populateTagSelector, addTagToFile, removeTagFromFile, populateTagFilterSelector } from './tagPrototype.js';
import { populateTypeFilterSelector, populateTypeFilterSelectorMultiple, getSelectedFileTypes, setSelectedFileTypes, filterFiles, filterFilesByTag, filterFilesByType, filterFilesByName } from './filterPrototype.js';
import { showSyncModal, closeSyncModal, addGoogleDriveSync, saveSync, deleteSync } from './syncModal.js';
import { showCreateSyncModal, closeCreateSyncModal } from './createSyncModal.js';
import { shareCurrentFolder, revokeCurrentFolder, loadSharedFolder } from './folderSharing.js';


// ========== INICJALIZACJA ==========
document.addEventListener('DOMContentLoaded', async () => {
    const path = window.location.pathname;

    // Case 1: Shared folder
    const sharedMatch = path.match(/^\/shared\/([a-f0-9]{24}|[a-f0-9]{16,64})$/);

    console.log("shared match: " + sharedMatch);

    if (sharedMatch) {
        const sharedLink = sharedMatch[1];
        console.log("Detected shared folder link:", sharedLink);

        try {
            await loadSharedFolder(sharedLink);
            console.log("Shared folder loaded successfully");
        } catch (error) {
            console.error("Error loading shared folder:", error);
            document.body.innerHTML = `
                <div class="error-message">
                    <h2>Error Loading Shared Folder</h2>
                    <p>The shared folder could not be loaded. It may have been deleted or you may not have permission to access it.</p>
                </div>
            `;
        }

        return; // ✅ prevent normal init
    }

    // ✅ Case 2: User is at landing page `/`
    if (path === '/') {
        console.log("At root path — show login/register chooser");
        showLandingPage(); // implement this or load content dynamically
        return;
    }

    // Case 3: All other paths – require auth unless it's login/register
    const token = localStorage.getItem('token');
    if (!token) {
        // Redirect unless user is already on login or register page
        if (path !== '/login.html' && path !== '/register.html') {
            window.location.href = '/login.html';
            return;
        }
    }

    // Normal authenticated app flow...
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('code') && urlParams.has('state')) {
        // Google Drive callback
        try {
            const result = await handleAuthCallback();
            if (result.success) {
                showAuthSuccessMessage();
                const syncModal = document.getElementById('syncModal');
                if (syncModal && syncModal.style.display === 'block') {
                    const { loadAvailableProviders } = await import('./syncCore.js');
                    await loadAvailableProviders();
                }
            } else {
                showAuthErrorMessage(result.error);
            }
        } catch (error) {
            console.error('Error handling auth callback:', error);
            showAuthErrorMessage(error.message);
        }
    }

    const savedState = localStorage.getItem('folderState');
    if (savedState) {
        try {
            const { current, stack, folderChildren } = JSON.parse(savedState);
            currentFolder.id = current.id;
            currentFolder.name = current.name;
            folderStack.length = 0;
            stack.forEach(item => folderStack.push(item));
            innerFolders.clear();
            if (folderChildren) {
                folderChildren.forEach(([key, value]) => innerFolders.set(key, value));
            }
            console.log("Folder state restored:", folderChildren);
        } catch (error) {
            console.error("Error restoring folder state:", error);
            localStorage.removeItem('folderState');
        }
    }

    // Continue with full app init
    loadFolderContents();
    loadUserTags();
    updateBreadcrumbs();
    updateTree();
    populateTypeFilterSelectorMultiple();
    setupDropdown('typeFilterSelector');
    setupDropdown('tagFilterSelector');
});


// ========== FUNKCJE POMOCNICZE AUTORYZACJI ==========

// Dodaj funkcję handleAuthCallback jeśli nie istnieje w innych plikach
async function handleAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    
    try {
        const response = await fetch('/api/auth/google/callback', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ code, state })
        });
        
        if (!response.ok) {
            throw new Error('Błąd podczas autoryzacji');
        }
        
        const result = await response.json();
        
        // Wyczyść URL z parametrów callback
        window.history.replaceState({}, document.title, window.location.pathname);
        
        return { success: true, result };
        
    } catch (error) {
        console.error('Auth callback error:', error);
        return { success: false, error: error.message };
    }
}

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

window.closeAuthMessage = function () {
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
window.toggleSharing = toggleSharing;
window.toggleFileSharing = toggleFileSharing;

// Funkcje obsługi plików
window.triggerFileInput = triggerFileInput;
window.renameFile = renameFile;
window.deleteFile = deleteFile;

// Funkcje obsługi folderów
window.createFolder = createFolder;
window.renameFolder = renameFolder;
window.deleteFolder = deleteFolder;

window.shareCurrentFolder = shareCurrentFolder;
window.revokeCurrentFolder = revokeCurrentFolder;
window.loadSharedFolder = loadSharedFolder;

// Funkcje obsługi modali
window.showCreateFolderModal = showCreateFolderModal;
window.closeFolderModal = closeFolderModal;
window.showFileDetails = showFileDetails;
window.saveMetadata = saveMetadata;
window.closeFileModal = closeFileModal;

// Funkcje obsługi kosza
window.showTrashModal = showTrashModal;
window.closeTrashModal = closeTrashModal;
window.restoreFile = restoreFile;
window.permanentDeleteFile = permanentDeleteFile;
window.emptyTrash = emptyTrash;

// TAGI
window.loadUserTags = loadUserTags;
window.renderTagsList = renderTagsList;
window.createTag = createTag;
window.deleteTag = deleteTag;
window.renderFileTags = renderFileTags;
window.populateTagSelector = populateTagSelector;
window.addTagToFile = addTagToFile;
window.removeTagFromFile = removeTagFromFile;
window.populateTagFilterSelector = populateTagFilterSelector;

// FILTRY

window.populateTypeFilterSelector = populateTypeFilterSelector;
window.populateTypeFilterSelectorMultiple = populateTypeFilterSelectorMultiple;
window.getSelectedFileTypes = getSelectedFileTypes;
window.setSelectedFileTypes = setSelectedFileTypes;
window.filterFiles = filterFiles;
window.filterFilesByTag = filterFilesByTag;
window.filterFilesByType = filterFilesByType;
window.filterFilesByName = filterFilesByName;

// Funkcje synchronizacji
window.showSyncModal = showSyncModal;
window.closeSyncModal = closeSyncModal;
window.showCreateSyncModal = showCreateSyncModal;
window.closeCreateSyncModal = closeCreateSyncModal;
window.addGoogleDriveSync = addGoogleDriveSync;
window.saveSync = saveSync;
window.deleteSync = deleteSync;

window.showCreateGoogleDriveSync = function(folderId, folderName) {
    showCreateSyncModal(folderId, folderName);
};

// ========== FUNKCJE UI ==========
window.view_image = function (image_preview_src) {
    // Get modal for image view
    var imgView = document.getElementById("image-view-id");

    // Get destination for image from preview
    var imgFromView = document.getElementById("image-zoom-id");

    imgView.style.display = "block";
    imgFromView.src = image_preview_src;
};

window.close_img_view = function () {
    // Get modal for image view
    var imgView = document.getElementById("image-view-id");
    imgView.style.display = "none";
};

window.toggleImgCloseup = function (img, zoomClass = 'closeup'){
   img.classList.toggle(zoomClass);
}

// ========== DODATKOWE FUNKCJE ==========
window.open_profile_edit = function () {
    window.location.pathname = '/EditProfilePage.html';
};

window.logout = function() {
    localStorage.removeItem('token');

    // Usuń stan zalogowania FB przed przekierowaniem
    if (window.FB) {
        FB.getLoginStatus(function (response) {
            if (response && response.status === 'connected') {
                FB.logout(function () {
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

window.refreshCurrentFolderContent = function () {
    // Sprawdź czy użytkownik jest zalogowany
    const token = localStorage.getItem('token');
    if (!token) return; // Nie wykonuj dalszego kodu jeśli nie ma tokenu

    loadFolderContents(); // Załaduj widoczną zawartośću, czyli obecnie wybrany folder

    //filterFiles(); // Zastosuj użyte wcześniej filtry - jeśli konieczne
}

let intervalId = setInterval(window.refreshCurrentFolderContent, 60000); // Execute function every minute
// clearInterval(intervalId);