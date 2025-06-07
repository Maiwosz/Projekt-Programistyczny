using DesktopClient.Models;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace DesktopClient.Services {
    public class SyncConfigManager {
        private readonly string _configFilePath;
        private List<LocalSyncConfig> _syncConfigs;

        public SyncConfigManager() {
            var appDataPath = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            var appFolder = Path.Combine(appDataPath, "FileManagerClient");
            Directory.CreateDirectory(appFolder);
            _configFilePath = Path.Combine(appFolder, "sync_config.json");
            LoadConfig();
        }

        public List<LocalSyncConfig> GetAllConfigs() {
            return _syncConfigs.ToList();
        }

        public LocalSyncConfig GetConfig(string syncId) {
            return _syncConfigs.FirstOrDefault(c => c.SyncId == syncId);
        }

        public void AddConfig(LocalSyncConfig config) {
            config.SyncId = Guid.NewGuid().ToString();
            _syncConfigs.Add(config);
            SaveConfig();
        }

        public void UpdateConfig(LocalSyncConfig config) {
            var existing = _syncConfigs.FirstOrDefault(c => c.SyncId == config.SyncId);
            if (existing != null) {
                var index = _syncConfigs.IndexOf(existing);
                _syncConfigs[index] = config;
                SaveConfig();
            }
        }

        public void RemoveConfig(string syncId) {
            _syncConfigs.RemoveAll(c => c.SyncId == syncId);
            SaveConfig();
        }

        private void LoadConfig() {
            try {
                if (File.Exists(_configFilePath)) {
                    var json = File.ReadAllText(_configFilePath);
                    _syncConfigs = JsonConvert.DeserializeObject<List<LocalSyncConfig>>(json) ?? new List<LocalSyncConfig>();
                } else {
                    _syncConfigs = new List<LocalSyncConfig>();
                }
            } catch {
                _syncConfigs = new List<LocalSyncConfig>();
            }
        }

        private void SaveConfig() {
            try {
                var json = JsonConvert.SerializeObject(_syncConfigs, Formatting.Indented);
                File.WriteAllText(_configFilePath, json);
            } catch (Exception ex) {
                throw new Exception($"Nie można zapisać konfiguracji: {ex.Message}");
            }
        }
    }
}