// ApiClient.kt
package com.example.mobileclient

import com.google.gson.Gson
import com.google.gson.GsonBuilder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.security.cert.X509Certificate
import java.util.*
import java.util.concurrent.TimeUnit
import javax.net.ssl.*

class ApiClient {
    private val baseUrl = "https://89.200.230.226:443"
    private var authToken: String? = null

    private val gson: Gson = GsonBuilder()
        .setDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
        .create()

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        // Konfiguracja SSL dla self-signed certyfikatów
        .apply {
            try {
                val trustAllCerts = arrayOf<TrustManager>(object : X509TrustManager {
                    override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
                    override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
                    override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
                })

                val sslContext = SSLContext.getInstance("SSL")
                sslContext.init(null, trustAllCerts, java.security.SecureRandom())
                val sslSocketFactory = sslContext.socketFactory

                sslSocketFactory(sslSocketFactory, trustAllCerts[0] as X509TrustManager)
                hostnameVerifier(HostnameVerifier { _, _ -> true })
            } catch (e: Exception) {
                println("Błąd konfiguracji SSL: ${e.message}")
            }
        }
        // Interceptor dla logowania
        .addInterceptor { chain ->
            val request = chain.request()
            println("[HTTP ${request.method}] ${request.url}")
            try {
                val response = chain.proceed(request)
                println("[HTTP RESPONSE] ${response.code} ${response.message}")
                response
            } catch (e: Exception) {
                println("[HTTP ERROR] ${e.message}")
                throw e
            }
        }
        .build()

    fun setAuthToken(token: String?) {
        authToken = token
    }

    fun getAuthToken(): String? {
        return authToken
    }

    // === AUTORYZACJA ===

    suspend fun login(username: String, password: String): LoginResponse = withContext(Dispatchers.IO) {
        val request = LoginRequest(username, password)
        postAsync("/api/auth/login", request)
    }

    suspend fun getFolders(): List<Folder> = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("$baseUrl/api/folders")
            .apply {
                authToken?.let { token ->
                    header("Authorization", "Bearer $token")
                }
                header("User-Agent", "AndroidMobileClient/1.0")
                header("Accept", "application/json")
            }
            .build()

        val response = client.newCall(request).execute()
        val responseBody = response.body?.string() ?: ""

        if (response.isSuccessful) {
            val listType = object : com.google.gson.reflect.TypeToken<List<Folder>>() {}.type
            gson.fromJson(responseBody, listType)
        } else {
            handleErrorResponse(response.code, responseBody)
        }
    }

    // === ZARZĄDZANIE KLIENTAMI ===

    // Rejestruje nowego klienta synchronizacji w systemie
    suspend fun registerClient(type: String, name: String, metadata: Any = mapOf<String, Any>()): RegisterClientResponse = withContext(Dispatchers.IO) {
        val request = RegisterClientRequest(type, name, metadata)
        postAsync("/api/sync/clients", request)
    }

    // Pobiera informacje o zarejestrowanym kliencie
    suspend fun getClient(clientId: String): GetClientResponse = withContext(Dispatchers.IO) {
        getAsync("/api/sync/clients/$clientId")
    }

    // Aktualizuje timestamp ostatniej aktywności klienta (heartbeat)
    suspend fun updateClientActivity(clientId: String): ApiResponse = withContext(Dispatchers.IO) {
        putAsync("/api/sync/clients/$clientId/activity", null)
    }

    // === KONFIGURACJA FOLDERÓW SYNCHRONIZACJI ===

    // Dodaje folder serwera do synchronizacji z lokalnym folderem klienta
    suspend fun addFolderToSync(
        clientId: String,
        clientFolderPath: String,
        serverFolderId: String,
        clientFolderName: String? = null
    ): AddFolderToSyncResponse = withContext(Dispatchers.IO) {
        val request = AddFolderToSyncRequest(clientId, clientFolderPath, serverFolderId, clientFolderName)
        logRequest("Add Folder to Sync", request)
        postAsync("/api/sync/folders", request)
    }

    // Usuwa folder z synchronizacji (całkowicie lub tylko dla określonego klienta)
    suspend fun removeFolderFromSync(folderId: String, syncId: String): ApiResponse = withContext(Dispatchers.IO) {
        val url = "/api/sync/folders/$folderId?syncId=$syncId"
        deleteAsync(url)
    }

    // Pobiera informacje o synchronizacji folderu (klienci, ustawienia)
    suspend fun getSyncFolderInfo(folderId: String): SyncFolderInfoResponse = withContext(Dispatchers.IO) {
        getAsync("/api/sync/folders/$folderId/info")
    }

    // === GŁÓWNY PROCES SYNCHRONIZACJI ===

    // Pobiera dane synchronizacji - listę wszystkich operacji do wykonania
    suspend fun getSyncData(folderId: String, clientId: String): SyncDataResponse = withContext(Dispatchers.IO) {
        getAsync("/api/sync/folders/$folderId/sync-data/$clientId")
    }

    // Pobiera plik z serwera (do pobrania przez klienta)
    suspend fun downloadFileFromServer(fileId: String, clientId: String): FileDownloadResponse = withContext(Dispatchers.IO) {
        getAsync("/api/sync/files/$fileId/download/$clientId")
    }

    // Wysyła nowy plik z klienta na serwer
    suspend fun uploadNewFileToServer(folderId: String, clientId: String, fileData: UploadFileRequest): UploadFileResponse = withContext(Dispatchers.IO) {
        logRequest("Upload New File", fileData)
        postAsync("/api/sync/folders/$folderId/files/$clientId", fileData)
    }

    // Aktualizuje istniejący plik na serwerze
    suspend fun updateExistingFileOnServer(fileId: String, clientId: String, fileData: UpdateFileRequest): UpdateFileResponse = withContext(Dispatchers.IO) {
        logRequest("Update Existing File", fileData)
        putAsync("/api/sync/files/$fileId/update/$clientId", fileData)
    }

    // Potwierdza pobranie pliku przez klienta (po downlodzie z serwera)
    suspend fun confirmFileDownloaded(fileId: String, clientId: String, clientFileInfo: ClientFileInfo): ApiResponse = withContext(Dispatchers.IO) {
        logRequest("Confirm File Downloaded", clientFileInfo)
        postAsync("/api/sync/files/$fileId/confirm-download/$clientId", clientFileInfo)
    }

    // Potwierdza usunięcie pliku przez klienta (usuwa stan synchronizacji)
    suspend fun confirmFileDeletedOnClient(fileId: String, clientId: String): ApiResponse = withContext(Dispatchers.IO) {
        postAsync("/api/sync/files/$fileId/confirm-delete/$clientId", null)
    }

    // Usuwa plik z serwera na żądanie klienta
    suspend fun deleteFileFromServer(fileId: String, clientId: String): ApiResponse = withContext(Dispatchers.IO) {
        deleteAsync("/api/sync/files/$fileId/delete-from-server/$clientId")
    }

    // Potwierdza zakończenie całej synchronizacji folderu
    suspend fun confirmSyncCompleted(folderId: String, clientId: String): SyncCompletedResponse = withContext(Dispatchers.IO) {
        postAsync("/api/sync/folders/$folderId/confirm/$clientId", null)
    }

    // === FUNKCJE POMOCNICZE ===

    // Wyszukuje plik po ID klienta (clientFileId)
    suspend fun findFileByClientId(clientId: String, clientFileId: String, folderId: String? = null): FindFileResponse = withContext(Dispatchers.IO) {
        var url = "/api/sync/clients/$clientId/files/$clientFileId"
        if (!folderId.isNullOrEmpty()) {
            url += "?folderId=$folderId"
        }
        getAsync(url)
    }

    // Wyszukuje plik po nazwie i hashu
    suspend fun findFileByNameAndHash(folderId: String, fileName: String, fileHash: String): FindFileResponse = withContext(Dispatchers.IO) {
        getAsync("/api/sync/folders/$folderId/find/$fileName/$fileHash")
    }

    // Aktualizuje ustawienia synchronizacji (kierunek, ścieżka, aktywność)
    suspend fun updateSyncSettings(folderId: String, syncId: String, settings: UpdateSyncSettingsRequest): ApiResponse = withContext(Dispatchers.IO) {
        logRequest("Update Sync Settings", settings)
        putAsync("/api/sync/folders/$folderId/settings/$syncId", settings)
    }

    // === METODY POMOCNICZE HTTP ===

    private suspend inline fun <reified T> getAsync(endpoint: String): T {
        val request = Request.Builder()
            .url("$baseUrl$endpoint")
            .apply {
                authToken?.let { token ->
                    header("Authorization", "Bearer $token")
                }
                header("User-Agent", "AndroidMobileClient/1.0")
                header("Accept", "application/json")
            }
            .build()

        println("[HTTP GET] $baseUrl$endpoint")
        return executeRequest(request)
    }

    private suspend inline fun <reified T> postAsync(endpoint: String, data: Any?): T {
        val json = if (data != null) gson.toJson(data) else "{}"
        println("[HTTP POST] $baseUrl$endpoint")
        println("Payload: $json")

        val requestBody = json.toRequestBody("application/json".toMediaType())

        val request = Request.Builder()
            .url("$baseUrl$endpoint")
            .post(requestBody)
            .apply {
                authToken?.let { token ->
                    header("Authorization", "Bearer $token")
                }
                header("User-Agent", "AndroidMobileClient/1.0")
                header("Content-Type", "application/json")
                header("Accept", "application/json")
            }
            .build()

        return executeRequest(request)
    }

    private suspend inline fun <reified T> putAsync(endpoint: String, data: Any?): T {
        val json = if (data != null) gson.toJson(data) else "{}"
        println("[HTTP PUT] $baseUrl$endpoint")
        println("Payload: $json")

        val requestBody = json.toRequestBody("application/json".toMediaType())

        val request = Request.Builder()
            .url("$baseUrl$endpoint")
            .put(requestBody)
            .apply {
                authToken?.let { token ->
                    header("Authorization", "Bearer $token")
                }
                header("User-Agent", "AndroidMobileClient/1.0")
                header("Content-Type", "application/json")
                header("Accept", "application/json")
            }
            .build()

        return executeRequest(request)
    }

    private suspend inline fun <reified T> deleteAsync(endpoint: String): T {
        val request = Request.Builder()
            .url("$baseUrl$endpoint")
            .delete()
            .apply {
                authToken?.let { token ->
                    header("Authorization", "Bearer $token")
                }
                header("User-Agent", "AndroidMobileClient/1.0")
                header("Accept", "application/json")
            }
            .build()

        println("[HTTP DELETE] $baseUrl$endpoint")
        return executeRequest(request)
    }

    private suspend inline fun <reified T> executeRequest(request: Request): T {
        return withContext(Dispatchers.IO) {
            try {
                val response = client.newCall(request).execute()
                val responseBody = response.body?.string() ?: ""

                println("[HTTP RESPONSE] ${response.code} ${response.message}")
                if (responseBody.isNotEmpty()) {
                    println("Response body: $responseBody")
                }

                if (response.isSuccessful) {
                    if (responseBody.trim().startsWith("{") || responseBody.trim().startsWith("[")) {
                        try {
                            gson.fromJson(responseBody, T::class.java)
                        } catch (e: Exception) {
                            throw Exception("Błąd parsowania odpowiedzi: ${e.message}")
                        }
                    } else {
                        throw Exception("Serwer zwrócił nieprawidłową odpowiedź: $responseBody")
                    }
                } else {
                    handleErrorResponse(response.code, responseBody)
                }
            } catch (e: IOException) {
                throw Exception("Błąd połączenia: ${e.message}")
            } catch (e: Exception) {
                if (e.message?.contains("Błąd") == true) {
                    throw e
                } else {
                    throw Exception("Nieoczekiwany błąd: ${e.message}")
                }
            }
        }
    }

    private fun <T> handleErrorResponse(code: Int, responseBody: String): T {
        if (responseBody.trim().startsWith("{") || responseBody.trim().startsWith("[")) {
            try {
                val error = gson.fromJson(responseBody, ErrorResponse::class.java)
                throw Exception(error.error ?: "Błąd serwera ($code): $responseBody")
            } catch (e: Exception) {
                throw Exception("Błąd serwera ($code): $responseBody")
            }
        } else {
            throw Exception("Błąd serwera ($code): $responseBody")
        }
    }

    private fun logRequest(operation: String, request: Any) {
        try {
            val json = gson.toJson(request)
            println("[$operation] Request: $json")
        } catch (e: Exception) {
            println("[$operation] Request logging failed: ${e.message}")
        }
    }

    fun dispose() {
        try {
            client.dispatcher.executorService.shutdown()
            client.connectionPool.evictAll()
        } catch (e: Exception) {
            println("Błąd podczas zamykania klienta: ${e.message}")
        }
    }
}