using DesktopClient.Models;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Threading.Tasks;

namespace DesktopClient.Services {
    public class SyncService {
        private readonly ApiClient _apiClient;
        private readonly string _clientId;

        public SyncService(ApiClient apiClient, string clientId) {
            _apiClient = apiClient;
            _clientId = clientId;
        }

        // Główna metoda synchronizacji folderu
        public async Task<SyncResult> SyncFolderAsync(LocalSyncConfig syncConfig) {
            try {
                var result = new SyncResult { success = true };

                // 1. Pobierz pliki z serwera
                var serverFiles = await _apiClient.GetFilesForSyncAsync(syncConfig.ServerFolderId, _clientId);

                // 2. Pobierz pliki lokalne
                var localFiles = GetLocalFiles(syncConfig.LocalFolderPath);

                // 3. Sprawdź status synchronizacji
                var syncStatus = await _apiClient.CheckSyncStatusAsync(
                    syncConfig.ServerFolderId,
                    _clientId,
                    localFiles.Select(MapToClientFile).ToList()
                );

                // 4. Wykonaj synchronizację
                if (syncStatus.syncRequired) {
                    await ProcessSyncChanges(syncStatus.changes, syncConfig);
                }

                // 5. Aktualizuj datę ostatniej synchronizacji
                syncConfig.LastSyncDate = DateTime.Now;

                return result;
            } catch (Exception ex) {
                return new SyncResult {
                    success = false,
                    error = $"Błąd synchronizacji: {ex.Message}"
                };
            }
        }

        // Przetwarzanie zmian synchronizacji
        private async Task ProcessSyncChanges(List<SyncChange> changes, LocalSyncConfig syncConfig) {
            var filesToUpload = new List<SyncFileRequest>();

            foreach (var change in changes) {
                try {
                    switch (change.direction) {
                        case "to-client":
                            // Pobierz plik z serwera
                            await DownloadFileFromServer(change.file, syncConfig.LocalFolderPath);
                            break;

                        case "from-client":
                            // Wyślij plik na serwer
                            var uploadRequest = await PrepareFileUpload(change.clientFile, syncConfig);
                            if (uploadRequest != null) {
                                filesToUpload.Add(uploadRequest);
                            }
                            break;

                        case "conflict":
                            // Obsługuj konflikt - domyślnie wybierz nowszy plik
                            if (change.clientFile.lastModified > change.localFile.lastModified) {
                                var conflictRequest = await PrepareFileUpload(change.clientFile, syncConfig);
                                if (conflictRequest != null) {
                                    filesToUpload.Add(conflictRequest);
                                }
                            } else {
                                await DownloadFileFromServer(change.localFile, syncConfig.LocalFolderPath);
                            }
                            break;
                    }
                } catch (Exception ex) {
                    System.Diagnostics.Debug.WriteLine($"Błąd przetwarzania zmiany: {ex.Message}");
                }
            }

            // Wyślij pliki wsadowo
            if (filesToUpload.Any()) {
                await _apiClient.BatchSyncFilesAsync(_clientId, filesToUpload);
            }
        }

        // Pobieranie pliku z serwera
        private async Task DownloadFileFromServer(ServerFile serverFile, string localFolderPath) {
            try {
                var fileContent = await _apiClient.DownloadFileAsync(serverFile._id);
                var localFilePath = Path.Combine(localFolderPath, serverFile.originalName);

                // Utwórz katalog jeśli nie istnieje
                var directory = Path.GetDirectoryName(localFilePath);
                if (!Directory.Exists(directory)) {
                    Directory.CreateDirectory(directory);
                }

                await Task.Run(() => File.WriteAllBytes(localFilePath, fileContent));

                // Ustaw datę modyfikacji
                File.SetLastWriteTime(localFilePath, serverFile.lastModified);

                System.Diagnostics.Debug.WriteLine($"Pobrano plik: {serverFile.originalName}");
            } catch (Exception ex) {
                System.Diagnostics.Debug.WriteLine($"Błąd pobierania pliku {serverFile.originalName}: {ex.Message}");
                throw;
            }
        }

        // Przygotowanie pliku do wysłania
        private async Task<SyncFileRequest> PrepareFileUpload(ClientFile clientFile, LocalSyncConfig syncConfig) {
            try {
                var localFilePath = Path.Combine(syncConfig.LocalFolderPath, clientFile.name);

                if (!File.Exists(localFilePath)) {
                    return null;
                }

                var fileContent = await Task.Run(() => File.ReadAllBytes(localFilePath));
                var base64Content = Convert.ToBase64String(fileContent);

                return new SyncFileRequest {
                    folderId = syncConfig.ServerFolderId,
                    clientFileId = clientFile.clientFileId,
                    clientFileName = clientFile.name,
                    clientPath = syncConfig.LocalFolderPath,
                    name = clientFile.name,
                    mimetype = clientFile.mimetype ?? GetMimeType(localFilePath),
                    size = clientFile.size,
                    lastModified = clientFile.lastModified,
                    content = base64Content,
                    hash = clientFile.hash,
                    action = "create"
                };
            } catch (Exception ex) {
                System.Diagnostics.Debug.WriteLine($"Błąd przygotowania pliku {clientFile.name}: {ex.Message}");
                return null;
            }
        }

        // Pobieranie listy plików lokalnych
        private List<FileInfo> GetLocalFiles(string folderPath) {
            try {
                if (!Directory.Exists(folderPath)) {
                    Directory.CreateDirectory(folderPath);
                    return new List<FileInfo>();
                }

                var directory = new DirectoryInfo(folderPath);
                return directory.GetFiles("*", SearchOption.AllDirectories).ToList();
            } catch (Exception ex) {
                System.Diagnostics.Debug.WriteLine($"Błąd pobierania plików lokalnych: {ex.Message}");
                return new List<FileInfo>();
            }
        }

        // Mapowanie FileInfo na ClientFile
        private ClientFile MapToClientFile(FileInfo fileInfo) {
            return new ClientFile {
                clientFileId = GenerateClientFileId(fileInfo.FullName),
                name = fileInfo.Name,
                path = fileInfo.FullName,
                size = fileInfo.Length,
                lastModified = fileInfo.LastWriteTime,
                hash = CalculateFileHash(fileInfo.FullName),
                mimetype = GetMimeType(fileInfo.FullName)
            };
        }

        // Generowanie ID pliku klienta
        private string GenerateClientFileId(string filePath) {
            using (var sha256 = SHA256.Create()) {
                var hash = sha256.ComputeHash(System.Text.Encoding.UTF8.GetBytes(filePath));
                return Convert.ToBase64String(hash).Replace("/", "_").Replace("+", "-").TrimEnd('=');
            }
        }

        // Obliczanie hash pliku
        private string CalculateFileHash(string filePath) {
            try {
                using (var sha256 = SHA256.Create()) {
                    using (var stream = File.OpenRead(filePath)) {
                        var hash = sha256.ComputeHash(stream);
                        return Convert.ToBase64String(hash);
                    }
                }
            } catch {
                return null;
            }
        }

        private string GetMimeType(string filePath) {
            var extension = Path.GetExtension(filePath).ToLowerInvariant();
            switch (extension) {
                case ".txt":
                    return "text/plain";
                case ".pdf":
                    return "application/pdf";
                case ".doc":
                    return "application/msword";
                case ".docx":
                    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
                case ".jpg":
                case ".jpeg":
                    return "image/jpeg";
                case ".png":
                    return "image/png";
                case ".gif":
                    return "image/gif";
                case ".zip":
                    return "application/zip";
                case ".rar":
                    return "application/x-rar-compressed";
                default:
                    return "application/octet-stream";
            }
        }
    }
}