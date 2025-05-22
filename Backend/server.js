require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const connectDB = require('./config/db');
const https = require('https');
const http = require('http');
const fs = require('fs');

// Obsługa niewyłapanych błędów
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Inicjalizacja aplikacji Express
const app = express();

// Połączenie z bazą z obsługą błędów
async function initializeDatabase() {
    try {
        await connectDB();
        console.log('Połączenie z bazą danych udane');
    } catch (error) {
        console.error('Błąd połączenia z bazą danych:', error);
        process.exit(1);
    }
}

// Middleware
app.use(express.json());
app.use(cors());
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

// Sprawdzanie istnienia plików routów przed ich załadowaniem
const routes = [
    { path: '/api', file: './routes/authRoutes' },
    { path: '/api/auth', file: './routes/googleAuthRoutes' },
    { path: '/api/auth', file: './routes/facebookAuthRoutes' },
    { path: '/api/files', file: './routes/fileRoutes' },
    { path: '/api/folders', file: './routes/folderRoutes' },
    { path: '/api/user', file: './routes/userRoutes' },
    { path: '/api/config', file: './routes/configRoutes' },
    { path: '/api/sync', file: './routes/syncRoutes' }
];

routes.forEach(route => {
    try {
        if (fs.existsSync(route.file + '.js')) {
            app.use(route.path, require(route.file));
            console.log(`✓ Załadowano route: ${route.path}`);
        } else {
            console.warn(`⚠ Plik route nie istnieje: ${route.file}.js`);
        }
    } catch (error) {
        console.error(`✗ Błąd ładowania route ${route.path}:`, error.message);
    }
});

// Sprawdzanie katalogu uploads
const uploadsPath = path.resolve(process.env.UPLOADS_DIR || './uploads');
if (!fs.existsSync(uploadsPath)) {
    try {
        fs.mkdirSync(uploadsPath, { recursive: true });
        console.log(`✓ Utworzono katalog uploads: ${uploadsPath}`);
    } catch (error) {
        console.error('✗ Nie można utworzyć katalogu uploads:', error);
    }
}
app.use('/uploads', express.static(uploadsPath));

// Sprawdzanie katalogu frontend
const frontendPath = path.join(__dirname, '../Web-Frontend');
if (fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath));
    console.log(`✓ Frontend path: ${frontendPath}`);
    
    app.get('/prototype', (req, res) => {
        const prototypePath = path.join(frontendPath, 'prototype/fileManagementPrototype.html');
        if (fs.existsSync(prototypePath)) {
            res.sendFile(prototypePath);
        } else {
            res.status(404).send('Prototype file not found');
        }
    });

    app.get('*', (req, res) => {
        const indexPath = path.join(frontendPath, 'index.html');
        if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
        } else {
            res.status(404).send('Frontend not found');
        }
    });
} else {
    console.warn(`⚠ Frontend path nie istnieje: ${frontendPath}`);
}

// Konfiguracja portów
const HTTP_PORT = process.env.HTTP_PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

async function startServer() {
    try {
        // Inicjalizacja bazy danych
        await initializeDatabase();

        // Uruchomienie serwera HTTP (przekierowanie na HTTPS)
        http.createServer((req, res) => {
            res.writeHead(301, { 'Location': `https://localhost:${HTTPS_PORT}${req.url}` });
            res.end();
        }).listen(HTTP_PORT, () => {
            console.log(`✓ Serwer HTTP przekierowuje na port ${HTTPS_PORT}`);
        });

        // Sprawdzanie certyfikatów SSL
        const keyPath = './ssl/localhost+2-key.pem';
        const certPath = './ssl/localhost+2.pem';
        
        if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
            console.error('✗ Certyfikaty SSL nie istnieją:');
            console.error(`   Key: ${keyPath} - ${fs.existsSync(keyPath) ? 'OK' : 'BRAK'}`);
            console.error(`   Cert: ${certPath} - ${fs.existsSync(certPath) ? 'OK' : 'BRAK'}`);
            console.log('\nAby wygenerować certyfikaty SSL, użyj mkcert:');
            console.log('1. Zainstaluj mkcert: npm install -g mkcert');
            console.log('2. Stwórz katalog ssl: mkdir ssl');
            console.log('3. Wygeneruj certyfikaty: mkcert -key-file ssl/localhost+2-key.pem -cert-file ssl/localhost+2.pem localhost 127.0.0.1 ::1');
            
            // Uruchom tylko HTTP jeśli brak certyfikatów
            console.log(`\n⚠ Uruchamiam tylko serwer HTTP na porcie ${HTTP_PORT}`);
            return;
        }

        // Konfiguracja HTTPS
        const httpsOptions = {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath)
        };
        
        // Uruchomienie serwera HTTPS
        https.createServer(httpsOptions, app).listen(HTTPS_PORT, () => {
            console.log(`✓ Serwer HTTPS działa na porcie ${HTTPS_PORT}`);
            console.log(`✓ Aplikacja dostępna pod: https://localhost:${HTTPS_PORT}`);
        });

    } catch (error) {
        console.error('✗ Błąd uruchamiania serwera:', error);
        process.exit(1);
    }
}

// Uruchomienie serwera
startServer();