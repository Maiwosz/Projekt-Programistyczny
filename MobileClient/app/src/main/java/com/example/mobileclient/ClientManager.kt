// ClientManager.kt
package com.example.mobileclient

import android.content.Context
import android.os.Build
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

class ClientManager(private val context: Context) {

    private companion object {
        const val CLIENT_TYPE = "mobile"
        const val CLIENT_FILE_PREFIX = "client_"
    }

    suspend fun getOrCreateClientId(username: String, apiClient: ApiClient): String = withContext(Dispatchers.IO) {
        try {
            // Sprawdź czy istnieje zapisane ID klienta dla tego użytkownika
            val savedClientId = getSavedClientId(username)

            if (!savedClientId.isNullOrEmpty()) {
                // Sprawdź czy klient nadal istnieje na serwerze
                if (isClientValid(savedClientId, apiClient)) {
                    apiClient.updateClientActivity(savedClientId)
                    return@withContext savedClientId
                }

                // Klient nie istnieje - usuń zapisane ID
                removeSavedClientId(username)
            }

            // Zarejestruj nowego klienta
            val clientName = "${Build.MODEL} - $username"
            val metadata = mapOf(
                "deviceModel" to Build.MODEL,
                "deviceManufacturer" to Build.MANUFACTURER,
                "androidVersion" to Build.VERSION.RELEASE,
                "apiLevel" to Build.VERSION.SDK_INT,
                "deviceName" to (Build.DISPLAY ?: "Unknown")
            )

            val response = apiClient.registerClient(CLIENT_TYPE, clientName, metadata)

            if (response.success) {
                saveClientId(username, response.client.clientId)
                return@withContext response.client.clientId
            }

            throw Exception("Nie udało się zarejestrować klienta")
        } catch (e: Exception) {
            throw Exception("Błąd podczas rejestracji klienta: ${e.message}")
        }
    }

    private suspend fun isClientValid(clientId: String, apiClient: ApiClient): Boolean {
        return try {
            val response = apiClient.getClient(clientId)
            response.success
        } catch (e: Exception) {
            false
        }
    }

    private fun getSavedClientId(username: String): String? {
        return try {
            val file = getClientFile(username)
            if (file.exists()) {
                file.readText().trim()
            } else {
                null
            }
        } catch (e: Exception) {
            null
        }
    }

    private fun saveClientId(username: String, clientId: String) {
        try {
            val file = getClientFile(username)
            file.parentFile?.mkdirs()
            file.writeText(clientId)
        } catch (e: Exception) {
            // Ignoruj błędy zapisu
            println("Błąd zapisu ID klienta: ${e.message}")
        }
    }

    private fun removeSavedClientId(username: String) {
        try {
            val file = getClientFile(username)
            if (file.exists()) {
                file.delete()
            }
        } catch (e: Exception) {
            // Ignoruj błędy usuwania
            println("Błąd usuwania ID klienta: ${e.message}")
        }
    }

    private fun getClientFile(username: String): File {
        return File(context.filesDir, "$CLIENT_FILE_PREFIX$username.txt")
    }
}