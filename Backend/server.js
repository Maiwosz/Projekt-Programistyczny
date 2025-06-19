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

// Import HTTPLogger
const HTTPLogger = require('./middleware/Logger');

// Import Google Drive Service
const GoogleDriveSyncService = require('./services/GoogleDriveSyncService');
const GoogleDriveSchedulerService = require('./services/GoogleDriveSchedulerService');

// Czyszczenie pliku http.log na początku
function clearHttpLog() {
    const httpLogPath = './http.log';
    try {
        if (fs.existsSync(httpLogPath)) {
            fs.writeFileSync(httpLogPath, '');
            console.log('✓ Plik http.log został wyczyszczony');
        }
    } catch (error) {
        console.warn('⚠ Nie można wyczyścić pliku http.log:', error.message);
    }
}

// Czyszczenie logu na początku
clearHttpLog();

// Inicjalizacja aplikacji Express
const app = express();

// Konfiguracja loggera HTTP
const httpLogger = new HTTPLogger({
    enabled: true, // Wyłącz w testach
    logToFile: true, // Kontrola przez zmienną środowiskową
    logFilePath: './http.log',
    maxBodySize: parseInt(process.env.HTTP_LOG_MAX_BODY_SIZE) || 1000,
    excludePaths: [],
    sensitiveHeaders: []
});

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
        
        googleDriveScheduler = new GoogleDriveSchedulerService(GoogleDriveSyncService);
		global.googleDriveScheduler = googleDriveScheduler;
        
        if (!googleDriveScheduler) {
            throw new Error('Nie można utworzyć GoogleDriveSchedulerService');
        }
        
        const initResult = await googleDriveScheduler.initializeAutoSync();
        
        console.log(`✓ Google Drive Service zainicjalizowany - aktywnych synchronizacji: ${initResult.initialized}`);
        
        if (initResult.errors > 0) {
            console.warn(`⚠ Błędy inicjalizacji: ${initResult.errors} z ${initResult.total}`);
        }
        
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
        
        return { initialized: 0, errors: 1, error: error.message };
    }
}

// Middleware
app.use(express.json({ 
    limit: '10mb'
}));
app.use(cors());

// DODANIE MIDDLEWARE LOGGERA - WAŻNE: Przed innymi middleware
app.use(httpLogger.middleware());

// Podstawowe logowanie (może zostać usunięte po wdrożeniu HTTPLogger)
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

// Middleware do ustawiania JSON dla API endpoints
app.use('/api', (req, res, next) => {
    res.setHeader('Content-Type', 'application/json');
    next();
});

// Endpoint do kontroli loggera
app.get('/api/logger/status', (req, res) => {
    res.json({
        enabled: httpLogger.enabled,
        logToFile: httpLogger.logToFile,
        logFilePath: httpLogger.logFilePath,
        maxBodySize: httpLogger.maxBodySize,
        excludePaths: httpLogger.excludePaths
    });
});

// Endpoint do przełączania loggera
app.post('/api/logger/toggle', (req, res) => {
    httpLogger.enabled = !httpLogger.enabled;
    res.json({
        message: `Logger ${httpLogger.enabled ? 'włączony' : 'wyłączony'}`,
        enabled: httpLogger.enabled
    });
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
    { path: '/api/filter', file: './routes/fileFilterRoutes' },

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

    // 🔧 Add this block for shared links:
    app.get('/shared/*', (req, res) => {
        const indexPath = path.join(frontendPath, 'index.html');
        if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
        } else {
            res.status(404).send('Shared view not available');
        }
    });

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
}
// Konfiguracja portów
const HTTP_PORT = process.env.HTTP_PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

async function startServer() {
    try {
        await initializeDatabase();
        
        const driveServiceResult = await initializeGoogleDriveService();
        
        if (driveServiceResult.error) {
            console.warn('⚠ Aplikacja uruchomiona bez Google Drive Service');
        }

        const gracefulShutdown = async (signal) => {
            console.log(`\n[SHUTDOWN] Otrzymano ${signal}, graceful shutdown...`);
            
            const shutdownTimeout = setTimeout(() => {
                console.error('[SHUTDOWN] Timeout - wymuszam zamknięcie');
                process.exit(1);
            }, 10000);
            
            try {
                if (googleDriveScheduler) {
                    console.log('[SHUTDOWN] Zatrzymywanie Google Drive Service...');
                    await googleDriveScheduler.shutdown();
                    console.log('✓ Google Drive Service zatrzymany');
                }
                
                // Logowanie informacji o graceful shutdown
                httpLogger.log('🔴 APPLICATION SHUTDOWN', { 
                    signal, 
                    timestamp: new Date().toISOString() 
                });
                
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
            
            // Logowanie uruchomienia aplikacji
            httpLogger.log('🟢 APPLICATION STARTED', {
                port: HTTPS_PORT,
                environment: process.env.NODE_ENV || 'development',
                loggerEnabled: httpLogger.enabled,
                logToFile: httpLogger.logToFile,
                timestamp: new Date().toISOString()
            });
            
            if (googleDriveScheduler) {
                const activeCount = googleDriveScheduler.getActiveSyncCount();
                console.log(`✓ Google Drive - aktywnych synchronizacji: ${activeCount}`);
                console.log(`✓ Health check: https://localhost:${HTTPS_PORT}/api/sync/health`);
            }
            
            console.log(`✓ Logger status: https://localhost:${HTTPS_PORT}/api/logger/status`);
        });

    } catch (error) {
        console.error('✗ Błąd uruchamiania serwera:', error);
        
        // Logowanie błędu uruchomienia
        if (httpLogger) {
            httpLogger.log('🔴 SERVER STARTUP ERROR', {
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
        }
        
        process.exit(1);
    }
}

// Uruchomienie serwera
startServer().catch(error => {
    console.error('✗ Krytyczny błąd aplikacji:', error);
    process.exit(1);
});

