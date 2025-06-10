// SessionManager.kt
package com.example.mobileclient

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import java.util.*

class SessionManager(private val context: Context) {

    private val gson: Gson = GsonBuilder()
        .setDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
        .create()

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val encryptedPrefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        "file_manager_session",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    private val settingsPrefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        "file_manager_settings",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    fun saveSession(username: String, token: String, clientId: String) {
        try {
            val sessionData = SessionData(
                username = username,
                token = token,
                clientId = clientId,
                savedAt = Date()
            )

            val json = gson.toJson(sessionData)
            encryptedPrefs.edit()
                .putString("session_data", json)
                .apply()

        } catch (e: Exception) {
            println("Błąd zapisu sesji: ${e.message}")
        }
    }

    fun loadSession(): SessionData? {
        try {
            val json = encryptedPrefs.getString("session_data", null) ?: return null
            val sessionData = gson.fromJson(json, SessionData::class.java)

            // Sprawdź czy sesja nie jest zbyt stara (30 dni)
            val daysDiff = (Date().time - sessionData.savedAt.time) / (1000 * 60 * 60 * 24)
            if (daysDiff > 30) {
                clearSession()
                return null
            }

            return sessionData
        } catch (e: Exception) {
            println("Błąd odczytu sesji: ${e.message}")
            clearSession()
            return null
        }
    }

    fun clearSession() {
        try {
            encryptedPrefs.edit()
                .remove("session_data")
                .apply()
        } catch (e: Exception) {
            println("Błąd usuwania sesji: ${e.message}")
        }
    }

    fun hasActiveSession(): Boolean {
        return loadSession() != null
    }

    // === USTAWIENIA UŻYTKOWNIKA ===

    fun saveUserSettings(username: String, settings: UserSettings) {
        try {
            val json = gson.toJson(settings)
            settingsPrefs.edit()
                .putString("settings_$username", json)
                .apply()
        } catch (e: Exception) {
            println("Błąd zapisu ustawień: ${e.message}")
        }
    }

    fun loadUserSettings(username: String): UserSettings {
        return try {
            val json = settingsPrefs.getString("settings_$username", null)
            if (json != null) {
                gson.fromJson(json, UserSettings::class.java)
            } else {
                UserSettings()
            }
        } catch (e: Exception) {
            println("Błąd odczytu ustawień: ${e.message}")
            UserSettings()
        }
    }

    // === Token ===

    fun isTokenExpired(): Boolean {
        val session = loadSession() ?: return true

        // Sprawdź czy token wygasa w ciągu najbliższych 10 minut
        val expirationBuffer = 10 * 60 * 1000 // 10 minut w ms
        val tokenAge = Date().time - session.savedAt.time
        val maxAge = 4 * 60 * 60 * 1000 - expirationBuffer // 4h minus bufor

        return tokenAge > maxAge
    }

    fun updateToken(newToken: String) {
        val currentSession = loadSession()
        if (currentSession != null) {
            saveSession(currentSession.username, newToken, currentSession.clientId)
        }
    }
}