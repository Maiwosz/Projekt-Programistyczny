using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace DesktopClient.Services {
    public class SessionManager {
        private const string SESSION_FILE = "session.dat";
        private const string SETTINGS_FILE = "user_settings.dat";
        private readonly string _sessionFilePath;
        private readonly string _settingsFilePath;

        public SessionManager() {
            var appDataPath = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            var appDirectory = Path.Combine(appDataPath, "FileManager");
            Directory.CreateDirectory(appDirectory);
            _sessionFilePath = Path.Combine(appDirectory, SESSION_FILE);
            _settingsFilePath = Path.Combine(appDirectory, SETTINGS_FILE);
        }

        public void SaveSession(string username, string token, string clientId) {
            try {
                var sessionData = new SessionData {
                    Username = username,
                    Token = token,
                    ClientId = clientId,
                    SavedAt = DateTime.UtcNow
                };

                var json = JsonSerializer.Serialize(sessionData);
                var encryptedData = ProtectData(json);
                File.WriteAllBytes(_sessionFilePath, encryptedData);
            } catch (Exception ex) {
                System.Diagnostics.Debug.WriteLine($"Błąd zapisu sesji: {ex.Message}");
            }
        }

        // Nowa metoda do aktualizacji tylko tokenu
        public void UpdateToken(string newToken) {
            try {
                var existingSession = LoadSession();
                if (existingSession != null) {
                    existingSession.Token = newToken;
                    existingSession.SavedAt = DateTime.UtcNow; // Aktualizuj datę zapisu

                    var json = JsonSerializer.Serialize(existingSession);
                    var encryptedData = ProtectData(json);
                    File.WriteAllBytes(_sessionFilePath, encryptedData);

                    System.Diagnostics.Debug.WriteLine("Token został zaktualizowany w sesji");
                }
            } catch (Exception ex) {
                System.Diagnostics.Debug.WriteLine($"Błąd aktualizacji tokenu: {ex.Message}");
            }
        }

        public SessionData LoadSession() {
            try {
                if (!File.Exists(_sessionFilePath))
                    return null;

                var encryptedData = File.ReadAllBytes(_sessionFilePath);
                var json = UnprotectData(encryptedData);
                var sessionData = JsonSerializer.Deserialize<SessionData>(json);

                // Sprawdź czy sesja nie jest zbyt stara (np. 30 dni)
                if (sessionData != null &&
                    DateTime.UtcNow.Subtract(sessionData.SavedAt).TotalDays > 30) {
                    ClearSession();
                    return null;
                }

                return sessionData;
            } catch (Exception ex) {
                System.Diagnostics.Debug.WriteLine($"Błąd odczytu sesji: {ex.Message}");
                // Jeśli nie można odczytać sesji, usuń plik
                ClearSession();
                return null;
            }
        }

        // Nowa metoda do sprawdzenia czy token może być bliski wygaśnięciu
        public bool IsTokenNearExpiry(int hoursBeforeExpiry = 1) {
            try {
                var session = LoadSession();
                if (session?.Token == null) return false;

                // Parsuj token JWT aby sprawdzić datę wygaśnięcia
                var tokenParts = session.Token.Split('.');
                if (tokenParts.Length != 3) return false;

                // Dekoduj payload (środkową część tokenu)
                var payload = tokenParts[1];
                // Dodaj padding jeśli potrzebny
                while (payload.Length % 4 != 0) {
                    payload += "=";
                }

                var payloadBytes = Convert.FromBase64String(payload);
                var payloadJson = Encoding.UTF8.GetString(payloadBytes);
                var payloadData = JsonSerializer.Deserialize<Dictionary<string, object>>(payloadJson);

                if (payloadData.ContainsKey("exp")) {
                    var expTimestamp = Convert.ToInt64(payloadData["exp"].ToString());
                    var expDate = DateTimeOffset.FromUnixTimeSeconds(expTimestamp).DateTime;
                    var timeUntilExpiry = expDate - DateTime.UtcNow;

                    return timeUntilExpiry.TotalHours <= hoursBeforeExpiry;
                }

                return false;
            } catch (Exception ex) {
                System.Diagnostics.Debug.WriteLine($"Błąd sprawdzania wygaśnięcia tokenu: {ex.Message}");
                return false;
            }
        }

        public void ClearSession() {
            try {
                if (File.Exists(_sessionFilePath)) {
                    File.Delete(_sessionFilePath);
                }
            } catch (Exception ex) {
                System.Diagnostics.Debug.WriteLine($"Błąd usuwania sesji: {ex.Message}");
            }
        }

        // Nowe metody dla ustawień użytkownika
        public void SaveUserSettings(string username, UserSettings settings) {
            try {
                var allSettings = LoadAllUserSettings();
                allSettings[username] = settings;

                var json = JsonSerializer.Serialize(allSettings);
                var encryptedData = ProtectData(json);
                File.WriteAllBytes(_settingsFilePath, encryptedData);
            } catch (Exception ex) {
                System.Diagnostics.Debug.WriteLine($"Błąd zapisu ustawień: {ex.Message}");
            }
        }

        public UserSettings LoadUserSettings(string username) {
            try {
                var allSettings = LoadAllUserSettings();
                return allSettings.ContainsKey(username) ? allSettings[username] : new UserSettings();
            } catch (Exception ex) {
                System.Diagnostics.Debug.WriteLine($"Błąd odczytu ustawień: {ex.Message}");
                return new UserSettings();
            }
        }

        private Dictionary<string, UserSettings> LoadAllUserSettings() {
            try {
                if (!File.Exists(_settingsFilePath))
                    return new Dictionary<string, UserSettings>();

                var encryptedData = File.ReadAllBytes(_settingsFilePath);
                var json = UnprotectData(encryptedData);
                return JsonSerializer.Deserialize<Dictionary<string, UserSettings>>(json) ?? new Dictionary<string, UserSettings>();
            } catch {
                return new Dictionary<string, UserSettings>();
            }
        }

        private byte[] ProtectData(string data) {
            var dataBytes = Encoding.UTF8.GetBytes(data);
            return ProtectedData.Protect(dataBytes, null, DataProtectionScope.CurrentUser);
        }

        private string UnprotectData(byte[] encryptedData) {
            var dataBytes = ProtectedData.Unprotect(encryptedData, null, DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(dataBytes);
        }
    }

    public class SessionData {
        public string Username { get; set; }
        public string Token { get; set; }
        public string ClientId { get; set; }
        public DateTime SavedAt { get; set; }
    }

    public class UserSettings {
        public int SyncIntervalMinutes { get; set; } = 5; // Domyślnie 5 minut
        public DateTime LastModified { get; set; } = DateTime.UtcNow;
    }
}