// Models.kt
package com.example.mobileclient

import com.google.gson.annotations.Expose
import com.google.gson.annotations.SerializedName
import java.util.*

// === PODSTAWOWE MODELE ===

data class LoginRequest(
    val username: String,
    val password: String
)

data class LoginResponse(
    val token: String
)

data class ErrorResponse(
    val error: String
)

data class ApiResponse(
    val success: Boolean,
    val message: String
)

data class Folder(
    @SerializedName("_id")
    val id: String,
    val user: String,
    val name: String,
    val description: String?,
    val parent: String?,
    val createdAt: Date
)

data class RefreshTokenResponse(
    val token: String
)

// === ZARZĄDZANIE KLIENTAMI ===

data class RegisterClientRequest(
    val type: String,
    val name: String,
    val metadata: Any
)

data class RegisterClientResponse(
    val success: Boolean,
    val client: ClientInfo
)

data class GetClientResponse(
    val success: Boolean,
    val client: ClientInfo
)

data class ClientInfo(
    val clientId: String,
    val type: String,
    val name: String,
    val metadata: Any,
    val isActive: Boolean,
    val lastSeen: Date
)

// === KONFIGURACJA FOLDERÓW SYNCHRONIZACJI ===

data class AddFolderToSyncRequest(
    val clientId: String,
    val clientFolderPath: String,
    val serverFolderId: String,
    val clientFolderName: String?
)

data class AddFolderToSyncResponse(
    val success: Boolean,
    val syncFolder: SyncFolderInfo
)

data class SyncFolderInfo(
    val id: String,
    val folder: String,
    val clients: List<SyncClientInfo>
)

// Poprawiona klasa SyncClientInfo zgodna z wersją C#
data class SyncClientInfo(
    // Obsługa zarówno string ID jak i zagnieżdżonego obiektu
    @SerializedName("client")
    private val _clientRaw: Any? = null,

    val clientFolderId: String = "",
    val clientFolderName: String = "",
    val clientFolderPath: String = "",
    val syncDirection: String = "",
    val isActive: Boolean = false,
    val lastSyncDate: Date? = null,
    @SerializedName("_id")
    val id: String = "",

    // Właściwości pomocnicze dla kompatybilności wstecznej
    val name: String? = null,
    val type: String? = null,

    // Dodaj bezpośrednie pole clientId jako alternatywę
    @SerializedName("clientId")
    private val _clientId: String? = null
) {
    val client: String?
        get() = when (_clientRaw) {
            is String -> _clientRaw
            is Map<*, *> -> (_clientRaw as? Map<String, Any>)?.get("clientId") as? String
                ?: (_clientRaw as? Map<String, Any>)?.get("_id") as? String
            else -> null
        }

    val clientId: String?
        get() = _clientId ?: client

    val clientInfo: ClientInfo?
        get() = _clientRaw as? ClientInfo

    override fun toString(): String {
        return "SyncClientInfo(client=$client, clientId=$clientId, path=$clientFolderPath, active=$isActive)"
    }
}

data class SyncFolderInfoResponse(
    val success: Boolean,
    val syncFolder: SyncFolderInfo,
    val message: String
)

// === GŁÓWNY PROCES SYNCHRONIZACJI ===

data class SyncDataResponse(
    val success: Boolean,
    val syncData: List<SyncDataItem>,
    val lastSyncDate: Date,
    val totalFiles: Int,
    val message: String
)

data class SyncDataItem(
    val fileId: String,
    val file: FileInfo,
    val operation: String, // "added", "modified", "deleted", "unchanged"
    val lastSyncDate: Date?,
    val clientPath: String,
    val clientFileName: String,
    val clientFileId: String,
    val clientLastModified: Date?
)

data class FileInfo(
    @SerializedName("_id")
    val id: String,
    val originalName: String,
    val mimetype: String,
    val size: Long,
    val category: String,
    val fileHash: String,
    val lastModified: Date,
    val isDeleted: Boolean
)

data class FileDownloadResponse(
    val success: Boolean,
    val file: FileInfo,
    val content: String, // Base64
    val contentType: String
)

data class UploadFileRequest(
    val name: String,
    val hash: String,
    val clientFileId: String,
    val content: String, // Base64
    val clientLastModified: Date?
)

data class UploadFileResponse(
    val success: Boolean,
    val fileId: String,
    val message: String
)

data class UpdateFileRequest(
    val hash: String,
    val clientFileId: String,
    val content: String, // Base64
    val clientLastModified: Date?
)

data class UpdateFileResponse(
    val success: Boolean,
    val fileId: String,
    val message: String
)

data class ClientFileInfo(
    val clientFileId: String,
    val clientFileName: String,
    val clientPath: String,
    val clientLastModified: Date
)

data class SyncCompletedResponse(
    val success: Boolean,
    val message: String,
    val totalOperations: Int,
    val syncCompletedAt: Date
)

// === FUNKCJE POMOCNICZE ===

data class FindFileResponse(
    val success: Boolean,
    val exists: Boolean,
    val count: Int,
    val files: List<FileInfo>
) {
    // Właściwość pomocnicza dla kompatybilności wstecznej - zwraca pierwszy plik
    val file: FileInfo?
        get() = files.firstOrNull()
}

data class UpdateSyncSettingsRequest(
    val syncDirection: String,
    val clientFolderPath: String,
    val isActive: Boolean?
)

// === LOKALNE MODELE ===

data class SessionData(
    val username: String,
    val token: String,
    val clientId: String,
    val savedAt: Date
)

data class UserSettings(
    val syncIntervalMinutes: Int = 5,
    val lastModified: Date = Date()
)

data class SyncFolderDisplay(
    val folderId: String,
    val folderName: String,
    val folderDescription: String,
    val localPath: String,
    val syncDirection: String,
    val isActive: Boolean,
    val lastSyncDate: Date?,
    val syncId: String
) : java.io.Serializable