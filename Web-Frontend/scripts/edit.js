document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const loadLogin = async () => {
        try {
            const response = await fetch('/api/user/login', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const loginRes = await response.json();
            const loginPlacement = document.getElementById("login");
            loginPlacement.textContent = loginRes.login;

            if(loginRes.login == null ) {
                loginPlacement.textContent = "Brak loginu";
            } else {
                loginPlacement.textContent = loginRes.login;
            }

        } catch (error) {
            console.error('Błąd pobierania loginu:', error);
        }
    };

    const loadEmail = async () => {
        try {
            const response = await fetch('/api/user/email', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const emailRes = await response.json();
            const emailPlacement = document.getElementById("email");

            if(emailRes.email == null ) {
                emailPlacement.textContent = "Brak email";
            } else {
            emailPlacement.textContent = emailRes.email;
            }

        } catch (error) {
            console.error('Błąd pobierania email:', error);
        }
    };

    
	const loadPicture = async () => {
		try {
			const response = await fetch('/api/user/profile-picture', {
				headers: { 
					'Authorization': `Bearer ${token}`,
					'Cache-Control': 'no-cache'
				}
			});
			const pictureRes = await response.json();
			const picturePlacement = document.getElementById("picture");
			
			if(pictureRes.path == null) {
				picturePlacement.src = "https://as2.ftcdn.net/v2/jpg/01/67/89/19/1000_F_167891932_sEnDfidqP5OczKJpkZso3mpbTqEFsrja.jpg";
				picturePlacement.alt = "Domyślne zdjęcie profilowe";
			} else {
				// Wymuś przeładowanie obrazu
				const timestamp = Date.now();
				const imageUrl = `/uploads/${pictureRes.path}?v=${timestamp}&_=${Math.random()}`;
				
				// Utwórz nowy obiekt Image do załadowania
				const newImage = new Image();
				newImage.onload = function() {
					picturePlacement.src = imageUrl;
					picturePlacement.alt = "Zdjęcie profilowe";
				};
				newImage.onerror = function() {
					picturePlacement.src = "https://as2.ftcdn.net/v2/jpg/01/67/89/19/1000_F_167891932_sEnDfidqP5OczKJpkZso3mpbTqEFsrja.jpg";
					picturePlacement.alt = "Błąd ładowania zdjęcia";
				};
				newImage.src = imageUrl;
			}

		} catch (error) {
			console.error('Błąd pobierania zdjecia profilowego:', error);
			const picturePlacement = document.getElementById("picture");
			picturePlacement.src = "https://as2.ftcdn.net/v2/jpg/01/67/89/19/1000_F_167891932_sEnDfidqP5OczKJpkZso3mpbTqEFsrja.jpg";
			picturePlacement.alt = "Błąd ładowania zdjęcia";
		}
	};

    await loadPicture();
    await loadLogin();
    await loadEmail();
});

function triggerFileInput() {
    // Utwórz dynamiczny input plikowy
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = false;
    input.accept = 'image/*'; // Ograniczenie do plików obrazów
    input.style.display = 'none';

    // Obsłuż zmianę wybranych plików
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        
        // Sprawdź czy plik to obraz
        if (file && file.type.startsWith('image/')) {
            upload_ProfilePic(e.target.files);
        } else {
            alert('Proszę wybrać plik obrazu (jpg, png, gif, etc.)');
        }
        
        document.body.removeChild(input); // Posprzątaj po sobie
    });

    // Symuluj kliknięcie inputu
    document.body.appendChild(input);
    input.click();
}

async function upload_ProfilePic(files) {
    if (!files.length) return;

    const picturePlacement = document.getElementById("picture");
    
    // Pokaż preview załadowanego pliku od razu
    const file = files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
        picturePlacement.src = e.target.result;
        picturePlacement.alt = "Przesyłanie zdjęcia...";
    };
    reader.readAsDataURL(file);

    // Przygotuj dane formularza
    const formData = new FormData();
    formData.append('file', file); 
    
    try {
        // Wyślij plik na serwer
        const response = await fetch('/api/user/profile-picture', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: formData
        });
        
        if (response.ok) {
            const pictureRes = await response.json();
            
            // Dodaj opóźnienie żeby serwer zdążył przetworzyć plik
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Wymuś przeładowanie obrazu z serwera z nowym timestampem
            const timestamp = Date.now();
            const newImageUrl = `/uploads/${pictureRes.path}?v=${timestamp}&_=${Math.random()}`;
            
            // Funkcja do wielokrotnych prób załadowania
            const loadWithRetry = (url, maxRetries = 3) => {
                return new Promise((resolve, reject) => {
                    let attempts = 0;
                    
                    const tryLoad = () => {
                        attempts++;
                        const img = new Image();
                        
                        img.onload = () => {
                            picturePlacement.src = url;
                            picturePlacement.alt = "Zdjęcie profilowe";
                            resolve();
                        };
                        
                        img.onerror = () => {
                            if (attempts < maxRetries) {
                                // Poczekaj chwilę i spróbuj ponownie
                                setTimeout(tryLoad, 200 * attempts);
                            } else {
                                reject();
                            }
                        };
                        
                        img.src = url;
                    };
                    
                    tryLoad();
                });
            };
            
            try {
                await loadWithRetry(newImageUrl);
            } catch {
                // Jeśli nadal nie udało się załadować, zostaw preview z FileReader
                picturePlacement.alt = "Zdjęcie profilowe";
            }
            
        } else {
            const error = await response.json();
            // Przywróć domyślne zdjęcie w przypadku błędu
            picturePlacement.src = "https://as2.ftcdn.net/v2/jpg/01/67/89/19/1000_F_167891932_sEnDfidqP5OczKJpkZso3mpbTqEFsrja.jpg";
            picturePlacement.alt = "Błąd przesyłania";
            alert(error.error || 'Nie udało się przesłać pliku');
        }
    } catch (error) {
        console.error('Błąd przesyłania:', error);
        // Przywróć domyślne zdjęcie w przypadku błędu
        picturePlacement.src = "https://as2.ftcdn.net/v2/jpg/01/67/89/19/1000_F_167891932_sEnDfidqP5OczKJpkZso3mpbTqEFsrja.jpg";
        picturePlacement.alt = "Błąd przesyłania";
        alert('Nie udało się przesłać pliku');
    }
}

function showPanel(type) {
    const panel = document.getElementById("editPanel");
    const label = document.getElementById("inputLabel");
    const input = document.getElementById("mainInput");
    const inputP = document.getElementById("passwordInput");
    const save = document.getElementById("saveButton");
    const form = document.getElementById("formEditId");
    form.onsubmit = e => {
        e.preventDefault();
		e.stopImmediatePropagation();
        console.log("fddgdh")
    };
    panel.classList.add("active");
    if (type === "email") {
        label.textContent = "Nowy e-mail:";
        input.type = "email";
        input.placeholder = "np. janusz@domena.pl";
        inputP.textContent = "Hasło:";
        save.onclick = editEmail;
    } else if (type === "login") {
        label.textContent = "Nowy login:";
        input.type = "text";
        input.placeholder = "np. janusz123";
        inputP.textContent = "Hasło:";
        save.onclick = editLogin;
    }
    else if (type === "haslo") {
        label.textContent = "Nowe hasło:";
        input.type = "password";
        inputP.textContent = "Stare hasło:"
        input.placeholder = "";
        save.onclick = editPassword;
    }
}

async function editLogin (e) {
    const token = localStorage.getItem('token');

    console.log("1")
    const input = document.getElementById("mainInput");
    try {

        const response = await fetch('/api/user/login', {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`,
                       'Content-Type': 'application/json'  },
            body: JSON.stringify({username:input.value})
        });

        if (response.ok) {
            console.log("1ok")
            const loginRes = await response.json();
            const loginPlacement = document.getElementById("login");

            if(loginRes.username == null ) {
                loginPlacement.textContent = "Brak loginu";
            } else {
                loginPlacement.textContent = loginRes.username;
            }
            closePanel();
        } else {
            const error = await response.json();
            alert(error.error || 'Nieznany błąd');
        }

    } catch (error) {
        console.error('Błąd zmiany loginu:', error);
    }
}

async function editEmail (e) {
    console.log("2")
    const token = localStorage.getItem('token');
    const input = document.getElementById("mainInput");

    try {

        const response = await fetch('/api/user/email', {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`,
                       'Content-Type': 'application/json'  },
            body: JSON.stringify({email:input.value})
        });

        if (response.ok) {
            console.log("2ok")
            const emailRes = await response.json();
            const emailPlacement = document.getElementById("email");

            if(emailRes.email == null ) {
                emailPlacement.textContent = "Brak email";
            } else {
                emailPlacement.textContent = emailRes.email;
            }
            closePanel();
        } else {
            const error = await response.json();
            alert(error.error || 'Nieznany błąd');
        }

    } catch (error) {
        console.error('Błąd zmiany email:', error);
    }
}

async function editPassword (e) {
    console.log("3")
    const token = localStorage.getItem('token');

    const input = document.getElementById("mainInput");
    const input2 = document.getElementById("password");
    try {

        const response = await fetch('/api/user/password', {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`,
                       'Content-Type': 'application/json'  },
            body: JSON.stringify({newPassword:input.value, oldPassword:input2.value})
        });

        if (response.ok) {
            console.log("1ok")
            const passwordRes = await response.json();
            alert(passwordRes);
            //const passwordPlacement = document.getElementById("password");

            closePanel();
        } else {
            const error = await response.json();
            alert(error.error || 'Nieznany błąd');
        }

    } catch (error) {
        console.error('Błąd zmiany hasła:', error);
    }
}

async function removeUser() {
    if (!confirm('Czy na pewno chcesz usunąć konto?')) return;
    const token = localStorage.getItem('token');
    try {
        await fetch(`/api/user`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
    } catch (error) {
        console.error('Błąd usuwania:', error);
        alert('Nie udało się usunąć konta');
    }
}

function closePanel() {
    document.getElementById("editPanel").classList.remove("active");
    const text1 = document.getElementById("mainInput");
    const text2 = document.getElementById("password");
    text1.value = "";
    text2.value = "";
}


function open_mainpage() {
    window.location.pathname = '/index.html';
}


