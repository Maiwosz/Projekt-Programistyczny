// trashHandler.js - nowy moduł do obsługi kosza
import { getFileIcon, formatFileSize } from './uiComponents.js';

export async function showTrashModal() {
    const modal = document.getElementById('trashModal');
    modal.style.display = 'block';
    await loadTrashItems();
}

export function closeTrashModal() {
    const modal = document.getElementById('trashModal');
    modal.style.display = 'none';
}

export async function loadTrashItems() {
    try {
        const response = await fetch('/api/files/deleted', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) throw new Error('Błąd pobierania usuniętych plików');

        const deletedFiles = await response.json();
        renderTrashItems(deletedFiles);
    } catch (error) {
        console.error('Błąd ładowania kosza:', error);
        alert('Nie udało się załadować zawartości kosza');
    }
}

function renderTrashItems(files) {
    const container = document.getElementById('trashItems');
    
    if (files.length === 0) {
        container.innerHTML = '<p class="empty-info">Kosz jest pusty</p>';
        return;
    }

    let html = '';
    files.forEach(file => {
        const isImage = file.category === 'image';
        const deletedDate = new Date(file.deletedAt).toLocaleDateString('pl-PL');
        
        html += `
        <div class="item-card trash-item">
            <div class="item-actions">
                <button onclick="restoreFile('${file._id}')" title="Przywróć" class="btn-success">↶</button>
                <button onclick="permanentDeleteFile('${file._id}')" title="Usuń na zawsze" class="btn-danger">🗑️</button>
            </div>
            
            <div style="text-align: center;" class="file-clickable">
                ${isImage
                    ? `<img class="thumbnail" src="/uploads/${file.path}" alt="${file.originalName}" style="opacity: 0.7;">`
                    : `<div class="file-preview" style="opacity: 0.7;">${getFileIcon(file.category)}</div>`
                }
                <div class="file-name">
                    ${file.originalName}
                    <p class="file-deleted-date" style="font-size: 0.8em; color: #666;">
                        Usunięto: ${deletedDate}
                    </p>
                </div>
            </div>
        </div>`;
    });

    container.innerHTML = html;
}

export async function restoreFile(fileId) {
    if (!confirm('Przywrócić plik z kosza?')) return;

    try {
        const response = await fetch(`/api/files/restore/${fileId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) throw new Error('Błąd przywracania pliku');

        await loadTrashItems(); // Odśwież kosz
        
        // Jeśli główny widok jest otwarty, odśwież go też
        if (typeof window.loadFolderContents === 'function') {
            window.loadFolderContents();
        }
        
        alert('Plik został przywrócony');
    } catch (error) {
        console.error('Błąd przywracania pliku:', error);
        alert('Nie udało się przywrócić pliku');
    }
}

export async function permanentDeleteFile(fileId) {
    if (!confirm('Czy na pewno chcesz trwale usunąć ten plik? Tej operacji nie można cofnąć!')) return;

    try {
        const response = await fetch(`/api/files/${fileId}?permanent=true`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) throw new Error('Błąd trwałego usuwania pliku');

        await loadTrashItems(); // Odśwież kosz
        alert('Plik został trwale usunięty');
    } catch (error) {
        console.error('Błąd trwałego usuwania pliku:', error);
        alert('Nie udało się trwale usunąć pliku');
    }
}

export async function emptyTrash() {
    if (!confirm('Czy na pewno chcesz opróżnić cały kosz? Wszystkie pliki zostaną trwale usunięte!')) return;

    try {
        const response = await fetch('/api/files/trash/empty', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) throw new Error('Błąd opróżniania kosza');

        const result = await response.json();
        await loadTrashItems(); // Odśwież kosz
        alert(`Kosz został opróżniony. Usunięto ${result.deletedCount} plików.`);
    } catch (error) {
        console.error('Błąd opróżniania kosza:', error);
        alert('Nie udało się opróżnić kosza');
    }
}