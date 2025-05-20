require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const connectDB = require('./config/db');

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
app.use('/api/config', require('./routes/configRoutes')); // Nowy endpoint konfiguracyjny


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



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serwer działa na porcie ${PORT}`));