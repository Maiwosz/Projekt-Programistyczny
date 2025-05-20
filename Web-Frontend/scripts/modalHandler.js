// Naprawione importy
import { currentFileId } from './main.js';
import { getFileIcon, formatFileSize } from './uiComponents.js';

export function showCreateFolderModal() {
    // Pokaż modal i ustaw focus na polu nazwy
    document.getElementById('folderModal').style.display = 'block';
    document.getElementById('folderName').focus();
}

export function closeFolderModal() {
    // Ukryj modal i wyczyść formularz
    document.getElementById('folderModal').style.display = 'none';
    document.getElementById('folderName').value = '';
}

export async function showFileDetails(fileId) {
    try {
        window.currentFileId = fileId; // Zapamiętaj ID pliku
        // Pobierz metadane pliku z API
        const response = await fetch(`/api/files/${fileId}/metadata`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (!response.ok) throw new Error('Błąd pobierania danych');

        const fileData = await response.json();
        renderFileModal(fileData); // Renderuj modal z danymi
    } catch (error) {
        console.error('Błąd:', error);
        alert('Nie udało się załadować danych pliku');
    }
}

function renderFileModal(file) {
    const modal = document.getElementById('fileModal');
    const preview = document.getElementById('filePreviewLarge');
    // Określ typ pliku dla odpowiedniego podglądu
    const isImage = file.category === 'image';
    const isVideo = file.category === 'video';
    const isAudio = file.category === 'audio';

    // Resetuj zawartość modala
    preview.innerHTML = '';
    document.getElementById('metadataFields').innerHTML = '';

    // Generuj odpowiedni podgląd pliku
    if (isImage) {
        preview.innerHTML = `<img src="/uploads/${file.path}" alt="${file.originalName}" onclick="view_image('/uploads/${file.path}')">`;
    } else if (isVideo) {
        preview.innerHTML = `
            <video controls>
                <source src="/uploads/${file.path}" type="${file.mimetype}">
                Przeglądarka nie obsługuje odtwarzania wideo.
            </video>
        `;
    } else if (isAudio) {
        preview.innerHTML = `
            <audio controls>
                <source src="/uploads/${file.path}" type="${file.mimetype}">
                Przeglądarka nie obsługuje odtwarzania audio.
            </audio>
        `;
    } else {
        preview.innerHTML = getFileIcon(file.category); // Ikona domyślna
    }

    // Wypełnij podstawowe informacje
    document.getElementById('fileName').textContent = file.originalName;
    document.getElementById('fileType').textContent = file.mimetype;
    document.getElementById('fileSize').textContent = formatFileSize(file.size);
    document.getElementById('fileDate').textContent = new Date(file.createdAt).toLocaleString();

    // Obsłuż metadane
    const metadataFields = document.getElementById('metadataFields');
    if (file.metadata && Object.keys(file.metadata).length > 0) {
        // Generuj edytowalne pola tylko dla obrazów
        Object.entries(file.metadata).forEach(([key, value]) => {
            const field = document.createElement('div');
            field.className = 'metadata-field';
            field.innerHTML = `
                <label>${key}:</label>
                <input type="text" name="${key}" value="${value || ''}" 
                    ${file.mimetype.startsWith('image/') ? '' : 'readonly'}>
            `;
            metadataFields.appendChild(field);
        });
    } else {
        metadataFields.innerHTML = '<p>Brak dostępnych metadanych</p>';
    }

    modal.style.display = 'block'; // Pokaż modal
}

export async function saveMetadata(event) {
    event.preventDefault(); // Blokuj domyślną akcję formularza

    // Sprawdź czy mamy ID pliku
    if (!window.currentFileId) {
        alert('Błąd: brak ID pliku');
        return;
    }

    // Przygotuj dane metadanych z formularza
    const form = document.getElementById('metadataForm');
    const formData = new FormData(form);
    const metadata = Object.fromEntries(formData.entries());

    try {
        // Wyślij zaktualizowane metadane
        const response = await fetch(`/api/files/${window.currentFileId}/metadata`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(metadata)
        });

        if (!response.ok) throw new Error('Błąd zapisu metadanych');

        closeFileModal();
        alert('Metadane zostały zaktualizowane');
    } catch (error) {
        console.error('Błąd:', error);
        alert('Nie udało się zapisać metadanych: ' + error.message);
    }
}

export function closeFileModal() {
    // Ukryj modal i zresetuj ID pliku
    document.getElementById('fileModal').style.display = 'none';
    window.currentFileId = null;
}