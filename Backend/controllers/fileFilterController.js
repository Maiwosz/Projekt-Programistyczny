const File = require('../models/File');
const Tag = require('../models/Tag');
const FileTag = require('../models/FileTag');

/**
 * Filter files by multiple criteria: tags, file type (category), and name
 * Query parameters:
 * - tagIds: comma-separated tag IDs
 * - categories: comma-separated file categories (image, document, audio, video, other)
 * - name: partial file name search (case-insensitive)
 * - folderId: filter by folder (optional)
 * - includeDeleted: include soft-deleted files (default: false)
 * - sortBy: sort field (name, createdAt, category) (default: createdAt)
 * - sortOrder: asc or desc (default: desc)
 */
exports.filterFiles = async (req, res) => {
    try {
        const {
            tagIds,
            categories,
            name,
            folderId,
            includeDeleted = 'false',
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        // Build the base query for files belonging to the user
        let fileQuery = {
            user: req.user.userId
        };

        // Handle soft delete filter
        if (includeDeleted !== 'true') {
            fileQuery.isDeleted = { $ne: true };
        }

        // Handle folder filter
        if (folderId) {
            if (folderId === 'null' || folderId === 'root') {
                fileQuery.folder = null;
            } else {
                fileQuery.folder = folderId;
            }
        }

        // Handle category filter
        if (categories) {
            const categoryArray = categories.split(',').map(cat => cat.trim());
            const validCategories = categoryArray.filter(cat => 
                ['image', 'document', 'audio', 'video', 'other'].includes(cat)
            );
            
            if (validCategories.length > 0) {
                fileQuery.category = { $in: validCategories };
            }
        }

        // Handle name filter (case-insensitive partial match)
        if (name && name.trim()) {
            fileQuery.originalName = { 
                $regex: name.trim(), 
                $options: 'i' 
            };
        }

        let files = [];

        // If tag filtering is requested
        if (tagIds && tagIds.trim()) {
            const tagIdArray = tagIds.split(',').map(id => id.trim()).filter(id => id);
            
            if (tagIdArray.length > 0) {
                // Verify that all tags belong to the user
                const userTags = await Tag.find({
                    _id: { $in: tagIdArray },
                    user: req.user.userId
                });

                if (userTags.length === 0) {
                    return res.status(404).json({ 
                        error: 'Tagi nie znalezione'
                    });
                }

                // Get files that have the specified tags
                const fileTags = await FileTag.find({
                    tag: { $in: tagIdArray },
                    user: req.user.userId
                }).populate({
                    path: 'file',
                    match: fileQuery, // Apply file filters here
                    select: 'originalName path mimetype category createdAt folder metadata fileHash lastModified isDeleted deletedAt'
                });

                // Extract files and remove nulls (files that didn't match the query)
                const taggedFiles = fileTags
                    .map(fileTag => fileTag.file)
                    .filter(file => file !== null);

                // Remove duplicates (files that have multiple matching tags)
                const uniqueFileMap = new Map();
                taggedFiles.forEach(file => {
                    uniqueFileMap.set(file._id.toString(), file);
                });

                files = Array.from(uniqueFileMap.values());
            }
        } else {
            // No tag filtering - search files directly
            files = await File.find(fileQuery)
                .select('originalName path mimetype category createdAt folder metadata fileHash lastModified isDeleted deletedAt');
        }

        // Sort files
        const sortMultiplier = sortOrder === 'asc' ? 1 : -1;
        files.sort((a, b) => {
            let aValue, bValue;
            
            switch (sortBy) {
                case 'name':
                    aValue = a.originalName.toLowerCase();
                    bValue = b.originalName.toLowerCase();
                    return aValue.localeCompare(bValue) * sortMultiplier;
                case 'category':
                    aValue = a.category;
                    bValue = b.category;
                    return aValue.localeCompare(bValue) * sortMultiplier;
                case 'createdAt':
                default:
                    aValue = new Date(a.createdAt);
                    bValue = new Date(b.createdAt);
                    return (aValue - bValue) * sortMultiplier;
            }
        });

        // For each file, get its tags
        const fileIds = files.map(file => file._id);
        const fileTagsWithTags = await FileTag.find({
            file: { $in: fileIds },
            user: req.user.userId
        }).populate('tag', 'name');

        // Group tags by file
        const fileTagsMap = {};
        fileTagsWithTags.forEach(fileTag => {
            const fileId = fileTag.file.toString();
            if (!fileTagsMap[fileId]) {
                fileTagsMap[fileId] = [];
            }
            fileTagsMap[fileId].push(fileTag.tag);
        });

        // Add tags to each file
        const filesWithTags = files.map(file => ({
            ...file.toObject(),
            tags: fileTagsMap[file._id.toString()] || []
        }));

        res.json({
            files: filesWithTags,
            totalCount: files.length,
            filters: {
                tagIds: tagIds || null,
                categories: categories || null,
                name: name || null,
                folderId: folderId || null,
                includeDeleted: includeDeleted === 'true'
            },
            sorting: {
                sortBy,
                sortOrder
            }
        });

    } catch (error) {
        console.error('Błąd filtrowania plików:', error);
        res.status(500).json({ 
            error: 'Błąd filtrowania plików',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get available filter options for the user
 * Returns unique categories and all user tags
 */
exports.getFilterOptions = async (req, res) => {
    try {
        // Get user's tags
        const userTags = await Tag.find({ user: req.user.userId })
            .select('name')
            .sort({ name: 1 });

        // Get available categories from user's files
        const categories = await File.distinct('category', { 
            user: req.user.userId,
            isDeleted: { $ne: true }
        });

        // Get file count by category
        const categoryCounts = await File.aggregate([
            { 
                $match: { 
                    user: req.user.userId,
                    isDeleted: { $ne: true }
                }
            },
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 }
                }
            }
        ]);

        const categoryCountMap = {};
        categoryCounts.forEach(item => {
            categoryCountMap[item._id] = item.count;
        });

        res.json({
            tags: userTags,
            categories: categories.map(category => ({
                name: category,
                count: categoryCountMap[category] || 0
            })),
            totalFiles: await File.countDocuments({ 
                user: req.user.userId,
                isDeleted: { $ne: true }
            })
        });

    } catch (error) {
        console.error('Błąd pobierania opcji filtrowania:', error);
        res.status(500).json({ 
            error: 'Błąd pobierania opcji filtrowania',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Advanced search with text-based query
 * Searches in file names, tags, and metadata
 */
exports.searchFiles = async (req, res) => {
    try {
        const { q, ...otherFilters } = req.query;
        
        if (!q || !q.trim()) {
            return res.status(400).json({ 
                error: 'Brak zapytania wyszukiwania' 
            });
        }

        const searchTerm = q.trim();
        
        // Search in tags
        const matchingTags = await Tag.find({
            user: req.user.userId,
            name: { $regex: searchTerm, $options: 'i' }
        });

        const matchingTagIds = matchingTags.map(tag => tag._id);

        // Modify the request to include found tags
        req.query = {
            ...otherFilters,
            name: searchTerm,
            tagIds: matchingTagIds.length > 0 ? matchingTagIds.join(',') : undefined
        };

        // Use the existing filter function
        await this.filterFiles(req, res);

    } catch (error) {
        console.error('Błąd wyszukiwania plików:', error);
        res.status(500).json({ 
            error: 'Błąd wyszukiwania plików',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};