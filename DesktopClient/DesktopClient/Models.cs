using System;
using System.Collections.Generic;

namespace DesktopClient.Models {
    // === PODSTAWOWE MODELE ===

    public class LoginResponse {
        public string token { get; set; }
    }

    public class LoginRequest {
        public string username { get; set; }
        public string password { get; set; }
    }

    public class User {
        public string _id { get; set; }
        public string username { get; set; }
        public string email { get; set; }
        public string googleId { get; set; }
        public string facebookId { get; set; }
        public string profilePictureUrl { get; set; }
        public UserSyncSettings syncSettings { get; set; }
        public DateTime createdAt { get; set; }
        public DateTime lastActivity { get; set; }
    }

    public class UserSyncSettings {
        public int maxClients { get; set; } = 10;
        public bool globalAutoSync { get; set; } = false;
        public string conflictResolution { get; set; } = "newest-wins"; // "newest-wins", "manual", "keep-both"
    }

    public class Folder {
        public string _id { get; set; }
        public string user { get; set; }
        public string name { get; set; }
        public string description { get; set; }
        public string parent { get; set; }
        public DateTime createdAt { get; set; }
    }

    // === ODPOWIEDZI API ===

    public class ApiResponse {
        public string message { get; set; }
        public bool success { get; set; } = true;
    }

    public class ApiResponse<T> {
        public T data { get; set; }
        public string message { get; set; }
        public bool success { get; set; } = true;
        public string error { get; set; }
    }

    public class ErrorResponse {
        public string error { get; set; }
        public string message { get; set; }
        public int statusCode { get; set; }
    }

    // === MODELE SYNCHRONIZACJI ===

    public class Client {
        public string _id { get; set; }
        public string user { get; set; }
        public string type { get; set; } // "desktop", "mobile", "web", "server-integration", "google-drive"
        public string name { get; set; }
        public object metadata { get; set; }
        public bool isActive { get; set; }
        public DateTime lastSeen { get; set; }
        public DateTime createdAt { get; set; }
        public DateTime updatedAt { get; set; }
    }

    public class SyncFolder {
        public string _id { get; set; }
        public string user { get; set; }
        public string folder { get; set; }
        public List<SyncClient> clients { get; set; }
        public DateTime createdAt { get; set; }
        public DateTime updatedAt { get; set; }
    }

    public class SyncClient {
        public string _id { get; set; }
        public string client { get; set; }
        public string clientFolderId { get; set; }
        public string clientFolderName { get; set; }
        public string clientFolderPath { get; set; }
        public string syncDirection { get; set; } // "bidirectional", "to-client", "from-client"
        public bool isActive { get; set; }
        public DateTime? lastSyncDate { get; set; }
    }

    public class SyncState {
        public List<SyncOperation> operations { get; set; }
        public DateTime lastSyncDate { get; set; }
        public int totalFiles { get; set; }
    }

    public class SyncOperation {
        public string fileId { get; set; }
        public string operation { get; set; } // "added", "modified", "deleted", "unchanged"
        public FileInfo file { get; set; }
    }

    // === NOWE MODELE PASUJĄCE DO RZECZYWISTEJ ODPOWIEDZI API ===

    public class SyncDataItem {
        public string fileId { get; set; }

        // Zagnieżdżony obiekt file z prawdziwej odpowiedzi API
        public FileInfo file { get; set; }

        public string operation { get; set; } // "added", "modified", "deleted", "unchanged"
        public DateTime? lastSyncDate { get; set; }
        public string clientPath { get; set; }
        public string clientFileName { get; set; }
        public string clientFileId { get; set; }
        public DateTime? clientLastModified { get; set; }

        // Właściwości pomocnicze dla łatwiejszego dostępu do danych z zagnieżdżonego obiektu file
        public string originalName => file?.originalName;
        public string mimetype => file?.mimetype;
        public long size => file?.size ?? 0;
        public string hash => file?.fileHash;
        public DateTime lastModified => file?.lastModified ?? DateTime.MinValue;
        public string category => file?.category;
    }

    public class FileInfo {
        public string _id { get; set; }
        public string originalName { get; set; }
        public string mimetype { get; set; }
        public long size { get; set; }
        public string category { get; set; }
        public string fileHash { get; set; }
        public DateTime lastModified { get; set; }
        public bool isDeleted { get; set; }
    }

    // === MODELE ŻĄDAŃ ===

    public class RegisterClientRequest {
        public string type { get; set; }
        public string name { get; set; }
        public object metadata { get; set; }
    }

    public class AddSyncFolderRequest {
        public string clientId { get; set; }
        public string folderPath { get; set; }
        public string serverFolderId { get; set; }
    }

    public class CompletedOperation {
        public string fileId { get; set; }
        public string operation { get; set; }
        public bool success { get; set; }
        public string error { get; set; }
    }

    public class ConfirmSyncRequest {
        public List<CompletedOperation> completedOperations { get; set; }
    }

    public class ClientFileInfo {
        public string clientFileId { get; set; }
        public string clientFileName { get; set; }
        public string clientPath { get; set; }
        public DateTime clientLastModified { get; set; }
    }

    public class UploadFileRequest {
        public string name { get; set; }
        public string content { get; set; } // Base64
        public string hash { get; set; }
        public string clientFileId { get; set; }
        public DateTime? clientLastModified { get; set; }
    }

    public class UpdateFileRequest {
        public string content { get; set; } // Base64
        public string hash { get; set; }
        public string clientFileId { get; set; }
        public DateTime? clientLastModified { get; set; }
    }

    public class CheckFileExistsRequest {
        public string clientFileId { get; set; }
        public string fileName { get; set; }
        public string fileHash { get; set; }
    }

    public class UpdateSyncSettingsRequest {
        public string syncDirection { get; set; }
        public string clientFolderPath { get; set; }
        public bool? isActive { get; set; }
    }

    // === MODELE ODPOWIEDZI ===

    public class RegisterClientResponse {
        public bool success { get; set; }
        public ClientData client { get; set; }
    }

    public class ClientData {
        public string clientId { get; set; }
        public string type { get; set; }
        public string name { get; set; }
        public object metadata { get; set; }
        public bool isActive { get; set; }
        public DateTime lastSeen { get; set; }
    }

    public class GetClientResponse {
        public bool success { get; set; }
        public ClientData client { get; set; }
    }

    // === POPRAWIONA ODPOWIEDŹ SYNC STATE ===
    public class SyncStateResponse {
        public bool success { get; set; }
        public List<SyncDataItem> syncData { get; set; } = new List<SyncDataItem>();
        public DateTime lastSyncDate { get; set; }
        public int totalFiles { get; set; }

        // Właściwość pomocnicza dla kompatybilności z istniejącym kodem
        public List<SyncOperation> operations {
            get {
                if (syncData == null) return new List<SyncOperation>();

                var ops = new List<SyncOperation>();
                foreach (var item in syncData) {
                    ops.Add(new SyncOperation {
                        fileId = item.fileId,
                        operation = item.operation,
                        file = new FileInfo {
                            _id = item.fileId,
                            originalName = item.originalName,
                            mimetype = item.mimetype,
                            size = item.size,
                            category = item.category,
                            fileHash = item.hash,
                            lastModified = item.lastModified,
                            isDeleted = item.operation == "deleted"
                        }
                    });
                }
                return ops;
            }
        }
    }

    public class FileDownloadResponse {
        public bool success { get; set; }
        public FileInfo file { get; set; }
        public string content { get; set; } // Base64
        public string contentType { get; set; }
    }

    public class FileExistsFileInfo {
        public string fileId { get; set; }  // Zmieniono z _id na fileId
        public string originalName { get; set; }
        public string hash { get; set; }
        public long size { get; set; }
        public DateTime lastModified { get; set; }
        public string mimetype { get; set; }
        public string category { get; set; }
        public bool isDeleted { get; set; }
    }

    public class FileExistsResponse {
        public bool success { get; set; }
        public bool exists { get; set; }
        public FileExistsFileInfo file { get; set; }  // Użyj nowej klasy
    }

    public class FolderSyncsResponse {
        public bool success { get; set; }
        public List<SyncClientInfo> syncs { get; set; }
    }

    public class SyncClientInfo {
        public string id { get; set; }
        public string clientName { get; set; }
        public string clientType { get; set; }
        public string clientId { get; set; }
        public string syncDirection { get; set; }
        public string clientFolderPath { get; set; }
        public bool isActive { get; set; }
        public DateTime? lastSyncDate { get; set; }
    }

    public class SyncDetailsResponse {
        public bool success { get; set; }
        public SyncClientInfo sync { get; set; }
        public string message { get; set; }
        public string error { get; set; }
    }
}