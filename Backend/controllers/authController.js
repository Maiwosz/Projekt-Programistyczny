const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.registerUser = async (req, res) => {
    try {
        const user = new User(req.body);
        await user.save();
        res.status(201).send();
    } catch (error) {
        res.status(400).json({ error: 'Nazwa u¿ytkownika jest ju¿ zajêta' });
    }
};

exports.loginUser = async (req, res) => {
    const user = await User.findOne({ username: req.body.username });

    if (!user || !await bcrypt.compare(req.body.password, user.password)) {
        return res.status(401).json({ error: 'B³êdne dane logowania' });
    }

    const token = jwt.sign(
        { userId: user._id },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );

    res.json({ token });
};

exports.getCurrentUser = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-password');
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'B³¹d serwera' });
    }
};