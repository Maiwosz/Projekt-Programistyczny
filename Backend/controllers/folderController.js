const FolderService = require('../services/FolderService');
const crypto = require('crypto');

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

exports.shareFolder = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        const folder = await FolderService.getFolderById(userId, id);
        if (!folder) return res.status(404).json({ error: 'Folder not found' });
        
        if (folder.isShared) {
            return res.status(400).json({ message: 'Folder is already shared' });
        }

        const sharedLink = crypto.randomBytes(12).toString('hex');

        folder.sharedLink = sharedLink;
        folder.isShared = true;
        await folder.save();

        const fullLink = `${process.env.BASE_URL || 'http://localhost:3000'}/shared/${sharedLink}`;
        res.json({ sharedLink: fullLink });
    } catch (error) {
        console.error('Error sharing folder:', error);
        res.status(500).json({ error: 'Error sharing folder' });
    }
};

exports.revokeSharedLink = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        const folder = await FolderService.getFolderById(userId, id);
        if (!folder) return res.status(404).json({ error: 'Folder not found' });


        if (!folder.sharedLink) {
            return res.status(400).json({ error: 'Folder is not shared' });
        }

        folder.sharedLink = undefined;
        folder.isShared = false;

        await folder.save();

        res.json({ message: 'Shared link revoked successfully' });

    } catch (err) {
        console.error('Error revoking share:', err);
        res.status(500).json({ error: 'Error revoking shared link' });
    }
};

exports.isFolderShared = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        const folder = await FolderService.getFolderById(userId, id);

        if (!folder) return res.status(404).json({ error: 'Folder not found' });

        const isShared = !!folder.sharedLink;
        res.json({ shared: isShared, link: isShared ? `${process.env.BASE_URL || 'http://localhost:3000'}/shared/${folder.sharedLink}` : null });
    } catch (err) {
        console.error('Error checking shared status:', err);
        res.status(500).json({ error: 'Error checking shared status' });
    }
};


exports.getSharedFolderContents = async (req, res) => {
    try {
        const { sharedLink } = req.params;

        const folder = await Folder.findOne({ sharedLink });
        if (!folder) return res.status(404).json({ error: 'Shared folder not found' });

        const contents = await FolderService.getFolderContents(folder.user, folder._id, {
            includeFiles: true,
            includeSubfolders: true
        });

        res.json({
            folder: {
                id: folder._id,
                name: folder.name,
                description: folder.description
            },
            contents
        });
    } catch (err) {
        console.error('Shared access error:', err);
        res.status(500).json({ error: 'Unable to load shared folder contents' });
    }
};
