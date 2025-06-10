// SyncService.kt
package com.example.mobileclient

import android.content.Context
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import java.security.MessageDigest
import java.util.*
import kotlin.collections.HashMap

class SyncService(
    private val context: Context,
    private val apiClient: ApiClient,
    private val clientId: String
) {
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var syncJob: Job? = null
    private var autoSyncJob: Job? = null

    // State management
    private val _syncStatus = MutableStateFlow("Gotowy do synchronizacji")
    val syncStatus: StateFlow<String> = _syncStatus.asStateFlow()

    private val _isAutoSyncRunning = MutableStateFlow(false)
    val isAutoSyncRunning: StateFlow<Boolean> = _isAutoSyncRunning.asStateFlow()

    private val _isSyncing = MutableStateFlow(false)
    val isSyncing: StateFlow<Boolean> = _isSyncing.asStateFlow()

    private var currentIntervalMinutes = 5

    // Event callbacks
    var onSyncError: ((String, Exception) -> Unit)? = null

    // === ZARZĄDZANIE AUTO-SYNC ===

    fun startAutoSync(intervalMinutes: Int = 5) {
        currentIntervalMinutes = intervalMinutes
        stopAutoSync()

        autoSyncJob = serviceScope.launch {
            _isAutoSyncRunning.value = true
            _syncStatus.value = "Automatyczna synchronizacja uruchomiona (co $intervalMinutes min)"

            while (isActive) {
                delay(intervalMinutes * 60 * 1000L)
                if (isActive && !_isSyncing.value) {
                    try {
                        performSync() // To będzie teraz działać poprawnie
                    } catch (e: Exception) {
                        _syncStatus.value = "Błąd auto-synchronizacji: ${e.message}"
                        onSyncError?.invoke("Błąd auto-synchronizacji", e)
                    }
                }
            }
        }
    }

    fun stopAutoSync() {
        autoSyncJob?.cancel()
        autoSyncJob = null
        _isAutoSyncRunning.value = false
        _syncStatus.value = "Automatyczna synchronizacja zatrzymana"
    }

    fun updateSyncInterval(intervalMinutes: Int) {
        require(intervalMinutes >= 1) { "Interwał musi wynosić co najmniej 1 minutę" }

        currentIntervalMinutes = intervalMinutes

        if (_isAutoSyncRunning.value) {
            startAutoSync(intervalMinutes)
        }

        _syncStatus.value = "Interwał synchronizacji zmieniony na $intervalMinutes min"
    }

    fun getCurrentSyncInterval(): Int = currentIntervalMinutes

    // === SYNCHRONIZACJA ===

    suspend fun performSync() {
        if (_isSyncing.value) return

        _isSyncing.value = true
        _syncStatus.value = "Synchronizacja w toku..."

        try {
            val syncFolders = getActiveSyncFolders()
            for (syncFolder in syncFolders) {
                syncFolder(syncFolder)
            }
            _syncStatus.value = "Synchronizacja zakończona"
        } catch (e: Exception) {
            _syncStatus.value = "Błąd synchronizacji: ${e.message}"
            onSyncError?.invoke("Błąd synchronizacji", e)
        } finally {
            _isSyncing.value = false
        }
    }

    suspend fun performSync(folderId: String) {
        if (_isSyncing.value) return

        _isSyncing.value = true
        _syncStatus.value = "Synchronizacja folderu w toku..."

        try {
            val syncFolder = getSyncFolderInfo(folderId)
            if (syncFolder != null) {
                syncFolder(syncFolder)
                _syncStatus.value = "Synchronizacja folderu zakończona"
            } else {
                _syncStatus.value = "Folder nie jest synchronizowany"
            }
        } catch (e: Exception) {
            _syncStatus.value = "Błąd synchronizacji folderu: ${e.message}"
            onSyncError?.invoke("Błąd synchronizacji folderu $folderId", e)
        } finally {
            _isSyncing.value = false
        }
    }

    // === GŁÓWNA LOGIKA SYNCHRONIZACJI ===

    private suspend fun syncFolder(syncFolder: SyncFolderInfo) {
        try {
            _syncStatus.value = "Synchronizowanie: ${syncFolder.localPath}"
            println("DEBUG: Rozpoczynam synchronizację folderu ${syncFolder.folderId}")

            // KROK 1: Pobierz dane synchronizacji z serwera
            val syncData = apiClient.getSyncData(syncFolder.folderId, clientId)
            _syncStatus.value = "Dane synchronizacji pobrane - ${syncData.syncData.size} operacji na serwerze"
            println("DEBUG: Pobrano ${syncData.syncData.size} elementów do synchronizacji")

            // Przygotuj mapę plików z serwera
            val serverFiles = HashMap<String, SyncDataItem>()
            syncData.syncData.forEach { item ->
                val key = getValidClientFileId(item) ?: getFileName(item)
                if (key.isNotEmpty()) {
                    serverFiles[key] = item
                }
                println("DEBUG: Element serwera - ${item.operation}: ${getFileName(item)}")
            }

            // Pobierz listę lokalnych plików
            val localFiles = getAllLocalFiles(syncFolder.localPath)
            _syncStatus.value = "Znaleziono ${localFiles.size} plików lokalnych"
            println("DEBUG: Znaleziono ${localFiles.size} plików lokalnych")

            // KROK 2: Przetwórz pliki
            val processedFiles = mutableSetOf<String>()

            // 2a) Przetwórz pliki z serwera
            println("DEBUG: Przetwarzam ${syncData.syncData.size} plików z serwera")
            val processedFileIds = mutableSetOf<String>() // Dodaj to

            for (syncItem in syncData.syncData) {
                // Unikaj podwójnego przetwarzania tego samego pliku
                if (processedFileIds.contains(syncItem.fileId)) {
                    println("DEBUG: Pomijam duplikat pliku: ${getFileName(syncItem)} (${syncItem.fileId})")
                    continue
                }

                println("DEBUG: Przetwarzam plik z serwera: ${getFileName(syncItem)}, operacja: ${syncItem.operation}")
                processServerFile(syncItem, syncFolder)

                processedFileIds.add(syncItem.fileId) // Dodaj to

                val key = getValidClientFileId(syncItem) ?: getFileName(syncItem)
                if (key.isNotEmpty()) {
                    processedFiles.add(key)
                }
            }

            // 2b) Przetwórz lokalne pliki nie obecne na serwerze
            println("DEBUG: Sprawdzam lokalne pliki nie obecne na serwerze")
            for (localFile in localFiles) {
                val relativePath = getRelativePath(syncFolder.localPath, localFile.absolutePath)

                if (!processedFiles.contains(relativePath) && !processedFiles.contains(localFile.name)) {
                    println("DEBUG: Przetwarzam lokalny plik: ${localFile.name}")
                    processLocalOnlyFile(localFile, syncFolder, serverFiles)
                }
            }

            // KROK 3: Potwierdź zakończenie synchronizacji
            _syncStatus.value = "Potwierdzanie zakończenia synchronizacji..."
            println("DEBUG: Potwierdzam zakończenie synchronizacji")
            val confirmResponse = apiClient.confirmSyncCompleted(syncFolder.folderId, clientId)

            if (confirmResponse.success) {
                _syncStatus.value = "Synchronizacja zakończona pomyślnie. Wykonano ${confirmResponse.totalOperations} operacji."
                println("DEBUG: Synchronizacja zakończona pomyślnie")
            } else {
                _syncStatus.value = "Ostrzeżenie przy potwierdzaniu: ${confirmResponse.message}"
                println("DEBUG: Ostrzeżenie: ${confirmResponse.message}")
            }

        } catch (e: Exception) {
            _syncStatus.value = "Błąd synchronizacji folderu ${syncFolder.localPath}: ${e.message}"
            println("DEBUG: Błąd synchronizacji: ${e.message}")
            e.printStackTrace()
            throw e
        }
    }

    // === PRZETWARZANIE PLIKÓW Z SERWERA ===

    private suspend fun processServerFile(syncItem: SyncDataItem, syncFolder: SyncFolderInfo) {
        val fileName = getFileName(syncItem)
        val localPath = getLocalFilePath(syncItem, syncFolder.localPath)

        _syncStatus.value = "Przetwarzanie pliku z serwera: $fileName (operacja: ${syncItem.operation})"

        try {
            // Obsługa pliku oznaczonego jako usunięty
            if (syncItem.file.isDeleted) {
                handleDeletedServerFile(syncItem, localPath, syncFolder)
                return
            }

            when (syncItem.operation.lowercase()) {
                "added" -> handleServerFileAdded(syncItem, localPath, syncFolder.syncDirection)
                "modified" -> handleServerFileModified(syncItem, localPath, syncFolder.syncDirection)
                "deleted", "deleted_from_server" -> handleServerFileDeleted(syncItem, localPath, syncFolder.syncDirection)
                "unchanged" -> handleServerFileUnchanged(syncItem, localPath, syncFolder.syncDirection)
                else -> _syncStatus.value = "Nieznana operacja: ${syncItem.operation} dla pliku $fileName"
            }
        } catch (e: Exception) {
            _syncStatus.value = "Błąd przetwarzania pliku z serwera $fileName: ${e.message}"
        }
    }

    private suspend fun handleDeletedServerFile(syncItem: SyncDataItem, localPath: String, syncFolder: SyncFolderInfo) {
        val fileName = getFileName(syncItem)
        val localFile = File(localPath)

        if (!localFile.exists()) {
            // Plik nie istnieje lokalnie - potwierdź usunięcie
            _syncStatus.value = "Potwierdzanie usunięcia pliku nieistniejącego lokalnie: $fileName"
            apiClient.confirmFileDeletedOnClient(syncItem.fileId, clientId)
            return
        }

        // Plik istnieje lokalnie, ale został usunięty na serwerze
        when {
            canDownloadToClient(syncFolder.syncDirection) && !canUploadFromClient(syncFolder.syncDirection) -> {
                // Tylko pobieranie - usuń lokalny plik
                _syncStatus.value = "Usuwanie lokalnego pliku (plik usunięty na serwerze): $fileName"
                deleteLocalFile(localPath)
                apiClient.confirmFileDeletedOnClient(syncItem.fileId, clientId)
            }

            canUploadFromClient(syncFolder.syncDirection) -> {
                // Sprawdź czy lokalna wersja jest nowsza lub różna
                try {
                    val localContent = localFile.readBytes()
                    val localHash = calculateFileHash(localContent)
                    val localModified = Date(localFile.lastModified())

                    // Jeśli plik na serwerze miał inne hash lub lokalny jest nowszy, prześlij go ponownie
                    if (localHash != syncItem.file.fileHash || localModified.after(syncItem.file.lastModified)) {
                        _syncStatus.value = "Plik usunięty na serwerze różni się od lokalnego - przesyłanie: $fileName"
                        val relativePath = getRelativePath(syncFolder.localPath, localPath)
                        uploadNewFile(localPath, syncFolder.folderId, relativePath)
                    } else {
                        // Identyczny plik - po prostu potwierdź usunięcie (użytkownik usunął na serwerze)
                        _syncStatus.value = "Plik identyczny z usuniętym na serwerze - potwierdzanie usunięcia: $fileName"
                        deleteLocalFile(localPath)
                        apiClient.confirmFileDeletedOnClient(syncItem.fileId, clientId)
                    }
                } catch (e: Exception) {
                    _syncStatus.value = "Błąd sprawdzania lokalnego pliku $fileName - zachowuję lokalnie: ${e.message}"
                }
            }

            else -> {
                // Nie można ani pobierać ani przesyłać - zachowaj lokalny plik
                _syncStatus.value = "Plik usunięty na serwerze, zachowuję lokalnie (brak uprawnień sync): $fileName"
                apiClient.confirmFileDeletedOnClient(syncItem.fileId, clientId)
            }
        }
    }

    // === PRZETWARZANIE OPERACJI ===

    private suspend fun handleServerFileAdded(syncItem: SyncDataItem, localPath: String, syncDirection: String) {
        if (canDownloadToClient(syncDirection)) {
            downloadFileFromServer(syncItem, localPath)
        }
    }

    private suspend fun handleServerFileModified(syncItem: SyncDataItem, localPath: String, syncDirection: String) {
        val localFile = File(localPath)

        if (!localFile.exists()) {
            if (canDownloadToClient(syncDirection)) {
                downloadFileFromServer(syncItem, localPath)
            }
            return
        }

        if (canUploadFromClient(syncDirection)) {
            val localContent = localFile.readBytes()
            val localHash = calculateFileHash(localContent)
            val localModified = Date(localFile.lastModified())

            val serverIsNewer = syncItem.file.lastModified.after(localModified)
            val hashesMatch = localHash == syncItem.file.fileHash

            when {
                !hashesMatch && serverIsNewer && canDownloadToClient(syncDirection) -> {
                    downloadFileFromServer(syncItem, localPath)
                }
                !hashesMatch && !serverIsNewer -> {
                    updateFileOnServer(syncItem.fileId, localPath, getValidClientFileId(syncItem) ?: "")
                }
                hashesMatch -> {
                    confirmFileSync(syncItem.fileId, localPath, getValidClientFileId(syncItem) ?: "")
                }
            }
        } else if (canDownloadToClient(syncDirection)) {
            downloadFileFromServer(syncItem, localPath)
        }
    }

    private suspend fun handleServerFileDeleted(syncItem: SyncDataItem, localPath: String, syncDirection: String) {
        val localFile = File(localPath)

        if (!localFile.exists()) {
            apiClient.confirmFileDeletedOnClient(syncItem.fileId, clientId)
            _syncStatus.value = "Potwierdzono usunięcie pliku: ${getFileName(syncItem)}"
            return
        }

        when {
            canDownloadToClient(syncDirection) -> {
                deleteLocalFile(localPath)
                apiClient.confirmFileDeletedOnClient(syncItem.fileId, clientId)
            }
            canUploadFromClient(syncDirection) -> {
                _syncStatus.value = "Plik usunięty na serwerze, ale istnieje lokalnie - przesyłanie: ${getFileName(syncItem)}"
                uploadNewFile(localPath, syncItem.file.id, getValidClientFileId(syncItem) ?: "")
            }
        }
    }

    private suspend fun handleServerFileUnchanged(syncItem: SyncDataItem, localPath: String, syncDirection: String) {
        val localFile = File(localPath)

        if (!localFile.exists()) {
            when {
                canUploadFromClient(syncDirection) -> {
                    _syncStatus.value = "Plik usunięty lokalnie - usuwanie na serwerze: ${getFileName(syncItem)}"
                    apiClient.deleteFileFromServer(syncItem.fileId, clientId)
                }
                canDownloadToClient(syncDirection) -> {
                    _syncStatus.value = "Plik nie istnieje lokalnie - pobieranie: ${getFileName(syncItem)}"
                    downloadFileFromServer(syncItem, localPath)
                }
            }
            return
        }

        if (canUploadFromClient(syncDirection)) {
            val localContent = localFile.readBytes()
            val localHash = calculateFileHash(localContent)

            if (localHash != syncItem.file.fileHash) {
                _syncStatus.value = "Plik zmieniony lokalnie - aktualizowanie na serwerze: ${getFileName(syncItem)}"
                updateFileOnServer(syncItem.fileId, localPath, getValidClientFileId(syncItem) ?: "")
            } else {
                confirmFileSync(syncItem.fileId, localPath, getValidClientFileId(syncItem) ?: "")
            }
        }
    }

    // === PRZETWARZANIE LOKALNYCH PLIKÓW ===

    private suspend fun processLocalOnlyFile(
        localFile: File,
        syncFolder: SyncFolderInfo,
        serverFiles: HashMap<String, SyncDataItem>
    ) {
        if (!canUploadFromClient(syncFolder.syncDirection)) return

        try {
            val relativePath = getRelativePath(syncFolder.localPath, localFile.absolutePath)
            _syncStatus.value = "Przetwarzanie lokalnego pliku: ${localFile.name}"

            val fileContent = localFile.readBytes()
            val fileHash = calculateFileHash(fileContent)

            // Sprawdź czy plik istnieje na serwerze po nazwie i hashu
            val existingFileResponse = apiClient.findFileByNameAndHash(syncFolder.folderId, localFile.name, fileHash)

            if (existingFileResponse.exists && existingFileResponse.files.isNotEmpty()) {
                val validFile = existingFileResponse.files.firstOrNull { !it.isDeleted }
                    ?: existingFileResponse.files.first()

                _syncStatus.value = "Plik ${localFile.name} już istnieje na serwerze - potwierdzanie"
                confirmLocalFileExists(validFile.id, localFile, relativePath)
                return
            }

            // Sprawdź po clientFileId
            val fileByClientIdResponse = apiClient.findFileByClientId(clientId, relativePath, syncFolder.folderId)

            if (fileByClientIdResponse.exists && fileByClientIdResponse.files.isNotEmpty()) {
                val validFile = fileByClientIdResponse.files.firstOrNull { !it.isDeleted }
                    ?: fileByClientIdResponse.files.first()

                _syncStatus.value = "Aktualizowanie pliku na serwerze: ${localFile.name}"
                updateFileOnServer(validFile.id, localFile.absolutePath, relativePath)
                return
            }

            // Prześlij nowy plik
            _syncStatus.value = "Przesyłanie nowego pliku: ${localFile.name}"
            uploadNewFile(localFile.absolutePath, syncFolder.folderId, relativePath)

        } catch (e: Exception) {
            _syncStatus.value = "Błąd przetwarzania lokalnego pliku ${localFile.name}: ${e.message}"
        }
    }

    // === OPERACJE API ===

    private suspend fun downloadFileFromServer(syncItem: SyncDataItem, localPath: String) {
        try {
            val fileName = getFileName(syncItem)
            _syncStatus.value = "Pobieranie: $fileName"

            val downloadResponse = apiClient.downloadFileFromServer(syncItem.fileId, clientId)

            if (!downloadResponse.success) {
                _syncStatus.value = "Błąd pobierania $fileName: ${downloadResponse.file.originalName}"
                return
            }

            val fileContent = Base64.getDecoder().decode(downloadResponse.content)
            val localFile = File(localPath)

            // Utwórz katalogi jeśli nie istnieją
            localFile.parentFile?.mkdirs()
            localFile.writeBytes(fileContent)

            // Ustaw datę modyfikacji
            if (syncItem.file.lastModified.time != 0L) {
                localFile.setLastModified(syncItem.file.lastModified.time)
            }

            // Potwierdź pobranie
            val clientFileInfo = ClientFileInfo(
                clientFileId = getValidClientFileId(syncItem)
                    ?: getRelativePath(File(localPath).parent ?: "", localPath),
                clientFileName = localFile.name,
                clientPath = localPath,
                clientLastModified = Date(localFile.lastModified())
            )

            apiClient.confirmFileDownloaded(syncItem.fileId, clientId, clientFileInfo)
            _syncStatus.value = "Pobrano: $fileName"

        } catch (e: Exception) {
            _syncStatus.value = "Błąd pobierania ${getFileName(syncItem)}: ${e.message}"
        }
    }

    private suspend fun uploadNewFile(filePath: String, folderId: String, relativePath: String) {
        try {
            val localFile = File(filePath)
            val fileName = localFile.name
            val fileContent = localFile.readBytes()
            val fileHash = calculateFileHash(fileContent)

            val uploadRequest = UploadFileRequest(
                name = fileName,
                content = Base64.getEncoder().encodeToString(fileContent),
                hash = fileHash,
                clientFileId = relativePath,
                clientLastModified = Date(localFile.lastModified())
            )

            val response = apiClient.uploadNewFileToServer(folderId, clientId, uploadRequest)

            if (response.success) {
                _syncStatus.value = "Przesłano: $fileName"
            } else {
                _syncStatus.value = "Błąd przesyłania $fileName: ${response.message}"
            }

        } catch (e: Exception) {
            _syncStatus.value = "Błąd przesyłania ${File(filePath).name}: ${e.message}"
        }
    }

    private suspend fun updateFileOnServer(fileId: String, filePath: String, clientFileId: String) {
        try {
            val localFile = File(filePath)
            val fileName = localFile.name
            val fileContent = localFile.readBytes()
            val fileHash = calculateFileHash(fileContent)

            val updateRequest = UpdateFileRequest(
                content = Base64.getEncoder().encodeToString(fileContent),
                hash = fileHash,
                clientFileId = clientFileId,
                clientLastModified = Date(localFile.lastModified())
            )

            val response = apiClient.updateExistingFileOnServer(fileId, clientId, updateRequest)

            if (response.success) {
                _syncStatus.value = "Zaktualizowano: $fileName"
            } else {
                _syncStatus.value = "Błąd aktualizacji $fileName: ${response.message}"
            }

        } catch (e: Exception) {
            _syncStatus.value = "Błąd aktualizacji ${File(filePath).name}: ${e.message}"
        }
    }

    private suspend fun confirmLocalFileExists(fileId: String, localFile: File, relativePath: String) {
        try {
            val clientFileInfo = ClientFileInfo(
                clientFileId = relativePath,
                clientFileName = localFile.name,
                clientPath = localFile.absolutePath,
                clientLastModified = Date(localFile.lastModified())
            )

            apiClient.confirmFileDownloaded(fileId, clientId, clientFileInfo)
            _syncStatus.value = "Potwierdzono istnienie pliku: ${localFile.name}"

        } catch (e: Exception) {
            _syncStatus.value = "Błąd potwierdzania pliku ${localFile.name}: ${e.message}"
        }
    }

    private suspend fun confirmFileSync(fileId: String, filePath: String, clientFileId: String) {
        try {
            val localFile = File(filePath)
            val clientFileInfo = ClientFileInfo(
                clientFileId = clientFileId,
                clientFileName = localFile.name,
                clientPath = filePath,
                clientLastModified = Date(localFile.lastModified())
            )

            apiClient.confirmFileDownloaded(fileId, clientId, clientFileInfo)

        } catch (e: Exception) {
            _syncStatus.value = "Błąd potwierdzania synchronizacji ${File(filePath).name}: ${e.message}"
        }
    }

    private fun deleteLocalFile(filePath: String) {
        try {
            val localFile = File(filePath)
            if (localFile.exists()) {
                localFile.delete()
                _syncStatus.value = "Usunięto: ${localFile.name}"
            }
        } catch (e: Exception) {
            _syncStatus.value = "Błąd usuwania ${File(filePath).name}: ${e.message}"
        }
    }

    // === METODY POMOCNICZE ===

    private suspend fun getAllLocalFiles(folderPath: String): List<File> {
        return withContext(Dispatchers.IO) {
            val folder = File(folderPath)
            if (!folder.exists()) return@withContext emptyList()

            try {
                folder.walkTopDown()
                    .filter { it.isFile }
                    .toList()
            } catch (e: Exception) {
                _syncStatus.value = "Błąd skanowania lokalnych plików: ${e.message}"
                emptyList()
            }
        }
    }

    private suspend fun getActiveSyncFolders(): List<SyncFolderInfo> {
        val folders = apiClient.getFolders()
        val syncFolders = mutableListOf<SyncFolderInfo>()

        for (folder in folders) {
            try {
                val syncInfo = apiClient.getSyncFolderInfo(folder.id)
                val clientSync = syncInfo.syncFolder.clients.firstOrNull {
                    it.client == clientId && it.isActive
                }

                if (clientSync != null) {
                    syncFolders.add(SyncFolderInfo(
                        folderId = folder.id,
                        localPath = clientSync.clientFolderPath,
                        syncDirection = clientSync.syncDirection
                    ))
                }
            } catch (e: Exception) {
                _syncStatus.value = "Błąd sprawdzania folderu ${folder.name}: ${e.message}"
            }
        }

        return syncFolders
    }

    private suspend fun getSyncFolderInfo(folderId: String): SyncFolderInfo? {
        return try {
            val syncInfo = apiClient.getSyncFolderInfo(folderId)
            val clientSync = syncInfo.syncFolder.clients.firstOrNull {
                it.client == clientId && it.isActive
            }

            clientSync?.let {
                SyncFolderInfo(
                    folderId = folderId,
                    localPath = it.clientFolderPath,
                    syncDirection = it.syncDirection
                )
            }
        } catch (e: Exception) {
            null
        }
    }

    // Poprawiona metoda getFileName - zabezpieczenie przed null
    private fun getFileName(syncItem: SyncDataItem): String {
        return when {
            !syncItem.clientFileName.isNullOrEmpty() -> syncItem.clientFileName
            !syncItem.clientPath.isNullOrEmpty() -> File(syncItem.clientPath).name
            else -> syncItem.file.originalName ?: "unknown_file"
        }
    }

    // Nowa pomocnicza metoda do bezpiecznego pobierania clientFileId
    private fun getValidClientFileId(syncItem: SyncDataItem): String? {
        return syncItem.clientFileId?.takeIf { it.isNotEmpty() }
    }

    private fun getLocalFilePath(syncItem: SyncDataItem, basePath: String): String {
        val clientPath = syncItem.clientPath
        return if (!clientPath.isNullOrEmpty()) {
            if (File(clientPath).isAbsolute) {
                clientPath
            } else {
                File(basePath, clientPath).absolutePath
            }
        } else {
            File(basePath, getFileName(syncItem)).absolutePath
        }
    }

    private fun canDownloadToClient(syncDirection: String): Boolean {
        return syncDirection == "bidirectional" || syncDirection == "to-client"
    }

    private fun canUploadFromClient(syncDirection: String): Boolean {
        return syncDirection == "bidirectional" || syncDirection == "from-client"
    }

    private fun getRelativePath(basePath: String, fullPath: String): String {
        return try {
            val baseFile = File(basePath)
            val fullFile = File(fullPath)
            baseFile.toURI().relativize(fullFile.toURI()).path
        } catch (e: Exception) {
            File(fullPath).name
        }
    }

    private fun calculateFileHash(fileContent: ByteArray): String {
        val md5 = MessageDigest.getInstance("MD5")
        val hashBytes = md5.digest(fileContent)
        return hashBytes.joinToString("") { "%02x".format(it) }
    }

    fun dispose() {
        stopAutoSync()
        syncJob?.cancel()
        serviceScope.cancel()
    }

    // === KLASY POMOCNICZE ===

    private data class SyncFolderInfo(
        val folderId: String,
        val localPath: String,
        val syncDirection: String
    )
}