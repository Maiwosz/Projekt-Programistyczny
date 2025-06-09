using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Linq;

namespace DesktopClient.Models {
    // === PODSTAWOWE MODELE ===

    public class LoginRequest {
        public string username { get; set; }
        public string password { get; set; }
    }

    public class LoginResponse {
        public string token { get; set; }
    }

    public class ErrorResponse {
        public string error { get; set; }
    }

    public class ApiResponse {
        public bool success { get; set; }
        public string message { get; set; }
    }

    public class Folder {
        public string _id { get; set; }
        public string user { get; set; }
        public string name { get; set; }
        public string description { get; set; }
        public string parent { get; set; }
        public DateTime createdAt { get; set; }
    }

    // === ZARZĄDZANIE KLIENTAMI ===

    public class RegisterClientRequest {
        public string type { get; set; }
        public string name { get; set; }
        public object metadata { get; set; }
    }

    public class RegisterClientResponse {
        public bool success { get; set; }
        public ClientInfo client { get; set; }
    }

    public class GetClientResponse {
        public bool success { get; set; }
        public ClientInfo client { get; set; }
    }

    public class ClientInfo {
        public string clientId { get; set; }
        public string type { get; set; }
        public string name { get; set; }
        public object metadata { get; set; }
        public bool isActive { get; set; }
        public DateTime lastSeen { get; set; }
    }

    // === KONFIGURACJA FOLDERÓW SYNCHRONIZACJI ===

    public class AddFolderToSyncRequest {
        public string clientId { get; set; }
        public string clientFolderPath { get; set; }
        public string serverFolderId { get; set; }
        public string clientFolderName { get; set; }
    }

    public class AddFolderToSyncResponse {
        public bool success { get; set; }
        public SyncFolderInfo syncFolder { get; set; }
    }

    public class SyncFolderInfo {
        public string id { get; set; }
        public string folder { get; set; }
        public List<SyncClientInfo> clients { get; set; }
    }

    public class SyncClientInfo {
        // Obsługa zarówno string ID jak i zagnieżdżonego obiektu
        [JsonProperty("client")]
        private object _clientRaw { get; set; }

        [JsonIgnore]
        public string client {
            get {
                if (_clientRaw is string str) return str;
                if (_clientRaw is ClientInfo clientObj) return clientObj.clientId;
                return null;
            }
        }

        [JsonIgnore]
        public ClientInfo clientInfo {
            get {
                return _clientRaw as ClientInfo;
            }
        }

        public string clientFolderId { get; set; }
        public string clientFolderName { get; set; }
        public string clientFolderPath { get; set; }
        public string syncDirection { get; set; }
        public bool isActive { get; set; }
        public DateTime? lastSyncDate { get; set; }
        public string _id { get; set; }

        // Właściwości pomocnicze dla kompatybilności wstecznej
        public string name { get; set; }
        public string type { get; set; }
        public string clientId { get; set; }
    }

    public class SyncFolderInfoResponse {
        public bool success { get; set; }
        public SyncFolderInfo syncFolder { get; set; }
        public string message { get; set; }
    }

    // === GŁÓWNY PROCES SYNCHRONIZACJI ===

    public class SyncDataResponse {
        public bool success { get; set; }
        public List<SyncDataItem> syncData { get; set; }
        public DateTime lastSyncDate { get; set; }
        public int totalFiles { get; set; }
        public string message { get; set; }
    }

    public class SyncDataItem {
        public string fileId { get; set; }
        public FileInfo file { get; set; }
        public string operation { get; set; } // "added", "modified", "deleted", "unchanged"
        public DateTime? lastSyncDate { get; set; }
        public string clientPath { get; set; }
        public string clientFileName { get; set; }
        public string clientFileId { get; set; }
        public DateTime? clientLastModified { get; set; }
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

    public class FileDownloadResponse {
        public bool success { get; set; }
        public FileInfo file { get; set; }
        public string content { get; set; } // Base64
        public string contentType { get; set; }
    }

    public class UploadFileRequest {
        public string name { get; set; }
        public string hash { get; set; }
        public string clientFileId { get; set; }
        public string content { get; set; } // Base64
        public DateTime? clientLastModified { get; set; }
    }

    public class UploadFileResponse {
        public bool success { get; set; }
        public string fileId { get; set; }
        public string message { get; set; }
    }

    public class UpdateFileRequest {
        public string hash { get; set; }
        public string clientFileId { get; set; }
        public string content { get; set; } // Base64
        public DateTime? clientLastModified { get; set; }
    }

    public class UpdateFileResponse {
        public bool success { get; set; }
        public string fileId { get; set; }
        public string message { get; set; }
    }

    public class ClientFileInfo {
        public string clientFileId { get; set; }
        public string clientFileName { get; set; }
        public string clientPath { get; set; }
        public DateTime clientLastModified { get; set; }
    }

    public class SyncCompletedResponse {
        public bool success { get; set; }
        public string message { get; set; }
        public int totalOperations { get; set; }
        public DateTime syncCompletedAt { get; set; }
    }

    // === FUNKCJE POMOCNICZE ===

    public class FindFileResponse {
        public bool success { get; set; }
        public bool exists { get; set; }
        public int count { get; set; }
        public List<FileInfo> files { get; set; }

        // Właściwość pomocnicza dla kompatybilności wstecznej - zwraca pierwszy plik
        [JsonIgnore]
        public FileInfo file => files?.FirstOrDefault();
    }

    public class UpdateSyncSettingsRequest {
        public string syncDirection { get; set; }
        public string clientFolderPath { get; set; }
        public bool? isActive { get; set; }
    }
}