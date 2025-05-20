// Naprawione importy
import { currentFolder, folderStack, innerFolders } from './main.js';
import { updateBreadcrumbs, updateTree, saveState } from './uiComponents.js';

export async function loadFolderContents() {
    try {
        // Buduj endpoint w zależności od tego czy jesteśmy w folderze głównym
        const endpoint = currentFolder.id
            ? `/api/folders/${currentFolder.id}/contents`
            : '/api/folders/contents';

        // Pobierz dane z API z nagłówkiem autoryzacyjnym
        const response = await fetch(endpoint, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        // Obsłuż błędy HTTP
        if (!response.ok) throw new Error(`Błąd HTTP: ${response.status}`);

        // Przetwórz odpowiedź JSON i zaktualizuj UI
        const data = await response.json();
        window.renderItems(data);
        saveState(); // Zapisz aktualny stan nawigacji
    } catch (error) {
        console.error('Błąd ładowania zawartości:', error);
        alert('Nie udało się załadować zawartości folderu');
    }
}

export function enterFolder(folderId, folderName) {
    // Zapisz aktualny folder w historii
    folderStack.push({ ...currentFolder });

    // Zaktualizuj bieżący folder na nowy
    currentFolder.id = folderId;
    currentFolder.name = folderName;

    // Odśwież elementy interfejsu
    updateBreadcrumbs();
    loadFolderContents();
    updateTree();
}

export function navigateToIndex(index) {
    // Obetnij historię do wybranego indeksu
    const newStack = folderStack.slice(0, index);
    // Pobierz odpowiadający folder z historii lub folder główny
    const newCurrent = index >= 0 ? folderStack[index] : { id: null, name: 'Główny' };

    // Aktualizuj stan aplikacji
    folderStack.length = 0;
	newStack.forEach(item => folderStack.push(item));
    currentFolder.id = newCurrent.id;
    currentFolder.name = newCurrent.name;

    // Odśwież widok i zapisz stan
    loadFolderContents();
    updateBreadcrumbs();
    updateTree();
    saveState();
}

export function buildPathTo(targetId, currentId = null, path = []) {
    const children = innerFolders.get(currentId) || [];
    for (const child of children) {
        const newPath = [...path, child];
        if (child.id === targetId) {
            console.log("nowa ścieżka: ", newPath);
            return newPath;    
        }
        const result = buildPathTo(targetId, child.id, newPath);
        if (result.length) return result;
    }
    return [];
}