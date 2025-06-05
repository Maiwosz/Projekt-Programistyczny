import { userTags } from './main.js';

export async function loadUserTags() {
    try {
        const response = await fetch('/api/tags', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (!response.ok) throw new Error('Błąd pobierania tagów');

        const tags = await response.json();
        userTags.length = 0;
        userTags.push(...tags);

        renderTagsList();
        populateTagFilterSelector();
    } catch (error) {
        console.error('Błąd:', error);
        alert('Nie udało się załadować tagów');
    }
}


// Function to render the tags list in the main page
export function renderTagsList() {
    const tagsList = document.getElementById('tagsList');
    tagsList.innerHTML = '';

    if (userTags.length === 0) {
        tagsList.innerHTML = '<li>Brak dostępnych tagów</li>';
        return;
    }

    userTags.forEach(tag => {
        const li = document.createElement('li');
        li.className = 'tag-item';
        li.innerHTML = `
            <span>${tag.name}</span>
            <button class="tagButton" onclick="deleteTag('${tag._id}')">🗑️</button>
        `;
        tagsList.appendChild(li);
    });
}

// Function to create a new tag
export async function createTag() {
    const tagNameInput = document.getElementById('newTagName');
    const tagName = tagNameInput.value.trim();

    if (!tagName) {
        alert('Nazwa tagu jest wymagana');
        return;
    }

    try {
        const response = await fetch('/api/tags', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ name: tagName })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Błąd tworzenia tagu');
        }

        const newTag = await response.json();
        userTags.push(newTag);
        renderTagsList();
        tagNameInput.value = '';
    } catch (error) {
        console.error('Błąd:', error);
        alert(error.message);
    }
}

// Function to delete a tag
export async function deleteTag(tagId) {
    //if (!confirm('Czy na pewno chcesz usunąć ten tag?')) return;

    console.log(tagId);

    try {
        await fetch(`/api/tags/${tagId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        loadUserTags();
    } catch (error) {
        console.error('Błąd:', error);
        alert('Nie udało się usunąć tagu');
    }
}



// Function to render file tags in the modal
export function renderFileTags(fileTags) {
    const fileTagsList = document.getElementById('fileTagsList');
    fileTagsList.innerHTML = '';

    if (fileTags.length === 0) {
        fileTagsList.innerHTML = '<p>Brak przypisanych tagów</p>';
        return;
    }

    const tagsList = document.createElement('ul');
    tagsList.className = 'tags-list';

    fileTags.forEach(tag => {
        const li = document.createElement('li');
        li.className = 'file-tag-item';
        li.innerHTML = `
            <span>${tag.name}</span>
            <button onclick="removeTagFromFile('${tag._id}')">Usuń</button>
        `;
        tagsList.appendChild(li);
    });

    fileTagsList.appendChild(tagsList);
}


export function populateTagSelector(fileTags) {
    const tagSelector = document.getElementById('tagSelector');
    tagSelector.innerHTML = '<option value="">Wybierz tag</option>';

    // Filter out tags that are already assigned to the file
    const fileTagIds = fileTags.map(tag => tag._id);
    
    // Add only unassigned tags to the dropdown
    userTags
        .filter(tag => !fileTagIds.includes(tag._id))
        .forEach(tag => {
            const option = document.createElement('option');
            option.value = tag._id;
            option.textContent = tag.name;
            tagSelector.appendChild(option);
        });
}

export async function addTagToFile() {
    const tagId = document.getElementById('tagSelector').value;
    
    if (!tagId) {
        alert('Wybierz tag');
        return;
    }
    
    try {
        const response = await fetch('/api/tags/assign', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                fileId: window.currentFileId,
                tagId: tagId
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Błąd przypisywania tagu');
        }

        // Refresh file tags
        const tagsResponse = await fetch(`/api/tags/file/${currentFileId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        if (!tagsResponse.ok) throw new Error('Błąd pobierania tagów pliku');
        
        const fileTags = await tagsResponse.json();
        
        // Update only the tags section of the modal
        renderFileTags(fileTags);
        populateTagSelector(fileTags);
    } catch (error) {
        console.error('Błąd:', error);
        alert(error.message);
    }
}


export async function removeTagFromFile(tagId) {
    try {
        const response = await fetch(`/api/tags/remove/${currentFileId}/${tagId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                fileId: currentFileId,
                tagId: tagId
            })
        });

        if (!response.ok) throw new Error('Błąd usuwania tagu z pliku');

        // Refresh file tags
        const tagsResponse = await fetch(`/api/tags/file/${currentFileId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        if (!tagsResponse.ok) throw new Error('Błąd pobierania tagów pliku');
        
        const fileTags = await tagsResponse.json();
        
        // Update only the tags section of the modal
        renderFileTags(fileTags);
        populateTagSelector(fileTags);
    } catch (error) {
        console.error('Błąd:', error);
        alert('Nie udało się usunąć tagu z pliku');
    }
}

export function populateTagFilterSelector() {
    const tagFilter = document.getElementById('tagFilterSelector');
    if (!tagFilter) return;

    // Clear all options for multiple select
    tagFilter.innerHTML = '';
    
    userTags.forEach(tag => {
        const option = document.createElement('option');
        option.value = tag._id;
        option.textContent = tag.name;
        tagFilter.appendChild(option);
    });
}

// export async function filterFilesByTag() {
//     const tagId = document.getElementById('tagFilterSelector').value;

//     if (!tagId) {
//         //alert('Wybierz tag, aby przefiltrować pliki');
//         window.loadFolderContents();
//         return;
//     }

//     try {
//         const response = await fetch(`/api/tags/files/${tagId}`, {
//             headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
//         });

//         if (!response.ok) throw new Error('Błąd pobierania plików');

//         const files = await response.json();

//         window.renderItems({ subfolders: [], files: files });

//     } catch (error) {
//         console.error('Błąd:', error);
//         alert('Nie udało się załadować plików dla wybranego tagu');
//     }
// }

export async function filterFilesByTag() {
    const selector = document.getElementById('tagFilterSelector');
    const selectedOptions = Array.from(selector.selectedOptions).map(option => option.value).filter(Boolean);

    if (selectedOptions.length === 0) {
        window.loadFolderContents();
        return;
    }

    try {
        const query = selectedOptions.join(',');
        const response = await fetch(`/api/tags/files?tagIds=${query}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (!response.ok) throw new Error('Błąd pobierania plików');

        const files = await response.json();
        window.renderItems({ subfolders: [], files: files });

    } catch (error) {
        console.error('Błąd:', error);
        alert('Nie udało się załadować plików dla wybranych tagów');
    }
}