require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const connectDB = require('./config/db');
const https = require('https');
const http = require('http');
const fs = require('fs');

// Inicjalizacja aplikacji Express
const app = express();

// Połączenie z bazą
connectDB();

// Middleware
app.use(express.json());
app.use(cors());
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

// Routy
app.use('/api', require('./routes/authRoutes'));
app.use('/api/auth', require('./routes/googleAuthRoutes'));
app.use('/api/auth', require('./routes/facebookAuthRoutes'));
app.use('/api/files', require('./routes/fileRoutes'));
app.use('/api/folders', require('./routes/folderRoutes'));
app.use('/api/user', require('./routes/userRoutes'));
app.use('/api/config', require('./routes/configRoutes'));
app.use('/api/drive', require('./routes/googleDriveRoutes'));

// Obsługa plików statycznych
const uploadsPath = path.resolve(process.env.UPLOADS_DIR);
app.use('/uploads', express.static(uploadsPath));

// Serwowanie frontendu
const frontendPath = path.join(__dirname, '../Web-Frontend');
app.use(express.static(frontendPath));

app.get('/prototype', (req, res) => {
    res.sendFile(path.join(frontendPath, 'prototype/fileManagementPrototype.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// Konfiguracja portów
const HTTP_PORT = process.env.HTTP_PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

// Uruchomienie serwera HTTP
http.createServer((req, res) => {
    res.writeHead(301, { 'Location': `https://localhost:${HTTPS_PORT}${req.url}` });
    res.end();
}).listen(HTTP_PORT, () => {
    console.log(`Serwer HTTP przekierowuje na port ${HTTPS_PORT}`);
});

// Konfiguracja HTTPS
try {
    const httpsOptions = {
	  key: fs.readFileSync('./ssl/localhost+2-key.pem'),
	  cert: fs.readFileSync('./ssl/localhost+2.pem')
	};
    
    // Uruchomienie serwera HTTPS
    https.createServer(httpsOptions, app).listen(HTTPS_PORT, () => {
        console.log(`Serwer HTTPS działa na porcie ${HTTPS_PORT}`);
    });
} catch (error) {
    console.error('Nie można uruchomić serwera HTTPS:', error.message);
    console.log('Upewnij się, że certyfikaty SSL istnieją w katalogu ./ssl/');
}