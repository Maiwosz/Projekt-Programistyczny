// LoginActivity.kt
package com.example.mobileclient

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

class LoginActivity : AppCompatActivity() {

    private lateinit var apiClient: ApiClient
    private lateinit var clientManager: ClientManager
    private lateinit var sessionManager: SessionManager

    private lateinit var etUsername: EditText
    private lateinit var etPassword: EditText
    private lateinit var btnLogin: Button
    private lateinit var btnRegister: Button
    private lateinit var cbRememberMe: CheckBox
    private lateinit var tvStatus: TextView
    private lateinit var progressBar: ProgressBar

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login)

        initializeServices()
        initializeViews()
        checkSavedSession()
    }

    private fun initializeServices() {
        apiClient = ApiClient()
        clientManager = ClientManager(this)
        sessionManager = SessionManager(this)
    }

    private fun initializeViews() {
        etUsername = findViewById(R.id.etUsername)
        etPassword = findViewById(R.id.etPassword)
        btnLogin = findViewById(R.id.btnLogin)
        btnRegister = findViewById(R.id.btnRegister)
        cbRememberMe = findViewById(R.id.cbRememberMe)
        tvStatus = findViewById(R.id.tvStatus)
        progressBar = findViewById(R.id.progressBar)

        btnLogin.setOnClickListener { performLogin() }
        btnRegister.setOnClickListener { openRegistrationPage() }
        cbRememberMe.isChecked = true

        // Obsługuj naciśnięcie Enter w polach tekstowych
        etUsername.setOnKeyListener { _, keyCode, event ->
            if (keyCode == android.view.KeyEvent.KEYCODE_ENTER && event.action == android.view.KeyEvent.ACTION_DOWN) {
                etPassword.requestFocus()
                true
            } else false
        }

        etPassword.setOnKeyListener { _, keyCode, event ->
            if (keyCode == android.view.KeyEvent.KEYCODE_ENTER && event.action == android.view.KeyEvent.ACTION_DOWN) {
                performLogin()
                true
            } else false
        }
    }

    private fun checkSavedSession() {
        lifecycleScope.launch {
            try {
                val sessionData = sessionManager.loadSession()
                if (sessionData != null) {
                    setLoading(true)
                    showMessage("Sprawdzanie zapisanej sesji...", false)

                    apiClient.setAuthToken(sessionData.token)
                    val folders = apiClient.getFolders()

                    val clientId = clientManager.getOrCreateClientId(sessionData.username, apiClient)

                    showMessage("Automatyczne logowanie zakończone sukcesem!", false)
                    navigateToMain(sessionData.username, clientId)
                }
            } catch (e: Exception) {
                println("Błąd sprawdzenia sesji: ${e.message}")
                sessionManager.clearSession()
                showMessage("Sesja wygasła, zaloguj się ponownie", true)
            } finally {
                setLoading(false)
            }
        }
    }

    private fun performLogin() {
        val username = etUsername.text.toString().trim()
        val password = etPassword.text.toString()

        if (username.isEmpty() || password.isEmpty()) {
            showMessage("Wypełnij wszystkie pola", true)
            return
        }

        lifecycleScope.launch {
            setLoading(true)
            showMessage("Logowanie...", false)

            try {
                val loginResponse = apiClient.login(username, password)

                if (loginResponse.token.isNotEmpty()) {
                    apiClient.setAuthToken(loginResponse.token)
                    showMessage("Rejestrowanie klienta...", false)

                    val clientId = clientManager.getOrCreateClientId(username, apiClient)

                    if (cbRememberMe.isChecked) {
                        sessionManager.saveSession(username, loginResponse.token, clientId)
                    }

                    showMessage("Logowanie zakończone sukcesem!", false)
                    navigateToMain(username, clientId)
                } else {
                    showMessage("Nieprawidłowa odpowiedź serwera", true)
                }
            } catch (e: Exception) {
                showMessage(e.message ?: "Błąd logowania", true)
            } finally {
                setLoading(false)
            }
        }
    }

    private fun openRegistrationPage() {
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://89.200.230.226/register.html"))
            startActivity(intent)
        } catch (e: Exception) {
            showMessage("Nie można otworzyć przeglądarki: ${e.message}", true)
        }
    }

    private fun navigateToMain(username: String, clientId: String) {
        val intent = Intent(this, MainActivity::class.java).apply {
            putExtra("username", username)
            putExtra("clientId", clientId)
            putExtra("authToken", apiClient.getAuthToken())
        }
        startActivity(intent)
        finish()
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

    private fun setLoading(isLoading: Boolean) {
        btnLogin.isEnabled = !isLoading
        btnRegister.isEnabled = !isLoading
        etUsername.isEnabled = !isLoading
        etPassword.isEnabled = !isLoading
        cbRememberMe.isEnabled = !isLoading
        progressBar.visibility = if (isLoading) View.VISIBLE else View.GONE
    }

    override fun onDestroy() {
        super.onDestroy()
        apiClient.dispose()
    }
}