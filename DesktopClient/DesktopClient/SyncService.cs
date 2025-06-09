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
        private System.Timers.Timer _syncTimer;
        private bool _isSyncing = false;

        public event Action<string> OnSyncStatusChanged;
        public event Action<string, Exception> OnSyncError;

        public SyncService(ApiClient apiClient, string clientId) {
            _apiClient = apiClient;
            _clientId = clientId;
        }

        public void StartAutoSync(int intervalMinutes = 5) {
            _syncTimer = new System.Timers.Timer(intervalMinutes * 60 * 1000);
            _syncTimer.Elapsed += async (sender, e) => await PerformSyncAsync();
            _syncTimer.AutoReset = true;
            _syncTimer.Enabled = true;
        }

        public void StopAutoSync() {
            _syncTimer?.Stop();
            _syncTimer?.Dispose();
            _syncTimer = null;
        }

        public async Task PerformSyncAsync() {
            if (_isSyncing) return;

            _isSyncing = true;
            OnSyncStatusChanged?.Invoke("Synchronizacja w toku...");

            try {
                var syncFolders = await GetActiveSyncFoldersAsync();
                foreach (var syncFolder in syncFolders) {
                    await SyncFolderAsync(syncFolder);
                }
                OnSyncStatusChanged?.Invoke("Synchronizacja zakończona");
            } catch (Exception ex) {
                OnSyncError?.Invoke("Błąd synchronizacji", ex);
            } finally {
                _isSyncing = false;
            }
        }

        public async Task PerformSyncAsync(string folderId) {
            if (_isSyncing) return;

            _isSyncing = true;
            OnSyncStatusChanged?.Invoke("Synchronizacja folderu w toku...");

            try {
                var syncFolder = await GetSyncFolderInfoAsync(folderId);
                if (syncFolder != null) {
                    await SyncFolderAsync(syncFolder);
                    OnSyncStatusChanged?.Invoke("Synchronizacja folderu zakończona");
                } else {
                    OnSyncStatusChanged?.Invoke("Folder nie jest synchronizowany");
                }
            } catch (Exception ex) {
                OnSyncError?.Invoke($"Błąd synchronizacji folderu {folderId}", ex);
            } finally {
                _isSyncing = false;
            }
        }

        private async Task<List<SyncFolderInfo>> GetActiveSyncFoldersAsync() {
            var folders = await _apiClient.GetFoldersAsync();
            var syncFolders = new List<SyncFolderInfo>();

            foreach (var folder in folders) {
                try {
                    var syncs = await _apiClient.GetFolderSyncsAsync(folder._id);
                    var clientSync = syncs.syncs?.FirstOrDefault(s => s.clientId == _clientId && s.isActive);

                    if (clientSync != null) {
                        syncFolders.Add(new SyncFolderInfo {
                            FolderId = folder._id,
                            LocalPath = clientSync.clientFolderPath,
                            SyncDirection = clientSync.syncDirection,
                            SyncId = clientSync.id
                        });
                    }
                } catch (Exception ex) {
                    OnSyncStatusChanged?.Invoke($"Błąd podczas sprawdzania folderu {folder.name}: {ex.Message}");
                }
            }

            return syncFolders;
        }

        private async Task<SyncFolderInfo> GetSyncFolderInfoAsync(string folderId) {
            try {
                var syncs = await _apiClient.GetFolderSyncsAsync(folderId);
                var clientSync = syncs.syncs?.FirstOrDefault(s => s.clientId == _clientId && s.isActive);

                return clientSync != null ? new SyncFolderInfo {
                    FolderId = folderId,
                    LocalPath = clientSync.clientFolderPath,
                    SyncDirection = clientSync.syncDirection,
                    SyncId = clientSync.id
                } : null;
            } catch {
                return null;
            }
        }

        private async Task SyncFolderAsync(SyncFolderInfo syncFolder) {
            try {
                OnSyncStatusChanged?.Invoke($"Synchronizowanie: {syncFolder.LocalPath}");

                var syncState = await _apiClient.GetSyncStateAsync(syncFolder.FolderId, _clientId);
                var completedOperations = new List<CompletedOperation>();

                OnSyncStatusChanged?.Invoke($"Znaleziono {syncState.syncData?.Count ?? 0} operacji do wykonania");

                if (syncState.syncData != null) {
                    foreach (var syncItem in syncState.syncData) {
                        var success = await ProcessSyncDataItemAsync(syncItem, syncFolder);
                        completedOperations.Add(new CompletedOperation {
                            fileId = syncItem.fileId,
                            operation = syncItem.operation,
                            success = success,
                            error = success ? null : "Błąd operacji"
                        });
                        OnSyncStatusChanged?.Invoke($"Operacja {syncItem.operation} dla {syncItem.originalName}: {(success ? "OK" : "BŁĄD")}");
                    }
                }

                if (CanUploadFromClient(syncFolder.SyncDirection)) {
                    await ScanAndUploadNewLocalFilesAsync(syncFolder, completedOperations);
                }

                if (completedOperations.Any()) {
                    OnSyncStatusChanged?.Invoke("Potwierdzanie zakończenia synchronizacji...");
                    await _apiClient.ConfirmSyncCompletedAsync(syncFolder.FolderId, _clientId, completedOperations);
                }
            } catch (Exception ex) {
                OnSyncError?.Invoke($"Błąd synchronizacji folderu {syncFolder.LocalPath}", ex);
            }
        }

        private async Task<bool> ProcessSyncDataItemAsync(SyncDataItem syncItem, SyncFolderInfo syncFolder) {
            // Dla operacji deleted, sprawdź clientFileName lub clientPath zamiast originalName
            string fileName = GetFileName(syncItem);
            if (string.IsNullOrEmpty(fileName)) {
                OnSyncStatusChanged?.Invoke($"Operacja {syncItem.operation} - brak nazwy pliku");
                return false;
            }

            var localFilePath = GetLocalFilePath(syncItem, syncFolder.LocalPath);

            OnSyncStatusChanged?.Invoke($"Przetwarzanie operacji: {syncItem.operation} dla pliku: {fileName}");

            switch (syncItem.operation.ToLower()) {
                case "added":
                case "modified":
                    return CanDownloadToClient(syncFolder.SyncDirection)
                        ? await DownloadFileAsync(syncItem, localFilePath)
                        : LogSkipAndReturnTrue($"Pominięto pobieranie (kierunek sync): {fileName}");

                case "deleted":
                    return CanDownloadToClient(syncFolder.SyncDirection)
                        ? DeleteLocalFile(localFilePath)
                        : LogSkipAndReturnTrue($"Pominięto usuwanie (kierunek sync): {fileName}");

                case "unchanged":
                    return await HandleUnchangedFileAsync(syncItem, localFilePath, syncFolder.SyncDirection, fileName);

                default:
                    OnSyncStatusChanged?.Invoke($"Nieznana operacja: {syncItem.operation} dla {fileName}");
                    return true;
            }
        }

        private async Task<bool> HandleUnchangedFileAsync(SyncDataItem syncItem, string localFilePath, string syncDirection, string fileName) {
            // Sprawdź czy plik nie został usunięty lokalnie
            if (!File.Exists(localFilePath)) {
                // Jeśli plik nie istnieje lokalnie, a serwer ma go jako "unchanged"
                if (CanUploadFromClient(syncDirection)) {
                    // Usuń plik na serwerze jeśli synchronizacja pozwala na upload
                    OnSyncStatusChanged?.Invoke($"Plik '{fileName}' został usunięty lokalnie - usuwanie na serwerze");
                    return await DeleteFileOnServerAsync(syncItem.fileId);
                } else {
                    // Jeśli nie można uploadować, pobierz plik z serwera
                    OnSyncStatusChanged?.Invoke($"Plik oznaczony jako 'unchanged' ale nie istnieje lokalnie - pobieranie: {fileName}");
                    return await DownloadFileAsync(syncItem, localFilePath);
                }
            }

            if (!CanDownloadToClient(syncDirection)) {
                OnSyncStatusChanged?.Invoke($"Bez zmian: {fileName}");
                return true;
            }

            try {
                var localContent = File.ReadAllBytes(localFilePath);
                var localHash = CalculateFileHash(localContent);

                if (localHash != syncItem.hash) {
                    OnSyncStatusChanged?.Invoke($"Plik 'unchanged' ma inny hash - aktualizowanie: {fileName}");
                    return await DownloadFileAsync(syncItem, localFilePath);
                }

                OnSyncStatusChanged?.Invoke($"Bez zmian: {fileName} (plik identyczny)");
                return true;
            } catch (Exception ex) {
                OnSyncStatusChanged?.Invoke($"Błąd sprawdzania hash pliku {fileName}: {ex.Message} - pobieranie ponownie");
                return await DownloadFileAsync(syncItem, localFilePath);
            }
        }

        private async Task<bool> DeleteFileOnServerAsync(string fileId) {
            try {
                if (string.IsNullOrEmpty(fileId)) {
                    OnSyncStatusChanged?.Invoke("Błąd - brak ID pliku do usunięcia");
                    return false;
                }

                // Potwierdź usunięcie pliku na serwerze
                var response = await _apiClient.ConfirmFileDeletedAsync(fileId, _clientId);

                if (response.success) {
                    OnSyncStatusChanged?.Invoke($"Plik został usunięty na serwerze (ID: {fileId})");
                    return true;
                } else {
                    OnSyncStatusChanged?.Invoke($"Błąd usuwania pliku na serwerze (ID: {fileId}): {response.message}");
                    return false;
                }
            } catch (Exception ex) {
                OnSyncStatusChanged?.Invoke($"Błąd podczas usuwania pliku na serwerze (ID: {fileId}): {ex.Message}");
                return false;
            }
        }

        private async Task ScanAndUploadNewLocalFilesAsync(SyncFolderInfo syncFolder, List<CompletedOperation> completedOperations) {
            try {
                if (!Directory.Exists(syncFolder.LocalPath)) return;

                OnSyncStatusChanged?.Invoke("Skanowanie nowych plików lokalnych...");
                var localFiles = Directory.GetFiles(syncFolder.LocalPath, "*", SearchOption.AllDirectories);

                foreach (var localFilePath in localFiles) {
                    try {
                        await ProcessLocalFileAsync(localFilePath, syncFolder, completedOperations);
                    } catch (Exception ex) {
                        OnSyncStatusChanged?.Invoke($"Błąd przetwarzania pliku {localFilePath}: {ex.Message}");
                    }
                }
            } catch (Exception ex) {
                OnSyncError?.Invoke("Błąd skanowania lokalnych plików", ex);
            }
        }

        private async Task ProcessLocalFileAsync(string localFilePath, SyncFolderInfo syncFolder, List<CompletedOperation> completedOperations) {
            var fileName = Path.GetFileName(localFilePath);
            var relativePath = GetRelativePath(syncFolder.LocalPath, localFilePath);

            OnSyncStatusChanged?.Invoke($"Sprawdzanie pliku: {fileName} (relativePath: {relativePath})");

            try {
                var localFileContent = File.ReadAllBytes(localFilePath);
                var localFileHash = CalculateFileHash(localFileContent);

                var checkRequest = new CheckFileExistsRequest {
                    clientFileId = relativePath,
                    fileName = fileName,
                    fileHash = localFileHash
                };

                var existsResponse = await _apiClient.CheckFileExistsAsync(syncFolder.FolderId, _clientId, checkRequest);

                OnSyncStatusChanged?.Invoke($"Plik {fileName} istnieje na serwerze: {existsResponse.exists}");

                if (!existsResponse.exists) {
                    await UploadNewFile(localFilePath, syncFolder.FolderId, relativePath, completedOperations, fileName);
                } else if (existsResponse.file?.hash != localFileHash) {
                    await UpdateExistingFile(localFilePath, existsResponse.file, relativePath, completedOperations, fileName, syncFolder.FolderId);
                } else {
                    OnSyncStatusChanged?.Invoke($"Plik {fileName} jest identyczny - pomijanie");
                }
            } catch (Exception ex) {
                OnSyncStatusChanged?.Invoke($"Błąd przetwarzania pliku {fileName}: {ex.Message}");
                completedOperations.Add(new CompletedOperation {
                    fileId = fileName,
                    operation = "error",
                    success = false,
                    error = ex.Message
                });
            }
        }

        private async Task UploadNewFile(string localFilePath, string folderId, string relativePath, List<CompletedOperation> completedOperations, string fileName) {
            System.Diagnostics.Debug.WriteLine($"DEBUG: Przesyłanie nowego pliku: {fileName} do folderu: {folderId}");
            System.Diagnostics.Debug.WriteLine($"DEBUG: localFilePath: {localFilePath}");
            System.Diagnostics.Debug.WriteLine($"DEBUG: relativePath: {relativePath}");

            try {
                // Sprawdź czy plik istnieje
                if (!File.Exists(localFilePath)) {
                    System.Diagnostics.Debug.WriteLine($"BŁĄD: Plik nie istnieje: {localFilePath}");
                    completedOperations.Add(new CompletedOperation {
                        fileId = relativePath,
                        operation = "upload-new",
                        success = false,
                        error = "Plik nie istnieje"
                    });
                    return;
                }

                // Sprawdź czy folderId nie jest pusty
                if (string.IsNullOrEmpty(folderId)) {
                    System.Diagnostics.Debug.WriteLine($"BŁĄD: Brak ID folderu dla pliku {fileName}");
                    completedOperations.Add(new CompletedOperation {
                        fileId = relativePath,
                        operation = "upload-new",
                        success = false,
                        error = "Brak ID folderu"
                    });
                    return;
                }

                // Odczytaj plik i wygeneruj hash
                var fileContent = File.ReadAllBytes(localFilePath);
                var fileHash = CalculateFileHash(fileContent);
                var lastModified = File.GetLastWriteTime(localFilePath);

                System.Diagnostics.Debug.WriteLine($"DEBUG: Zawartość pliku - rozmiar: {fileContent.Length} bajtów, hash: {fileHash}");

                // Przygotuj żądanie uploadu
                var uploadRequest = new UploadFileRequest {
                    name = fileName,
                    content = Convert.ToBase64String(fileContent),
                    hash = fileHash,
                    clientFileId = relativePath,
                    clientLastModified = lastModified
                };

                // Dodatkowe debugowanie przed wysłaniem
                System.Diagnostics.Debug.WriteLine($"DEBUG: Upload request prepared - name: '{uploadRequest.name}', clientFileId: '{uploadRequest.clientFileId}', hash: '{uploadRequest.hash}', content length: {uploadRequest.content?.Length ?? 0}");

                // Sprawdź czy wszystkie wymagane pola są niepuste
                if (string.IsNullOrEmpty(uploadRequest.name) ||
                uploadRequest.content == null ||  // Zmieniono z string.IsNullOrEmpty na == null
                string.IsNullOrEmpty(uploadRequest.hash) ||
                string.IsNullOrEmpty(uploadRequest.clientFileId)) {
                    System.Diagnostics.Debug.WriteLine($"BŁĄD: Puste wymagane pola - name: '{uploadRequest.name}', content: {(uploadRequest.content == null ? "NULL" : "OK")}, hash: '{uploadRequest.hash}', clientFileId: '{uploadRequest.clientFileId}'");

                    completedOperations.Add(new CompletedOperation {
                        fileId = relativePath,
                        operation = "upload-new",
                        success = false,
                        error = "Puste wymagane pola"
                    });
                    return;
                }

                System.Diagnostics.Debug.WriteLine($"DEBUG: Wysyłanie żądania uploadu dla pliku {fileName}...");

                // WYKONAJ RZECZYWISTY UPLOAD
                var response = await _apiClient.UploadFileFromClientAsync(folderId, _clientId, uploadRequest);

                System.Diagnostics.Debug.WriteLine($"DEBUG: Odpowiedź serwera otrzymana - success: {response?.success}, message: '{response?.message}'");

                bool success = response?.success ?? false;

                completedOperations.Add(new CompletedOperation {
                    fileId = success ? (response?.message ?? relativePath) : relativePath, // Może serwer zwraca ID w message
                    operation = "upload-new",
                    success = success,
                    error = success ? null : (response?.message ?? "Nieznany błąd podczas uploadu")
                });

                OnSyncStatusChanged?.Invoke($"Upload {fileName}: {(success ? "SUKCES" : "BŁĄD")}");

                if (!success) {
                    OnSyncStatusChanged?.Invoke($"Szczegóły błędu uploadu: {response?.message ?? "Brak szczegółów"}");
                }
            } catch (Exception ex) {
                System.Diagnostics.Debug.WriteLine($"WYJĄTEK podczas uploadu pliku {fileName}: {ex.GetType().Name} - {ex.Message}");
                System.Diagnostics.Debug.WriteLine($"Stack trace: {ex.StackTrace}");

                completedOperations.Add(new CompletedOperation {
                    fileId = relativePath,
                    operation = "upload-new",
                    success = false,
                    error = ex.Message
                });
            }
        }

        private async Task UpdateExistingFile(string localFilePath, FileExistsFileInfo existingFile, string relativePath, List<CompletedOperation> completedOperations, string fileName, string folderId) {
            if (!string.IsNullOrEmpty(existingFile?.fileId)) {
                OnSyncStatusChanged?.Invoke($"Aktualizowanie pliku: {fileName} (ID: {existingFile.fileId})");
                var success = await UpdateExistingFileAsync(localFilePath, existingFile.fileId, relativePath);

                completedOperations.Add(new CompletedOperation {
                    fileId = existingFile.fileId,
                    operation = "update-from-client",
                    success = success,
                    error = success ? null : "Błąd aktualizacji pliku"
                });

                OnSyncStatusChanged?.Invoke($"Update {fileName}: {(success ? "SUKCES" : "BŁĄD")}");
            } else {
                // Jeśli nie ma fileId, traktuj jako nowy plik
                OnSyncStatusChanged?.Invoke($"Brak fileId dla {fileName} - traktuję jako nowy plik");
                await UploadNewFile(localFilePath, folderId, relativePath, completedOperations, fileName);
            }
        }

        private async Task<bool> DownloadFileAsync(SyncDataItem syncItem, string localPath) {
            try {
                OnSyncStatusChanged?.Invoke($"Rozpoczynam pobieranie pliku: {syncItem.originalName} (ID: {syncItem.fileId})");

                if (string.IsNullOrEmpty(syncItem.fileId)) {
                    OnSyncStatusChanged?.Invoke($"Błąd - brak ID pliku dla {syncItem.originalName}");
                    return false;
                }

                var downloadResponse = await _apiClient.GetFileForDownloadAsync(syncItem.fileId, _clientId);

                if (!downloadResponse.success || string.IsNullOrEmpty(downloadResponse.content)) {
                    OnSyncStatusChanged?.Invoke($"Błąd pobierania pliku {syncItem.originalName}");
                    return false;
                }

                var fileContent = Convert.FromBase64String(downloadResponse.content);

                CreateDirectoryIfNotExists(localPath);
                File.WriteAllBytes(localPath, fileContent);

                if (syncItem.lastModified != default) {
                    File.SetLastWriteTime(localPath, syncItem.lastModified);
                }

                await ConfirmFileDownloaded(syncItem, localPath);
                OnSyncStatusChanged?.Invoke($"Pobrano plik: {syncItem.originalName}");
                return true;
            } catch (Exception ex) {
                OnSyncStatusChanged?.Invoke($"Błąd pobierania {syncItem.originalName}: {ex.Message}");
                return false;
            }
        }

        private async Task ConfirmFileDownloaded(SyncDataItem syncItem, string localPath) {
            try {
                var clientFileInfo = new ClientFileInfo {
                    clientFileId = Path.GetFileName(localPath),
                    clientFileName = Path.GetFileName(localPath),
                    clientPath = localPath,
                    clientLastModified = File.GetLastWriteTime(localPath)
                };

                await _apiClient.ConfirmFileDownloadedAsync(syncItem.fileId, _clientId, clientFileInfo);
            } catch (Exception ex) {
                OnSyncStatusChanged?.Invoke($"Błąd potwierdzenia pobrania {syncItem.originalName}: {ex.Message}");
            }
        }

        private bool DeleteLocalFile(string localPath) {
            try {
                if (File.Exists(localPath)) {
                    File.Delete(localPath);
                    OnSyncStatusChanged?.Invoke($"Usunięto lokalny plik: {localPath}");
                } else {
                    OnSyncStatusChanged?.Invoke($"Plik do usunięcia nie istnieje: {localPath}");
                }
                return true;
            } catch (Exception ex) {
                OnSyncStatusChanged?.Invoke($"Błąd usuwania pliku {localPath}: {ex.Message}");
                return false;
            }
        }

        private async Task<bool> UpdateExistingFileAsync(string localFilePath, string fileId, string relativePath) {
            try {
                if (string.IsNullOrEmpty(fileId)) return false;

                var fileContent = File.ReadAllBytes(localFilePath);
                var updateRequest = new UpdateFileRequest {
                    content = Convert.ToBase64String(fileContent),
                    hash = CalculateFileHash(fileContent),
                    clientFileId = relativePath,
                    clientLastModified = File.GetLastWriteTime(localFilePath)
                };

                var response = await _apiClient.UpdateFileFromClientAsync(fileId, _clientId, updateRequest);
                return response.success;
            } catch {
                return false;
            }
        }

        // Helper methods
        private string GetLocalFilePath(SyncDataItem syncItem, string basePath) {
            // Użyj clientPath jeśli jest dostępny
            if (!string.IsNullOrEmpty(syncItem.clientPath)) {
                // Jeśli clientPath to już pełna ścieżka, użyj jej bezpośrednio
                if (Path.IsPathRooted(syncItem.clientPath)) {
                    return syncItem.clientPath;
                }
                // W przeciwnym razie połącz z basePath
                return Path.Combine(basePath, syncItem.clientPath);
            }

            // Pobierz nazwę pliku i połącz z basePath
            var fileName = GetFileName(syncItem);
            return Path.Combine(basePath, fileName);
        }


        private string GetFileName(SyncDataItem syncItem) {
            // Sprawdź clientFileName najpierw
            if (!string.IsNullOrEmpty(syncItem.clientFileName)) {
                return syncItem.clientFileName;
            }

            // Jeśli clientPath jest dostępny, wyciągnij z niego nazwę pliku
            if (!string.IsNullOrEmpty(syncItem.clientPath)) {
                return Path.GetFileName(syncItem.clientPath);
            }

            // Dla operacji deleted może nie być zagnieżdżonego obiektu file
            // Sprawdź originalName tylko jeśli obiekt file istnieje
            if (syncItem.file != null && !string.IsNullOrEmpty(syncItem.file.originalName)) {
                return syncItem.file.originalName;
            }

            // Jeśli wszystko inne zawiedzie, zwróć placeholder
            return $"file_{syncItem.fileId}";
        }

        private bool CanDownloadToClient(string syncDirection) {
            return syncDirection == "bidirectional" || syncDirection == "to-client";
        }

        private bool CanUploadFromClient(string syncDirection) {
            return syncDirection == "bidirectional" || syncDirection == "from-client";
        }

        private bool LogSkipAndReturnTrue(string message) {
            OnSyncStatusChanged?.Invoke(message);
            return true;
        }

        private void CreateDirectoryIfNotExists(string filePath) {
            var directory = Path.GetDirectoryName(filePath);
            if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory)) {
                Directory.CreateDirectory(directory);
            }
        }

        private string GetRelativePath(string basePath, string fullPath) {
            if (string.IsNullOrEmpty(basePath) || string.IsNullOrEmpty(fullPath)) {
                return Path.GetFileName(fullPath);
            }

            var baseUri = new Uri(basePath.EndsWith("\\") ? basePath : basePath + "\\");
            var fullUri = new Uri(fullPath);

            return baseUri.IsBaseOf(fullUri)
                ? Uri.UnescapeDataString(baseUri.MakeRelativeUri(fullUri).ToString().Replace('/', '\\'))
                : Path.GetFileName(fullPath);
        }

        private string CalculateFileHash(byte[] fileContent) {
            using (var md5 = MD5.Create()) {
                var hashBytes = md5.ComputeHash(fileContent);
                return BitConverter.ToString(hashBytes).Replace("-", "").ToLowerInvariant();
            }
        }

        public void Dispose() {
            StopAutoSync();
        }

        private class SyncFolderInfo {
            public string FolderId { get; set; }
            public string LocalPath { get; set; }
            public string SyncDirection { get; set; }
            public string SyncId { get; set; }
        }
    }
}