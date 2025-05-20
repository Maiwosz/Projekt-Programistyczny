const User = require('../models/User');
const jwt = require('jsonwebtoken');
const axios = require('axios');

exports.facebookAuth = async (req, res) => {
    try {
        const { accessToken } = req.body;
        
        if (!accessToken) {
            return res.status(400).json({ error: 'Brak tokenu dostępu Facebook' });
        }
        
        // Weryfikacja tokenu i pobranie informacji o użytkowniku z Facebook API
        const response = await axios.get(`https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${accessToken}`);
        
        if (!response.data || !response.data.id) {
            return res.status(401).json({ error: 'Nieprawidłowy token Facebook' });
        }
        
        const { id: facebookId, name, email, picture } = response.data;
        const profilePictureUrl = picture?.data?.url;
        
        // Sprawdź, czy użytkownik już istnieje (po facebookId lub email)
        let user = await User.findOne({ $or: [{ facebookId }, { email }] });
        
        if (!user) {
            // Utwórz nowego użytkownika, jeśli nie istnieje
            const username = email ? email.split('@')[0] + '_fb_' + Math.floor(Math.random() * 1000) : 
                             'fb_user_' + Math.floor(Math.random() * 10000);
            
            user = new User({
                username,
                email: email || null, // Facebook może nie zawsze zwracać email
                password: Math.random().toString(36).slice(-10), // Losowe hasło (nie będzie używane)
                facebookId,
                profilePictureUrl: profilePictureUrl
            });
            
            await user.save();
        } else if (!user.facebookId) {
            // Jeśli użytkownik istnieje ale nie ma facebookId, aktualizujemy
            user.facebookId = facebookId;
            if (profilePictureUrl) user.profilePictureUrl = profilePictureUrl;
            await user.save();
        }
        
        // Generowanie JWT
        const authToken = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
        
        res.json({ token: authToken });
    } catch (error) {
        console.error('Facebook authentication error:', error);
        res.status(401).json({ error: 'Błąd autoryzacji Facebook' });
    }
};