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
import { showSyncModal, closeSyncModal, startFolderSync, authorizeGoogleDrive, disconnectSync, checkGoogleDriveConnection } from './syncHandler.js';

// ========== INICJALIZACJA ==========
document.addEventListener('DOMContentLoaded', () => {
    // Sprawdź czy użytkownik jest zalogowany
    const token = localStorage.getItem('token');
    if (!token) return; // Nie wykonuj dalszego kodu jeśli nie ma tokenu
  
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

// Funkcje obsługi synchronizacji"
window.showSyncModal = showSyncModal;
window.closeSyncModal = closeSyncModal;
window.startFolderSync = startFolderSync;
window.authorizeGoogleDrive = authorizeGoogleDrive;
window.disconnectSync = disconnectSync;

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