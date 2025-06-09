using System;
using System.Threading.Tasks;

namespace DesktopClient.Services {
    public class ClientManager {
        private const string CLIENT_TYPE = "desktop";

        public async Task<string> GetOrCreateClientIdAsync(string username, ApiClient apiClient) {
            try {
                // Sprawdź czy istnieje zapisane ID klienta dla tego użytkownika
                var savedClientId = GetSavedClientId(username);

                if (!string.IsNullOrEmpty(savedClientId)) {
                    // Sprawdź czy klient nadal istnieje na serwerze
                    if (await IsClientValidAsync(savedClientId, apiClient)) {
                        await apiClient.UpdateClientActivityAsync(savedClientId);
                        return savedClientId;
                    }

                    // Klient nie istnieje - usuń zapisane ID
                    RemoveSavedClientId(username);
                }

                // Zarejestruj nowego klienta
                var clientName = $"{Environment.MachineName} - {username}";
                var metadata = new {
                    machineName = Environment.MachineName,
                    userName = Environment.UserName,
                    osVersion = Environment.OSVersion.ToString()
                };

                var response = await apiClient.RegisterClientAsync(CLIENT_TYPE, clientName, metadata);

                if (response.success && response.client != null) {
                    SaveClientId(username, response.client.clientId);
                    return response.client.clientId;
                }

                throw new Exception("Nie udało się zarejestrować klienta");
            } catch (Exception ex) {
                throw new Exception($"Błąd podczas rejestracji klienta: {ex.Message}");
            }
        }

        private async Task<bool> IsClientValidAsync(string clientId, ApiClient apiClient) {
            try {
                var response = await apiClient.GetClientAsync(clientId);
                return response.success && response.client != null;
            } catch {
                return false;
            }
        }

        private string GetSavedClientId(string username) {
            try {
                var filePath = GetClientFilePath(username);
                if (System.IO.File.Exists(filePath)) {
                    return System.IO.File.ReadAllText(filePath).Trim();
                }
                return null;
            } catch {
                return null;
            }
        }

        private void SaveClientId(string username, string clientId) {
            try {
                var filePath = GetClientFilePath(username);
                var directory = System.IO.Path.GetDirectoryName(filePath);
                System.IO.Directory.CreateDirectory(directory);
                System.IO.File.WriteAllText(filePath, clientId);
            } catch {
                // Ignoruj błędy zapisu
            }
        }

        private void RemoveSavedClientId(string username) {
            try {
                var filePath = GetClientFilePath(username);
                if (System.IO.File.Exists(filePath)) {
                    System.IO.File.Delete(filePath);
                }
            } catch {
                // Ignoruj błędy usuwania
            }
        }

        private string GetClientFilePath(string username) {
            var appDataPath = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            return System.IO.Path.Combine(appDataPath, "FileManager", $"{username}.client");
        }
    }
}