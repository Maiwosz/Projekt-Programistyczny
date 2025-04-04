const Photo = require('../models/Photo');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../../uploads/photos');
        fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ storage });

exports.uploadPhoto = [
    upload.single('photo'),
    async (req, res) => {
        try {
            const photo = new Photo({
                user: req.user.userId,
                path: path.join('photos', req.file.filename).replace(/\\/g, '/')
            });
            await photo.save();
            res.status(201).json(photo);
        } catch (error) {
            res.status(500).json({ error: 'B³¹d przesy³ania zdjêcia' });
        }
    }
];

exports.getUserPhotos = async (req, res) => {
    try {
        const photos = await Photo.find({ user: req.user.userId });
        res.json(photos);
    } catch (error) {
        res.status(500).json({ error: 'B³¹d pobierania zdjêæ' });
    }
};