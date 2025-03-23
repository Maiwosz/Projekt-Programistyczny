// server.js
require('dotenv').config(); // Ładuj zmienne środowiskowe z .env
const express = require('express');
const mongoose = require('mongoose'); // ORM do MongoDB
const bcrypt = require('bcryptjs'); // Hashowanie haseł
const jwt = require('jsonwebtoken'); // Generowanie tokenów JWT
const path = require('path');
const cors = require('cors'); // Obsługa CORS

const app = express();
app.use(express.json()); // Parsuj body requestów jako JSON
app.use(cors()); // Zezwalaj na zapytania między domenami

// Połączenie z MongoDB wykorzystujące zmienną środowiskową
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Definicja struktury użytkownika w bazie
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true }, // Unikalna nazwa użytkownika
  password: String // Zahashowane hasło
});

// Middleware wykonujące się PRZED zapisem użytkownika
UserSchema.pre('save', async function(next) {
  if (this.isModified('password')) { // Tylko jeśli hasło się zmieniło
    this.password = await bcrypt.hash(this.password, 10); // Hashuj hasło
  }
  next();
});

const User = mongoose.model('User', UserSchema);

// Endpoint rejestracji
app.post('/api/register', async (req, res) => {
  try {
    const user = new User(req.body);
    await user.save(); // Zapisz użytkownika (automatycznie zahashuje hasło)
    res.status(201).send();
  } catch (error) {
    res.status(400).json({ error: 'Nazwa użytkownika jest już zajęta' });
  }
});

// Endpoint logowania
app.post('/api/login', async (req, res) => {
  // Szukaj użytkownika po nazwie
  const user = await User.findOne({ username: req.body.username });
  
  // Sprawdź czy użytkownik istnieje i czy hasło pasuje
  if (!user || !await bcrypt.compare(req.body.password, user.password)) {
    return res.status(401).json({ error: 'Błędne dane logowania' });
  }
  
  // Generuj token JWT ważny przez 1 godzinę
  const token = jwt.sign(
    { username: user.username }, 
    process.env.JWT_SECRET, // Sekret z zmiennych środowiskowych
    { expiresIn: '1h' }
  );
  
  res.json({ token }); // Wyślij token
});

// Serwowanie statycznych plików frontendu
const frontendPath = path.join(__dirname, '../Web-Frontend');
app.use(express.static(frontendPath));

// Fallback dla Single Page Application - przekieruj wszystkie niezdefiniowane ścieżki na index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serwer działa na porcie ${PORT}`));