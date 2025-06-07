const FolderService = require('../services/FolderService');

exports.createFolder = async (req, res) => {
    try {
        const folder = await FolderService.createFolder(req.user.userId, req.body);
        res.status(201).json(folder);
    } catch (error) {
        console.error('Błąd tworzenia folderu:', error);
        res.status(400).json({ error: error.message });
    }
};

exports.getFolders = async (req, res) => {
    try {
        const { 
            parent, 
            search, 
            sortBy, 
            sortOrder, 
            limit, 
            skip, 
            populate 
        } = req.query;
        
        const options = {};
        
        if (parent !== undefined) options.parent = parent || null;
        if (search) options.search = search;
        if (sortBy) options.sortBy = sortBy;
        if (sortOrder) options.sortOrder = sortOrder;
        if (limit) options.limit = limit;
        if (skip) options.skip = skip;
        if (populate) options.populate = populate.split(',');
        
        const folders = await FolderService.getUserFolders(req.user.userId, options);
        res.json(folders);
    } catch (error) {
        console.error('Błąd pobierania folderów:', error);
        res.status(500).json({ error: 'Błąd pobierania folderów' });
    }
};

exports.renameFolder = async (req, res) => {
    try {
        const { id } = req.params;
        const { newName } = req.body;
        
        if (!newName || newName.trim() === '') {
            return res.status(400).json({ error: 'Nowa nazwa jest wymagana' });
        }
        
        const folder = await FolderService.renameFolder(req.user.userId, id, newName);
        res.json(folder);
    } catch (error) {
        console.error('Błąd zmiany nazwy folderu:', error);
        
        if (error.message.includes('nie znaleziony')) {
            return res.status(404).json({ error: error.message });
        }
        
        res.status(400).json({ error: error.message });
    }
};

exports.deleteFolder = async (req, res) => {
    try {
        const { id } = req.params;
        const { force, permanent } = req.query;
        
        const options = {
            force: force === 'true',
            permanent: permanent === 'true'
        };
        
        const result = await FolderService.deleteFolder(req.user.userId, id, options);
        res.json(result);
    } catch (error) {
        console.error('Błąd usuwania folderu:', error);
        
        if (error.message.includes('nie znaleziony')) {
            return res.status(404).json({ error: error.message });
        }
        
        if (error.message.includes('nie jest pusty')) {
            return res.status(400).json({ error: error.message });
        }
        
        res.status(500).json({ error: 'Błąd usuwania folderu' });
    }
};

exports.getFolderContents = async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            includeFiles = 'true', 
            includeSubfolders = 'true',
            sortBy,
            sortOrder,
            search,
            fileTypes
        } = req.query;
        
        const folderId = id === 'root' ? null : id;
        
        const options = {
            includeFiles: includeFiles === 'true',
            includeSubfolders: includeSubfolders === 'true'
        };
        
        if (sortBy) options.sortBy = sortBy;
        if (sortOrder) options.sortOrder = sortOrder;
        if (search) options.search = search;
        if (fileTypes) options.fileTypes = fileTypes.split(',');
        
        const contents = await FolderService.getFolderContents(req.user.userId, folderId, options);
        res.json(contents);
    } catch (error) {
        console.error('Błąd pobierania zawartości folderu:', error);
        res.status(500).json({ error: 'Błąd pobierania zawartości folderu' });
    }
};