const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');

// Inicjalizacja klienta Google OAuth
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.googleAuth = async (req, res) => {
    try {
        const { token } = req.body;
        
        // Weryfikacja tokena Google
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID
        });
        
        const payload = ticket.getPayload();
        const { email, name, picture, sub: googleId } = payload;
        
        // Sprawdź, czy użytkownik już istnieje
        let user = await User.findOne({ email });
        
        if (!user) {
            // Utwórz nowego użytkownika, jeśli nie istnieje
            // Generujemy unikalną nazwę użytkownika na podstawie części adresu email
            const username = email.split('@')[0] + '_' + Math.floor(Math.random() * 1000);
            
            user = new User({
                username,
                email,
                password: Math.random().toString(36).slice(-10), // Losowe hasło (nie będzie używane)
                googleId,
                profilePictureUrl: picture // Dodajemy URL zdjęcia profilowego z Google
            });
            
            await user.save();
        } else if (!user.googleId) {
            // Jeśli użytkownik istnieje, ale nie ma przypisanego googleId, aktualizujemy
            user.googleId = googleId;
            if (picture) user.profilePictureUrl = picture;
            await user.save();
        }
        
        // Generowanie JWT, tak jak w zwykłym logowaniu
        const authToken = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
        
        res.json({ token: authToken });
    } catch (error) {
        console.error('Google authentication error:', error);
        res.status(401).json({ error: 'Błąd autoryzacji Google' });
    }
};