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
                        try {
                            // Dodaj dodatkowe debugowanie przed deserializacją
                            System.Diagnostics.Debug.WriteLine($"Attempting to deserialize: {responseContent}");

                            var loginResponse = JsonConvert.DeserializeObject<LoginResponse>(responseContent);

                            // Sprawdź czy deserializacja się powiodła
                            System.Diagnostics.Debug.WriteLine($"Deserialized token: {loginResponse?.token ?? "NULL"}");

                            return loginResponse;
                        } catch (JsonException jsonEx) {
                            System.Diagnostics.Debug.WriteLine($"JSON Deserialization Error: {jsonEx.Message}");
                            System.Diagnostics.Debug.WriteLine($"JSON Content: {responseContent}");
                            throw new Exception($"Błąd parsowania odpowiedzi serwera: {jsonEx.Message}. Otrzymana odpowiedź: {responseContent}");
                        }
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
            } catch (Exception ex) when (ex is JsonException) {
                // Ten blok już został obsłużony wyżej, ale dla pewności
                throw new Exception($"Błąd parsowania JSON: {ex.Message}");
            } catch (Exception ex) {
                // Ogólny handler dla innych błędów
                System.Diagnostics.Debug.WriteLine($"General Exception: {ex.GetType().Name}: {ex.Message}");
                throw new Exception($"Błąd podczas logowania: {ex.Message}");
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

        // === ZARZĄDZANIE KLIENTAMI ===

        public async Task<RegisterClientResponse> RegisterClientAsync(string type, string name, object metadata = null) {
            var request = new RegisterClientRequest {
                type = type,
                name = name,
                metadata = metadata ?? new { }
            };

            return await PostAsync<RegisterClientResponse>("/api/sync/clients", request);
        }

        public async Task<GetClientResponse> GetClientAsync(string clientId) {
            return await GetAsync<GetClientResponse>($"/api/sync/clients/{clientId}");
        }

        public async Task<ApiResponse> UpdateClientActivityAsync(string clientId) {
            return await PutAsync<ApiResponse>($"/api/sync/clients/{clientId}/activity", null);
        }

        // === KONFIGURACJA SYNCHRONIZACJI FOLDERÓW ===

        public async Task<ApiResponse> AddSyncFolderAsync(string clientId, string folderPath, string serverFolderId) {
            var request = new AddSyncFolderRequest {
                clientId = clientId,
                folderPath = folderPath,
                serverFolderId = serverFolderId
            };

            return await PostAsync<ApiResponse>("/api/sync/folders", request);
        }

        public async Task<ApiResponse> RemoveSyncFolderAsync(string folderId) {
            return await DeleteAsync<ApiResponse>($"/api/sync/folders/{folderId}");
        }

        // === SYNCHRONIZACJA - GŁÓWNY INTERFEJS ===

        public async Task<SyncStateResponse> GetSyncStateAsync(string folderId, string clientId) {
            return await GetAsync<SyncStateResponse>($"/api/sync/folders/{folderId}/state/{clientId}");
        }

        public async Task<ApiResponse> ConfirmSyncCompletedAsync(string folderId, string clientId, List<CompletedOperation> completedOperations) {
            var request = new ConfirmSyncRequest {
                completedOperations = completedOperations
            };

            return await PostAsync<ApiResponse>($"/api/sync/folders/{folderId}/confirm/{clientId}", request);
        }

        // === OPERACJE NA PLIKACH PODCZAS SYNCHRONIZACJI ===

        public async Task<FileDownloadResponse> GetFileForDownloadAsync(string fileId, string clientId) {
            return await GetAsync<FileDownloadResponse>($"/api/sync/files/{fileId}/download/{clientId}");
        }

        public async Task<ApiResponse> ConfirmFileDownloadedAsync(string fileId, string clientId, ClientFileInfo clientFileInfo) {
            return await PostAsync<ApiResponse>($"/api/sync/files/{fileId}/confirm-download/{clientId}", clientFileInfo);
        }

        public async Task<ApiResponse> ConfirmFileDeletedAsync(string fileId, string clientId) {
            return await PostAsync<ApiResponse>($"/api/sync/files/{fileId}/confirm-delete/{clientId}", null);
        }

        public async Task<ApiResponse> UploadFileFromClientAsync(string folderId, string clientId, UploadFileRequest fileData) {
            return await PostAsync<ApiResponse>($"/api/sync/folders/{folderId}/files/{clientId}", fileData);
        }

        public async Task<ApiResponse> UpdateFileFromClientAsync(string fileId, string clientId, UpdateFileRequest fileData) {
            return await PutAsync<ApiResponse>($"/api/sync/files/{fileId}/update/{clientId}", fileData);
        }

        public async Task<FileExistsResponse> CheckFileExistsAsync(string folderId, string clientId, CheckFileExistsRequest checkData) {
            return await PostAsync<FileExistsResponse>($"/api/sync/folders/{folderId}/files/check/{clientId}", checkData);
        }

        public async Task<ApiResponse> ConfirmFileOperationAsync(string fileId, string clientId, ClientFileInfo clientFileInfo) {
            return await PostAsync<ApiResponse>($"/api/sync/files/{fileId}/confirm-operation/{clientId}", clientFileInfo);
        }

        public async Task<ApiResponse> MarkFileAsDeletedAsync(string fileId) {
            return await PostAsync<ApiResponse>($"/api/sync/files/{fileId}/mark-deleted", new { });
        }

        public async Task<FileExistsResponse> FindFileByClientIdAsync(string clientId, string clientFileId, string folderId = null) {
            var url = $"/api/sync/clients/{clientId}/files/{clientFileId}";
            if (!string.IsNullOrEmpty(folderId)) {
                url += $"?folderId={folderId}";
            }
            return await GetAsync<FileExistsResponse>(url);
        }

        public async Task<FileExistsResponse> FindFileByNameAndHashAsync(string folderId, string fileName, string fileHash) {
            return await GetAsync<FileExistsResponse>($"/api/sync/folders/{folderId}/find/{fileName}/{fileHash}");
        }

        // === OZNACZANIE PLIKÓW DO SYNCHRONIZACJI ===

        public async Task<ApiResponse> MarkFileForSyncAsync(string fileId, string operation = "modified") {
            var request = new { operation = operation };
            return await PostAsync<ApiResponse>($"/api/sync/files/{fileId}/mark", request);
        }

        public async Task<ApiResponse> MarkFolderForSyncAsync(string folderId) {
            return await PostAsync<ApiResponse>($"/api/sync/folders/{folderId}/mark", null);
        }

        // === ZARZĄDZANIE SYNCHRONIZACJAMI FOLDERÓW - INTERFEJS WEBOWY ===

        public async Task<FolderSyncsResponse> GetFolderSyncsAsync(string folderId) {
            return await GetAsync<FolderSyncsResponse>($"/api/sync/folders/{folderId}/syncs");
        }

        public async Task<SyncDetailsResponse> GetSyncDetailsAsync(string folderId, string syncId) {
            return await GetAsync<SyncDetailsResponse>($"/api/sync/folders/{folderId}/syncs/{syncId}");
        }

        public async Task<ApiResponse> UpdateSyncSettingsAsync(string folderId, string syncId, UpdateSyncSettingsRequest settings) {
            return await PutAsync<ApiResponse>($"/api/sync/folders/{folderId}/syncs/{syncId}", settings);
        }

        public async Task<ApiResponse> DeleteSyncFolderAsync(string folderId, string syncId) {
            return await DeleteAsync<ApiResponse>($"/api/sync/folders/{folderId}/syncs/{syncId}");
        }

        // === METODY POMOCNICZE ===

        private async Task<T> GetAsync<T>(string endpoint) {
            try {
                var response = await _httpClient.GetAsync($"{_baseUrl}{endpoint}");
                return await ProcessResponse<T>(response);
            } catch (Exception ex) {
                throw new Exception($"Błąd podczas GET {endpoint}: {ex.Message}");
            }
        }

        private async Task<T> PostAsync<T>(string endpoint, object data) {
            try {
                var json = JsonConvert.SerializeObject(data);

                // Dodaj debugowanie dla requestów upload
                if (endpoint.Contains("/files/")) {
                    System.Diagnostics.Debug.WriteLine($"POST to {endpoint}");
                    System.Diagnostics.Debug.WriteLine($"Request JSON: {json}");
                }

                var content = new StringContent(json, Encoding.UTF8, "application/json");
                var response = await _httpClient.PostAsync($"{_baseUrl}{endpoint}", content);
                return await ProcessResponse<T>(response);
            } catch (Exception ex) {
                throw new Exception($"Błąd podczas POST {endpoint}: {ex.Message}");
            }
        }

        private async Task<T> PutAsync<T>(string endpoint, object data) {
            try {
                var json = data != null ? JsonConvert.SerializeObject(data) : "{}";
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                var response = await _httpClient.PutAsync($"{_baseUrl}{endpoint}", content);
                return await ProcessResponse<T>(response);
            } catch (Exception ex) {
                throw new Exception($"Błąd podczas PUT {endpoint}: {ex.Message}");
            }
        }

        private async Task<T> DeleteAsync<T>(string endpoint) {
            try {
                var response = await _httpClient.DeleteAsync($"{_baseUrl}{endpoint}");
                return await ProcessResponse<T>(response);
            } catch (Exception ex) {
                throw new Exception($"Błąd podczas DELETE {endpoint}: {ex.Message}");
            }
        }

        private async Task<T> ProcessResponse<T>(HttpResponseMessage response) {
            var responseContent = await response.Content.ReadAsStringAsync();

            // Dodaj debugging
            System.Diagnostics.Debug.WriteLine($"HTTP Status: {response.StatusCode}");
            System.Diagnostics.Debug.WriteLine($"Response Content: {responseContent}");

            if (response.IsSuccessStatusCode) {
                if (responseContent.Trim().StartsWith("{") || responseContent.Trim().StartsWith("[")) {
                    try {
                        var result = JsonConvert.DeserializeObject<T>(responseContent);
                        System.Diagnostics.Debug.WriteLine($"Deserialization successful for type {typeof(T).Name}");
                        return result;
                    } catch (JsonException jsonEx) {
                        System.Diagnostics.Debug.WriteLine($"JSON Deserialization Error: {jsonEx.Message}");
                        throw new Exception($"Błąd parsowania odpowiedzi: {jsonEx.Message}");
                    }
                } else {
                    throw new Exception($"Serwer zwrócił nieprawidłową odpowiedź: {responseContent}");
                }
            } else {
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
        }

        public void Dispose() {
            _httpClient?.Dispose();
        }
    }
}