const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.registerUser = async (req, res) => {
    try {
        const user = new User(req.body);
        await user.save();
        
        // Sprawd� czy request pochodzi od klienta API (ma nag��wek Accept: application/json)
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            res.status(201).json({ message: 'U�ytkownik zosta� zarejestrowany' });
        } else {
            res.status(201).send();
        }
    } catch (error) {
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            res.status(400).json({ error: 'Nazwa u�ytkownika jest ju� zaj�ta' });
        } else {
            res.status(400).json({ error: 'Nazwa u�ytkownika jest ju� zaj�ta' });
        }
    }
};

exports.loginUser = async (req, res) => {
    try {
        const user = await User.findOne({ username: req.body.username });

        if (!user || !await bcrypt.compare(req.body.password, user.password)) {
            return res.status(401).json({ error: 'B��dne dane logowania' });
        }

        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        // Zawsze zwracaj JSON dla logowania
        res.json({ token });
    } catch (error) {
        res.status(500).json({ error: 'B��d serwera' });
    }
};

exports.getCurrentUser = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-password');
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'B��d serwera' });
    }
};