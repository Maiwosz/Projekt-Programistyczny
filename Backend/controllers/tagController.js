// controllers/tagController.js
const Tag = require('../models/Tag');
const FileTag = require('../models/FileTag');
const File = require('../models/File');
const mongoose = require('mongoose');

exports.createTag = async (req, res) => {
    try {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Nazwa tagu jest wymagana' });
        }

        const existingTag = await Tag.findOne({
            user: req.user.userId,
            name: name
        });

        if (existingTag) {
            return res.status(400).json({ error: 'Tag o tej nazwie już istnieje' });
        }

        const tag = new Tag({
            user: req.user.userId,
            name,
        });

        await tag.save();
        res.status(201).json(tag);
    } catch (err) {
        res.status(500).json({ error: 'Błąd tworzenia tagu' });
    }
}

// Get all tags for a user
exports.getUserTags = async (req, res) => {
    try {
        const tags = await Tag.find({ user: req.user.userId })
            .sort({ name: 1 });
        res.json(tags);
    } catch (error) {
        console.error('Błąd pobierania tagów:', error);
        res.status(500).json({ error: 'Błąd pobierania tagów' });
    }
};

// Delete a tag
exports.deleteTag = async (req, res) => {

    try {

        const {tagId} = req.params;
        const tag = await Tag.findOne({ _id: tagId, user: req.user.userId })

        if (!tag) {
            return res.status(404).json({ error: 'Backend: Tag nie znaleziony' });
        }

        // delete links to files
        const fileTags = await FileTag.find({tag: tagId});
        for (const fileTag of fileTags) {
            await FileTag.findByIdAndDelete(fileTag._id);
        }

        await Tag.findByIdAndDelete(tagId);
        
        
        res.json({ message: 'Backend: Tag usunięty' });
    } catch (error) {
        console.error('Backend: Błąd usuwania tagu:', error);
        res.status(500).json({ error: 'Backend: Błąd usuwania tagu' });
    }
};

exports.assignTagToFile = async (req, res) => {
    try {
        const { fileId, tagId } = req.body;
        
        if (!fileId || !tagId) {
            return res.status(400).json({ error: 'ID pliku i tagu są wymagane' });
        }

        // Check if file exists and belongs to user
        const file = await File.findOne({ 
            _id: fileId, 
            user: req.user.userId 
        });
        
        if (!file) {
            return res.status(404).json({ error: 'Plik nie znaleziony' });
        }

        // Check if tag exists and belongs to user
        const tag = await Tag.findOne({ 
            _id: tagId, 
            user: req.user.userId 
        });
        
        if (!tag) {
            return res.status(404).json({ error: 'Tag nie znaleziony' });
        }

        // Check if this tag is already assigned to this file
        const existingFileTag = await FileTag.findOne({
            file: fileId,
            tag: tagId
        });

        if (existingFileTag) {
            return res.status(400).json({ error: 'Tag jest już przypisany do tego pliku' });
        }

        // Create new file-tag association
        const fileTag = new FileTag({
            file: fileId,
            tag: tagId,
            user: req.user.userId
        });

        await fileTag.save();
        res.status(201).json(fileTag);
    } catch (error) {
        console.error('Błąd przypisywania tagu:', error);
        res.status(500).json({ 
            error: 'Błąd przypisywania tagu',
            details: error.message
        });
    }
};

// Remove a tag from a file
exports.removeTagFromFile = async (req, res) => {
    try {
        console.log("requestr params: ", req.params);

        const { fileId, tagId } = req.params;
        
        // Delete the file-tag association
        const result = await FileTag.findOneAndDelete({
            file: fileId,
            tag: tagId,
            user: req.user.userId
        });

        if (!result) {
            return res.status(404).json({ error: 'Przypisanie tagu nie znalezione' });
        }

        res.json({ message: 'Tag usunięty z pliku' });
    } catch (error) {
        console.error('Błąd usuwania tagu z pliku:', error);
        res.status(500).json({ error: 'Błąd usuwania tagu z pliku' });
    }
};


exports.getFileTags = async (req, res) => {
    try {
        const fileId = req.params.fileId;
        
        // Check if file exists and belongs to user
        const file = await File.findOne({ 
            _id: fileId, 
            user: req.user.userId 
        });
        
        if (!file) {
            return res.status(404).json({ error: 'Plik nie znaleziony' });
        }

        // Get all tags assigned to this file
        const fileTags = await FileTag.find({ 
            file: fileId,
            user: req.user.userId
        }).populate('tag');

        // Extract tag objects from file-tag associations
        const tags = fileTags
            .map(fileTag => fileTag.tag);
        
        res.json(tags);
    } catch (error) {
        console.error('Błąd pobierania tagów pliku:', error);
        res.status(500).json({ error: 'Błąd pobierania tagów pliku' });
    }
};
exports.getFilesByTag = async (req, res) => {
    try {
        const tagId = req.params.tagId;
        
        // Check if tag exists and belongs to user
        const tag = await Tag.findOne({ 
            _id: tagId, 
            user: req.user.userId 
        });
        
        if (!tag) {
            return res.status(404).json({ error: 'Tag nie znaleziony' });
        }

        // Get all file-tag associations for this tag
        const fileTags = await FileTag.find({ 
            tag: tagId,
            user: req.user.userId
        }).populate({
            path: 'file',
            select: 'originalName path mimetype category createdAt'
        });

        // Extract file objects from file-tag associations
        const files = fileTags
            .map(fileTag => fileTag.file)
            .filter(file => file !== null); // Filter out any null values (deleted files)
        
        res.json(files);
    } catch (error) {
        console.error('Błąd pobierania plików według tagu:', error);
        res.status(500).json({ error: 'Błąd pobierania plików według tagu' });
    }
};