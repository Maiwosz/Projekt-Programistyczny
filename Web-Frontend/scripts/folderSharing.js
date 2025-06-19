import { currentFolder, folderStack, innerFolders } from './main.js';
import { updateBreadcrumbs, updateTree, saveState, renderItems } from './uiComponents.js';

export async function shareCurrentFolder() {
    try {
        const response = await fetch(`/api/folders/${currentFolder.id}/share`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) throw new Error('Nie udało się udostępnić folderu');

        const data = await response.json();
        document.getElementById('share-link').textContent = `Link: ${data.sharedLink}`;
        
        // Show success message
        alert('Folder został pomyślnie udostępniony!');
    } catch (error) {
        console.error('Błąd przy udostępnianiu:', error);
        alert('Wystąpił błąd przy udostępnianiu folderu');
    }
}
//kopia funkcji dla obecnego frontendu
export async function shareFolder() {
    try {
        const response = await fetch(`/api/folders/${currentFolder.id}/share`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
             const errorText = await response.text();
            console.error("Odpowiedź serwera:", errorText);
            throw new Error('Nie udało się udostępnić folderu');
        }

        const data = await response.json();
        // Show success message
        alert('Folder został pomyślnie udostępniony!');
        return {
            link: data.link,
            success: true
        };
    } catch (error) {
        console.error('Błąd przy udostępnianiu:', error);
        alert('Wystąpił błąd przy udostępnianiu folderu');
        return {
            link: '',
            success: false
        };
    }
}

export async function revokeCurrentFolder() {
    if (!currentFolder.id) {
        alert('Nie można wyłączyć udostępniania folderu głównego');
        return;
    }

    try {
        const response = await fetch(`/api/folders/${currentFolder.id}/revoke-share`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) throw new Error('Nie udało się wyłączyć udostępniania');

        document.getElementById('share-link').textContent = 'Link: ';
        alert('Udostępnianie zostało wyłączone');
    } catch (error) {
        console.error('Błąd przy wyłączaniu udostępniania:', error);
        alert('Wystąpił błąd przy wyłączaniu udostępniania folderu');
    }
}
//kopia dp frontendu
export async function stopSharingFolder() {
    try {
        const response = await fetch(`/api/folders/${currentFolder.id}/revoke-share`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            throw new Error('Nie udało się wyłączyć udostępniania');
            return false;
        }

        alert('Udostępnianie zostało wyłączone');
        return true;
    } catch (error) {
        console.error('Błąd przy wyłączaniu udostępniania:', error);
        alert('Wystąpił błąd przy wyłączaniu udostępniania folderu');
        return false;
    }
}

export async function displaySharedStatus() {
    // Only check sharing status if we're in a specific folder (not root)
    if (!currentFolder.id) {
        document.getElementById('share-link').textContent = 'Link: ';
        return;
    }

    try {
        console.log("checking shared status");  

        const response = await fetch(`/api/folders/${currentFolder.id}/is-shared`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) throw new Error('Nie udało się pobrać informacji o stanie udostępnienia');

        const data = await response.json();
        const linkText = data.link ? `Link: ${data.link}` : 'Link: ';
        document.getElementById('share-link').textContent = linkText;

    } catch (error) {
        console.error('Błąd przy pobieraniu informacji:', error);
        // Don't show alert for shared status check failures
        document.getElementById('share-link').textContent = 'Link: ';
    }
}

export async function isShared() {
    try {
        console.log("checking shared status");

        const response = await fetch(`/api/folders/${currentFolder.id}/is-shared`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Nie udało się pobrać informacji o stanie udostępnienia');
        }

        const data = await response.json();
        return {
            isShared: data.isShared,
            link: data.link
        };

    } catch (error) {
        console.error('Błąd przy pobieraniu informacji:', error);
        return [false, ""]; // zwracamy false w przypadku błędu
    }
}

export async function loadSharedFolder(sharedLink) {
    try {
        console.log("loading shared folder with link:", sharedLink);

        const response = await fetch(`/api/shared/${sharedLink}`);
        if (!response.ok) {
            throw new Error("Shared folder not found or access denied.");
        }

        const data = await response.json();
        console.log("Received shared folder data:", data);

        // Update current folder context (mutate the properties, don't reassign)
        currentFolder.id = data.folder.id;
        currentFolder.name = data.folder.name || 'Udostępniony folder';
        
        // Clear folder stack for shared views (disable back navigation)
        folderStack.length = 0;
        
        // Clear inner folders map
        innerFolders.clear();

        // Render the shared folder contents - use the contents array from your API
        renderItems(data.contents || []);
        
        // Update UI components
        updateBreadcrumbs();
        
        // Hide navigation elements that shouldn't be available in shared view
        hideNavigationForSharedView();
        
        // Show shared folder indicator
        showSharedFolderIndicator(data.folder.name);

        console.log("Successfully loaded shared folder:", data.folder.name);
        
    } catch (error) {
        console.error("Error loading shared folder:", error);
        
        // Show user-friendly error page
        showSharedFolderError(error.message);
    }
}

// Helper function to hide navigation elements in shared view
function hideNavigationForSharedView() {
    // Hide elements that shouldn't be available when viewing shared folders
    const elementsToHide = [
        'create-folder-btn',
        'upload-file-btn',
        'trash-btn',
        'sync-btn',
        // Add other element IDs that should be hidden
    ];
    
    elementsToHide.forEach(elementId => {
        const element = document.getElementById(elementId);
        if (element) {
            element.style.display = 'none';
        }
    });
    
    // Also hide any context menu options for files/folders
    const contextMenus = document.querySelectorAll('.context-menu');
    contextMenus.forEach(menu => {
        menu.style.display = 'none';
    });
}

// Helper function to show shared folder indicator
function showSharedFolderIndicator(folderName) {
    // Create or update shared folder indicator
    let indicator = document.getElementById('shared-folder-indicator');
    
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'shared-folder-indicator';
        indicator.className = 'shared-folder-indicator';
        
        // Insert at the top of the main content area
        const mainContent = document.querySelector('.main-content') || document.body;
        mainContent.insertBefore(indicator, mainContent.firstChild);
    }
    
    indicator.innerHTML = `
        <div class="shared-indicator-content">
            <span class="shared-icon">🔗</span>
            <span class="shared-text">Przeglądasz udostępniony folder: <strong>${folderName}</strong></span>
        </div>
    `;
    
    indicator.style.display = 'block';
}

// Helper function to show error page for shared folders
function showSharedFolderError(errorMessage) {
    const mainContent = document.querySelector('.main-content') || document.body;
    
    mainContent.innerHTML = `
        <div class="shared-error-container">
            <div class="shared-error-content">
                <h2>Nie można załadować udostępnionego folderu</h2>
                <p>${errorMessage}</p>
                <div class="error-suggestions">
                    <p>Możliwe przyczyny:</p>
                    <ul>
                        <li>Link wygasł lub został odwołany</li>
                        <li>Folder został usunięty</li>
                        <li>Brak uprawnień dostępu</li>
                    </ul>
                </div>
                <button onclick="window.location.href='/'" class="btn-primary">
                    Przejdź do strony głównej
                </button>
            </div>
        </div>
    `;
}