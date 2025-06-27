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

        private int _currentIntervalMinutes = 5;

        public SyncService(ApiClient apiClient, string clientId) {
            _apiClient = apiClient;
            _clientId = clientId;
        }

        public void StartAutoSync(int intervalMinutes = 5) {
            _currentIntervalMinutes = intervalMinutes;
            StopAutoSync(); // Zatrzymaj istniejący timer

            _syncTimer = new System.Timers.Timer(intervalMinutes * 60 * 1000);
            _syncTimer.Elapsed += async (sender, e) => await PerformSyncAsync();
            _syncTimer.AutoReset = true;
            _syncTimer.Enabled = true;

            OnSyncStatusChanged?.Invoke($"Automatyczna synchronizacja uruchomiona (co {intervalMinutes} min)");
        }

        public void UpdateSyncInterval(int intervalMinutes) {
            if (intervalMinutes < 1) {
                throw new ArgumentException("Interwał musi wynosić co najmniej 1 minutę");
            }

            _currentIntervalMinutes = intervalMinutes;

            // Jeśli timer jest aktywny, uruchom go ponownie z nowym interwałem
            if (_syncTimer != null && _syncTimer.Enabled) {
                StartAutoSync(intervalMinutes);
            }

            OnSyncStatusChanged?.Invoke($"Interwał synchronizacji zmieniony na {intervalMinutes} min");
        }

        public int GetCurrentSyncInterval() {
            return _currentIntervalMinutes;
        }

        public bool IsAutoSyncRunning {
            get { return _syncTimer != null && _syncTimer.Enabled; }
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
                var processedFileIds = new HashSet<string>(); // NOWE: Śledzenie przetworzonych fileId

                // 2a) Przetwórz pliki z serwera
                if (syncData.syncData != null) {
                    foreach (var syncItem in syncData.syncData) {
                        // SPRAWDŹ CZY PLIK JUŻ ZOSTAŁ PRZETWORZONY
                        if (processedFileIds.Contains(syncItem.fileId)) {
                            OnSyncStatusChanged?.Invoke($"Plik {GetFileName(syncItem)} już przetworzony (fileId: {syncItem.fileId}) - pomijanie operacji {syncItem.operation}");
                            continue;
                        }

                        await ProcessServerFileAsync(syncItem, syncFolder);

                        // Oznacz plik jako przetworzony (zarówno po kluczu jak i po fileId)
                        var key = !string.IsNullOrEmpty(syncItem.clientFileId) ? syncItem.clientFileId : syncItem.file?.originalName;
                        if (!string.IsNullOrEmpty(key)) {
                            processedFiles.Add(key);
                        }
                        processedFileIds.Add(syncItem.fileId); // NOWE: Dodaj fileId do przetworzonych
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

            // DEBUG: Wypisz szczegółowe informacje o pliku
            Console.WriteLine($"[DEBUG] ProcessServerFileAsync:");
            Console.WriteLine($"  - Plik: {fileName}");
            Console.WriteLine($"  - Operacja: {syncItem.operation}");
            Console.WriteLine($"  - FileId: {syncItem.fileId}");
            Console.WriteLine($"  - Lokalny plik istnieje: {File.Exists(localPath)}");
            Console.WriteLine($"  - syncItem.file?.isDeleted: {syncItem.file?.isDeleted}");
            Console.WriteLine($"  - Kierunek synchronizacji: {syncFolder.SyncDirection}");

            try {
                // Sprawdź czy to operacja usunięcia (niezależnie od isDeleted)
                bool isDeleteOperation = syncItem.operation.ToLower() == "deleted" ||
                                        syncItem.operation.ToLower() == "deleted_from_server";

                // Sprawdź czy plik jest oznaczony jako usunięty na serwerze (jeśli obiekt file istnieje)
                bool isMarkedAsDeleted = syncItem.file?.isDeleted == true;

                Console.WriteLine($"[DEBUG] Analiza usunięcia:");
                Console.WriteLine($"  - isDeleteOperation: {isDeleteOperation}");
                Console.WriteLine($"  - isMarkedAsDeleted: {isMarkedAsDeleted}");

                if (isDeleteOperation || isMarkedAsDeleted) {
                    Console.WriteLine($"[DEBUG] Wywołuję HandleFileDeleted dla pliku: {fileName}");
                    await HandleFileDeleted(syncItem, localPath, syncFolder);
                    return;
                }

                // TYLKO gdy plik NIE jest usunięty, przetwarzaj inne operacje
                switch (syncItem.operation.ToLower()) {
                    case "added":
                        Console.WriteLine($"[DEBUG] Obsługa operacji 'added' dla pliku: {fileName}");
                        await HandleServerFileAdded(syncItem, localPath, syncFolder.SyncDirection);
                        break;

                    case "modified":
                        Console.WriteLine($"[DEBUG] Obsługa operacji 'modified' dla pliku: {fileName}");
                        await HandleServerFileModified(syncItem, localPath, syncFolder.SyncDirection);
                        break;

                    case "unchanged":
                        Console.WriteLine($"[DEBUG] Obsługa operacji 'unchanged' dla pliku: {fileName}");
                        await HandleServerFileUnchanged(syncItem, localPath, syncFolder.SyncDirection);
                        break;

                    default:
                        Console.WriteLine($"[DEBUG] Nieznana operacja: {syncItem.operation} dla pliku {fileName}");
                        OnSyncStatusChanged?.Invoke($"Nieznana operacja: {syncItem.operation} dla pliku {fileName}");
                        break;
                }
            } catch (Exception ex) {
                Console.WriteLine($"[ERROR] Błąd przetwarzania pliku z serwera {fileName}: {ex.Message}");
                OnSyncStatusChanged?.Invoke($"Błąd przetwarzania pliku z serwera {fileName}: {ex.Message}");
            }
        }

        // Dodaj te metody pomocnicze do klasy SyncService
        private DateTime NormalizeToUtc(DateTime dateTime) {
            // Sprawdź czy DateTime ma informację o strefie czasowej
            if (dateTime.Kind == DateTimeKind.Utc) {
                return dateTime;
            } else if (dateTime.Kind == DateTimeKind.Local) {
                return dateTime.ToUniversalTime();
            } else {
                // DateTimeKind.Unspecified - załóż że to czas serwera (często UTC)
                // W niektórych przypadkach może być potrzebne dostosowanie tej logiki
                return DateTime.SpecifyKind(dateTime, DateTimeKind.Utc);
            }
        }

        // Opcjonalna metoda dla konfigurowalnej tolerancji czasowej
        private TimeSpan GetTimeTolerance() {
            // Można to zrobić konfigurowalne, np. z ustawień aplikacji
            return TimeSpan.FromSeconds(30); // Domyślnie 30 sekund
        }

        // Zamień metodę HandleFileDeleted na tę poprawioną wersję:
        private async Task HandleFileDeleted(SyncDataItem syncItem, string localPath, SyncFolderInfo syncFolder) {
            var fileName = GetFileName(syncItem);

            Console.WriteLine($"[DEBUG] HandleFileDeleted:");
            Console.WriteLine($"  - Plik: {fileName}");
            Console.WriteLine($"  - Lokalny plik istnieje: {File.Exists(localPath)}");
            Console.WriteLine($"  - Kierunek synchronizacji: {syncFolder.SyncDirection}");
            Console.WriteLine($"  - lastSyncDate: {syncItem.lastSyncDate}");

            if (!File.Exists(localPath)) {
                // Plik nie istnieje lokalnie - potwierdź usunięcie
                Console.WriteLine($"[DEBUG] Plik nie istnieje lokalnie - potwierdzam usunięcie: {fileName}");
                OnSyncStatusChanged?.Invoke($"Potwierdzanie usunięcia pliku nieistniejącego lokalnie: {fileName}");
                await _apiClient.ConfirmFileDeletedOnClientAsync(syncItem.fileId, _clientId);
                return;
            }

            // Plik istnieje lokalnie - sprawdź kierunek synchronizacji
            var localModified = File.GetLastWriteTime(localPath);

            // POPRAWKA: Normalizuj czasy do UTC przed porównaniem
            var localModifiedUtc = NormalizeToUtc(localModified);
            var serverDeletedTimeUtc = syncItem.lastSyncDate.HasValue ?
                NormalizeToUtc(syncItem.lastSyncDate.Value) : DateTime.MinValue;

            // Dodaj tolerancję czasową (np. 30 sekund) aby uniknąć problemów z drobnymi różnicami
            var timeTolerance = GetTimeTolerance();

            Console.WriteLine($"[DEBUG] Plik istnieje lokalnie - analiza czasów:");
            Console.WriteLine($"  - Data modyfikacji lokalnej (oryginalna): {localModified}");
            Console.WriteLine($"  - Data modyfikacji lokalnej (UTC): {localModifiedUtc}");
            Console.WriteLine($"  - Data ostatniej synchronizacji (oryginalna): {syncItem.lastSyncDate}");
            Console.WriteLine($"  - Data ostatniej synchronizacji (UTC): {serverDeletedTimeUtc}");
            Console.WriteLine($"  - Różnica czasowa: {localModifiedUtc - serverDeletedTimeUtc}");
            Console.WriteLine($"  - Tolerancja czasowa: {timeTolerance}");

            if (syncFolder.SyncDirection == "to-client") {
                // Synchronizacja tylko z serwera - usuń lokalny plik
                Console.WriteLine($"[DEBUG] Synchronizacja 'to-client' - usuwam lokalny plik: {fileName}");
                DeleteLocalFile(localPath);
                await _apiClient.ConfirmFileDeletedOnClientAsync(syncItem.fileId, _clientId);
                OnSyncStatusChanged?.Invoke($"Usunięto lokalny plik (synchronizacja jednokierunkowa z serwera): {fileName}");

            } else if (syncFolder.SyncDirection == "from-client") {
                // Synchronizacja tylko na serwer - prześlij plik ponownie
                Console.WriteLine($"[DEBUG] Synchronizacja 'from-client' - przesyłam plik ponownie: {fileName}");
                OnSyncStatusChanged?.Invoke($"Plik usunięty na serwerze, przesyłanie ponownie (synchronizacja jednokierunkowa na serwer): {fileName}");
                var relativePath = GetRelativePath(syncFolder.LocalPath, localPath);
                await UploadNewFile(localPath, syncFolder.FolderId, relativePath);

            } else if (syncFolder.SyncDirection == "bidirectional") {
                // Synchronizacja dwukierunkowa - strategia rozwiązywania konfliktów z tolerancją czasową
                var timeDifference = localModifiedUtc - serverDeletedTimeUtc;
                bool localIsSignificantlyNewer = timeDifference > timeTolerance;
                bool serverIsSignificantlyNewer = timeDifference < -timeTolerance;

                Console.WriteLine($"[DEBUG] Synchronizacja dwukierunkowa - analiza konfliktów:");
                Console.WriteLine($"  - Lokalny czas modyfikacji (UTC): {localModifiedUtc}");
                Console.WriteLine($"  - Czas usunięcia na serwerze (UTC): {serverDeletedTimeUtc}");
                Console.WriteLine($"  - Różnica czasowa: {timeDifference}");
                Console.WriteLine($"  - Lokalny znacząco nowszy: {localIsSignificantlyNewer}");
                Console.WriteLine($"  - Serwer znacząco nowszy: {serverIsSignificantlyNewer}");

                if (localIsSignificantlyNewer) {
                    // Lokalny plik był modyfikowany znacząco później niż usunięcie na serwerze - prześlij go
                    Console.WriteLine($"[DEBUG] Lokalny plik znacząco nowszy - przesyłam na serwer: {fileName}");
                    OnSyncStatusChanged?.Invoke($"Lokalny plik nowszy niż usunięcie na serwerze - przesyłanie: {fileName}");
                    var relativePath = GetRelativePath(syncFolder.LocalPath, localPath);
                    await UploadNewFile(localPath, syncFolder.FolderId, relativePath);
                } else if (serverIsSignificantlyNewer) {
                    // Plik został usunięty na serwerze znacząco później - usuń lokalnie
                    Console.WriteLine($"[DEBUG] Serwer znacząco nowszy - usuwam lokalny plik: {fileName}");
                    OnSyncStatusChanged?.Invoke($"Plik usunięty na serwerze po ostatniej modyfikacji lokalnej - usuwanie: {fileName}");
                    DeleteLocalFile(localPath);
                    await _apiClient.ConfirmFileDeletedOnClientAsync(syncItem.fileId, _clientId);
                } else {
                    // Czasy są bardzo zbliżone - preferuj operację serwera (usunięcie)
                    Console.WriteLine($"[DEBUG] Czasy zbliżone (w tolerancji {timeTolerance}) - preferuję operację serwera (usunięcie): {fileName}");
                    OnSyncStatusChanged?.Invoke($"Czasy modyfikacji zbliżone - preferowanie operacji serwera (usunięcie): {fileName}");
                    DeleteLocalFile(localPath);
                    await _apiClient.ConfirmFileDeletedOnClientAsync(syncItem.fileId, _clientId);
                }
            } else {
                Console.WriteLine($"[DEBUG] Nieznany kierunek synchronizacji: {syncFolder.SyncDirection}");
                OnSyncStatusChanged?.Invoke($"Nieznany kierunek synchronizacji: {syncFolder.SyncDirection}");
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
                var existingFileResponse = await _apiClient.FindFileByNameAndHashAsync(syncFolder.FolderId, localFile.Name, fileHash);

                if (existingFileResponse.exists && existingFileResponse.files?.Count > 0) {
                    // Wybierz pierwszy nieusunięty plik lub pierwszy dostępny
                    var validFile = existingFileResponse.files.FirstOrDefault(f => !f.isDeleted)
                                   ?? existingFileResponse.files.FirstOrDefault();

                    if (validFile != null) {
                        // Plik już istnieje na serwerze z tym samym hashem - potwierdź pobranie
                        OnSyncStatusChanged?.Invoke($"Plik {localFile.Name} już istnieje na serwerze - potwierdzanie");
                        await ConfirmLocalFileExists(validFile._id, localFile, relativePath);
                        return;
                    }
                }

                // Sprawdź czy może istnieje plik o tej samej nazwie ale innym hashu
                var fileByClientIdResponse = await _apiClient.FindFileByClientIdAsync(_clientId, relativePath, syncFolder.FolderId);

                if (fileByClientIdResponse.exists && fileByClientIdResponse.files?.Count > 0) {
                    // Wybierz pierwszy nieusunięty plik lub pierwszy dostępny
                    var validFile = fileByClientIdResponse.files.FirstOrDefault(f => !f.isDeleted)
                                   ?? fileByClientIdResponse.files.FirstOrDefault();

                    if (validFile != null) {
                        // Aktualizuj istniejący plik
                        OnSyncStatusChanged?.Invoke($"Aktualizowanie pliku na serwerze: {localFile.Name}");
                        await UpdateFileOnServer(validFile._id, localFile.FullPath, relativePath);
                        return;
                    }
                }

                // Prześlij nowy plik
                OnSyncStatusChanged?.Invoke($"Przesyłanie nowego pliku: {localFile.Name}");
                await UploadNewFile(localFile.FullPath, syncFolder.FolderId, relativePath);

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

        private async Task HandleServerFileUnchanged(SyncDataItem syncItem, string localPath, string syncDirection) {
            var fileName = GetFileName(syncItem);

            Console.WriteLine($"[DEBUG] HandleServerFileUnchanged:");
            Console.WriteLine($"  - Plik: {fileName}");
            Console.WriteLine($"  - Lokalny plik istnieje: {File.Exists(localPath)}");
            Console.WriteLine($"  - Kierunek synchronizacji: {syncDirection}");
            Console.WriteLine($"  - syncItem.file?.isDeleted: {syncItem.file?.isDeleted}");

            // WAŻNE: Sprawdź czy plik nie jest przypadkiem oznaczony jako usunięty
            if (syncItem.file?.isDeleted == true) {
                Console.WriteLine($"[DEBUG] Plik w operacji 'unchanged' jest oznaczony jako usunięty - przekierowuję do HandleFileDeleted");
                await HandleFileDeleted(syncItem, localPath, new SyncFolderInfo {
                    SyncDirection = syncDirection,
                    LocalPath = Path.GetDirectoryName(localPath)
                });
                return;
            }

            if (!File.Exists(localPath)) {
                Console.WriteLine($"[DEBUG] Lokalny plik nie istnieje:");
                Console.WriteLine($"  - CanUploadFromClient: {CanUploadFromClient(syncDirection)}");
                Console.WriteLine($"  - CanDownloadToClient: {CanDownloadToClient(syncDirection)}");

                if (CanUploadFromClient(syncDirection)) {
                    // Plik usunięty lokalnie - usuń na serwerze
                    Console.WriteLine($"[DEBUG] Usuwam plik na serwerze (plik usunięty lokalnie): {fileName}");
                    OnSyncStatusChanged?.Invoke($"Plik usunięty lokalnie - usuwanie na serwerze: {fileName}");
                    await _apiClient.DeleteFileFromServerAsync(syncItem.fileId, _clientId);
                } else if (CanDownloadToClient(syncDirection)) {
                    // Plik nie istnieje lokalnie - pobierz z serwera
                    Console.WriteLine($"[DEBUG] Pobieram plik z serwera (nie istnieje lokalnie): {fileName}");
                    OnSyncStatusChanged?.Invoke($"Plik nie istnieje lokalnie - pobieranie: {fileName}");
                    await DownloadFileFromServer(syncItem, localPath);
                }
                return;
            }

            // Sprawdź czy lokalny plik się zmienił
            if (CanUploadFromClient(syncDirection)) {
                var localContent = File.ReadAllBytes(localPath);
                var localHash = CalculateFileHash(localContent);
                var serverHash = syncItem.file?.fileHash;

                Console.WriteLine($"[DEBUG] Porównanie hashów:");
                Console.WriteLine($"  - Lokalny hash: {localHash}");
                Console.WriteLine($"  - Serwer hash: {serverHash}");
                Console.WriteLine($"  - Hashe są różne: {localHash != serverHash}");

                if (localHash != serverHash) {
                    Console.WriteLine($"[DEBUG] Plik zmieniony lokalnie - aktualizuję na serwerze: {fileName}");
                    OnSyncStatusChanged?.Invoke($"Plik zmieniony lokalnie - aktualizowanie na serwerze: {fileName}");
                    await UpdateFileOnServer(syncItem.fileId, localPath, syncItem.clientFileId);
                } else {
                    // Pliki są identyczne - potwierdź synchronizację
                    Console.WriteLine($"[DEBUG] Pliki identyczne - potwierdzam synchronizację: {fileName}");
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