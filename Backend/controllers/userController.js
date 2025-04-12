const User = require('../models/User');

exports.getUserEmailById = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-email');
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Blad serwera' });
    }
}

exports.getUserLoginById = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-login');
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Blad serwera' });
    }
}

exports.getUserProfilePictureById = async (req, res) => {
    try {
        const file = await User.findById(req.user.userId).select('-login');
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Blad serwera' });
    }
}