exports.getClientConfig = (req, res) => {
    try {
        // Udostępniamy tylko niezbędne ID klientów dla API społecznościowych
        const clientConfig = {
            googleClientId: process.env.GOOGLE_CLIENT_ID,
            facebookAppId: process.env.FACEBOOK_APP_ID
        };
        
        res.json(clientConfig);
    } catch (error) {
        console.error('Błąd podczas pobierania konfiguracji klienta:', error);
        res.status(500).json({ error: 'Błąd serwera podczas pobierania konfiguracji' });
    }
};