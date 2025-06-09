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

    const formData = new FormData();
    formData.append('file', files[0]);
    formData.append('folder', currentFolder.id);

    try {
        const response = await fetch('/api/files', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: formData
        });

        const result = await response.json();

        if (response.status === 409 && result.error === 'DUPLICATE_FILE') {
            // Pokaż dialog wyboru akcji dla duplikatu
            showDuplicateDialog([{
                originalName: files[0].name,
                file: files[0],
                existingFile: result.existingFile,
                suggestedName: result.suggestedName
            }]);
            return;
        }

        if (!response.ok) {
            throw new Error(result.message || 'Błąd przesyłania');
        }

        loadFolderContents();
    } catch (error) {
        console.error('Błąd przesyłania:', error);
        alert('Nie udało się przesłać pliku');
    }
}

async function handleMultipleFiles(files) {
    if (!files.length) return;

    const formData = new FormData();
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

        const result = await response.json();

        if (response.status === 409 && result.error === 'MULTIPLE_DUPLICATES') {
            // Pokaż dialog wyboru akcji dla wielu duplikatów
            const duplicateFiles = result.duplicates.map(dup => {
                const originalFile = Array.from(files).find(f => f.name === dup.originalName);
                return {
                    originalName: dup.originalName,
                    file: originalFile,
                    existingFile: dup.existingFile,
                    suggestedName: dup.suggestedName
                };
            });
            showDuplicateDialog(duplicateFiles);
            return;
        }

        if (!response.ok) {
            throw new Error(result.message || 'Błąd przesyłania');
        }

        loadFolderContents();
    } catch (error) {
        console.error('Błąd przesyłania:', error);
        alert(`Błąd: ${error.message}`);
    }
}

export async function renameFile(fileId) {
    // Pobierz nową nazwę od użytkownika
    const newName = prompt('Nowa nazwa pliku:');
    if (!newName) return;

    try {
        // Wyślij żądanie zmiany nazwy do API
        await fetch(`/api/files/${fileId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ newName })
        });
        loadFolderContents(); // Odśwież listę folderów

    } catch (error) {
        console.error('Błąd zmiany nazwy:', error);
        alert('Nie udało się zmienić nazwy');
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

function showDuplicateDialog(duplicateFiles) {
    const isMultiple = duplicateFiles.length > 1;
    const fileText = isMultiple ? 'pliki' : 'plik';
    const existText = isMultiple ? 'istnieją' : 'istnieje';
    
    const message = `${duplicateFiles.length} ${fileText} już ${existText} w tym folderze:\n\n${
        duplicateFiles.map(f => `• ${f.originalName}`).join('\n')
    }\n\nCo chcesz zrobić?`;

    const actions = [
        { text: 'Nadpisz istniejące', value: 'overwrite' },
        { text: 'Dodaj z nową nazwą', value: 'rename' },
        { text: 'Anuluj', value: 'cancel' }
    ];

    showCustomDialog(message, actions, (action) => {
        if (action === 'cancel') return;
        
        handleDuplicateAction(duplicateFiles, action);
    });
}

async function handleDuplicateAction(duplicateFiles, action) {
    try {
        // Przygotuj dane do wysłania
        const filesData = await Promise.all(duplicateFiles.map(async (dupFile) => {
            // Dla pojedynczego pliku
            if (dupFile.file) {
                const tempFormData = new FormData();
                tempFormData.append('file', dupFile.file);
                tempFormData.append('folder', currentFolder.id);
                tempFormData.append('duplicateAction', action);
                
                const tempResponse = await fetch('/api/files', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: tempFormData
                });
                
                if (!tempResponse.ok) {
                    throw new Error(`Błąd przesyłania ${dupFile.originalName}`);
                }
                
                return await tempResponse.json();
            }
        }));

        loadFolderContents();
        
        const successCount = filesData.filter(f => f).length;
        alert(`Pomyślnie przesłano ${successCount} plików`);
        
    } catch (error) {
        console.error('Błąd obsługi duplikatów:', error);
        alert(`Błąd: ${error.message}`);
    }
}

function showCustomDialog(message, actions, callback) {
    // Utwórz modal dialog
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;
    
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: white;
        padding: 20px;
        border-radius: 8px;
        max-width: 400px;
        width: 90%;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `;
    
    const messageEl = document.createElement('div');
    messageEl.style.cssText = `
        margin-bottom: 20px;
        white-space: pre-line;
        line-height: 1.4;
    `;
    messageEl.textContent = message;
    
    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.cssText = `
        display: flex;
        gap: 10px;
        justify-content: flex-end;
    `;
    
    actions.forEach(action => {
        const button = document.createElement('button');
        button.textContent = action.text;
        button.style.cssText = `
            padding: 8px 16px;
            border: 1px solid #ddd;
            border-radius: 4px;
            background: ${action.value === 'cancel' ? '#f5f5f5' : '#007bff'};
            color: ${action.value === 'cancel' ? '#333' : 'white'};
            cursor: pointer;
        `;
        
        button.onclick = () => {
            document.body.removeChild(overlay);
            callback(action.value);
        };
        
        buttonsContainer.appendChild(button);
    });
    
    dialog.appendChild(messageEl);
    dialog.appendChild(buttonsContainer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    // Zamknij na kliknięcie poza dialogiem
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            document.body.removeChild(overlay);
            callback('cancel');
        }
    };
}