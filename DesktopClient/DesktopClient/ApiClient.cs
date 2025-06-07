using DesktopClient.Models;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;

namespace DesktopClient.Services {
    public class ApiClient {
        private readonly HttpClient _httpClient;
        private readonly string _baseUrl;
        private string _authToken;

        public ApiClient() {
            _httpClient = new HttpClient();
            //_baseUrl = "http://89.200.230.226"; // Publiczny adres
            _baseUrl = "https://localhost:3443"; // Backup localhost

            _httpClient.Timeout = TimeSpan.FromSeconds(30);

            // Dodaj nagłówek Accept aby serwer wiedział, że oczekujemy JSON
            _httpClient.DefaultRequestHeaders.Accept.Clear();
            _httpClient.DefaultRequestHeaders.Accept.Add(
                new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("application/json"));
        }

        public void SetAuthToken(string token) {
            _authToken = token;
            if (!string.IsNullOrEmpty(token)) {
                _httpClient.DefaultRequestHeaders.Authorization =
                    new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
            } else {
                _httpClient.DefaultRequestHeaders.Authorization = null;
            }
        }

        public async Task<LoginResponse> LoginAsync(string username, string password) {
            try {
                var loginRequest = new LoginRequest {
                    username = username,
                    password = password
                };

                var json = JsonConvert.SerializeObject(loginRequest);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await _httpClient.PostAsync($"{_baseUrl}/api/auth/login", content);
                var responseContent = await response.Content.ReadAsStringAsync();

                // Debugowanie - sprawdź co zwraca serwer
                System.Diagnostics.Debug.WriteLine($"Status Code: {response.StatusCode}");
                System.Diagnostics.Debug.WriteLine($"Response Content: {responseContent}");

                if (response.IsSuccessStatusCode) {
                    // Sprawdź czy odpowiedź to JSON
                    if (responseContent.Trim().StartsWith("{") || responseContent.Trim().StartsWith("[")) {
                        return JsonConvert.DeserializeObject<LoginResponse>(responseContent);
                    } else {
                        throw new Exception($"Serwer zwrócił nieprawidłową odpowiedź: {responseContent}");
                    }
                } else {
                    // Dla błędów też sprawdź format odpowiedzi
                    if (responseContent.Trim().StartsWith("{") || responseContent.Trim().StartsWith("[")) {
                        try {
                            var error = JsonConvert.DeserializeObject<ErrorResponse>(responseContent);
                            throw new Exception(error?.error ?? $"Błąd serwera ({response.StatusCode}): {responseContent}");
                        } catch (JsonException) {
                            throw new Exception($"Błąd serwera ({response.StatusCode}): {responseContent}");
                        }
                    } else {
                        throw new Exception($"Błąd serwera ({response.StatusCode}): {responseContent}");
                    }
                }
            } catch (HttpRequestException ex) {
                throw new Exception($"Błąd połączenia z serwerem: {ex.Message}");
            } catch (TaskCanceledException) {
                throw new Exception("Timeout - serwer nie odpowiada");
            } catch (JsonException ex) {
                throw new Exception($"Błąd parsowania odpowiedzi serwera: {ex.Message}");
            } catch (Exception ex) when (!(ex is HttpRequestException || ex is TaskCanceledException || ex is JsonException)) {
                throw new Exception($"Błąd podczas logowania: {ex.Message}");
            }
        }

        public async Task<User> GetCurrentUserAsync() {
            try {
                var response = await _httpClient.GetAsync($"{_baseUrl}/api/auth/me");
                var responseContent = await response.Content.ReadAsStringAsync();

                // Debugowanie
                System.Diagnostics.Debug.WriteLine($"GetUser Status Code: {response.StatusCode}");
                System.Diagnostics.Debug.WriteLine($"GetUser Response: {responseContent}");

                if (response.IsSuccessStatusCode) {
                    if (responseContent.Trim().StartsWith("{") || responseContent.Trim().StartsWith("[")) {
                        return JsonConvert.DeserializeObject<User>(responseContent);
                    } else {
                        throw new Exception($"Serwer zwrócił nieprawidłową odpowiedź: {responseContent}");
                    }
                } else {
                    if (responseContent.Trim().StartsWith("{") || responseContent.Trim().StartsWith("[")) {
                        try {
                            var error = JsonConvert.DeserializeObject<ErrorResponse>(responseContent);
                            throw new Exception(error?.error ?? $"Błąd pobierania danych użytkownika ({response.StatusCode})");
                        } catch (JsonException) {
                            throw new Exception($"Błąd serwera ({response.StatusCode}): {responseContent}");
                        }
                    } else {
                        throw new Exception($"Błąd serwera ({response.StatusCode}): {responseContent}");
                    }
                }
            } catch (HttpRequestException ex) {
                throw new Exception($"Błąd połączenia z serwerem: {ex.Message}");
            } catch (TaskCanceledException) {
                throw new Exception("Timeout - serwer nie odpowiada");
            } catch (JsonException ex) {
                throw new Exception($"Błąd parsowania odpowiedzi serwera: {ex.Message}");
            }
        }

        public async Task<List<Folder>> GetFoldersAsync() {
            try {
                var response = await _httpClient.GetAsync($"{_baseUrl}/api/folders");
                var responseContent = await response.Content.ReadAsStringAsync();

                // Debugowanie
                System.Diagnostics.Debug.WriteLine($"GetFolders Status Code: {response.StatusCode}");
                System.Diagnostics.Debug.WriteLine($"GetFolders Response: {responseContent}");

                if (response.IsSuccessStatusCode) {
                    if (responseContent.Trim().StartsWith("{") || responseContent.Trim().StartsWith("[")) {
                        return JsonConvert.DeserializeObject<List<Folder>>(responseContent);
                    } else {
                        throw new Exception($"Serwer zwrócił nieprawidłową odpowiedź: {responseContent}");
                    }
                } else {
                    if (responseContent.Trim().StartsWith("{") || responseContent.Trim().StartsWith("[")) {
                        try {
                            var error = JsonConvert.DeserializeObject<ErrorResponse>(responseContent);
                            throw new Exception(error?.error ?? $"Błąd pobierania folderów ({response.StatusCode})");
                        } catch (JsonException) {
                            throw new Exception($"Błąd serwera ({response.StatusCode}): {responseContent}");
                        }
                    } else {
                        throw new Exception($"Błąd serwera ({response.StatusCode}): {responseContent}");
                    }
                }
            } catch (HttpRequestException ex) {
                throw new Exception($"Błąd połączenia z serwerem: {ex.Message}");
            } catch (TaskCanceledException) {
                throw new Exception("Timeout - serwer nie odpowiada");
            } catch (JsonException ex) {
                throw new Exception($"Błąd parsowania odpowiedzi serwera: {ex.Message}");
            }
        }

        public async Task<Client> RegisterClientAsync(RegisterClientRequest request) {
            try {
                var json = JsonConvert.SerializeObject(request);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await _httpClient.PostAsync($"{_baseUrl}/api/sync/clients", content);
                var responseContent = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode) {
                    return JsonConvert.DeserializeObject<Client>(responseContent);
                } else {
                    throw new Exception($"Błąd rejestracji klienta: {responseContent}");
                }
            } catch (Exception ex) {
                throw new Exception($"Błąd rejestracji klienta: {ex.Message}");
            }
        }

        public async Task<List<Client>> GetClientsAsync() {
            try {
                var response = await _httpClient.GetAsync($"{_baseUrl}/api/sync/clients");
                var responseContent = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode) {
                    return JsonConvert.DeserializeObject<List<Client>>(responseContent);
                } else {
                    throw new Exception($"Błąd pobierania klientów: {responseContent}");
                }
            } catch (Exception ex) {
                throw new Exception($"Błąd pobierania klientów: {ex.Message}");
            }
        }

        public async Task<SyncFolder> CreateSyncFolderAsync(CreateSyncFolderRequest request) {
            try {
                var json = JsonConvert.SerializeObject(request);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await _httpClient.PostAsync($"{_baseUrl}/api/sync/folders", content);
                var responseContent = await response.Content.ReadAsStringAsync();

                // Debugowanie
                System.Diagnostics.Debug.WriteLine($"CreateSyncFolder Status Code: {response.StatusCode}");
                System.Diagnostics.Debug.WriteLine($"CreateSyncFolder Response: {responseContent}");

                if (response.IsSuccessStatusCode) {
                    if (responseContent.Trim().StartsWith("{") || responseContent.Trim().StartsWith("[")) {
                        return JsonConvert.DeserializeObject<SyncFolder>(responseContent);
                    } else {
                        throw new Exception($"Serwer zwrócił nieprawidłową odpowiedź: {responseContent}");
                    }
                } else {
                    if (responseContent.Trim().StartsWith("{") || responseContent.Trim().StartsWith("[")) {
                        try {
                            var error = JsonConvert.DeserializeObject<ErrorResponse>(responseContent);
                            throw new Exception(error?.error ?? $"Błąd tworzenia synchronizacji ({response.StatusCode}): {responseContent}");
                        } catch (JsonException) {
                            throw new Exception($"Błąd serwera ({response.StatusCode}): {responseContent}");
                        }
                    } else {
                        throw new Exception($"Błąd serwera ({response.StatusCode}): {responseContent}");
                    }
                }
            } catch (HttpRequestException ex) {
                throw new Exception($"Błąd połączenia z serwerem: {ex.Message}");
            } catch (TaskCanceledException) {
                throw new Exception("Timeout - serwer nie odpowiada");
            } catch (JsonException ex) {
                throw new Exception($"Błąd parsowania odpowiedzi serwera: {ex.Message}");
            } catch (Exception ex) when (!(ex is HttpRequestException || ex is TaskCanceledException || ex is JsonException)) {
                throw new Exception($"Błąd podczas tworzenia synchronizacji: {ex.Message}");
            }
        }

        public async Task<List<SyncFolder>> GetSyncFoldersAsync() {
            try {
                var response = await _httpClient.GetAsync($"{_baseUrl}/api/sync/folders");
                var responseContent = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode) {
                    return JsonConvert.DeserializeObject<List<SyncFolder>>(responseContent);
                } else {
                    throw new Exception($"Błąd pobierania synchronizacji: {responseContent}");
                }
            } catch (Exception ex) {
                throw new Exception($"Błąd pobierania synchronizacji: {ex.Message}");
            }
        }

        public async Task DeleteSyncFolderAsync(string folderId, string clientId) {
            try {
                var response = await _httpClient.DeleteAsync($"{_baseUrl}/api/sync/folders/{folderId}?clientId={clientId}");

                if (!response.IsSuccessStatusCode) {
                    var responseContent = await response.Content.ReadAsStringAsync();
                    throw new Exception($"Błąd usuwania synchronizacji: {responseContent}");
                }
            } catch (Exception ex) {
                throw new Exception($"Błąd usuwania synchronizacji: {ex.Message}");
            }
        }

        public async Task UpdateClientActivityAsync(string clientId) {
            try {
                var response = await _httpClient.PutAsync($"{_baseUrl}/api/sync/clients/{clientId}/activity", null);

                if (!response.IsSuccessStatusCode) {
                    var responseContent = await response.Content.ReadAsStringAsync();
                    throw new Exception($"Błąd aktualizacji aktywności: {responseContent}");
                }
            } catch (Exception ex) {
                throw new Exception($"Błąd aktualizacji aktywności: {ex.Message}");
            }
        }

        // Pobieranie plików do synchronizacji
        public async Task<List<ServerFile>> GetFilesForSyncAsync(string folderId, string clientId) {
            try {
                var response = await _httpClient.GetAsync($"{_baseUrl}/api/sync/folders/{folderId}/files/{clientId}");
                var responseContent = await response.Content.ReadAsStringAsync();

                System.Diagnostics.Debug.WriteLine($"GetFilesForSync Status: {response.StatusCode}");
                System.Diagnostics.Debug.WriteLine($"GetFilesForSync Response: {responseContent}");

                if (response.IsSuccessStatusCode) {
                    return JsonConvert.DeserializeObject<List<ServerFile>>(responseContent);
                } else {
                    throw new Exception($"Błąd pobierania plików: {responseContent}");
                }
            } catch (Exception ex) {
                throw new Exception($"Błąd pobierania plików do synchronizacji: {ex.Message}");
            }
        }

        // Wysyłanie pliku na serwer
        public async Task<ServerFile> SyncFileToServerAsync(string clientId, SyncFileRequest request) {
            try {
                var json = JsonConvert.SerializeObject(request);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await _httpClient.PostAsync($"{_baseUrl}/api/sync/files/sync/{clientId}", content);
                var responseContent = await response.Content.ReadAsStringAsync();

                System.Diagnostics.Debug.WriteLine($"SyncFileToServer Status: {response.StatusCode}");
                System.Diagnostics.Debug.WriteLine($"SyncFileToServer Response: {responseContent}");

                if (response.IsSuccessStatusCode) {
                    return JsonConvert.DeserializeObject<ServerFile>(responseContent);
                } else {
                    throw new Exception($"Błąd wysyłania pliku: {responseContent}");
                }
            } catch (Exception ex) {
                throw new Exception($"Błąd synchronizacji pliku na serwer: {ex.Message}");
            }
        }

        // Batch synchronizacja wielu plików
        public async Task<BatchSyncResponse> BatchSyncFilesAsync(string clientId, List<SyncFileRequest> files) {
            try {
                var request = new { files = files };
                var json = JsonConvert.SerializeObject(request);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await _httpClient.PostAsync($"{_baseUrl}/api/sync/files/batch-sync/{clientId}", content);
                var responseContent = await response.Content.ReadAsStringAsync();

                System.Diagnostics.Debug.WriteLine($"BatchSync Status: {response.StatusCode}");
                System.Diagnostics.Debug.WriteLine($"BatchSync Response: {responseContent}");

                if (response.IsSuccessStatusCode) {
                    return JsonConvert.DeserializeObject<BatchSyncResponse>(responseContent);
                } else {
                    throw new Exception($"Błąd batch synchronizacji: {responseContent}");
                }
            } catch (Exception ex) {
                throw new Exception($"Błąd batch synchronizacji plików: {ex.Message}");
            }
        }

        // Sprawdzanie statusu synchronizacji
        public async Task<SyncStatusResponse> CheckSyncStatusAsync(string folderId, string clientId, List<ClientFile> clientFiles) {
            try {
                var request = new { files = clientFiles };
                var json = JsonConvert.SerializeObject(request);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await _httpClient.PostAsync($"{_baseUrl}/api/sync/folders/{folderId}/sync-status/{clientId}", content);
                var responseContent = await response.Content.ReadAsStringAsync();

                System.Diagnostics.Debug.WriteLine($"CheckSyncStatus Status: {response.StatusCode}");
                System.Diagnostics.Debug.WriteLine($"CheckSyncStatus Response: {responseContent}");

                if (response.IsSuccessStatusCode) {
                    return JsonConvert.DeserializeObject<SyncStatusResponse>(responseContent);
                } else {
                    throw new Exception($"Błąd sprawdzania statusu synchronizacji: {responseContent}");
                }
            } catch (Exception ex) {
                throw new Exception($"Błąd sprawdzania statusu synchronizacji: {ex.Message}");
            }
        }

        // Pobieranie zawartości pliku z serwera
        public async Task<byte[]> DownloadFileAsync(string fileId) {
            try {
                var response = await _httpClient.GetAsync($"{_baseUrl}/api/files/{fileId}/download");

                if (response.IsSuccessStatusCode) {
                    return await response.Content.ReadAsByteArrayAsync();
                } else {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    throw new Exception($"Błąd pobierania pliku: {errorContent}");
                }
            } catch (Exception ex) {
                throw new Exception($"Błąd pobierania pliku z serwera: {ex.Message}");
            }
        }

        public void Dispose() {
            _httpClient?.Dispose();
        }

    }
}