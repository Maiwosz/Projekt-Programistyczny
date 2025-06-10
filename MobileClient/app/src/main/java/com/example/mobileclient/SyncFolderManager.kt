package com.example.mobileclient

import LocalFolderBrowserAdapter
import android.app.Activity
import android.content.Context
import android.os.Environment
import android.view.LayoutInflater
import android.widget.*
import androidx.appcompat.app.AlertDialog
import androidx.lifecycle.LifecycleCoroutineScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import kotlinx.coroutines.launch
import java.io.File
import FolderBrowserAdapter
import android.widget.RadioGroup
import android.widget.RadioButton

class SyncFolderManager(
    private val context: Context,
    private val apiClient: ApiClient,
    private val clientId: String,
    private val lifecycleScope: LifecycleCoroutineScope,
    private val onSyncAdded: () -> Unit,
    private val showMessage: (String, Boolean) -> Unit
) {

    // Trzymamy referencje do dialogu i jego komponentów
    private var currentFolderDialog: AlertDialog? = null
    private var currentServerDialog: AlertDialog? = null
    private var currentRecyclerView: RecyclerView? = null
    private var currentPathTextView: TextView? = null
    private var currentServerFolder: Folder? = null
    private var currentLocalPath: String = "" // Dodajemy tracking aktualnej ścieżki

    fun showAddSyncDialog() {
        lifecycleScope.launch {
            try {
                val folders = apiClient.getFolders()
                val existingSyncFolders = getCurrentSyncFolders()
                val availableFolders = folders.filter { folder ->
                    existingSyncFolders.none { it.folderId == folder.id }
                }

                if (availableFolders.isEmpty()) {
                    showMessage("Brak dostępnych folderów do synchronizacji", true)
                    return@launch
                }

                showServerFolderSelection(availableFolders)

            } catch (e: Exception) {
                showMessage("Błąd pobierania folderów: ${e.message}", true)
            }
        }
    }

    private suspend fun getCurrentSyncFolders(): List<SyncFolderDisplay> {
        return try {
            val folders = apiClient.getFolders()
            val activeSyncs = mutableListOf<SyncFolderDisplay>()

            for (folder in folders) {
                try {
                    val syncInfo = apiClient.getSyncFolderInfo(folder.id)
                    if (syncInfo.success && syncInfo.syncFolder.clients.isNotEmpty()) {
                        val clientSync = syncInfo.syncFolder.clients.firstOrNull { client ->
                            client.client == clientId || client.clientId == clientId
                        }

                        if (clientSync != null) {
                            activeSyncs.add(SyncFolderDisplay(
                                folderId = folder.id,
                                folderName = folder.name,
                                folderDescription = folder.description ?: "",
                                localPath = clientSync.clientFolderPath,
                                syncDirection = clientSync.syncDirection,
                                isActive = clientSync.isActive,
                                lastSyncDate = clientSync.lastSyncDate,
                                syncId = clientSync.id
                            ))
                        }
                    }
                } catch (e: Exception) {
                    // Log error but continue with other folders
                }
            }
            activeSyncs
        } catch (e: Exception) {
            emptyList()
        }
    }

    // Uproszczony wybór folderu serwera
    private fun showServerFolderSelection(folders: List<Folder>) {
        val adapter = FolderBrowserAdapter(folders) { selectedFolder ->
            currentServerDialog?.dismiss() // Zamknij dialog wyboru serwera
            showLocalFolderSelection(selectedFolder)
        }

        val dialogView = LayoutInflater.from(context).inflate(R.layout.dialog_simple_list, null)
        val recyclerView = dialogView.findViewById<RecyclerView>(R.id.rvItems)
        val tvTitle = dialogView.findViewById<TextView>(R.id.tvTitle)

        tvTitle.text = "Wybierz folder serwera"
        recyclerView.layoutManager = LinearLayoutManager(context)
        recyclerView.adapter = adapter

        currentServerDialog = AlertDialog.Builder(context)
            .setTitle("Nowa synchronizacja")
            .setView(dialogView)
            .setNegativeButton("Anuluj", null)
            .setOnDismissListener {
                currentServerDialog = null
            }
            .create()

        currentServerDialog?.show()
    }

    // Uproszczony wybór folderu lokalnego
    private fun showLocalFolderSelection(serverFolder: Folder) {
        val startPath = getDefaultStartPath()
        currentServerFolder = serverFolder
        currentLocalPath = startPath // Inicjalizujemy aktualną ścieżkę
        showLocalFolderBrowser(startPath)
    }

    private fun getDefaultStartPath(): String {
        return when {
            // Android 11+ bez uprawnień MANAGE_EXTERNAL_STORAGE
            android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R &&
                    !Environment.isExternalStorageManager() -> {
                context.getExternalFilesDir(null)?.absolutePath ?: context.filesDir.absolutePath
            }
            // Starsze wersje lub z uprawnieniami
            else -> {
                Environment.getExternalStorageDirectory()?.absolutePath
                    ?: context.getExternalFilesDir(null)?.absolutePath
                    ?: context.filesDir.absolutePath
            }
        }
    }

    private fun showLocalFolderBrowser(targetPath: String) {
        val serverFolder = currentServerFolder ?: return

        // Aktualizujemy aktualną ścieżkę
        currentLocalPath = targetPath

        // Jeśli dialog już istnieje, aktualizujemy jego zawartość
        if (currentFolderDialog != null && currentRecyclerView != null && currentPathTextView != null) {
            updateFolderBrowserContent(targetPath)
            return
        }

        // Tworzymy nowy dialog tylko przy pierwszym wywołaniu
        val currentDir = File(targetPath)

        if (!currentDir.exists() || !currentDir.canRead()) {
            showMessage("Nie można odczytać folderu: $targetPath", true)
            return
        }

        val dialogView = LayoutInflater.from(context).inflate(R.layout.dialog_folder_browser, null)
        currentRecyclerView = dialogView.findViewById(R.id.rvFolders)
        currentPathTextView = dialogView.findViewById(R.id.tvCurrentPath)
        val btnCreateFolder = dialogView.findViewById<Button>(R.id.btnCreateFolder)
        val btnSelectFolder = dialogView.findViewById<Button>(R.id.btnSelectFolder)

        currentRecyclerView?.layoutManager = LinearLayoutManager(context)

        btnCreateFolder.setOnClickListener {
            showCreateFolderDialog(currentLocalPath) {
                updateFolderBrowserContent(currentLocalPath)
            }
        }

        currentFolderDialog = AlertDialog.Builder(context)
            .setTitle("Wybierz folder lokalny")
            .setView(dialogView)
            .setNegativeButton("Wstecz") { _, _ ->
                val parentFile = File(currentLocalPath).parentFile
                if (parentFile != null && parentFile.canRead() && parentFile.absolutePath != currentLocalPath) {
                    // Nawigujemy do folderu nadrzędnego
                    showLocalFolderBrowser(parentFile.absolutePath)
                } else {
                    // Powrót do wyboru folderu serwera - zamykamy dialog i otwieramy nowy
                    resetDialogState()

                    lifecycleScope.launch {
                        try {
                            val folders = apiClient.getFolders()
                            val availableFolders = folders.filter { folder ->
                                getCurrentSyncFolders().none { it.folderId == folder.id }
                            }
                            showServerFolderSelection(availableFolders)
                        } catch (e: Exception) {
                            showMessage("Błąd pobierania folderów: ${e.message}", true)
                        }
                    }
                }
            }
            .setOnDismissListener {
                // Wyczyść referencje przy zamknięciu dialogu
                resetDialogState()
            }
            .create()

        btnSelectFolder.setOnClickListener {
            if (canWriteToDirectory(currentLocalPath)) {
                currentFolderDialog?.dismiss()
                showSyncConfiguration(serverFolder, currentLocalPath)
            } else {
                showMessage("Brak uprawnień do zapisu w tym folderze", true)
            }
        }

        // Załaduj początkową zawartość i pokaż dialog
        updateFolderBrowserContent(targetPath)
        currentFolderDialog?.show()
    }

    private fun resetDialogState() {
        currentFolderDialog?.dismiss()
        currentFolderDialog = null
        currentServerDialog?.dismiss() // Dodaj tę linię
        currentServerDialog = null // Dodaj tę linię
        currentRecyclerView = null
        currentPathTextView = null
        currentServerFolder = null
        currentLocalPath = ""
    }

    private fun updateFolderBrowserContent(targetPath: String) {
        val currentDir = File(targetPath)

        if (!currentDir.exists() || !currentDir.canRead()) {
            showMessage("Nie można odczytać folderu: $targetPath", true)
            return
        }

        // Aktualizujemy aktualną ścieżkę
        currentLocalPath = targetPath

        val directories = try {
            currentDir.listFiles { file ->
                file.isDirectory && !file.isHidden && file.canRead()
            }?.sortedBy { it.name.lowercase() } ?: emptyList()
        } catch (e: SecurityException) {
            emptyList()
        }

        val adapter = LocalFolderBrowserAdapter(
            directories = directories,
            currentPath = targetPath,
            rootPath = getDefaultStartPath(), // Używamy domyślnej ścieżki startowej jako root
            onFolderSelected = { selectedPath ->
                // Nawigujemy do wybranego folderu
                showLocalFolderBrowser(selectedPath)
            },
            onCreateFolder = { folderName ->
                createFolder(targetPath, folderName) {
                    updateFolderBrowserContent(targetPath)
                }
            }
        )

        // Aktualizuj ścieżkę w UI
        val displayPath = if (targetPath.length > 60) {
            "..." + targetPath.takeLast(57)
        } else {
            targetPath
        }
        currentPathTextView?.text = displayPath

        // Aktualizuj adapter w RecyclerView
        currentRecyclerView?.adapter = adapter
    }

    private fun canWriteToDirectory(path: String): Boolean {
        return try {
            val dir = File(path)
            if (!dir.exists() || !dir.canWrite()) {
                false
            } else {
                val testFile = File(dir, ".test_write_${System.currentTimeMillis()}")
                val canWrite = testFile.createNewFile()
                if (canWrite) {
                    testFile.delete()
                }
                canWrite
            }
        } catch (e: Exception) {
            false
        }
    }

    private fun showCreateFolderDialog(parentPath: String, onSuccess: () -> Unit) {
        val dialogView = LayoutInflater.from(context).inflate(R.layout.dialog_input, null)
        val etInput = dialogView.findViewById<EditText>(R.id.etInput)
        val tvHint = dialogView.findViewById<TextView>(R.id.tvHint)

        etInput.hint = "Nazwa nowego folderu"
        tvHint.text = "Nazwa nie może zawierać: / \\ : * ? \" < > |"

        AlertDialog.Builder(context)
            .setTitle("Nowy folder")
            .setView(dialogView)
            .setPositiveButton("Utwórz") { _, _ ->
                val folderName = etInput.text.toString().trim()
                if (folderName.isNotEmpty() && isValidFolderName(folderName)) {
                    createFolder(parentPath, folderName, onSuccess)
                } else {
                    showMessage("Nieprawidłowa nazwa folderu", true)
                }
            }
            .setNegativeButton("Anuluj", null)
            .show()
    }

    private fun createFolder(parentPath: String, folderName: String, onSuccess: () -> Unit) {
        try {
            val parentDir = File(parentPath)
            val newFolder = File(parentDir, folderName)

            if (newFolder.exists()) {
                showMessage("Folder już istnieje", true)
                return
            }

            if (newFolder.mkdirs()) {
                showMessage("Folder utworzony", false)
                onSuccess()
            } else {
                showMessage("Nie udało się utworzyć folderu", true)
            }
        } catch (e: Exception) {
            showMessage("Błąd tworzenia folderu: ${e.message}", true)
        }
    }

    private fun isValidFolderName(name: String): Boolean {
        if (name.isBlank() || name.length > 255) return false

        val invalidChars = charArrayOf('/', '\\', ':', '*', '?', '"', '<', '>', '|', '\n', '\r', '\t')
        if (name.any { it in invalidChars }) return false

        val reservedNames = setOf("CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4",
            "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2",
            "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9")
        if (name.uppercase() in reservedNames) return false

        if (name.startsWith(" ") || name.endsWith(" ") ||
            name.startsWith(".") || name.endsWith(".")) return false

        return true
    }

    private fun showSyncConfiguration(folder: Folder, localPath: String) {
        val dialogView = LayoutInflater.from(context).inflate(R.layout.dialog_sync_config, null)

        val etFolderName = dialogView.findViewById<EditText>(R.id.etFolderName)
        val tvLocalPath = dialogView.findViewById<TextView>(R.id.tvLocalPath)
        val rgSyncDirection = dialogView.findViewById<RadioGroup>(R.id.rgSyncDirection)
        val rbBidirectional = dialogView.findViewById<RadioButton>(R.id.rbBidirectional)
        val rbToClient = dialogView.findViewById<RadioButton>(R.id.rbToClient)
        val rbFromClient = dialogView.findViewById<RadioButton>(R.id.rbFromClient)

        etFolderName.setText(folder.name)
        tvLocalPath.text = localPath

        val configDialog = AlertDialog.Builder(context)
            .setTitle("Konfiguracja synchronizacji")
            .setView(dialogView)
            .setPositiveButton("Dodaj") { _, _ ->
                val folderName = etFolderName.text.toString().trim()
                val syncDirection = when (rgSyncDirection.checkedRadioButtonId) {
                    rbBidirectional.id -> "bidirectional"
                    rbToClient.id -> "to-client"
                    rbFromClient.id -> "from-client"
                    else -> "bidirectional"
                }

                if (folderName.isEmpty()) {
                    showMessage("Podaj nazwę folderu", true)
                    return@setPositiveButton
                }

                addSyncFolder(folder.id, localPath, folderName, syncDirection)
            }
            .setNegativeButton("Wstecz") { _, _ ->
                showLocalFolderBrowser(localPath)
            }
            .create()

        configDialog.show()
    }

    private fun addSyncFolder(folderId: String, localPath: String, folderName: String, syncDirection: String) {
        lifecycleScope.launch {
            showMessage("Dodawanie synchronizacji...", false)

            try {
                val response = apiClient.addFolderToSync(clientId, localPath, folderId, folderName)

                if (response.success) {
                    showMessage("Synchronizacja dodana pomyślnie!", false)
                    resetDialogState() // Zamknie dialog browsera folderów
                    // Dialog konfiguracji zamknie się automatycznie po kliknięciu "Dodaj"
                    onSyncAdded()
                } else {
                    showMessage("Błąd dodawania synchronizacji", true)
                }

            } catch (e: Exception) {
                showMessage("Błąd: ${e.message}", true)
            }
        }
    }
}