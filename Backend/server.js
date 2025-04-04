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
app.use('/api/photos', require('./routes/photoUploadRoutes'));

// Obsługa plików statycznych
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

// Serwowanie frontendu
const frontendPath = path.join(__dirname, '../Web-Frontend');
app.use(express.static(frontendPath));
app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serwer działa na porcie ${PORT}`));