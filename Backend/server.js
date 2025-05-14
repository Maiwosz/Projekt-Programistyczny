const fs = require('fs');
const path = require('path');

const crashLogPath = path.join(__dirname, 'node_crash.log');

process.on('uncaughtException', (err) => {
  fs.appendFileSync(crashLogPath, `Uncaught Exception: ${err.stack || err}\n`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  fs.appendFileSync(crashLogPath, `Unhandled Rejection: ${reason.stack || reason}\n`);
  process.exit(1);
});



require('dotenv').config();
const express = require('express');

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
app.use('/api/files', require('./routes/fileRoutes'));
app.use('/api/folders', require('./routes/folderRoutes'));
app.use('/api/user', require('./routes/userRoutes'));
app.use('/api/tags', require('./routes/tagRoutes'));

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