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

        private async Task SyncFolderAsync(SyncFolderInfo syncFolder) {
            try {
                OnSyncStatusChanged?.Invoke($"Synchronizowanie: {syncFolder.LocalPath}");

                // KROK 1: GetSyncDataAsync - pobierz dane synchronizacji z serwera
                var syncData = await _apiClient.GetSyncDataAsync(syncFolder.FolderId, _clientId);
                OnSyncStatusChanged?.Invoke($"Dane synchronizacji pobrane - {syncData.syncData?.Count ?? 0} operacji na serwerze");

                // Przygotuj mapę plików z serwera dla łatwiejszego odnajdywania
                var serverFiles = new Dictionary<string, SyncDataItem>();
                if (syncData.syncData != null) {
                    foreach (var item in syncData.syncData) {
                        var key = !string.IsNullOrEmpty(item.clientFileId) ? item.clientFileId : item.file?.originalName;
                        if (!string.IsNullOrEmpty(key)) {
                            serverFiles[key] = item;
                        }
                    }
                }

                // Pobierz listę wszystkich lokalnych plików
                var localFiles = GetAllLocalFiles(syncFolder.LocalPath);
                OnSyncStatusChanged?.Invoke($"Znaleziono {localFiles.Count} plików lokalnych");

                // KROK 2: Wykonanie operacji dla każdego pliku
                var processedFiles = new HashSet<string>();

                // 2a) Przetwórz pliki z serwera
                if (syncData.syncData != null) {
                    foreach (var syncItem in syncData.syncData) {
                        await ProcessServerFileAsync(syncItem, syncFolder);

                        // Oznacz plik jako przetworzony
                        var key = !string.IsNullOrEmpty(syncItem.clientFileId) ? syncItem.clientFileId : syncItem.file?.originalName;
                        if (!string.IsNullOrEmpty(key)) {
                            processedFiles.Add(key);
                        }
                    }
                }

                // 2b) Przetwórz lokalne pliki, które nie były na serwerze
                foreach (var localFile in localFiles) {
                    var relativePath = GetRelativePath(syncFolder.LocalPath, localFile.FullPath);

                    if (!processedFiles.Contains(relativePath) && !processedFiles.Contains(localFile.Name)) {
                        await ProcessLocalOnlyFileAsync(localFile, syncFolder, serverFiles);
                    }
                }

                // KROK 3: ConfirmSyncCompletedAsync - finalne potwierdzenie
                OnSyncStatusChanged?.Invoke("Potwierdzanie zakończenia synchronizacji...");
                var confirmResponse = await _apiClient.ConfirmSyncCompletedAsync(syncFolder.FolderId, _clientId);

                if (confirmResponse.success) {
                    OnSyncStatusChanged?.Invoke($"Synchronizacja zakończona pomyślnie. Wykonano {confirmResponse.totalOperations} operacji.");
                } else {
                    OnSyncStatusChanged?.Invoke($"Ostrzeżenie przy potwierdzaniu: {confirmResponse.message}");
                }

            } catch (Exception ex) {
                OnSyncError?.Invoke($"Błąd synchronizacji folderu {syncFolder.LocalPath}", ex);
            }
        }

        private async Task ProcessServerFileAsync(SyncDataItem syncItem, SyncFolderInfo syncFolder) {
            var fileName = GetFileName(syncItem);
            var localPath = GetLocalFilePath(syncItem, syncFolder.LocalPath);

            OnSyncStatusChanged?.Invoke($"Przetwarzanie pliku z serwera: {fileName} (operacja: {syncItem.operation})");

            try {
                // DODANE: Sprawdź czy plik nie jest oznaczony jako usunięty na serwerze
                if (syncItem.file?.isDeleted == true && syncItem.operation.ToLower() != "deleted") {
                    OnSyncStatusChanged?.Invoke($"Pomijanie usuniętego pliku z serwera: {fileName}");
                    return;
                }

                switch (syncItem.operation.ToLower()) {
                    case "added":
                        // DODANE: Dodatkowe sprawdzenie dla operacji "added"
                        if (syncItem.file?.isDeleted == true) {
                            OnSyncStatusChanged?.Invoke($"Pomijanie dodania usuniętego pliku: {fileName}");
                            return;
                        }
                        await HandleServerFileAdded(syncItem, localPath, syncFolder.SyncDirection);
                        break;

                    case "modified":
                        await HandleServerFileModified(syncItem, localPath, syncFolder.SyncDirection);
                        break;

                    case "deleted":
                    case "deleted_from_server":  // DODANE: Obsługa dodatkowego typu operacji
                        await HandleServerFileDeleted(syncItem, localPath, syncFolder.SyncDirection);
                        break;

                    case "unchanged":
                        await HandleServerFileUnchanged(syncItem, localPath, syncFolder.SyncDirection);
                        break;

                    default:
                        OnSyncStatusChanged?.Invoke($"Nieznana operacja: {syncItem.operation} dla pliku {fileName}");
                        break;
                }
            } catch (Exception ex) {
                OnSyncStatusChanged?.Invoke($"Błąd przetwarzania pliku z serwera {fileName}: {ex.Message}");
            }
        }

        private async Task ProcessLocalOnlyFileAsync(LocalFileInfo localFile, SyncFolderInfo syncFolder, Dictionary<string, SyncDataItem> serverFiles) {
            if (!CanUploadFromClient(syncFolder.SyncDirection)) {
                return; // Nie można przesyłać z klienta
            }

            try {
                var relativePath = GetRelativePath(syncFolder.LocalPath, localFile.FullPath);
                OnSyncStatusChanged?.Invoke($"Przetwarzanie lokalnego pliku: {localFile.Name}");

                var fileContent = File.ReadAllBytes(localFile.FullPath);
                var fileHash = CalculateFileHash(fileContent);

                // Sprawdź czy plik istnieje na serwerze po nazwie i hashu
                var existingFile = await _apiClient.FindFileByNameAndHashAsync(syncFolder.FolderId, localFile.Name, fileHash);

                if (existingFile.exists) {
                    // Plik już istnieje na serwerze z tym samym hashem - potwierdź pobranie
                    OnSyncStatusChanged?.Invoke($"Plik {localFile.Name} już istnieje na serwerze - potwierdzanie");
                    await ConfirmLocalFileExists(existingFile.file._id, localFile, relativePath);
                    return;
                }

                // Sprawdź czy może istnieje plik o tej samej nazwie ale innym hashu
                var fileByClientId = await _apiClient.FindFileByClientIdAsync(_clientId, relativePath, syncFolder.FolderId);

                if (fileByClientId.exists) {
                    // Aktualizuj istniejący plik
                    OnSyncStatusChanged?.Invoke($"Aktualizowanie pliku na serwerze: {localFile.Name}");
                    await UpdateFileOnServer(fileByClientId.file._id, localFile.FullPath, relativePath);
                } else {
                    // Prześlij nowy plik
                    OnSyncStatusChanged?.Invoke($"Przesyłanie nowego pliku: {localFile.Name}");
                    await UploadNewFile(localFile.FullPath, syncFolder.FolderId, relativePath);
                }

            } catch (Exception ex) {
                OnSyncStatusChanged?.Invoke($"Błąd przetwarzania lokalnego pliku {localFile.Name}: {ex.Message}");
            }
        }

        // Obsługa operacji na plikach z serwera
        private async Task HandleServerFileAdded(SyncDataItem syncItem, string localPath, string syncDirection) {
            if (CanDownloadToClient(syncDirection)) {
                await DownloadFileFromServer(syncItem, localPath);
            }
        }

        private async Task HandleServerFileModified(SyncDataItem syncItem, string localPath, string syncDirection) {
            if (!File.Exists(localPath)) {
                // Plik nie istnieje lokalnie - pobierz go
                if (CanDownloadToClient(syncDirection)) {
                    await DownloadFileFromServer(syncItem, localPath);
                }
                return;
            }

            // Sprawdź czy lokalny plik się zmienił
            if (CanUploadFromClient(syncDirection)) {
                var localContent = File.ReadAllBytes(localPath);
                var localHash = CalculateFileHash(localContent);
                var localModified = File.GetLastWriteTime(localPath);

                // Porównaj z plikiem na serwerze
                bool serverIsNewer = syncItem.file?.lastModified > localModified;
                bool hashesMatch = localHash == syncItem.file?.fileHash;

                if (!hashesMatch) {
                    if (serverIsNewer) {
                        // Serwer jest nowszy - pobierz
                        if (CanDownloadToClient(syncDirection)) {
                            await DownloadFileFromServer(syncItem, localPath);
                        }
                    } else {
                        // Lokalny jest nowszy - wyślij
                        await UpdateFileOnServer(syncItem.fileId, localPath, syncItem.clientFileId);
                    }
                } else {
                    // Pliki są identyczne - potwierdź synchronizację
                    await ConfirmFileSync(syncItem.fileId, localPath, syncItem.clientFileId);
                }
            } else if (CanDownloadToClient(syncDirection)) {
                // Tylko pobieranie z serwera
                await DownloadFileFromServer(syncItem, localPath);
            }
        }

        private async Task HandleServerFileDeleted(SyncDataItem syncItem, string localPath, string syncDirection) {
            if (!File.Exists(localPath)) {
                // Plik już nie istnieje lokalnie - potwierdź usunięcie
                await _apiClient.ConfirmFileDeletedOnClientAsync(syncItem.fileId, _clientId);
                OnSyncStatusChanged?.Invoke($"Potwierdzono usunięcie pliku: {GetFileName(syncItem)}");
                return;
            }

            if (CanDownloadToClient(syncDirection)) {
                // Usuń lokalny plik
                DeleteLocalFile(localPath);
                await _apiClient.ConfirmFileDeletedOnClientAsync(syncItem.fileId, _clientId);
            } else if (CanUploadFromClient(syncDirection)) {
                // Lokalny plik istnieje, ale serwer go usunął - prześlij ponownie
                OnSyncStatusChanged?.Invoke($"Plik usunięty na serwerze, ale istnieje lokalnie - przesyłanie: {GetFileName(syncItem)}");
                // Tu możemy zdecydować czy przesłać plik ponownie, czy go usunąć lokalnie
                // Na razie przesyłamy ponownie
                await UploadNewFile(localPath, syncItem.file?._id, syncItem.clientFileId);
            }
        }

        private async Task HandleServerFileUnchanged(SyncDataItem syncItem, string localPath, string syncDirection) {
            if (!File.Exists(localPath)) {
                if (CanUploadFromClient(syncDirection)) {
                    // Plik usunięty lokalnie - usuń na serwerze
                    OnSyncStatusChanged?.Invoke($"Plik usunięty lokalnie - usuwanie na serwerze: {GetFileName(syncItem)}");
                    await _apiClient.DeleteFileFromServerAsync(syncItem.fileId, _clientId);
                } else if (CanDownloadToClient(syncDirection)) {
                    // Plik nie istnieje lokalnie - pobierz z serwera
                    OnSyncStatusChanged?.Invoke($"Plik nie istnieje lokalnie - pobieranie: {GetFileName(syncItem)}");
                    await DownloadFileFromServer(syncItem, localPath);
                }
                return;
            }

            // Sprawdź czy lokalny plik się zmienił
            if (CanUploadFromClient(syncDirection)) {
                var localContent = File.ReadAllBytes(localPath);
                var localHash = CalculateFileHash(localContent);

                if (localHash != syncItem.file?.fileHash) {
                    OnSyncStatusChanged?.Invoke($"Plik zmieniony lokalnie - aktualizowanie na serwerze: {GetFileName(syncItem)}");
                    await UpdateFileOnServer(syncItem.fileId, localPath, syncItem.clientFileId);
                } else {
                    // Pliki są identyczne - potwierdź synchronizację
                    await ConfirmFileSync(syncItem.fileId, localPath, syncItem.clientFileId);
                }
            }
        }

        // Metody wykonujące operacje API
        private async Task DownloadFileFromServer(SyncDataItem syncItem, string localPath) {
            try {
                var fileName = GetFileName(syncItem);
                OnSyncStatusChanged?.Invoke($"Pobieranie: {fileName}");

                var downloadResponse = await _apiClient.DownloadFileFromServerAsync(syncItem.fileId, _clientId);

                if (!downloadResponse.success) {
                    OnSyncStatusChanged?.Invoke($"Błąd pobierania {fileName}: {downloadResponse.file?.originalName ?? "nieznany błąd"}");
                    return;
                }

                var fileContent = Convert.FromBase64String(downloadResponse.content);
                CreateDirectoryIfNotExists(localPath);
                File.WriteAllBytes(localPath, fileContent);

                // Ustaw datę modyfikacji
                if (syncItem.file?.lastModified != default) {
                    File.SetLastWriteTime(localPath, syncItem.file.lastModified);
                }

                // Potwierdź pobranie
                var clientFileInfo = new ClientFileInfo {
                    clientFileId = syncItem.clientFileId ?? GetRelativePath(Path.GetDirectoryName(localPath), localPath),
                    clientFileName = Path.GetFileName(localPath),
                    clientPath = localPath,
                    clientLastModified = File.GetLastWriteTime(localPath)
                };

                await _apiClient.ConfirmFileDownloadedAsync(syncItem.fileId, _clientId, clientFileInfo);
                OnSyncStatusChanged?.Invoke($"Pobrano: {fileName}");

            } catch (Exception ex) {
                OnSyncStatusChanged?.Invoke($"Błąd pobierania {GetFileName(syncItem)}: {ex.Message}");
            }
        }

        private async Task UploadNewFile(string filePath, string folderId, string relativePath) {
            try {
                var fileName = Path.GetFileName(filePath);
                var fileContent = File.ReadAllBytes(filePath);
                var fileHash = CalculateFileHash(fileContent);

                var uploadRequest = new UploadFileRequest {
                    name = fileName,
                    content = Convert.ToBase64String(fileContent),
                    hash = fileHash,
                    clientFileId = relativePath,
                    clientLastModified = File.GetLastWriteTime(filePath)
                };

                var response = await _apiClient.UploadNewFileToServerAsync(folderId, _clientId, uploadRequest);

                if (response.success) {
                    OnSyncStatusChanged?.Invoke($"Przesłano: {fileName}");
                } else {
                    OnSyncStatusChanged?.Invoke($"Błąd przesyłania {fileName}: {response.message}");
                }

            } catch (Exception ex) {
                OnSyncStatusChanged?.Invoke($"Błąd przesyłania {Path.GetFileName(filePath)}: {ex.Message}");
            }
        }

        private async Task UpdateFileOnServer(string fileId, string filePath, string clientFileId) {
            try {
                var fileName = Path.GetFileName(filePath);
                var fileContent = File.ReadAllBytes(filePath);
                var fileHash = CalculateFileHash(fileContent);

                var updateRequest = new UpdateFileRequest {
                    content = Convert.ToBase64String(fileContent),
                    hash = fileHash,
                    clientFileId = clientFileId,
                    clientLastModified = File.GetLastWriteTime(filePath)
                };

                var response = await _apiClient.UpdateExistingFileOnServerAsync(fileId, _clientId, updateRequest);

                if (response.success) {
                    OnSyncStatusChanged?.Invoke($"Zaktualizowano: {fileName}");
                } else {
                    OnSyncStatusChanged?.Invoke($"Błąd aktualizacji {fileName}: {response.message}");
                }

            } catch (Exception ex) {
                OnSyncStatusChanged?.Invoke($"Błąd aktualizacji {Path.GetFileName(filePath)}: {ex.Message}");
            }
        }

        private async Task ConfirmLocalFileExists(string fileId, LocalFileInfo localFile, string relativePath) {
            try {
                var clientFileInfo = new ClientFileInfo {
                    clientFileId = relativePath,
                    clientFileName = localFile.Name,
                    clientPath = localFile.FullPath,
                    clientLastModified = File.GetLastWriteTime(localFile.FullPath)
                };

                await _apiClient.ConfirmFileDownloadedAsync(fileId, _clientId, clientFileInfo);
                OnSyncStatusChanged?.Invoke($"Potwierdzono istnienie pliku: {localFile.Name}");

            } catch (Exception ex) {
                OnSyncStatusChanged?.Invoke($"Błąd potwierdzania pliku {localFile.Name}: {ex.Message}");
            }
        }

        private async Task ConfirmFileSync(string fileId, string filePath, string clientFileId) {
            try {
                var clientFileInfo = new ClientFileInfo {
                    clientFileId = clientFileId,
                    clientFileName = Path.GetFileName(filePath),
                    clientPath = filePath,
                    clientLastModified = File.GetLastWriteTime(filePath)
                };

                await _apiClient.ConfirmFileDownloadedAsync(fileId, _clientId, clientFileInfo);

            } catch (Exception ex) {
                OnSyncStatusChanged?.Invoke($"Błąd potwierdzania synchronizacji {Path.GetFileName(filePath)}: {ex.Message}");
            }
        }

        private void DeleteLocalFile(string filePath) {
            try {
                if (File.Exists(filePath)) {
                    File.Delete(filePath);
                    OnSyncStatusChanged?.Invoke($"Usunięto: {Path.GetFileName(filePath)}");
                }
            } catch (Exception ex) {
                OnSyncStatusChanged?.Invoke($"Błąd usuwania {Path.GetFileName(filePath)}: {ex.Message}");
            }
        }

        // Metody pomocnicze
        private List<LocalFileInfo> GetAllLocalFiles(string folderPath) {
            var files = new List<LocalFileInfo>();

            if (!Directory.Exists(folderPath)) {
                return files;
            }

            try {
                var filePaths = Directory.GetFiles(folderPath, "*", SearchOption.AllDirectories);
                foreach (var filePath in filePaths) {
                    files.Add(new LocalFileInfo {
                        FullPath = filePath,
                        Name = Path.GetFileName(filePath),
                        LastModified = File.GetLastWriteTime(filePath)
                    });
                }
            } catch (Exception ex) {
                OnSyncStatusChanged?.Invoke($"Błąd skanowania lokalnych plików: {ex.Message}");
            }

            return files;
        }

        private async Task<List<SyncFolderInfo>> GetActiveSyncFoldersAsync() {
            var folders = await _apiClient.GetFoldersAsync();
            var syncFolders = new List<SyncFolderInfo>();

            foreach (var folder in folders) {
                try {
                    var syncInfo = await _apiClient.GetSyncFolderInfoAsync(folder._id);
                    var clientSync = syncInfo.syncFolder?.clients?.FirstOrDefault(c => c.clientId == _clientId && c.isActive);

                    if (clientSync != null) {
                        syncFolders.Add(new SyncFolderInfo {
                            FolderId = folder._id,
                            LocalPath = clientSync.clientFolderPath,
                            SyncDirection = clientSync.syncDirection
                        });
                    }
                } catch (Exception ex) {
                    OnSyncStatusChanged?.Invoke($"Błąd sprawdzania folderu {folder.name}: {ex.Message}");
                }
            }

            return syncFolders;
        }

        private async Task<SyncFolderInfo> GetSyncFolderInfoAsync(string folderId) {
            try {
                var syncInfo = await _apiClient.GetSyncFolderInfoAsync(folderId);
                var clientSync = syncInfo.syncFolder?.clients?.FirstOrDefault(c => c.clientId == _clientId && c.isActive);

                return clientSync != null ? new SyncFolderInfo {
                    FolderId = folderId,
                    LocalPath = clientSync.clientFolderPath,
                    SyncDirection = clientSync.syncDirection
                } : null;
            } catch {
                return null;
            }
        }

        // Pozostałe metody pomocnicze pozostają bez zmian
        private string GetFileName(SyncDataItem syncItem) {
            return !string.IsNullOrEmpty(syncItem.clientFileName) ? syncItem.clientFileName :
                   !string.IsNullOrEmpty(syncItem.clientPath) ? Path.GetFileName(syncItem.clientPath) :
                   syncItem.file?.originalName ?? $"file_{syncItem.fileId}";
        }

        private string GetLocalFilePath(SyncDataItem syncItem, string basePath) {
            if (!string.IsNullOrEmpty(syncItem.clientPath)) {
                return Path.IsPathRooted(syncItem.clientPath) ? syncItem.clientPath : Path.Combine(basePath, syncItem.clientPath);
            }
            return Path.Combine(basePath, GetFileName(syncItem));
        }

        private bool CanDownloadToClient(string syncDirection) {
            return syncDirection == "bidirectional" || syncDirection == "to-client";
        }

        private bool CanUploadFromClient(string syncDirection) {
            return syncDirection == "bidirectional" || syncDirection == "from-client";
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

        // Klasy pomocnicze
        private class SyncFolderInfo {
            public string FolderId { get; set; }
            public string LocalPath { get; set; }
            public string SyncDirection { get; set; }
        }

        private class LocalFileInfo {
            public string FullPath { get; set; }
            public string Name { get; set; }
            public DateTime LastModified { get; set; }
        }
    }
}