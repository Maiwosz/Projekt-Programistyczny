require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const connectDB = require('./config/db');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Połączenie z bazą
connectDB();

app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

// Routy
app.use('/api', require('./routes/authRoutes'));

// Serwowanie frontendu
const frontendPath = path.join(__dirname, '../Web-Frontend');
app.use(express.static(frontendPath));
app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serwer działa na porcie ${PORT}`));