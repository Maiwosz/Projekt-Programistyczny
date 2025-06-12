// MainActivity.kt
package com.example.mobileclient

import android.content.Intent
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.widget.*
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*
import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Environment
import android.provider.Settings
import android.net.Uri
import android.os.PowerManager

class MainActivity : AppCompatActivity() {

    private lateinit var apiClient: ApiClient
    private lateinit var syncService: SyncService
    private lateinit var sessionManager: SessionManager
    private lateinit var syncFolderManager: SyncFolderManager

    private lateinit var username: String
    private lateinit var clientId: String

    private var syncFolders = mutableListOf<SyncFolderDisplay>()
    private lateinit var adapter: SyncFolderAdapter

    // Views
    private lateinit var swipeRefreshLayout: SwipeRefreshLayout
    private lateinit var recyclerView: RecyclerView
    private lateinit var tvEmpty: LinearLayout
    private lateinit var progressBar: ProgressBar
    private lateinit var tvStatus: TextView
    private lateinit var btnAddSync: Button

    companion object {
        private const val STORAGE_PERMISSION_REQUEST = 100
        private const val MANAGE_STORAGE_REQUEST = 101
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Pobierz dane z Intent
        username = intent.getStringExtra("username") ?: ""
        clientId = intent.getStringExtra("clientId") ?: ""
        val authToken = intent.getStringExtra("authToken") ?: ""

        if (username.isEmpty() || clientId.isEmpty() || authToken.isEmpty()) {
            finish()
            return
        }

        // Sprawdź uprawnienia do storage
        checkStoragePermissions()
        requestBatteryOptimizationExemption()

        initializeServices(authToken)
        initializeViews()
        loadSyncFolders()
        startBackgroundService()
    }

    private fun startBackgroundService() {
        SyncForegroundService.start(this)
    }

    private fun requestBatteryOptimizationExemption() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            val packageName = packageName

            if (!powerManager.isIgnoringBatteryOptimizations(packageName)) {
                AlertDialog.Builder(this)
                    .setTitle("Optymalizacja baterii")
                    .setMessage("Aby zapewnić ciągłą synchronizację, wyłącz optymalizację baterii dla tej aplikacji.")
                    .setPositiveButton("Ustawienia") { _, _ ->
                        try {
                            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                            intent.data = Uri.parse("package:$packageName")
                            startActivity(intent)
                        } catch (e: Exception) {
                            // Fallback do ogólnych ustawień
                            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
                        }
                    }
                    .setNegativeButton("Później", null)
                    .show()
            }
        }
    }

    private fun checkStoragePermissions() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            // Android 11+ (API 30+) - sprawdź MANAGE_EXTERNAL_STORAGE
            if (!Environment.isExternalStorageManager()) {
                AlertDialog.Builder(this)
                    .setTitle("Wymagane uprawnienia")
                    .setMessage("Aplikacja potrzebuje dostępu do zarządzania plikami. Zostaniesz przekierowany do ustawień.")
                    .setPositiveButton("OK") { _, _ ->
                        try {
                            val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION)
                            intent.data = Uri.parse("package:$packageName")
                            startActivityForResult(intent, MANAGE_STORAGE_REQUEST)
                        } catch (e: Exception) {
                            // Fallback - otwórz ogólne ustawienia zarządzania plikami
                            val intent = Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
                            startActivityForResult(intent, MANAGE_STORAGE_REQUEST)
                        }
                    }
                    .setNegativeButton("Anuluj") { _, _ ->
                        showMessage("Brak uprawnień może ograniczyć funkcjonalność", true)
                    }
                    .show()
            }
        } else if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            // Android 6-10 - standardowe uprawnienia
            val permissions = mutableListOf<String>()

            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                permissions.add(Manifest.permission.READ_EXTERNAL_STORAGE)
            }

            if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                permissions.add(Manifest.permission.WRITE_EXTERNAL_STORAGE)
            }

            if (permissions.isNotEmpty()) {
                ActivityCompat.requestPermissions(this, permissions.toTypedArray(), STORAGE_PERMISSION_REQUEST)
            }
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)

        if (requestCode == MANAGE_STORAGE_REQUEST) {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
                if (Environment.isExternalStorageManager()) {
                    showMessage("Uprawnienia przyznane", false)
                } else {
                    showMessage("Brak uprawnień - funkcje mogą być ograniczone", true)
                }
            }
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == STORAGE_PERMISSION_REQUEST) {
            if (grantResults.all { it == PackageManager.PERMISSION_GRANTED }) {
                showMessage("Uprawnienia przyznane", false)
            } else {
                showMessage("Brak uprawnień do plików - funkcje mogą być ograniczone", true)
            }
        }
    }

    private fun initializeServices(authToken: String) {
        sessionManager = SessionManager(this)

        apiClient = ApiClient()
        apiClient.setAuthToken(authToken)
        // Przekaż sessionManager do ApiClient
        apiClient.setSessionManager(sessionManager)

        syncService = SyncService(this, apiClient, clientId)

        // Obsługa błędów synchronizacji
        syncService.onSyncError = { message, exception ->
            runOnUiThread {
                showMessage("Błąd synchronizacji: $message", true)
            }
        }

        syncFolderManager = SyncFolderManager(
            context = this,
            apiClient = apiClient,
            clientId = clientId,
            lifecycleScope = lifecycleScope,
            onSyncAdded = { loadSyncFolders() },
            showMessage = { message, isError -> showMessage(message, isError) }
        )
    }

    private fun initializeViews() {
        supportActionBar?.title = "Synchronizacje - $username"

        swipeRefreshLayout = findViewById(R.id.swipeRefreshLayout)
        recyclerView = findViewById(R.id.recyclerView)
        tvEmpty = findViewById(R.id.tvEmpty)
        progressBar = findViewById(R.id.progressBar)
        tvStatus = findViewById(R.id.tvStatus)
        btnAddSync = findViewById(R.id.btnAddSync)

        // Konfiguracja RecyclerView
        adapter = SyncFolderAdapter(syncFolders) { syncFolder ->
            openSyncDetails(syncFolder)
        }
        recyclerView.layoutManager = LinearLayoutManager(this)
        recyclerView.adapter = adapter

        // Konfiguracja SwipeRefreshLayout
        swipeRefreshLayout.setOnRefreshListener {
            loadSyncFolders()
        }

        // Obsługa przycisku dodawania synchronizacji w header
        btnAddSync.setOnClickListener {
            syncFolderManager.showAddSyncDialog()
        }

        // Obsługa przycisku dodawania synchronizacji w pustym stanie
        val btnAddSyncEmpty = findViewById<Button>(R.id.btnAddSyncEmpty)
        btnAddSyncEmpty.setOnClickListener {
            syncFolderManager.showAddSyncDialog()
        }

        // Obsługa statusu synchronizacji
        lifecycleScope.launch {
            syncService.syncStatus.collect { status ->
                tvStatus.text = status
            }
        }

        startBackgroundService()
    }

    override fun onCreateOptionsMenu(menu: Menu?): Boolean {
        menuInflater.inflate(R.menu.main_menu, menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            R.id.action_refresh -> {
                loadSyncFolders()
                true
            }
            R.id.action_sync -> {
                performManualSync()
                true
            }
            R.id.action_settings -> {
                showSettingsDialog()
                true
            }
            R.id.action_logout -> {
                logout()
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }

    private fun loadSyncFolders() {
        lifecycleScope.launch {
            setLoading(true)
            showMessage("Ładowanie synchronizacji...", false)

            try {
                val folders = apiClient.getFolders()
                val activeSyncs = mutableListOf<SyncFolderDisplay>()

                for (folder in folders) {
                    try {
                        val syncInfo = apiClient.getSyncFolderInfo(folder.id)

                        // Debug logging
                        println("Folder: ${folder.name}, ID: ${folder.id}")
                        println("SyncInfo success: ${syncInfo.success}")
                        println("Clients count: ${syncInfo.syncFolder.clients.size}")

                        // Sprawdź czy istnieją klienci synchronizacji
                        if (syncInfo.success && syncInfo.syncFolder.clients.isNotEmpty()) {
                            // Znajdź synchronizację dla aktualnego klienta - sprawdź oba pola
                            val clientSync = syncInfo.syncFolder.clients.firstOrNull { client ->
                                val matches = client.client == clientId || client.clientId == clientId
                                println("Checking client: ${client.client} vs $clientId, clientId: ${client.clientId} vs $clientId, matches: $matches")
                                matches
                            }

                            if (clientSync != null) {
                                println("Found client sync for folder ${folder.name}")
                                activeSyncs.add(SyncFolderDisplay(
                                    folderId = folder.id,
                                    folderName = folder.name,
                                    folderDescription = folder.description ?: "",
                                    localPath = clientSync.clientFolderPath,
                                    syncDirection = clientSync.syncDirection,
                                    isActive = clientSync.isActive,
                                    lastSyncDate = clientSync.lastSyncDate,
                                    syncId = clientSync.id // Używamy id zamiast clientFolderId
                                ))
                            } else {
                                println("No client sync found for folder ${folder.name} and clientId $clientId")
                            }
                        } else {
                            println("No sync info or empty clients for folder ${folder.name}")
                        }
                    } catch (e: Exception) {
                        println("Błąd sprawdzania folderu ${folder.name}: ${e.message}")
                        e.printStackTrace()
                    }
                }

                syncFolders.clear()
                syncFolders.addAll(activeSyncs)
                adapter.notifyDataSetChanged()

                updateEmptyState()
                showMessage("Załadowano ${syncFolders.size} synchronizacji", false)

            } catch (e: Exception) {
                showMessage("Błąd ładowania: ${e.message}", true)
                e.printStackTrace()
            } finally {
                setLoading(false)
            }
        }
    }

    private fun openSyncDetails(syncFolder: SyncFolderDisplay) {
        val intent = Intent(this, SyncDetailsActivity::class.java).apply {
            putExtra("syncFolder", syncFolder)
            putExtra("clientId", clientId)
            putExtra("authToken", apiClient.getAuthToken())
        }
        startActivity(intent)
    }

    private fun showSettingsDialog() {
        val currentSettings = sessionManager.loadUserSettings(username)

        val dialogView = layoutInflater.inflate(R.layout.dialog_settings, null)
        val cbAutoSync = dialogView.findViewById<CheckBox>(R.id.cbAutoSync)
        val etSyncInterval = dialogView.findViewById<EditText>(R.id.etSyncInterval)
        val tilSyncInterval = dialogView.findViewById<com.google.android.material.textfield.TextInputLayout>(R.id.tilSyncInterval)

        // Ustaw aktualne wartości
        cbAutoSync.isChecked = syncService.isAutoSyncRunning.value
        etSyncInterval.setText(currentSettings.syncIntervalMinutes.toString())

        // Włącz/wyłącz pole interwału w zależności od checkboxa
        tilSyncInterval.isEnabled = cbAutoSync.isChecked
        etSyncInterval.isEnabled = cbAutoSync.isChecked

        cbAutoSync.setOnCheckedChangeListener { _, isChecked ->
            tilSyncInterval.isEnabled = isChecked
            etSyncInterval.isEnabled = isChecked
        }

        AlertDialog.Builder(this)
            .setTitle("Ustawienia")
            .setView(dialogView)
            .setPositiveButton("Zapisz") { _, _ ->
                val interval = etSyncInterval.text.toString().toIntOrNull()
                val autoSyncEnabled = cbAutoSync.isChecked

                if (!autoSyncEnabled || (interval != null && interval >= 1)) {
                    // Zapisz ustawienia
                    val newSettings = currentSettings.copy(
                        syncIntervalMinutes = interval ?: currentSettings.syncIntervalMinutes,
                        lastModified = Date()
                    )
                    sessionManager.saveUserSettings(username, newSettings)

                    // Aktualizuj auto-sync
                    lifecycleScope.launch {
                        if (autoSyncEnabled) {
                            syncService.updateSyncInterval(interval!!)
                            if (!syncService.isAutoSyncRunning.value) {
                                syncService.startAutoSync(interval)
                            }
                            showMessage("Automatyczna synchronizacja włączona", false)
                        } else {
                            syncService.stopAutoSync()
                            showMessage("Automatyczna synchronizacja wyłączona", false)
                        }
                    }

                    showMessage("Ustawienia zapisane", false)
                } else {
                    showMessage("Nieprawidłowy interwał synchronizacji", true)
                }
            }
            .setNegativeButton("Anuluj", null)
            .show()
    }

    private fun logout() {
        AlertDialog.Builder(this)
            .setTitle("Wylogowanie")
            .setMessage("Czy na pewno chcesz się wylogować?")
            .setPositiveButton("Tak") { _, _ ->
                performLogout()
            }
            .setNegativeButton("Nie", null)
            .show()
    }

    private fun performLogout() {
        lifecycleScope.launch {
            try {
                syncService.stopAutoSync()
                SyncForegroundService.stop(this@MainActivity) // Dodaj tę linię
                sessionManager.clearSession()

                val intent = Intent(this@MainActivity, LoginActivity::class.java)
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                startActivity(intent)
                finish()

            } catch (e: Exception) {
                showMessage("Błąd wylogowania: ${e.message}", true)
            }
        }
    }

    private fun performManualSync() {
        lifecycleScope.launch {
            setLoading(true)
            showMessage("Rozpoczynanie synchronizacji...", false)

            try {
                syncService.performSync()
                showMessage("Synchronizacja zakończona", false)
                loadSyncFolders() // Odśwież listę po synchronizacji
            } catch (e: Exception) {
                showMessage("Błąd synchronizacji: ${e.message}", true)
            } finally {
                setLoading(false)
            }
        }
    }

    private fun updateEmptyState() {
        if (syncFolders.isEmpty()) {
            tvEmpty.visibility = View.VISIBLE
            recyclerView.visibility = View.GONE
        } else {
            tvEmpty.visibility = View.GONE
            recyclerView.visibility = View.VISIBLE
        }
    }

    private fun setLoading(isLoading: Boolean) {
        swipeRefreshLayout.isRefreshing = isLoading
        progressBar.visibility = if (isLoading) View.VISIBLE else View.GONE
        btnAddSync.isEnabled = !isLoading
    }

    private fun showMessage(message: String, isError: Boolean) {
        tvStatus.text = message
        tvStatus.setTextColor(
            if (isError) {
                resources.getColor(android.R.color.holo_red_dark, theme)
            } else {
                resources.getColor(android.R.color.holo_blue_dark, theme)
            }
        )
    }

    override fun onDestroy() {
        super.onDestroy()
        syncService.dispose()
        apiClient.dispose()
    }

    override fun onResume() {
        super.onResume()
        // Odśwież listę po powrocie z szczegółów
        loadSyncFolders()
    }
}

// === ADAPTER DLA RECYCLERVIEW ===

class SyncFolderAdapter(
    private val syncFolders: List<SyncFolderDisplay>,
    private val onItemClick: (SyncFolderDisplay) -> Unit
) : RecyclerView.Adapter<SyncFolderAdapter.ViewHolder>() {

    private val dateFormat = SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.getDefault())

    class ViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val tvFolderName: TextView = itemView.findViewById(R.id.tvFolderName)
        val tvLocalPath: TextView = itemView.findViewById(R.id.tvLocalPath)
        val tvSyncDirection: TextView = itemView.findViewById(R.id.tvSyncDirection)
        val tvLastSync: TextView = itemView.findViewById(R.id.tvLastSync)
        val tvStatus: TextView = itemView.findViewById(R.id.tvStatus)
        val ivStatus: ImageView = itemView.findViewById(R.id.ivStatus)
    }

    override fun onCreateViewHolder(parent: android.view.ViewGroup, viewType: Int): ViewHolder {
        val view = android.view.LayoutInflater.from(parent.context)
            .inflate(R.layout.item_sync_folder, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val syncFolder = syncFolders[position]

        holder.tvFolderName.text = syncFolder.folderName
        holder.tvLocalPath.text = syncFolder.localPath

        // Kierunek synchronizacji
        holder.tvSyncDirection.text = when (syncFolder.syncDirection) {
            "bidirectional" -> "Dwukierunkowa"
            "to-client" -> "Tylko pobieranie"
            "from-client" -> "Tylko wysyłanie"
            else -> syncFolder.syncDirection
        }

        // Data ostatniej synchronizacji
        holder.tvLastSync.text = if (syncFolder.lastSyncDate != null) {
            "Ostatnia sync: ${dateFormat.format(syncFolder.lastSyncDate)}"
        } else {
            "Nigdy nie synchronizowano"
        }

        // Status i ikona
        if (syncFolder.isActive) {
            holder.tvStatus.text = "Aktywna"
            holder.tvStatus.setTextColor(holder.itemView.context.resources.getColor(android.R.color.holo_green_dark))
            holder.ivStatus.setImageResource(android.R.drawable.presence_online)
        } else {
            holder.tvStatus.text = "Nieaktywna"
            holder.tvStatus.setTextColor(holder.itemView.context.resources.getColor(android.R.color.holo_red_dark))
            holder.ivStatus.setImageResource(android.R.drawable.presence_busy)
        }

        holder.itemView.setOnClickListener {
            onItemClick(syncFolder)
        }
    }

    override fun getItemCount() = syncFolders.size
}

// === MODEL DANYCH DLA WYŚWIETLANIA ===

