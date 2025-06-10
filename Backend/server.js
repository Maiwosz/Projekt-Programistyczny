const fs = require('fs');
const path = require('path');

const crashLogPath = path.join(__dirname, 'node_crash.log');

process.on('uncaughtException', (error) => {
    const errorMessage = `[${new Date().toISOString()}] Uncaught Exception: ${error.stack || error}\n`;
    console.error(errorMessage);
    
    try {
        fs.appendFileSync(crashLogPath, errorMessage);
    } catch (writeError) {
        console.error('Nie można zapisać do pliku crash log:', writeError);
    }
    
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    const errorMessage = `[${new Date().toISOString()}] Unhandled Rejection at: ${promise}, reason: ${reason?.stack || reason}\n`;
    console.error(errorMessage);
    
    try {
        fs.appendFileSync(crashLogPath, errorMessage);
    } catch (writeError) {
        console.error('Nie można zapisać do pliku crash log:', writeError);
    }
    
    process.exit(1);
});

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const https = require('https');
const http = require('http');

// Import Google Drive Service
const GoogleDriveSyncService = require('./services/GoogleDriveSyncService');
const GoogleDriveSchedulerService = require('./services/GoogleDriveSchedulerService');

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

// Inicjalizacja Google Drive Service
let googleDriveScheduler;

async function initializeGoogleDriveService() {
    try {
        console.log('[STARTUP] Inicjalizacja Google Drive Service...');
        
        // POPRAWKA: Przekaż instancję GoogleDriveSyncService, nie klasę
        googleDriveScheduler = new GoogleDriveSchedulerService(GoogleDriveSyncService);
        
        // Sprawdź czy scheduler został utworzony
        if (!googleDriveScheduler) {
            throw new Error('Nie można utworzyć GoogleDriveSchedulerService');
        }
        
        // Inicjalizuj automatyczną synchronizację
        const initResult = await googleDriveScheduler.initializeAutoSync();
        
        console.log(`✓ Google Drive Service zainicjalizowany - aktywnych synchronizacji: ${initResult.initialized}`);
        
        if (initResult.errors > 0) {
            console.warn(`⚠ Błędy inicjalizacji: ${initResult.errors} z ${initResult.total}`);
        }
        
        // POPRAWKA: Dodaj endpoint do monitorowania zdrowia
        app.get('/api/sync/health', async (req, res) => {
            try {
                const health = await googleDriveScheduler.healthCheck();
                res.json(health);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        return initResult;
        
    } catch (error) {
        console.error('✗ Błąd inicjalizacji Google Drive Service:', error);
        console.error('Stack trace:', error.stack);
        
        // POPRAWKA: Nie przerywaj działania aplikacji, ale zaloguj błąd
        // Aplikacja może działać bez Google Drive
        return { initialized: 0, errors: 1, error: error.message };
    }
}


// Middleware
app.use(express.json({ 
    limit: '10mb' // Zwiększ z domyślnego 1mb do 10mb
}));
app.use(cors());
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

// Middleware do ustawiania JSON dla API endpoints
app.use('/api', (req, res, next) => {
    // Ustaw domyślny Content-Type na JSON dla wszystkich odpowiedzi API
    res.setHeader('Content-Type', 'application/json');
    next();
});

// Sprawdzanie istnienia plików routów przed ich załadowaniem
const routes = [
    { path: '/api/auth', file: './routes/authRoutes' },
    { path: '/api/auth', file: './routes/googleAuthRoutes' },
    { path: '/api/auth', file: './routes/facebookAuthRoutes' },
    { path: '/api/files', file: './routes/fileRoutes' },
    { path: '/api/folders', file: './routes/folderRoutes' },
    { path: '/api/user', file: './routes/userRoutes' },
    { path: '/api/config', file: './routes/configRoutes' },
    { path: '/api/sync', file: './routes/syncRoutes' },
    { path: '/api/google-drive', file: './routes/googleDriveRoutes' },
    { path: '/api/tags', file: './routes/tagRoutes' },
    { path: '/api/filter', file: './routes/fileFilterRoutes' }
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
        
        // POPRAWKA: Inicjalizacja Google Drive Service z lepszą obsługą błędów
        const driveServiceResult = await initializeGoogleDriveService();
        
        if (driveServiceResult.error) {
            console.warn('⚠ Aplikacja uruchomiona bez Google Drive Service');
        }

        // POPRAWKA: Graceful shutdown z timeout
        const gracefulShutdown = async (signal) => {
            console.log(`\n[SHUTDOWN] Otrzymano ${signal}, graceful shutdown...`);
            
            const shutdownTimeout = setTimeout(() => {
                console.error('[SHUTDOWN] Timeout - wymuszam zamknięcie');
                process.exit(1);
            }, 10000); // 10 sekund timeout
            
            try {
                if (googleDriveScheduler) {
                    console.log('[SHUTDOWN] Zatrzymywanie Google Drive Service...');
                    await googleDriveScheduler.shutdown();
                    console.log('✓ Google Drive Service zatrzymany');
                }
                
                clearTimeout(shutdownTimeout);
                console.log('✓ Graceful shutdown zakończony');
                process.exit(0);
                
            } catch (error) {
                console.error('✗ Błąd podczas graceful shutdown:', error);
                clearTimeout(shutdownTimeout);
                process.exit(1);
            }
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));

        // Uruchomienie serwerów HTTP/HTTPS...
        // (reszta kodu uruchamiania serwerów pozostaje bez zmian)
        
        const HTTP_PORT = process.env.HTTP_PORT || 3000;
        const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
        
        // HTTP redirect do HTTPS
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
            console.error('✗ Certyfikaty SSL nie istnieją');
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
            
            // POPRAWKA: Wyświetl status Google Drive Service
            if (googleDriveScheduler) {
                const activeCount = googleDriveScheduler.getActiveSyncCount();
                console.log(`✓ Google Drive - aktywnych synchronizacji: ${activeCount}`);
                console.log(`✓ Health check: https://localhost:${HTTPS_PORT}/api/sync/health`);
            }
        });

    } catch (error) {
        console.error('✗ Błąd uruchamiania serwera:', error);
        process.exit(1);
    }
}

// Uruchomienie serwera
startServer().catch(error => {
    console.error('✗ Krytyczny błąd aplikacji:', error);
    process.exit(1);
});