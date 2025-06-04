export function populateTypeFilterSelector(categories = null) {
    const typeSelector = document.getElementById('typeFilterSelector');
    typeSelector.innerHTML = '<option value="">Wszystkie typy</option>';

    // Define available file types with display names
    const fileTypes = [
        { value: 'image', label: 'Obrazy' },
        { value: 'document', label: 'Dokumenty' },
        { value: 'audio', label: 'Audio' },
        { value: 'video', label: 'Wideo' },
        { value: 'other', label: 'Inne' }
    ];

    // If categories data is provided (from API), use it to show counts
    if (categories && Array.isArray(categories)) {
        const categoryMap = {};
        categories.forEach(cat => {
            categoryMap[cat.name] = cat.count;
        });

        fileTypes.forEach(type => {
            const count = categoryMap[type.value] || 0;
            if (count > 0) { // Only show types that have files
                const option = document.createElement('option');
                option.value = type.value;
                option.textContent = `${type.label} (${count})`;
                typeSelector.appendChild(option);
            }
        });
    } else {
        // Fallback: show all types without counts
        fileTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type.value;
            option.textContent = type.label;
            typeSelector.appendChild(option);
        });
    }
}

// Alternative function to populate with multiple selection support
export function populateTypeFilterSelectorMultiple(categories = null) {
    const typeSelector = document.getElementById('typeFilterSelector');
    
    // Clear existing options except the first "all types" option
    typeSelector.innerHTML = '';

    // Define available file types with display names
    const fileTypes = [
        { value: 'image', label: 'Obrazy' },
        { value: 'document', label: 'Dokumenty' },
        { value: 'audio', label: 'Audio' },
        { value: 'video', label: 'Wideo' },
        { value: 'other', label: 'Inne' }
    ];

    // If categories data is provided (from API), use it to show counts
    if (categories && Array.isArray(categories)) {
        const categoryMap = {};
        categories.forEach(cat => {
            categoryMap[cat.name] = cat.count;
        });

        fileTypes.forEach(type => {
            const count = categoryMap[type.value] || 0;
            if (count > 0) { // Only show types that have files
                const option = document.createElement('option');
                option.value = type.value;
                option.textContent = `${type.label} (${count})`;
                typeSelector.appendChild(option);
            }
        });
    } else {
        // Fallback: show all types without counts
        fileTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type.value;
            option.textContent = type.label;
            typeSelector.appendChild(option);
        });
    }
}

// Function to get selected types (for multiple selection)
export function getSelectedFileTypes() {
    const typeSelector = document.getElementById('typeFilterSelector');
    if (typeSelector.multiple) {
        return Array.from(typeSelector.selectedOptions).map(option => option.value);
    } else {
        return typeSelector.value ? [typeSelector.value] : [];
    }
}

// Function to set selected types
export function setSelectedFileTypes(types) {
    const typeSelector = document.getElementById('typeFilterSelector');
    
    if (typeSelector.multiple) {
        // For multiple selection
        Array.from(typeSelector.options).forEach(option => {
            option.selected = types.includes(option.value);
        });
    } else {
        // For single selection
        typeSelector.value = types.length > 0 ? types[0] : '';
    }
}

//////////////////////

export async function filterFiles() {
    const tagSelector = document.getElementById('tagFilterSelector');
    const typeSelector = document.getElementById('typeFilterSelector');
    const nameInput = document.getElementById('nameFilterSelector');

    // Get selected tags
    const selectedTags = tagSelector ? 
        Array.from(tagSelector.selectedOptions).map(option => option.value).filter(Boolean) : [];
    
    // Get selected types
    const selectedTypes = typeSelector ? 
        Array.from(typeSelector.selectedOptions).map(option => option.value).filter(Boolean) : [];
    
    // Get name filter
    const nameFilter = nameInput ? nameInput.value.trim() : '';

    // If no filters are applied, load all folder contents
    if (selectedTags.length === 0 && selectedTypes.length === 0 && !nameFilter) {
        window.loadFolderContents();
        return;
    }

    try {
        // Build query parameters
        const query = new URLSearchParams();
        
        if (selectedTags.length > 0) {
            query.append('tagIds', selectedTags.join(','));
        }
        
        if (selectedTypes.length > 0) {
            query.append('categories', selectedTypes.join(','));
        }
        
        if (nameFilter) {
            query.append('name', nameFilter);
        }

        const response = await fetch(`/api/filter?${query.toString()}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (!response.ok) throw new Error('Błąd pobierania plików');

        const data = await response.json();
        window.renderItems({ subfolders: [], files: data.files });

    } catch (error) {
        console.error('Błąd:', error);
        alert('Nie udało się załadować plików dla wybranych filtrów');
    }
}

// Individual filter functions for specific use cases
export async function filterFilesByTag() {
    const selector = document.getElementById('tagFilterSelector');
    const selectedOptions = Array.from(selector.selectedOptions).map(option => option.value).filter(Boolean);

    if (selectedOptions.length === 0) {
        window.loadFolderContents();
        return;
    }

    try {
        const query = selectedOptions.join(',');
        const response = await fetch(`/api/files/filter?tagIds=${query}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (!response.ok) throw new Error('Błąd pobierania plików');

        const data = await response.json();
        window.renderItems({ subfolders: [], files: data.files });

    } catch (error) {
        console.error('Błąd:', error);
        alert('Nie udało się załadować plików dla wybranych tagów');
    }
}

export async function filterFilesByType() {
    const selector = document.getElementById('typeFilterSelector');
    const selectedOptions = Array.from(selector.selectedOptions).map(option => option.value).filter(Boolean);

    if (selectedOptions.length === 0) {
        window.loadFolderContents();
        return;
    }

    try {
        const query = selectedOptions.join(',');
        const response = await fetch(`/api/files/filter?categories=${query}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (!response.ok) throw new Error('Błąd pobierania plików');

        const data = await response.json();
        window.renderItems({ subfolders: [], files: data.files });

    } catch (error) {
        console.error('Błąd:', error);
        alert('Nie udało się załadować plików dla wybranych typów');
    }
}

export async function filterFilesByName() {
    const nameInput = document.getElementById('nameFilter');
    const nameFilter = nameInput ? nameInput.value.trim() : '';

    if (!nameFilter) {
        window.loadFolderContents();
        return;
    }

    try {
        const response = await fetch(`/api/files/filter?name=${encodeURIComponent(nameFilter)}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (!response.ok) throw new Error('Błąd pobierania plików');

        const data = await response.json();
        window.renderItems({ subfolders: [], files: data.files });

    } catch (error) {
        console.error('Błąd:', error);
        alert('Nie udało się załadować plików dla wybranej nazwy');
    }
}