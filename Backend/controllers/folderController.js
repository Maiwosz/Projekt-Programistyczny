const Folder = require('../models/Folder');
const File = require('../models/File');
const path = require('path');
const fs = require('fs');
const SyncService = require('../services/SyncService');

exports.createFolder = async (req, res) => {
    try {
        const { name, description, parent } = req.body;

        if (parent) {
            const parentFolder = await Folder.findOne({ _id: parent, user: req.user.userId });
            if (!parentFolder) {
                return res.status(404).json({ error: 'Folder nadrzędny nie istnieje' });
            }
        }

        const folder = new Folder({
            user: req.user.userId,
            name,
            description,
            parent: parent || null
        });
        await folder.save();
        res.status(201).json(folder);
    } catch (err) {
        res.status(500).json({ error: 'Błąd tworzenia folderu' });
    }
};

exports.getFolders = async (req, res) => {
    try {
        const folders = await Folder.find({ user: req.user.userId });
        res.json(folders);
    } catch (err) {
        res.status(500).json({ error: 'Błąd pobierania folderów' });
    }
};

exports.renameFolder = async (req, res) => {
    const { id } = req.params;
    const { newName } = req.body;

    try {
        const folder = await Folder.findById(id);
        if (!folder) {
            return res.status(404).json({ error: 'Folder nie znaleziony' });
        }

        folder.name = newName;
        await folder.save();
        res.status(200).json(folder);
    } catch (error) {
        res.status(500).json({ error: 'Błąd zmiany nazwy folderu' });
    }
};

exports.deleteFolder = async (req, res) => {
    try {
        const { id } = req.params;
        const { force } = req.query;

        const folder = await Folder.findOne({ _id: id, user: req.user.userId });
        if (!folder) return res.status(404).json({ error: 'Folder nie znaleziony' });

        if (!force) {
            const [filesCount, subfoldersCount] = await Promise.all([
                File.countDocuments({ folder: id, user: req.user.userId }),
                Folder.countDocuments({ parent: id, user: req.user.userId })
            ]);

            if (filesCount > 0 || subfoldersCount > 0) {
                return res.status(400).json({
                    error: 'Folder nie jest pusty. Użyj parametru force=true, aby usunąć rekurencyjnie.'
                });
            }

            try {
                await SyncService.removeSyncFolder(req.user.userId, id);
            } catch (error) {
                console.warn('Błąd usuwania synchronizacji folderu:', error.message);
            }

            await Folder.findByIdAndDelete(id);
            return res.json({ message: 'Folder usunięty' });
        } else {
            const deleteFolderRecursive = async (folderId) => {
                const subfolders = await Folder.find({ parent: folderId, user: req.user.userId });
                for (const subfolder of subfolders) {
                    await deleteFolderRecursive(subfolder._id);
                }

                try {
                    await SyncService.removeSyncFolder(req.user.userId, folderId);
                } catch (error) {
                    console.warn('Błąd usuwania synchronizacji subfolderu:', error.message);
                }

                const files = await File.find({ folder: folderId, user: req.user.userId });
                for (const file of files) {
                    const filePath = path.join(__dirname, '../../../uploads', file.path);
                    try {
                        await fs.promises.unlink(filePath);
                    } catch (err) {
                        if (err.code !== 'ENOENT') throw err;
                    }
                    await File.findByIdAndDelete(file._id);
                }

                await Folder.findByIdAndDelete(folderId);
            };

            await deleteFolderRecursive(id);
            res.json({ message: 'Folder i jego zawartość usunięte' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Błąd usuwania folderu' });
    }
};

exports.getFolderContents = async (req, res) => {
    try {
        const folderId = req.params.id || null;

        const [files, subfolders] = await Promise.all([
            File.find({
                user: req.user.userId,
                folder: folderId,
                isDeleted: { $ne: true }
            }),
            Folder.find({
                user: req.user.userId,
                parent: folderId
            })
        ]);

        res.json({ files, subfolders });
    } catch (err) {
        res.status(500).json({ error: 'Błąd pobierania zawartości folderu' });
    }
};