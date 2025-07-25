// Naprawione importy
import { currentFileId } from './main.js'; // już nieużywane?
import { getFileIcon, formatFileSize } from './uiComponents.js';
import { userTags } from './main.js';

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

                // Load file tags
        const tagsResponse = await fetch(`/api/tags/file/${fileId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        if (!tagsResponse.ok) throw new Error('Błąd pobierania tagów pliku');
        
        const fileTags = await tagsResponse.json();

        renderFileModal(fileData, fileTags); // Renderuj modal z danymi
    } catch (error) {
        console.error('Błąd:', error);
        alert('Nie udało się załadować danych pliku');
    }
}

async function setAsProfilePic(fileId) {
    const token = localStorage.getItem('token');

    try {
        const response = await fetch('/api/user/profile-picture', {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`,
                       'Content-Type': 'application/json'  },
            body: JSON.stringify({fileId: fileId})
        });
        
        if (response.ok) {
            const picRes = await response.json();
            alert(picRes.message);
        } else {
            const error = await response.json();
            alert(error.error || 'Nieznany błąd');
        }

    } catch (error) {
        console.error('Błąd zmiany zdjęcia profilowego:', error);
    }
}

function renderFileModal(file, fileTags = []) {
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
    const profilePicButton = document.getElementById('isProfilePic');
	if (isImage) {
		profilePicButton.style.display = 'block';
		profilePicButton.onclick = () => setAsProfilePic(file._id);
	} else {
		profilePicButton.style.display = 'none';
	}

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

    // Renderuj tagi pliku
    renderFileTags(fileTags);
    // Wypełnij selektor tagów dostępnymi tagami
    populateTagSelector(fileTags);

    //Wyswietl opcje udostepniania
    const sharing = document.querySelector(".share-file");
    sharing.innerHTML = `<input type="text" id="share-link" value="">
                            <button type="button" onclick="toggleFileSharing(this)">Udostępnij</button>`;

    modal.style.display = 'block'; // Pokaż modal
}

export async function saveMetadata(event) {
    event.preventDefault();

    if (!window.currentFileId) {
        alert('Błąd: brak ID pliku');
        return;
    }

    const form = document.getElementById('metadataForm');
    const formData = new FormData(form);
    const metadata = {};
    
    // Filtruj puste wartości i przygotuj dane
    for (let [key, value] of formData.entries()) {
        if (value.trim()) {
            metadata[key] = value.trim();
        }
    }

    try {
        const response = await fetch(`/api/files/${window.currentFileId}/metadata`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(metadata)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.details || 'Błąd zapisu metadanych');
        }

        const result = await response.json();
        // closeFileModal();
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