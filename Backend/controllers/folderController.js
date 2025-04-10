const Folder = require('../models/Folder');

exports.createFolder = async (req, res) => {
    try {
        const { name, description } = req.body;
        const folder = new Folder({
            user: req.user.userId,
            name,
            description
        });
        await folder.save();
        res.status(201).json(folder);
    } catch (err) {
        res.status(500).json({ error: 'Błąd tworzenia folderu' });
    }
};

exports.getFolders = async (req, res) => {
    try {
        const folders = await Folder.find({ user: req.user.userId }).populate('photos');
        res.json(folders);
    } catch (err) {
        res.status(500).json({ error: 'Błąd pobierania folderów' });
    }
};

exports.renameFolder = async (req, res) => {
    const { id } = req.params;  // Get folder ID from URL parameters
    const { newName } = req.body;  // Get new folder name from request body

    try {
        // Find the folder by ID
        const folder = await Folder.findById(id);

        if (!folder) {
            return res.status(404).json({ error: 'Folder not found' });
        }

        // Update the folder name
        folder.name = newName;
        await folder.save();

        res.status(200).json(folder);  // Send back the updated folder
    } catch (error) {
        console.error('Error renaming folder:', error);
        res.status(500).json({ error: 'Error renaming folder' });
    }
};

exports.deleteFolder = async (req, res) => {
    try {
        const { id } = req.params;
        const folder = await Folder.findOneAndDelete({ _id: id, user: req.user.userId });
        if (!folder) return res.status(404).json({ error: 'Folder nie znaleziony' });
        res.json({ message: 'Folder usunięty' });
    } catch (err) {
        res.status(500).json({ error: 'Błąd usuwania folderu' });
    }
};

exports.addPhotoToFolder = async (req, res) => {
    try {
        const { folderId, photoId } = req.body;
        const folder = await Folder.findOneAndUpdate(
            { _id: folderId, user: req.user.userId },
            { $addToSet: { photos: photoId } },
            { new: true }
        );
        if (!folder) return res.status(404).json({ error: 'Folder nie znaleziony' });
        res.json(folder);
    } catch (err) {
        res.status(500).json({ error: 'Błąd dodawania zdjęcia do folderu' });
    }
};

exports.removePhotoFromFolder = async (req, res) => {
    try {
        const { folderId, photoId } = req.body;
        const folder = await Folder.findOneAndUpdate(
            { _id: folderId, user: req.user.userId },
            { $pull: { photos: photoId } },
            { new: true }
        );
        if (!folder) return res.status(404).json({ error: 'Folder nie znaleziony' });
        res.json(folder);
    } catch (err) {
        res.status(500).json({ error: 'Błąd usuwania zdjęcia z folderu' });
    }
};
