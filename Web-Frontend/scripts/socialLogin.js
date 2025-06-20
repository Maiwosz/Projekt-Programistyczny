// Globalne obiekty konfiguracyjne
let socialLoginConfig = {
    googleClientId: null,
    facebookAppId: null
};

// Inicjalizacja logowania społecznościowego
async function initSocialLogins() {
    try {
        // Pobierz konfigurację z API
        const response = await fetch('/api/config/client-config');
        const config = await response.json();
        
        // Zapisz konfigurację globalnie
        socialLoginConfig = {
            googleClientId: config.googleClientId,
            facebookAppId: config.facebookAppId
        };
        
        // Inicjalizuj oba systemy logowania
        initGoogleSignIn();
        initFacebookSDK();
    } catch (error) {
        console.error('Błąd podczas pobierania konfiguracji:', error);
        showSocialLoginError('google');
        showSocialLoginError('facebook');
    }
}

// Funkcja pomocnicza do wyświetlania błędów
function showSocialLoginError(provider) {
    const containerId = provider === 'google' ? 'google-signin-container' : 'facebook-login-container';
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `<p>Logowanie przez ${provider === 'google' ? 'Google' : 'Facebook'} jest obecnie niedostępne.</p>`;
    }
}

// ========== GOOGLE SIGN-IN ==========
function initGoogleSignIn() {
    const googleClientId = socialLoginConfig.googleClientId;
    if (!googleClientId) {
        console.error('Brak Google Client ID w konfiguracji');
        showSocialLoginError('google');
        return;
    }
    
    const googleSignInContainer = document.getElementById('google-signin-container');
    if (!googleSignInContainer) return;
    
    googleSignInContainer.innerHTML = '';

    const customDivOnload = document.createElement('div');
    customDivOnload.id = 'g_id_onload';
    customDivOnload.setAttribute('data-client_id', googleClientId);
    customDivOnload.setAttribute('data-callback', 'handleGoogleSignIn');
    customDivOnload.setAttribute('data-auto_prompt', 'false');

    const customDivSignin = document.createElement('div');
    customDivSignin.id = 'g_id_signin';
    customDivSignin.setAttribute('class', 'g_id_signin');
    customDivSignin.setAttribute('data-type', 'standard');
    customDivSignin.setAttribute('data-size', 'large');
    customDivSignin.setAttribute('data-theme', 'outline');
    customDivSignin.setAttribute('data-text', 'sign_in_with');
    customDivSignin.setAttribute('data-shape', 'rectangular');
    customDivSignin.setAttribute('data-logo_alignment', 'center');

    googleSignInContainer.appendChild(customDivOnload);
    googleSignInContainer.appendChild(customDivSignin);
       
    
    // Renderowanie przycisku Google
    if (window.google && window.google.accounts && window.google.accounts.id) {
        renderGoogleButton(googleClientId);
    } else {
        // Jeśli API Google nie jest jeszcze dostępne, dodaj nasłuchiwacz
        window.addEventListener('load', function() {
            setTimeout(() => {
                renderGoogleButton(googleClientId);
            }, 500); // Dodajemy małe opóźnienie dla pewności
        });
    }
}

function renderGoogleButton(googleClientId) {
    if (window.google && window.google.accounts && window.google.accounts.id) {
        window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: handleGoogleSignIn
        });
        const gIdSignin = document.getElementById('g_id_signin');
        if (gIdSignin) {
            window.google.accounts.id.renderButton(
                gIdSignin, 
                {
                    theme: 'outline',
                    size: 'large',
                    text: 'sign_in_with',
                    shape: 'rectangular',
                    logo_alignment: 'center'
                }
            );
        }
    } else {
        console.error('Google API nie zostało poprawnie załadowane');
    }
}

// Obsługa odpowiedzi z Google Sign-In
function handleGoogleSignIn(response) {
    try {
        console.log("Google Sign-In zakończony pomyślnie", response);
        
        if (!response || !response.credential) {
            console.error("Brak poświadczenia w odpowiedzi Google:", response);
            alert("Nieprawidłowa odpowiedź z Google. Brak poświadczenia.");
            return;
        }
        
        const credential = response.credential;
        console.log("Poświadczenie Google otrzymane:", credential.substring(0, 20) + "...");
        
        // Wysyłamy token ID do API
        handleSocialAuth('/api/auth/google', { token: credential });
    } catch (error) {
        console.error('Google Sign-In error:', error);
        alert('Problem z logowaniem przez Google: ' + error.message);
    }
}

// ========== FACEBOOK LOGIN ==========
function initFacebookSDK() {
    const facebookAppId = socialLoginConfig.facebookAppId;
    if (!facebookAppId) {
        console.error('Brak Facebook App ID w konfiguracji');
        showSocialLoginError('facebook');
        return;
    }

    // Sprawdź, czy SDK Facebooka jest już dostępne
    if (window.FB) {
        // Inicjalizuj ponownie z aktualnym App ID
        FB.init({
            appId: facebookAppId,
            cookie: true,
            xfbml: false,
            version: 'v22.0'
        });
        console.log("Facebook SDK zostało ponownie zainicjalizowane");
        renderFacebookButton();
    } else {
        // SDK nie jest załadowane, użyj fbAsyncInit
        window.fbAsyncInit = function() {
            FB.init({
                appId: facebookAppId,
                cookie: true,
                xfbml: false,
                version: 'v22.0'
            });
            console.log("Facebook SDK zainicjalizowane");
            renderFacebookButton();
        };

        // Dodatkowe sprawdzenie po krótkim opóźnieniu
        setTimeout(() => {
            if (window.FB) {
                FB.init({
                    appId: facebookAppId,
                    cookie: true,
                    xfbml: false,
                    version: 'v22.0'
                });
                renderFacebookButton();
            }
        }, 500);
    }
}

function renderFacebookButton() {
    const facebookLoginContainer = document.getElementById('facebook-login-container');
    if (!facebookLoginContainer) return;

    // Wyczyść kontener przed dodaniem przycisku
    facebookLoginContainer.innerHTML = '';

    // Utwórz przycisk z Twoimi stylami
    const customButton = document.createElement('button');
    customButton.className = 'fb-login-button';
    customButton.innerHTML = 'Zaloguj się przez Facebook';
    
    customButton.addEventListener('click', function(event) {
        event.preventDefault();
        loginWithFacebook();
    });

    facebookLoginContainer.appendChild(customButton);
}

// Funkcja do logowania przez Facebook
function loginWithFacebook() {
    console.log("Próba logowania przez Facebook");
    
    if (!window.FB) {
        console.error('Facebook SDK nie zostało poprawnie załadowane');
        alert('Problem z logowaniem przez Facebook: Facebook SDK nie jest dostępne');
        return;
    }
    
    console.log("Wywołanie FB.login");
    
    FB.login(function(response) {
        console.log("Odpowiedź FB.login:", response);
        
        if (response.authResponse) {
            console.log('Facebook login successful', response.authResponse);
            handleFacebookLogin(response.authResponse.accessToken);
        } else {
            console.log('Facebook login cancelled or failed');
        }
    }, {scope: 'email,public_profile'});
}

// Obsługa odpowiedzi z Facebook Login
function handleFacebookLogin(accessToken) {
    try {
        console.log("Facebook Login zakończony pomyślnie, otrzymano token dostępu");
        
        if (!accessToken) {
            console.error("Brak tokenu dostępu z Facebook");
            alert("Nieprawidłowa odpowiedź z Facebook. Brak tokenu dostępu.");
            return;
        }
        
        // Wysyłamy token dostępu do API
        handleSocialAuth('/api/auth/facebook', { accessToken });
    } catch (error) {
        console.error('Facebook Login error:', error);
        alert('Problem z logowaniem przez Facebook: ' + error.message);
    }
}

// ========== WSPÓLNA OBSŁUGA AUTORYZACJI ==========
function handleSocialAuth(endpoint, payload) {
    fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    })
    .then(response => {
        console.log(`Status odpowiedzi API ${endpoint}:`, response.status);
        if (!response.ok) {
            return response.json().then(errorData => {
                throw new Error(errorData.error || `Problem z autoryzacją`);
            });
        }
        return response.json();
    })
    .then(data => {
        console.log("Logowanie zakończone sukcesem:", data);
        localStorage.setItem('token', data.token);
        window.location.href = '/index.html';
    })
    .catch(error => {
        console.error('Social login error:', error);
        alert(`Problem z logowaniem: ${error.message}`);
    });
}

// Funkcja sprawdzająca status Google API i Facebook SDK (pomocnicza)
function checkApiStatus() {
    console.log("=== Sprawdzanie statusu API ===");
    // Google API
    console.log("Google API:");
    console.log("window.google istnieje:", !!window.google);
    if (window.google) {
        console.log("window.google.accounts istnieje:", !!window.google.accounts);
        if (window.google.accounts) {
            console.log("window.google.accounts.id istnieje:", !!window.google.accounts.id);
        }
    }
    
    // Facebook SDK
    console.log("Facebook SDK:");
    console.log("window.FB istnieje:", !!window.FB);
    if (window.FB) {
        console.log("FB.login istnieje:", typeof FB.login === 'function');
    }
    console.log("=== Koniec sprawdzania statusu API ===");
}

// Inicjalizacja po załadowaniu strony
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM załadowany - inicjuję social loginy");
    
    // Inicjalizuj social loginy
    initSocialLogins();
    
    // Sprawdź ponownie po pełnym załadowaniu strony
    window.addEventListener('load', function() {
        console.log("Strona w pełni załadowana");
        
        // Sprawdź status API
        checkApiStatus();
        
        setTimeout(() => {
            console.log("Sprawdzanie ponownie po 1 sekundzie:");
            checkApiStatus();
            
            // Ponowne renderowanie przycisków gdy nie zostały poprawnie zainicjalizowane
            if (document.getElementById('g_id_signin') && 
                document.getElementById('g_id_signin').children.length === 0) {
                console.log("Ponowna próba inicjalizacji przycisku Google");
                initGoogleSignIn();
            }
            
            if (document.getElementById('facebook-login-container') && 
                !document.querySelector('.facebook-login-button')) {
                console.log("Ponowna próba inicjalizacji przycisku Facebook");
                renderFacebookButton();
            }
        }, 1000);
        
        // Jeszcze jedna próba po dłuższym czasie
        setTimeout(() => {
            console.log("Ostateczna próba inicjalizacji po 3 sekundach:");
            checkApiStatus();
            
            // Sprawdź czy jest przycisk Facebook
            const fbButton = document.getElementById('fb-login-button');
            if (!fbButton && document.getElementById('facebook-login-container')) {
                console.log("Ostatnia próba renderowania przycisku Facebook");
                renderFacebookButton();
            }
        }, 3000);
    });
});

window.addEventListener('popstate', () => {
    if (window.location.pathname === '/login.html') {
        initSocialLogins();
    }
});