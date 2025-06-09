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
            _baseUrl = "https://localhost:3443";
            _httpClient.Timeout = TimeSpan.FromSeconds(30);
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

        // === AUTORYZACJA ===

        public async Task<LoginResponse> LoginAsync(string username, string password) {
            var request = new LoginRequest {
                username = username,
                password = password
            };

            return await PostAsync<LoginResponse>("/api/auth/login", request);
        }

        public async Task<List<Folder>> GetFoldersAsync() {
            return await GetAsync<List<Folder>>("/api/folders");
        }

        // === ZARZĄDZANIE KLIENTAMI ===

        // Rejestruje nowego klienta synchronizacji w systemie
        public async Task<RegisterClientResponse> RegisterClientAsync(string type, string name, object metadata = null) {
            var request = new RegisterClientRequest {
                type = type,
                name = name,
                metadata = metadata ?? new { }
            };

            return await PostAsync<RegisterClientResponse>("/api/sync/clients", request);
        }

        // Pobiera informacje o zarejestrowanym kliencie
        public async Task<GetClientResponse> GetClientAsync(string clientId) {
            return await GetAsync<GetClientResponse>($"/api/sync/clients/{clientId}");
        }

        // Aktualizuje timestamp ostatniej aktywności klienta (heartbeat)
        public async Task<ApiResponse> UpdateClientActivityAsync(string clientId) {
            return await PutAsync<ApiResponse>($"/api/sync/clients/{clientId}/activity", null);
        }

        // === KONFIGURACJA FOLDERÓW SYNCHRONIZACJI ===

        // Dodaje folder serwera do synchronizacji z lokalnym folderem klienta
        public async Task<AddFolderToSyncResponse> AddFolderToSyncAsync(string clientId, string clientFolderPath, string serverFolderId, string clientFolderName = null) {
            var request = new AddFolderToSyncRequest {
                clientId = clientId,
                clientFolderPath = clientFolderPath,
                serverFolderId = serverFolderId,
                clientFolderName = clientFolderName
            };

            return await PostAsync<AddFolderToSyncResponse>("/api/sync/folders", request);
        }

        // Usuwa folder z synchronizacji (całkowicie lub tylko dla określonego klienta)
        public async Task<ApiResponse> RemoveFolderFromSyncAsync(string folderId, string syncId) {
            var url = $"/api/sync/folders/{folderId}?syncId={syncId}";
            return await DeleteAsync<ApiResponse>(url);
        }

        // Pobiera informacje o synchronizacji folderu (klienci, ustawienia)
        public async Task<SyncFolderInfoResponse> GetSyncFolderInfoAsync(string folderId) {
            return await GetAsync<SyncFolderInfoResponse>($"/api/sync/folders/{folderId}/info");
        }

        // === GŁÓWNY PROCES SYNCHRONIZACJI ===

        // Pobiera dane synchronizacji - listę wszystkich operacji do wykonania
        public async Task<SyncDataResponse> GetSyncDataAsync(string folderId, string clientId) {
            return await GetAsync<SyncDataResponse>($"/api/sync/folders/{folderId}/sync-data/{clientId}");
        }

        // Pobiera plik z serwera (do pobrania przez klienta)
        public async Task<FileDownloadResponse> DownloadFileFromServerAsync(string fileId, string clientId) {
            return await GetAsync<FileDownloadResponse>($"/api/sync/files/{fileId}/download/{clientId}");
        }

        // Wysyła nowy plik z klienta na serwer
        public async Task<UploadFileResponse> UploadNewFileToServerAsync(string folderId, string clientId, UploadFileRequest fileData) {
            return await PostAsync<UploadFileResponse>($"/api/sync/folders/{folderId}/files/{clientId}", fileData);
        }

        // Aktualizuje istniejący plik na serwerze
        public async Task<UpdateFileResponse> UpdateExistingFileOnServerAsync(string fileId, string clientId, UpdateFileRequest fileData) {
            return await PutAsync<UpdateFileResponse>($"/api/sync/files/{fileId}/update/{clientId}", fileData);
        }

        // Potwierdza pobranie pliku przez klienta (po downlodzie z serwera)
        public async Task<ApiResponse> ConfirmFileDownloadedAsync(string fileId, string clientId, ClientFileInfo clientFileInfo) {
            return await PostAsync<ApiResponse>($"/api/sync/files/{fileId}/confirm-download/{clientId}", clientFileInfo);
        }

        // Potwierdza usunięcie pliku przez klienta (usuwa stan synchronizacji)
        public async Task<ApiResponse> ConfirmFileDeletedOnClientAsync(string fileId, string clientId) {
            return await PostAsync<ApiResponse>($"/api/sync/files/{fileId}/confirm-delete/{clientId}", null);
        }

        // Usuwa plik z serwera na żądanie klienta
        public async Task<ApiResponse> DeleteFileFromServerAsync(string fileId, string clientId) {
            return await DeleteAsync<ApiResponse>($"/api/sync/files/{fileId}/delete-from-server/{clientId}");
        }

        // Potwierdza zakończenie całej synchronizacji folderu
        public async Task<SyncCompletedResponse> ConfirmSyncCompletedAsync(string folderId, string clientId) {
            return await PostAsync<SyncCompletedResponse>($"/api/sync/folders/{folderId}/confirm/{clientId}", null);
        }

        // === FUNKCJE POMOCNICZE ===

        // Wyszukuje plik po ID klienta (clientFileId)
        public async Task<FindFileResponse> FindFileByClientIdAsync(string clientId, string clientFileId, string folderId = null) {
            var url = $"/api/sync/clients/{clientId}/files/{clientFileId}";
            if (!string.IsNullOrEmpty(folderId)) {
                url += $"?folderId={folderId}";
            }
            return await GetAsync<FindFileResponse>(url);
        }

        // Wyszukuje plik po nazwie i hashu
        public async Task<FindFileResponse> FindFileByNameAndHashAsync(string folderId, string fileName, string fileHash) {
            return await GetAsync<FindFileResponse>($"/api/sync/folders/{folderId}/find/{fileName}/{fileHash}");
        }

        // Aktualizuje ustawienia synchronizacji (kierunek, ścieżka, aktywność)
        public async Task<ApiResponse> UpdateSyncSettingsAsync(string folderId, string syncId, UpdateSyncSettingsRequest settings) {
            return await PutAsync<ApiResponse>($"/api/sync/folders/{folderId}/settings/{syncId}", settings);
        }

        // === METODY POMOCNICZE HTTP ===

        private async Task<T> GetAsync<T>(string endpoint) {
            try {
                var url = $"{_baseUrl}{endpoint}";
                Console.WriteLine($"[HTTP GET] {url}");
                var response = await _httpClient.GetAsync(url);
                return await ProcessResponse<T>(response);
            } catch (Exception ex) {
                throw new Exception($"Błąd podczas GET {endpoint}: {ex.Message}");
            }
        }


        private async Task<T> PostAsync<T>(string endpoint, object data) {
            try {
                var json = JsonConvert.SerializeObject(data);
                Console.WriteLine($"[HTTP POST] {_baseUrl}{endpoint}");
                Console.WriteLine($"Payload: {json}");
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
                Console.WriteLine($"[HTTP PUT] {_baseUrl}{endpoint}");
                Console.WriteLine($"Payload: {json}");
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                var response = await _httpClient.PutAsync($"{_baseUrl}{endpoint}", content);
                return await ProcessResponse<T>(response);
            } catch (Exception ex) {
                throw new Exception($"Błąd podczas PUT {endpoint}: {ex.Message}");
            }
        }


        private async Task<T> DeleteAsync<T>(string endpoint) {
            try {
                var url = $"{_baseUrl}{endpoint}";
                Console.WriteLine($"[HTTP DELETE] {url}");
                var response = await _httpClient.DeleteAsync(url);
                return await ProcessResponse<T>(response);
            } catch (Exception ex) {
                throw new Exception($"Błąd podczas DELETE {endpoint}: {ex.Message}");
            }
        }


        private async Task<T> ProcessResponse<T>(HttpResponseMessage response) {
            var responseContent = await response.Content.ReadAsStringAsync();

            Console.WriteLine($"[HTTP RESPONSE] {(int)response.StatusCode} {response.StatusCode}");
            Console.WriteLine($"Response body: {responseContent}");

            if (response.IsSuccessStatusCode) {
                if (responseContent.Trim().StartsWith("{") || responseContent.Trim().StartsWith("[")) {
                    try {
                        return JsonConvert.DeserializeObject<T>(responseContent);
                    } catch (JsonException jsonEx) {
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