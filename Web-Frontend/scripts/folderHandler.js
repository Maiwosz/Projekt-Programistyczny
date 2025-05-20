// Naprawione importy
import { currentFolder, innerFolders } from './main.js';
import { showCreateFolderModal, closeFolderModal } from './modalHandler.js';
import { loadFolderContents } from './folderNavigation.js';
import { updateTree } from './uiComponents.js';

export async function createFolder() {
    // Pobierz i waliduj nazwę folderu z formularza
    const name = document.getElementById('folderName').value.trim();
    if (!name) return alert('Podaj nazwę folderu');

    try {
        // Wyślij żądanie tworzenia folderu do API
        await fetch('/api/folders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                name,
                parent: currentFolder.id  // Określ folder nadrzędny
            })
        });
        // Zamknij modal i odśwież widok
        closeFolderModal();
        loadFolderContents();
        updateTree();
    } catch (error) {
        console.error('Błąd tworzenia:', error);
        alert('Nie udało się utworzyć folderu');
    }
}

export async function renameFolder(folderId) {
    // Pobierz nową nazwę od użytkownika
    const newName = prompt('Nowa nazwa folderu:');
    if (!newName) return;

    try {
        // Wyślij żądanie zmiany nazwy do API
        await fetch(`/api/folders/${folderId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ newName })
        });
        loadFolderContents(); // Odśwież listę folderów
        updateTree();
    } catch (error) {
        console.error('Błąd zmiany nazwy:', error);
        alert('Nie udało się zmienić nazwy');
    }
}

export async function deleteFolder(folderId) {
    // Potwierdź nieodwracalną operację usuwania
    if (!confirm('Usunąć folder i całą jego zawartość?')) return;

    try {
        // Wyślij żądanie usunięcia z parametrem force
        await fetch(`/api/folders/${folderId}?force=true`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        loadFolderContents(); // Odśwież widok
        updateTree();
    } catch (error) {
        console.error('Błąd usuwania:', error);
        alert('Nie udało się usunąć folderu');
    }
}