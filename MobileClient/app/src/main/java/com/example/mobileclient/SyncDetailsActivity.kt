// SyncDetailsActivity.kt
package com.example.mobileclient

import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

class SyncDetailsActivity : AppCompatActivity() {

    private lateinit var apiClient: ApiClient
    private lateinit var syncService: SyncService
    private lateinit var syncFolder: SyncFolderDisplay
    private lateinit var clientId: String

    // UI Components
    private lateinit var tvFolderName: TextView
    private lateinit var tvServerPath: TextView
    private lateinit var tvLocalPath: TextView
    private lateinit var tvSyncDirection: TextView
    private lateinit var tvLastSync: TextView
    private lateinit var tvStatus: TextView
    private lateinit var tvFileCount: TextView
    private lateinit var switchActive: Switch
    private lateinit var spinnerDirection: Spinner
    private lateinit var etLocalPath: EditText
    private lateinit var btnSyncNow: Button
    private lateinit var btnSave: Button
    private lateinit var btnRemoveSync: Button
    private lateinit var progressBar: ProgressBar
    private lateinit var tvSyncStatus: TextView
    private lateinit var layoutSyncProgress: LinearLayout

    private val dateFormatter = SimpleDateFormat("dd.MM.yyyy HH:mm:ss", Locale.getDefault())
    private var hasChanges = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_sync_details)

        // Initialize from intent
        syncFolder = intent.getSerializableExtra("syncFolder") as SyncFolderDisplay
        clientId = intent.getStringExtra("clientId") ?: ""
        val authToken = intent.getStringExtra("authToken")

        if (clientId.isEmpty() || authToken.isNullOrEmpty()) {
            Toast.makeText(this, "Błąd: Brak wymaganych danych", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        // Initialize API client and sync service
        apiClient = ApiClient().apply {
            setAuthToken(authToken)
        }
        syncService = SyncService(this, apiClient, clientId)

        setupActionBar()
        initializeViews()
        setupListeners()
        loadSyncDetails()
        observeSyncStatus()
    }

    private fun setupActionBar() {
        supportActionBar?.apply {
            title = "Szczegóły synchronizacji"
            setDisplayHomeAsUpEnabled(true)
        }
    }

    private fun initializeViews() {
        tvFolderName = findViewById(R.id.tvFolderName)
        tvServerPath = findViewById(R.id.tvServerPath)
        tvLocalPath = findViewById(R.id.tvLocalPath)
        tvSyncDirection = findViewById(R.id.tvSyncDirection)
        tvLastSync = findViewById(R.id.tvLastSync)
        tvStatus = findViewById(R.id.tvStatus)
        tvFileCount = findViewById(R.id.tvFileCount)
        switchActive = findViewById(R.id.switchActive)
        spinnerDirection = findViewById(R.id.spinnerDirection)
        etLocalPath = findViewById(R.id.etLocalPath)
        btnSyncNow = findViewById(R.id.btnSyncNow)
        btnSave = findViewById(R.id.btnSave)
        btnRemoveSync = findViewById(R.id.btnRemoveSync)
        progressBar = findViewById(R.id.progressBar)
        tvSyncStatus = findViewById(R.id.tvSyncStatus)
        layoutSyncProgress = findViewById(R.id.layoutSyncProgress)

        // Setup sync direction spinner
        val directions = arrayOf("Dwukierunkowa", "Do klienta", "Z klienta")
        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, directions)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerDirection.adapter = adapter

        // Hide progress layout initially
        layoutSyncProgress.visibility = android.view.View.GONE
    }

    private fun setupListeners() {
        switchActive.setOnCheckedChangeListener { _, _ ->
            markAsChanged()
        }

        spinnerDirection.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: android.view.View?, position: Int, id: Long) {
                markAsChanged()
            }
            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }

        etLocalPath.setOnFocusChangeListener { _, hasFocus ->
            if (!hasFocus) {
                markAsChanged()
            }
        }

        btnSyncNow.setOnClickListener {
            performSyncNow()
        }

        btnSave.setOnClickListener {
            saveChanges()
        }

        btnRemoveSync.setOnClickListener {
            showRemoveSyncDialog()
        }
    }

    private fun loadSyncDetails() {
        lifecycleScope.launch {
            try {
                progressBar.visibility = android.view.View.VISIBLE

                // Load detailed sync information
                val syncInfo = apiClient.getSyncFolderInfo(syncFolder.folderId)
                val clientSync = syncInfo.syncFolder.clients.firstOrNull {
                    it.client == clientId
                }

                if (clientSync != null) {
                    updateUI(clientSync)
                } else {
                    Toast.makeText(this@SyncDetailsActivity, "Nie znaleziono synchronizacji dla tego klienta", Toast.LENGTH_SHORT).show()
                    finish()
                }

            } catch (e: Exception) {
                Toast.makeText(this@SyncDetailsActivity, "Błąd ładowania szczegółów: ${e.message}", Toast.LENGTH_LONG).show()
            } finally {
                progressBar.visibility = android.view.View.GONE
            }
        }
    }

    private fun updateUI(clientSync: SyncClientInfo) {
        tvFolderName.text = syncFolder.folderName
        tvServerPath.text = "Serwer: ${syncFolder.folderName}"
        tvLocalPath.text = "Ścieżka lokalna: ${clientSync.clientFolderPath}"

        // Set sync direction
        val directionText = when (clientSync.syncDirection.lowercase()) {
            "bidirectional" -> "Dwukierunkowa"
            "to-client" -> "Do klienta"
            "from-client" -> "Z klienta"
            else -> clientSync.syncDirection
        }
        tvSyncDirection.text = "Kierunek: $directionText"

        // Set last sync date
        val lastSyncText = if (clientSync.lastSyncDate != null) {
            dateFormatter.format(clientSync.lastSyncDate)
        } else {
            "Nigdy"
        }
        tvLastSync.text = "Ostatnia synchronizacja: $lastSyncText"

        // Set status
        val statusText = if (clientSync.isActive) "Aktywna" else "Nieaktywna"
        tvStatus.text = "Status: $statusText"

        // Set file count (placeholder - would need additional API call)
        tvFileCount.text = "Pliki: Ładowanie..."

        // Update form controls
        switchActive.isChecked = clientSync.isActive
        etLocalPath.setText(clientSync.clientFolderPath)

        // Set spinner selection
        val spinnerPosition = when (clientSync.syncDirection.lowercase()) {
            "bidirectional" -> 0
            "to-client" -> 1
            "from-client" -> 2
            else -> 0
        }
        spinnerDirection.setSelection(spinnerPosition)

        // Load file count
        loadFileCount()

        // Reset changes flag
        hasChanges = false
        updateSaveButton()
    }

    private fun loadFileCount() {
        lifecycleScope.launch {
            try {
                val syncData = apiClient.getSyncData(syncFolder.folderId, clientId)
                tvFileCount.text = "Pliki: ${syncData.totalFiles}"
            } catch (e: Exception) {
                tvFileCount.text = "Pliki: Błąd ładowania"
            }
        }
    }

    private fun markAsChanged() {
        hasChanges = true
        updateSaveButton()
    }

    private fun updateSaveButton() {
        btnSave.isEnabled = hasChanges
        btnSave.text = if (hasChanges) "Zapisz zmiany" else "Brak zmian"
    }

    private fun saveChanges() {
        if (!hasChanges) return

        lifecycleScope.launch {
            try {
                progressBar.visibility = android.view.View.VISIBLE
                btnSave.isEnabled = false

                val newDirection = when (spinnerDirection.selectedItemPosition) {
                    0 -> "bidirectional"
                    1 -> "to-client"
                    2 -> "from-client"
                    else -> "bidirectional"
                }

                val settings = UpdateSyncSettingsRequest(
                    syncDirection = newDirection,
                    clientFolderPath = etLocalPath.text.toString().trim(),
                    isActive = switchActive.isChecked
                )

                val response = apiClient.updateSyncSettings(syncFolder.folderId, syncFolder.syncId, settings)

                if (response.success) {
                    Toast.makeText(this@SyncDetailsActivity, "Ustawienia zapisane", Toast.LENGTH_SHORT).show()
                    hasChanges = false
                    updateSaveButton()

                    // Refresh the display
                    loadSyncDetails()
                } else {
                    Toast.makeText(this@SyncDetailsActivity, "Błąd zapisywania: ${response.message}", Toast.LENGTH_LONG).show()
                }

            } catch (e: Exception) {
                Toast.makeText(this@SyncDetailsActivity, "Błąd zapisywania: ${e.message}", Toast.LENGTH_LONG).show()
            } finally {
                progressBar.visibility = android.view.View.GONE
                btnSave.isEnabled = hasChanges
            }
        }
    }

    private fun performSyncNow() {
        lifecycleScope.launch {
            try {
                layoutSyncProgress.visibility = android.view.View.VISIBLE
                btnSyncNow.isEnabled = false
                tvSyncStatus.text = "Rozpoczynanie synchronizacji..."

                syncService.performSync(syncFolder.folderId)

                Toast.makeText(this@SyncDetailsActivity, "Synchronizacja zakończona", Toast.LENGTH_SHORT).show()

                // Refresh details after sync
                loadSyncDetails()

            } catch (e: Exception) {
                Toast.makeText(this@SyncDetailsActivity, "Błąd synchronizacji: ${e.message}", Toast.LENGTH_LONG).show()
            } finally {
                layoutSyncProgress.visibility = android.view.View.GONE
                btnSyncNow.isEnabled = true
            }
        }
    }

    private fun observeSyncStatus() {
        lifecycleScope.launch {
            syncService.syncStatus.collectLatest { status ->
                tvSyncStatus.text = status
            }
        }

        lifecycleScope.launch {
            syncService.isSyncing.collectLatest { isSyncing ->
                if (isSyncing) {
                    layoutSyncProgress.visibility = android.view.View.VISIBLE
                    btnSyncNow.isEnabled = false
                } else {
                    layoutSyncProgress.visibility = android.view.View.GONE
                    btnSyncNow.isEnabled = true
                }
            }
        }
    }

    private fun showRemoveSyncDialog() {
        AlertDialog.Builder(this)
            .setTitle("Usuń synchronizację")
            .setMessage("Czy na pewno chcesz usunąć synchronizację folderu \"${syncFolder.folderName}\"?\n\nTa operacja nie może być cofnięta.")
            .setPositiveButton("Usuń") { _, _ ->
                removeSync()
            }
            .setNegativeButton("Anuluj", null)
            .show()
    }

    private fun removeSync() {
        lifecycleScope.launch {
            try {
                progressBar.visibility = android.view.View.VISIBLE

                val response = apiClient.removeFolderFromSync(syncFolder.folderId, syncFolder.syncId)

                if (response.success) {
                    Toast.makeText(this@SyncDetailsActivity, "Synchronizacja została usunięta", Toast.LENGTH_SHORT).show()

                    // Return to previous activity with result
                    setResult(RESULT_OK)
                    finish()
                } else {
                    Toast.makeText(this@SyncDetailsActivity, "Błąd usuwania: ${response.message}", Toast.LENGTH_LONG).show()
                }

            } catch (e: Exception) {
                Toast.makeText(this@SyncDetailsActivity, "Błąd usuwania synchronizacji: ${e.message}", Toast.LENGTH_LONG).show()
            } finally {
                progressBar.visibility = android.view.View.GONE
            }
        }
    }

    override fun onCreateOptionsMenu(menu: Menu?): Boolean {
        menuInflater.inflate(R.menu.menu_sync_details, menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            android.R.id.home -> {
                onBackPressed()
                true
            }
            R.id.action_refresh -> {
                loadSyncDetails()
                true
            }
            R.id.action_open_folder -> {
                openLocalFolder()
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }

    private fun openLocalFolder() {
        try {
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(android.net.Uri.parse(etLocalPath.text.toString()), "resource/folder")
            }

            if (intent.resolveActivity(packageManager) != null) {
                startActivity(intent)
            } else {
                Toast.makeText(this, "Brak aplikacji do otwierania folderów", Toast.LENGTH_SHORT).show()
            }
        } catch (e: Exception) {
            Toast.makeText(this, "Nie można otworzyć folderu: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onBackPressed() {
        if (hasChanges) {
            AlertDialog.Builder(this)
                .setTitle("Niezapisane zmiany")
                .setMessage("Masz niezapisane zmiany. Czy chcesz je zapisać przed wyjściem?")
                .setPositiveButton("Zapisz") { _, _ ->
                    saveChanges()
                    super.onBackPressed()
                }
                .setNegativeButton("Odrzuć") { _, _ ->
                    super.onBackPressed()
                }
                .setNeutralButton("Anuluj", null)
                .show()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        syncService.dispose()
    }
}