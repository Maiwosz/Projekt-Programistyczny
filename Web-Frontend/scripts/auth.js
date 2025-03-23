// auth.js
// Obsługa stanu logowania po załadowaniu strony
document.addEventListener('DOMContentLoaded', () => {
  // Sprawdź czy w pamięci przeglądarki jest token
  const token = localStorage.getItem('token');
  if (token) {
    // Pokaż elementy dla zalogowanych
    document.querySelectorAll('.logged-in').forEach(el => el.style.display = 'block');
    // Ukryj elementy dla niezalogowanych
    document.querySelectorAll('.logged-out').forEach(el => el.style.display = 'none');
    
    // Próbuj odczytać dane z tokena JWT
    try {
      // Token JWT składa się z 3 części oddzielonych kropkami
      const payload = JSON.parse(atob(token.split('.')[1])); // Dekoduj część z danymi
      document.getElementById('username').textContent = payload.username;
    } catch (error) {
      // W przypadku błędu (np. nieprawidłowy token) - wyloguj
      console.error('Błąd dekodowania tokena:', error);
      logout();
    }
  }
});

// Funkcja wylogowania
function logout() {
  // Usuń token z pamięci
  localStorage.removeItem('token');
  // Przekieruj na stronę główną
  window.location.href = '/';
}

// Globalna obsługa WSZYSTKICH formularzy na stronie
document.addEventListener('submit', async (e) => {
  if (e.target.matches('form')) {
    e.preventDefault(); // Blokuj domyślne wysłanie formularza
    
    // Zbierz dane z formularza
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    try {
      // Wyślij zapytanie do odpowiedniego endpointu API
      const response = await fetch(`/api${e.target.getAttribute('action')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (response.ok) {
        // Jeśli to logowanie - zapisz token
        if (e.target.id === 'loginForm') {
          const { token } = await response.json();
          localStorage.setItem('token', token);
        }
        // Przekieruj na stronę główną
        window.location.href = '/';
      } else {
        // Pokaż błąd z serwera
        alert(await response.text());
      }
    } catch (error) {
      console.error('Błąd:', error);
      alert('Błąd połączenia z serwerem');
    }
  }
});