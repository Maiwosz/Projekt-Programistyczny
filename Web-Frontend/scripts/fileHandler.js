// Naprawione importy
import { currentFolder } from './main.js';
import { loadFolderContents } from './folderNavigation.js';

export function triggerFileInput(multiple) {
    // Utwórz dynamiczny input plikowy
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = multiple; // Konfiguruj wielokrotny wybór
    input.style.display = 'none';

    // Obsłuż zmianę wybranych plików
    input.addEventListener('change', (e) => {
        if (multiple) {
            handleMultipleFiles(e.target.files);
        } else {
            handleSingleFile(e.target.files);
        }
        document.body.removeChild(input); // Posprzątaj po sobie
    });

    // Symuluj kliknięcie inputu
    document.body.appendChild(input);
    input.click();
}

async function handleSingleFile(files) {
    if (!files.length) return;

    // Przygotuj dane formularza
    const formData = new FormData();
    formData.append('file', files[0]); // Dodaj pierwszy plik
    formData.append('folder', currentFolder.id); // Dodaj ID folderu

    try {
        // Wyślij plik na serwer
        await fetch('/api/files', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: formData
        });
        loadFolderContents(); // Odśwież widok
    } catch (error) {
        console.error('Błąd przesyłania:', error);
        alert('Nie udało się przesłać pliku');
    }
}

async function handleMultipleFiles(files) {
    if (!files.length) return;

    const formData = new FormData();
    // Dodaj wszystkie pliki do formularza
    Array.from(files).forEach(file => formData.append('files', file));
    formData.append('folder', currentFolder.id);

    try {
        const response = await fetch('/api/files/multiple', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: formData
        });

        // Obsłuż błędy zwracane przez API
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Błąd przesyłania');
        }

        loadFolderContents();
    } catch (error) {
        console.error('Błąd przesyłania:', error);
        alert(`Błąd: ${error.message}`);
    }
}

export async function deleteFile(fileId) {
    if (!confirm('Przenieść plik do kosza?')) return;

    try {
        await fetch(`/api/files/${fileId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        loadFolderContents();
    } catch (error) {
        console.error('Błąd usuwania:', error);
        alert('Nie udało się usunąć pliku');
    }
}