using System;
using System.Collections.Generic;

namespace DesktopClient.Models {
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
        public DateTime createdAt { get; set; }
        public DateTime lastActivity { get; set; }
    }

    public class Folder {
        public string _id { get; set; }
        public string user { get; set; }
        public string name { get; set; }
        public string description { get; set; }
        public string parent { get; set; }
        public DateTime createdAt { get; set; }
    }

    public class Client {
        public string _id { get; set; }
        public string user { get; set; }
        public string clientId { get; set; }
        public string type { get; set; }
        public string name { get; set; }
        public bool isActive { get; set; }
        public DateTime lastSeen { get; set; }
        public DateTime createdAt { get; set; }
    }

    public class SyncClient {
        public string client { get; set; }  // ID klienta jako string
        public string clientId { get; set; }
        public string clientFolderId { get; set; }
        public string clientFolderName { get; set; }
        public string clientFolderPath { get; set; }
        public string syncDirection { get; set; }
        public SyncFilters filters { get; set; }
        public bool isActive { get; set; }
        public DateTime? lastSyncDate { get; set; }
        public string _id { get; set; }  // DODANE - MongoDB generuje _id dla elementów w array
    }

    public class SyncFilters {
        public List<string> allowedExtensions { get; set; } = new List<string>();
        public List<string> excludedExtensions { get; set; } = new List<string>();
        public long? maxFileSize { get; set; }
    }

    public class SyncFolder {
        public string _id { get; set; }
        public string user { get; set; }  // ZMIENIONE z User na string - serwer zwraca ID jako string
        public string folder { get; set; }  // ZMIENIONE z Folder na string - serwer zwraca ID jako string
        public List<SyncClient> clients { get; set; } = new List<SyncClient>();
        public DateTime createdAt { get; set; }
        public DateTime updatedAt { get; set; }
        public int __v { get; set; }  // DODANE - MongoDB version field
    }

    public class CreateSyncFolderRequest {
        public string folderId { get; set; }
        public List<ClientConfig> clientConfigs { get; set; } = new List<ClientConfig>();
    }

    public class ClientConfig {
        public string clientId { get; set; }
        public string clientFolderId { get; set; }
        public string clientFolderName { get; set; }
        public string clientFolderPath { get; set; }
        public string syncDirection { get; set; } = "bidirectional";
        public SyncFilters filters { get; set; } = new SyncFilters();
    }

    public class RegisterClientRequest {
        public string clientId { get; set; }
        public string type { get; set; } = "desktop";
        public string name { get; set; }
    }

    public class LocalSyncConfig {
        public string SyncId { get; set; }
        public string LocalFolderPath { get; set; }
        public string ServerFolderId { get; set; }
        public string ServerFolderName { get; set; }
        public string SyncDirection { get; set; }
        public int SyncIntervalMinutes { get; set; } = 30;
        public bool IsActive { get; set; } = true;
        public DateTime? LastSyncDate { get; set; }
        public SyncFilters Filters { get; set; } = new SyncFilters();
    }

    public class ServerFile {
        public string _id { get; set; }
        public string user { get; set; }
        public string path { get; set; }
        public string originalName { get; set; }
        public string mimetype { get; set; }
        public long size { get; set; }
        public string category { get; set; }
        public string folder { get; set; }
        public string fileHash { get; set; }
        public DateTime lastModified { get; set; }
        public DateTime createdAt { get; set; }
        public bool isDeleted { get; set; }
        public List<ClientMapping> clientMappings { get; set; } = new List<ClientMapping>();
    }

    public class ClientMapping {
        public string client { get; set; }
        public string clientFileId { get; set; }
        public string clientFileName { get; set; }
        public string clientPath { get; set; }
        public DateTime lastSyncDate { get; set; }
        public string _id { get; set; }
    }

    public class SyncFileRequest {
        public string folderId { get; set; }
        public string clientFileId { get; set; }
        public string clientFileName { get; set; }
        public string clientPath { get; set; }
        public string name { get; set; }
        public string mimetype { get; set; }
        public long size { get; set; }
        public DateTime lastModified { get; set; }
        public string content { get; set; }  // Base64 encoded file content
        public string hash { get; set; }
        public string action { get; set; } = "create"; // "create", "update", "delete"
    }

    public class ClientFile {
        public string clientFileId { get; set; }
        public string name { get; set; }
        public string path { get; set; }
        public long size { get; set; }
        public DateTime lastModified { get; set; }
        public string hash { get; set; }
        public string mimetype { get; set; }
    }

    public class BatchSyncResponse {
        public List<SyncResult> results { get; set; } = new List<SyncResult>();
    }

    public class SyncResult {
        public bool success { get; set; }
        public ServerFile file { get; set; }
        public string error { get; set; }
        public SyncFileRequest fileData { get; set; }
    }

    public class SyncStatusResponse {
        public bool syncRequired { get; set; }
        public List<SyncChange> changes { get; set; } = new List<SyncChange>();
    }

    public class SyncChange {
        public string direction { get; set; }  // "to-client", "from-client", "conflict"
        public ServerFile file { get; set; }
        public ClientFile clientFile { get; set; }
        public ServerFile localFile { get; set; }
        public string reason { get; set; }
    }

    public class ApiResponse<T> {
        public T data { get; set; }
        public string error { get; set; }
    }

    public class ErrorResponse {
        public string error { get; set; }
    }
}