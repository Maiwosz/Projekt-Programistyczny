const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const syncController = require('../controllers/syncController');

// Wszystkie endpointy wymagają autoryzacji
router.use(authMiddleware);

// ===== ZARZĄDZANIE KLIENTAMI =====
// Klienci to urządzenia/aplikacje które synchronizują pliki

/**
 * Rejestruje nowego klienta w systemie synchronizacji
 * Body: { type: string, name: string, metadata?: object }
 */
router.post('/clients', syncController.registerClient);

/**
 * Pobiera informacje o zarejestrowanym kliencie
 */
router.get('/clients/:clientId', syncController.getClient);

/**
 * Aktualizuje timestamp ostatniej aktywności klienta (heartbeat)
 * Używane do monitorowania czy klient jest aktywny
 */
router.put('/clients/:clientId/activity', syncController.updateClientActivity);

// ===== KONFIGURACJA SYNCHRONIZACJI FOLDERÓW =====
// Mapowanie folderów serwera na lokalne foldery klientów

/**
 * Dodaje folder serwera do synchronizacji z lokalnym folderem klienta
 * Body: { clientId: string, clientFolderPath: string, serverFolderId: string, clientFolderName?: string }
 */
router.post('/folders', syncController.addFolderToSync);

/**
 * Usuwa folder z synchronizacji
 * Query: ?clientId=xxx - usuwa tylko konkretnego klienta z synchronizacji
 * Bez clientId - usuwa całą konfigurację synchronizacji folderu
 */
router.delete('/folders/:folderId', syncController.removeFolderFromSync);

/**
 * Pobiera informacje o synchronizacji folderu (lista klientów, ustawienia)
 */
router.get('/folders/:folderId/info', syncController.getSyncFolderInfo);

// ===== GŁÓWNY PROCES SYNCHRONIZACJI =====
// Krok po kroku: pobieranie stanu → operacje na plikach → potwierdzenie

/**
 * KROK 1: Pobiera dane synchronizacji dla klienta
 * Zwraca listę wszystkich operacji do wykonania (download, upload, delete, itp.)
 */
router.get('/folders/:folderId/sync-data/:clientId', syncController.getSyncData);

/**
 * KROK 3: Potwierdza zakończenie całej synchronizacji folderu
 * Wywołane po wykonaniu wszystkich operacji przez klienta
 */
router.post('/folders/:folderId/confirm/:clientId', syncController.confirmSyncCompleted);

// ===== OPERACJE NA PLIKACH PODCZAS SYNCHRONIZACJI =====
// KROK 2: Wykonywanie konkretnych operacji na plikach

/**
 * KROK 2A: Pobiera plik z serwera (dla operacji 'download' i 'update_from_server')
 * Zwraca zawartość pliku zakodowaną w base64
 */
router.get('/files/:fileId/download/:clientId', syncController.downloadFileFromServer);

/**
 * KROK 2B: Wysyła nowy plik z klienta na serwer (dla operacji 'upload')
 * Body: { name: string, content: base64, hash: string, clientFileId: string, clientLastModified: date }
 */
router.post('/folders/:folderId/files/:clientId', syncController.uploadNewFileToServer);

/**
 * KROK 2C: Aktualizuje istniejący plik na serwerze (dla operacji 'update_to_server')
 * Body: { content: base64, hash: string, clientFileId: string, clientLastModified: date }
 */
router.put('/files/:fileId/update/:clientId', syncController.updateExistingFileOnServer);

/**
 * KROK 2D: Potwierdza pobranie pliku przez klienta (po download z serwera)
 * Body: { clientFileId: string, clientFileName: string, clientPath: string, clientLastModified: date }
 */
router.post('/files/:fileId/confirm-download/:clientId', syncController.confirmFileDownloaded);

/**
 * KROK 2E: Potwierdza usunięcie pliku przez klienta (dla operacji 'delete')
 * Usuwa stan synchronizacji dla tego pliku i klienta
 */
router.post('/files/:fileId/confirm-delete/:clientId', syncController.confirmFileDeletedOnClient);

/**
 * KROK 2F: Usuwa plik z serwera na żądanie klienta (dla operacji 'delete_from_server')
 */
router.delete('/files/:fileId/delete-from-server/:clientId', syncController.deleteFileFromServer);

// ===== FUNKCJE POMOCNICZE =====
// Wyszukiwanie plików dla klientów podczas synchronizacji

/**
 * Wyszukuje pliki po ID klienta (clientFileId)
 * Query: ?folderId=xxx - ogranicza wyszukiwanie do konkretnego folderu
 */
router.get('/clients/:clientId/files/:clientFileId', syncController.findFileByClientId);

/**
 * Wyszukuje pliki po nazwie i hashu w folderze
 * Używane przez klientów do sprawdzenia czy plik już istnieje przed uploadem
 */
router.get('/folders/:folderId/find/:fileName/:fileHash', syncController.findFileByNameAndHash);

// ===== ZARZĄDZANIE USTAWIENIAMI SYNCHRONIZACJI =====
// Interfejs webowy do konfiguracji synchronizacji

/**
 * Aktualizuje ustawienia synchronizacji (kierunek, ścieżka lokalną, aktywność)
 * Body: { syncDirection?: string, clientFolderPath?: string, isActive?: boolean }
 */
router.put('/folders/:folderId/settings/:syncId', syncController.updateSyncSettings);

module.exports = router;