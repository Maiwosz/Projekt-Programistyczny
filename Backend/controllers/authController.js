const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.registerUser = async (req, res) => {
    try {
        const user = new User(req.body);
        await user.save();
        
        // SprawdŸ czy request pochodzi od klienta API (ma nag³ówek Accept: application/json)
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            res.status(201).json({ message: 'U¿ytkownik zosta³ zarejestrowany' });
        } else {
            res.status(201).send();
        }
    } catch (error) {
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            res.status(400).json({ error: 'Nazwa u¿ytkownika jest ju¿ zajêta' });
        } else {
            res.status(400).json({ error: 'Nazwa u¿ytkownika jest ju¿ zajêta' });
        }
    }
};

exports.loginUser = async (req, res) => {
    try {
        const user = await User.findOne({ username: req.body.username });

        if (!user || !await bcrypt.compare(req.body.password, user.password)) {
            return res.status(401).json({ error: 'B³êdne dane logowania' });
        }

        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '4h' }
        );

        // Zawsze zwracaj JSON dla logowania
        res.json({ token });
    } catch (error) {
        res.status(500).json({ error: 'B³¹d serwera' });
    }
};

exports.getCurrentUser = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-password');
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'B³¹d serwera' });
    }
};

exports.refreshToken = async (req, res) => {
    try {
        // Pobierz token z nag³ówka Authorization
        const authHeader = req.headers.authorization;
        
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Brak tokenu autoryzacyjnego' });
        }

        const token = authHeader.split(' ')[1];

        try {
            // Zweryfikuj token (mo¿e byæ wygas³y, ale wci¹¿ wa¿ny strukturalnie)
            const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
            
            // SprawdŸ czy u¿ytkownik nadal istnieje
            const user = await User.findById(decoded.userId);
            if (!user) {
                return res.status(401).json({ error: 'U¿ytkownik nie istnieje' });
            }

            // SprawdŸ czy token nie jest zbyt stary (np. maksymalnie 7 dni od wydania)
            const tokenAge = Date.now() - (decoded.iat * 1000);
            const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 dni w milisekundach
            
            if (tokenAge > maxAge) {
                return res.status(401).json({ error: 'Token jest zbyt stary do odnovenia' });
            }

            // Wygeneruj nowy token
            const newToken = jwt.sign(
                { userId: user._id },
                process.env.JWT_SECRET,
                { expiresIn: '4h' }
            );

            res.json({ token: newToken });
        } catch (jwtError) {
            // Jeœli token jest nieprawid³owy strukturalnie
            return res.status(401).json({ error: 'Nieprawid³owy token' });
        }
    } catch (error) {
        res.status(500).json({ error: 'B³¹d serwera' });
    }
};