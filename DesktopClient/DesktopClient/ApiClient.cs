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
        private readonly SessionManager _sessionManager;

        // Event do powiadamiania o odświeżeniu tokenu
        public event Action<string> TokenRefreshed;

        public ApiClient(SessionManager sessionManager = null) {
            _httpClient = new HttpClient();
            _baseUrl = "https://localhost:3443";
            _httpClient.Timeout = TimeSpan.FromSeconds(30);
            _httpClient.DefaultRequestHeaders.Accept.Clear();
            _httpClient.DefaultRequestHeaders.Accept.Add(
                new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("application/json"));
            _sessionManager = sessionManager;
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

        // Nowa metoda do odświeżania tokenu
        public async Task<bool> RefreshTokenAsync() {
            try {
                if (string.IsNullOrEmpty(_authToken)) {
                    return false;
                }

                var response = await PostAsync<LoginResponse>("/api/auth/refresh", null, skipTokenRefresh: true);

                if (response?.token != null) {
                    SetAuthToken(response.token);
                    TokenRefreshed?.Invoke(response.token);
                    Console.WriteLine("[TOKEN] Token został odświeżony");
                    return true;
                }
                return false;
            } catch (Exception ex) {
                Console.WriteLine($"[TOKEN] Błąd odświeżania tokenu: {ex.Message}");
                return false;
            }
        }

        // === AUTORYZACJA ===

        public async Task<LoginResponse> LoginAsync(string username, string password) {
            var request = new LoginRequest {
                username = username,
                password = password
            };

            return await PostAsync<LoginResponse>("/api/auth/login", request, skipTokenRefresh: true);
        }

        public async Task<List<Folder>> GetFoldersAsync() {
            return await GetAsync<List<Folder>>("/api/folders");
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

        // === KONFIGURACJA FOLDERÓW SYNCHRONIZACJI ===

        public async Task<AddFolderToSyncResponse> AddFolderToSyncAsync(string clientId, string clientFolderPath, string serverFolderId, string clientFolderName = null) {
            var request = new AddFolderToSyncRequest {
                clientId = clientId,
                clientFolderPath = clientFolderPath,
                serverFolderId = serverFolderId,
                clientFolderName = clientFolderName
            };

            return await PostAsync<AddFolderToSyncResponse>("/api/sync/folders", request);
        }

        public async Task<ApiResponse> RemoveFolderFromSyncAsync(string folderId, string clientId) {
            var url = $"/api/sync/folders/{folderId}?clientId={clientId}";
            return await DeleteAsync<ApiResponse>(url);
        }

        public async Task<SyncFolderInfoResponse> GetSyncFolderInfoAsync(string folderId) {
            return await GetAsync<SyncFolderInfoResponse>($"/api/sync/folders/{folderId}/info");
        }

        // === GŁÓWNY PROCES SYNCHRONIZACJI ===

        public async Task<SyncDataResponse> GetSyncDataAsync(string folderId, string clientId) {
            return await GetAsync<SyncDataResponse>($"/api/sync/folders/{folderId}/sync-data/{clientId}");
        }

        public async Task<FileDownloadResponse> DownloadFileFromServerAsync(string fileId, string clientId) {
            return await GetAsync<FileDownloadResponse>($"/api/sync/files/{fileId}/download/{clientId}");
        }

        public async Task<UploadFileResponse> UploadNewFileToServerAsync(string folderId, string clientId, UploadFileRequest fileData) {
            return await PostAsync<UploadFileResponse>($"/api/sync/folders/{folderId}/files/{clientId}", fileData);
        }

        public async Task<UpdateFileResponse> UpdateExistingFileOnServerAsync(string fileId, string clientId, UpdateFileRequest fileData) {
            return await PutAsync<UpdateFileResponse>($"/api/sync/files/{fileId}/update/{clientId}", fileData);
        }

        public async Task<ApiResponse> ConfirmFileDownloadedAsync(string fileId, string clientId, ClientFileInfo clientFileInfo) {
            return await PostAsync<ApiResponse>($"/api/sync/files/{fileId}/confirm-download/{clientId}", clientFileInfo);
        }

        public async Task<ApiResponse> ConfirmFileDeletedOnClientAsync(string fileId, string clientId) {
            return await PostAsync<ApiResponse>($"/api/sync/files/{fileId}/confirm-delete/{clientId}", null);
        }

        public async Task<ApiResponse> DeleteFileFromServerAsync(string fileId, string clientId) {
            return await DeleteAsync<ApiResponse>($"/api/sync/files/{fileId}/delete-from-server/{clientId}");
        }

        public async Task<SyncCompletedResponse> ConfirmSyncCompletedAsync(string folderId, string clientId) {
            return await PostAsync<SyncCompletedResponse>($"/api/sync/folders/{folderId}/confirm/{clientId}", null);
        }

        // === FUNKCJE POMOCNICZE ===

        public async Task<FindFileResponse> FindFileByClientIdAsync(string clientId, string clientFileId, string folderId = null) {
            var url = $"/api/sync/clients/{clientId}/files/{clientFileId}";
            if (!string.IsNullOrEmpty(folderId)) {
                url += $"?folderId={folderId}";
            }
            return await GetAsync<FindFileResponse>(url);
        }

        public async Task<FindFileResponse> FindFileByNameAndHashAsync(string folderId, string fileName, string fileHash) {
            return await GetAsync<FindFileResponse>($"/api/sync/folders/{folderId}/find/{fileName}/{fileHash}");
        }

        public async Task<ApiResponse> UpdateSyncSettingsAsync(string folderId, string syncId, UpdateSyncSettingsRequest settings) {
            return await PutAsync<ApiResponse>($"/api/sync/folders/{folderId}/settings/{syncId}", settings);
        }

        // === METODY POMOCNICZE HTTP Z AUTOMATYCZNYM ODŚWIEŻANIEM TOKENU ===

        private async Task<T> GetAsync<T>(string endpoint) {
            return await ExecuteWithTokenRefresh(async () => {
                var url = $"{_baseUrl}{endpoint}";
                Console.WriteLine($"[HTTP GET] {url}");
                var response = await _httpClient.GetAsync(url);
                return await ProcessResponse<T>(response);
            });
        }

        private async Task<T> PostAsync<T>(string endpoint, object data, bool skipTokenRefresh = false) {
            return await ExecuteWithTokenRefresh(async () => {
                var content = new StringContent("{}", Encoding.UTF8, "application/json");

                if (data != null) {
                    var json = JsonConvert.SerializeObject(data);
                    Console.WriteLine($"[HTTP POST] {_baseUrl}{endpoint}");
                    Console.WriteLine($"Payload: {json}");
                    content = new StringContent(json, Encoding.UTF8, "application/json");
                } else {
                    Console.WriteLine($"[HTTP POST] {_baseUrl}{endpoint}");
                    Console.WriteLine($"Payload: {{}}");
                }

                var response = await _httpClient.PostAsync($"{_baseUrl}{endpoint}", content);
                return await ProcessResponse<T>(response);
            }, skipTokenRefresh);
        }

        private async Task<T> PutAsync<T>(string endpoint, object data) {
            return await ExecuteWithTokenRefresh(async () => {
                var content = new StringContent("{}", Encoding.UTF8, "application/json");

                if (data != null) {
                    var json = JsonConvert.SerializeObject(data);
                    Console.WriteLine($"[HTTP PUT] {_baseUrl}{endpoint}");
                    Console.WriteLine($"Payload: {json}");
                    content = new StringContent(json, Encoding.UTF8, "application/json");
                } else {
                    Console.WriteLine($"[HTTP PUT] {_baseUrl}{endpoint}");
                    Console.WriteLine($"Payload: {{}}");
                }

                var response = await _httpClient.PutAsync($"{_baseUrl}{endpoint}", content);
                return await ProcessResponse<T>(response);
            });
        }

        private async Task<T> DeleteAsync<T>(string endpoint) {
            return await ExecuteWithTokenRefresh(async () => {
                var url = $"{_baseUrl}{endpoint}";
                Console.WriteLine($"[HTTP DELETE] {url}");
                var response = await _httpClient.DeleteAsync(url);
                return await ProcessResponse<T>(response);
            });
        }

        // Nowa metoda - wrapper z automatycznym odświeżaniem tokenu
        private async Task<T> ExecuteWithTokenRefresh<T>(Func<Task<T>> operation, bool skipTokenRefresh = false) {
            try {
                return await operation();
            } catch (Exception ex) {
                // Sprawdź czy błąd to 401 (Unauthorized)
                if (!skipTokenRefresh && ex.Message.Contains("401") && !string.IsNullOrEmpty(_authToken)) {
                    Console.WriteLine("[TOKEN] Wykryto błąd 401, próba odświeżenia tokenu...");

                    var refreshed = await RefreshTokenAsync();
                    if (refreshed) {
                        Console.WriteLine("[TOKEN] Token odświeżony, ponawianie operacji...");
                        return await operation(); // Ponów operację z nowym tokenem
                    } else {
                        Console.WriteLine("[TOKEN] Nie udało się odświeżyć tokenu");
                        throw new UnauthorizedAccessException("Token wygasł i nie można go odświeżyć");
                    }
                }
                throw;
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