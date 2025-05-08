// Kontroler dostarczający konfigurację dla klienta
exports.getClientConfig = (req, res) => {
    // Zwracamy tylko publiczne klucze i konfiguracje, które są bezpieczne do udostępnienia
    res.json({
        googleClientId: process.env.GOOGLE_CLIENT_ID
        // Tutaj możesz dodać inne publiczne konfiguracje
    });
};