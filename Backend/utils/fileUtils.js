const fs = require('fs');
const crypto = require('crypto');

/**
 * Generuje hash MD5 dla pliku
 * @param {string} filePath - Ścieżka do pliku
 * @returns {Promise<string|null>} Hash pliku lub null w przypadku błędu
 */
const generateFileHash = async (filePath) => {
    try {
        const fileBuffer = await fs.promises.readFile(filePath);
        const hash = crypto.createHash('md5').update(fileBuffer).digest('hex');
        return hash;
    } catch (error) {
        console.error('Błąd generowania hash pliku:', error);
        return null;
    }
};

/**
 * Pobiera statystyki pliku z systemu plików
 * @param {string} filePath - Ścieżka do pliku
 * @returns {Promise<{size: number, lastModified: Date}>} Statystyki pliku
 */
const getFileStats = async (filePath) => {
    try {
        const stats = await fs.promises.stat(filePath);
        return {
            size: stats.size,
            lastModified: stats.mtime
        };
    } catch (error) {
        console.error('Błąd pobierania statystyk pliku:', error);
        return { size: 0, lastModified: new Date() };
    }
};

/**
 * Określa kategorię pliku na podstawie MIME type
 * @param {string} mimetype - Typ MIME pliku
 * @returns {string} Kategoria pliku
 */
const getCategoryFromMimeType = (mimetype) => {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.startsWith('audio/')) return 'audio';
    if (mimetype === 'application/pdf' || mimetype.startsWith('text/')) return 'document';
    return 'other';
};

/**
 * Pobiera typ MIME na podstawie nazwy pliku
 * @param {string} filename - Nazwa pliku z rozszerzeniem
 * @returns {string|null} Typ MIME lub null jeśli nieznany
 */
const getMimeTypeFromFilename = (filename) => {
    const extension = filename.split('.').pop().toLowerCase();
    const mimeTypes = {
        // Obrazy
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'svg': 'image/svg+xml',
        'bmp': 'image/bmp',
        
        // Dokumenty
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'ppt': 'application/vnd.ms-powerpoint',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'txt': 'text/plain',
        'rtf': 'application/rtf',
        
        // Audio
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'ogg': 'audio/ogg',
        'flac': 'audio/flac',
        'aac': 'audio/aac',
        
        // Wideo
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'avi': 'video/x-msvideo',
        'mov': 'video/quicktime',
        'mkv': 'video/x-matroska',
        
        // Archiwa
        'zip': 'application/zip',
        'rar': 'application/x-rar-compressed',
        '7z': 'application/x-7z-compressed',
        'tar': 'application/x-tar',
        'gz': 'application/gzip',
        
        // Inne
        'json': 'application/json',
        'xml': 'application/xml',
        'html': 'text/html',
        'css': 'text/css',
        'js': 'application/javascript'
    };
    
    return mimeTypes[extension] || null;
};

/**
 * Porównuje dwa pliki na podstawie ich hash MD5
 * @param {string} path1 - Ścieżka do pierwszego pliku
 * @param {string} path2 - Ścieżka do drugiego pliku
 * @returns {Promise<boolean>} True jeśli pliki są identyczne, false w przeciwnym razie
 */
const compareFiles = async (path1, path2) => {
    const getFileHash = (filePath) => {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('md5');
            const stream = fs.createReadStream(filePath);
            
            stream.on('error', err => reject(err));
            stream.on('data', chunk => hash.update(chunk));
            stream.on('end', () => resolve(hash.digest('hex')));
        });
    };
    
    try {
        const [hash1, hash2] = await Promise.all([
            getFileHash(path1),
            getFileHash(path2)
        ]);
        
        return hash1 === hash2;
    } catch (error) {
        console.error('Błąd porównywania plików:', error);
        return false;
    }
};

module.exports = {
    generateFileHash,
    getFileStats,
    getCategoryFromMimeType,
    getMimeTypeFromFilename,
    compareFiles
};