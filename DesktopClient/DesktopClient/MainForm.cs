using DesktopClient.Models;
using DesktopClient.Services;
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;

namespace DesktopClient {
    public partial class MainForm : Form {
        private ApiClient _apiClient;
        private SyncConfigManager _syncConfigManager;
        private string _currentUsername;
        private string _currentClientId;
        private ListView listViewSyncs;
        private Label lblWelcome;
        private Button btnAddSync;
        private Button btnRefresh;
        private Button btnLogout;
        private Label lblStatus;
        private ProgressBar progressBar;
        private System.Windows.Forms.Timer _syncTimer;

        public MainForm(ApiClient apiClient, string username) {
            InitializeComponent();
            _apiClient = apiClient;
            _syncConfigManager = new SyncConfigManager();
            _currentUsername = username;
            _currentClientId = Environment.MachineName + "_" + Environment.UserName;

            InitializeSyncTimer();
            RegisterClientAndLoadSyncs();
        }

        private void InitializeComponent() {
            this.SuspendLayout();

            // Form properties
            this.Text = "File Manager - Synchronizacje";
            this.Size = new Size(1000, 700);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.MinimumSize = new Size(800, 500);

            // Welcome label
            lblWelcome = new Label();
            lblWelcome.Text = $"Witaj, {_currentUsername}!";
            lblWelcome.Font = new Font("Segoe UI", 12, FontStyle.Bold);
            lblWelcome.Location = new Point(20, 20);
            lblWelcome.Size = new Size(300, 25);
            this.Controls.Add(lblWelcome);

            // Logout button
            btnLogout = new Button();
            btnLogout.Text = "Wyloguj";
            btnLogout.Location = new Point(880, 20);
            btnLogout.Size = new Size(80, 25);
            btnLogout.UseVisualStyleBackColor = true;
            btnLogout.Click += BtnLogout_Click;
            btnLogout.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            this.Controls.Add(btnLogout);

            // Refresh button
            btnRefresh = new Button();
            btnRefresh.Text = "Odśwież";
            btnRefresh.Location = new Point(790, 20);
            btnRefresh.Size = new Size(80, 25);
            btnRefresh.UseVisualStyleBackColor = true;
            btnRefresh.Click += BtnRefresh_Click;
            btnRefresh.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            this.Controls.Add(btnRefresh);

            // Add sync button
            btnAddSync = new Button();
            btnAddSync.Text = "Dodaj synchronizację";
            btnAddSync.Location = new Point(640, 20);
            btnAddSync.Size = new Size(140, 25);
            btnAddSync.UseVisualStyleBackColor = true;
            btnAddSync.Click += BtnAddSync_Click;
            btnAddSync.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            this.Controls.Add(btnAddSync);

            // Syncs label
            Label lblSyncs = new Label();
            lblSyncs.Text = "Twoje synchronizacje:";
            lblSyncs.Font = new Font("Segoe UI", 10, FontStyle.Bold);
            lblSyncs.Location = new Point(20, 60);
            lblSyncs.Size = new Size(200, 20);
            this.Controls.Add(lblSyncs);

            // ListView for syncs
            listViewSyncs = new ListView();
            listViewSyncs.Location = new Point(20, 90);
            listViewSyncs.Size = new Size(940, 500);
            listViewSyncs.View = View.Details;
            listViewSyncs.FullRowSelect = true;
            listViewSyncs.GridLines = true;
            listViewSyncs.MultiSelect = false;
            listViewSyncs.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;

            // Add columns
            listViewSyncs.Columns.Add("Folder lokalny", 200);
            listViewSyncs.Columns.Add("Folder serwera", 200);
            listViewSyncs.Columns.Add("Kierunek", 120);
            listViewSyncs.Columns.Add("Status", 100);
            listViewSyncs.Columns.Add("Ostatnia sync", 130);
            listViewSyncs.Columns.Add("Interwał (min)", 90);
            listViewSyncs.Columns.Add("Akcje", 100);

            // Context menu
            var contextMenu = new ContextMenuStrip();
            contextMenu.Items.Add("Szczegóły", null, ViewDetails_Click);
            contextMenu.Items.Add("Edytuj", null, EditSync_Click);
            contextMenu.Items.Add("-");
            contextMenu.Items.Add("Uruchom teraz", null, SyncNow_Click);
            contextMenu.Items.Add("-");
            contextMenu.Items.Add("Usuń", null, DeleteSync_Click);
            listViewSyncs.ContextMenuStrip = contextMenu;

            listViewSyncs.DoubleClick += ViewDetails_Click;

            this.Controls.Add(listViewSyncs);

            // Status label
            lblStatus = new Label();
            lblStatus.Text = "";
            lblStatus.Location = new Point(20, 610);
            lblStatus.Size = new Size(500, 20);
            lblStatus.ForeColor = Color.Blue;
            lblStatus.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
            this.Controls.Add(lblStatus);

            // Progress bar
            progressBar = new ProgressBar();
            progressBar.Location = new Point(20, 640);
            progressBar.Size = new Size(940, 10);
            progressBar.Style = ProgressBarStyle.Marquee;
            progressBar.Visible = false;
            progressBar.Anchor = AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            this.Controls.Add(progressBar);

            this.ResumeLayout(false);
            this.PerformLayout();
        }

        private void InitializeSyncTimer() {
            _syncTimer = new System.Windows.Forms.Timer();
            _syncTimer.Interval = 60000; // Sprawdzaj co minutę
            _syncTimer.Tick += SyncTimer_Tick;
            _syncTimer.Start();
        }

        private async void RegisterClientAndLoadSyncs() {
            SetLoading(true);
            ShowMessage("Rejestrowanie klienta...");

            try {
                // Sprawdź czy klient już istnieje
                var existingClients = await _apiClient.GetClientsAsync();
                if (!existingClients.Any(c => c.clientId == _currentClientId)) {
                    var registerRequest = new RegisterClientRequest {
                        clientId = _currentClientId,
                        type = "desktop",
                        name = $"Desktop - {Environment.MachineName}"
                    };
                    await _apiClient.RegisterClientAsync(registerRequest);
                }

                LoadSyncs();
                ShowMessage("Gotowe");
            } catch (Exception ex) {
                ShowMessage($"Błąd rejestracji klienta: {ex.Message}");
            } finally {
                SetLoading(false);
            }
        }

        private void LoadSyncs() {
            var configs = _syncConfigManager.GetAllConfigs();
            PopulateSyncsList(configs);
            ShowMessage($"Załadowano {configs.Count} synchronizacji");
        }

        private void PopulateSyncsList(List<LocalSyncConfig> configs) {
            listViewSyncs.Items.Clear();

            if (configs == null || configs.Count == 0) {
                var noSyncsItem = new ListViewItem("Brak synchronizacji");
                noSyncsItem.SubItems.Add("Dodaj pierwszą synchronizację");
                noSyncsItem.SubItems.Add("");
                noSyncsItem.SubItems.Add("");
                noSyncsItem.SubItems.Add("");
                noSyncsItem.SubItems.Add("");
                noSyncsItem.SubItems.Add("");
                noSyncsItem.ForeColor = Color.Gray;
                listViewSyncs.Items.Add(noSyncsItem);
                return;
            }

            foreach (var config in configs) {
                var item = new ListViewItem(config.LocalFolderPath ?? "Nie ustawiono");
                item.SubItems.Add(config.ServerFolderName ?? "Nie ustawiono");

                string direction;
                switch (config.SyncDirection) {
                    case "bidirectional":
                        direction = "Obustronna";
                        break;
                    case "to-client":
                        direction = "Do klienta";
                        break;
                    case "from-client":
                        direction = "Od klienta";
                        break;
                    default:
                        direction = "Nieznany";
                        break;
                }
                item.SubItems.Add(direction);

                item.SubItems.Add(config.IsActive ? "Aktywna" : "Nieaktywna");
                item.SubItems.Add(config.LastSyncDate?.ToString("dd.MM HH:mm") ?? "Nigdy");
                item.SubItems.Add(config.SyncIntervalMinutes.ToString());
                item.SubItems.Add("...");

                item.Tag = config;

                if (!config.IsActive) {
                    item.ForeColor = Color.Gray;
                }

                listViewSyncs.Items.Add(item);
            }
        }

        private async void SyncTimer_Tick(object sender, EventArgs e) {
            var configs = _syncConfigManager.GetAllConfigs();
            var now = DateTime.Now;

            foreach (var config in configs.Where(c => c.IsActive)) {
                var nextSync = config.LastSyncDate?.AddMinutes(config.SyncIntervalMinutes) ?? now.AddMinutes(-1);
                if (now >= nextSync) {
                    await PerformSync(config);
                }
            }
        }

        private async System.Threading.Tasks.Task PerformSync(LocalSyncConfig config) {
            try {
                // Aktualizuj aktywność klienta
                await _apiClient.UpdateClientActivityAsync(_currentClientId);

                // Zaktualizuj datę ostatniej synchronizacji
                config.LastSyncDate = DateTime.Now;
                _syncConfigManager.UpdateConfig(config);

                // Odśwież widok
                LoadSyncs();
            } catch (Exception ex) {
                ShowMessage($"Błąd synchronizacji {config.ServerFolderName}: {ex.Message}");
            }
        }

        private void BtnAddSync_Click(object sender, EventArgs e) {
            var addSyncForm = new AddSyncForm(_apiClient, _syncConfigManager, _currentClientId);
            if (addSyncForm.ShowDialog() == DialogResult.OK) {
                LoadSyncs();
            }
        }

        private void BtnRefresh_Click(object sender, EventArgs e) {
            LoadSyncs();
        }

        private void ViewDetails_Click(object sender, EventArgs e) {
            if (listViewSyncs.SelectedItems.Count > 0) {
                var config = listViewSyncs.SelectedItems[0].Tag as LocalSyncConfig;
                if (config != null) {
                    var detailsForm = new SyncDetailsForm(config, _apiClient, _syncConfigManager, _currentClientId);
                    if (detailsForm.ShowDialog() == DialogResult.OK) {
                        LoadSyncs();
                    }
                }
            }
        }

        private void EditSync_Click(object sender, EventArgs e) {
            if (listViewSyncs.SelectedItems.Count > 0) {
                var config = listViewSyncs.SelectedItems[0].Tag as LocalSyncConfig;
                if (config != null) {
                    var editForm = new AddSyncForm(_apiClient, _syncConfigManager, _currentClientId, config);
                    if (editForm.ShowDialog() == DialogResult.OK) {
                        LoadSyncs();
                    }
                }
            }
        }

        private async void SyncNow_Click(object sender, EventArgs e) {
            if (listViewSyncs.SelectedItems.Count > 0) {
                var config = listViewSyncs.SelectedItems[0].Tag as LocalSyncConfig;
                if (config != null) {
                    await PerformSync(config);
                }
            }
        }

        private async void DeleteSync_Click(object sender, EventArgs e) {
            if (listViewSyncs.SelectedItems.Count > 0) {
                var config = listViewSyncs.SelectedItems[0].Tag as LocalSyncConfig;
                if (config != null) {
                    var result = MessageBox.Show($"Czy na pewno chcesz usunąć synchronizację '{config.ServerFolderName}'?",
                        "Usuwanie synchronizacji", MessageBoxButtons.YesNo, MessageBoxIcon.Question);

                    if (result == DialogResult.Yes) {
                        try {
                            await _apiClient.DeleteSyncFolderAsync(config.ServerFolderId, _currentClientId);
                            _syncConfigManager.RemoveConfig(config.SyncId);
                            LoadSyncs();
                            ShowMessage("Synchronizacja została usunięta");
                        } catch (Exception ex) {
                            MessageBox.Show($"Błąd usuwania synchronizacji: {ex.Message}",
                                "Błąd", MessageBoxButtons.OK, MessageBoxIcon.Error);
                        }
                    }
                }
            }
        }

        private void BtnLogout_Click(object sender, EventArgs e) {
            var result = MessageBox.Show("Czy na pewno chcesz się wylogować?",
                "Wylogowanie", MessageBoxButtons.YesNo, MessageBoxIcon.Question);

            if (result == DialogResult.Yes) {
                _syncTimer?.Stop();
                _apiClient.SetAuthToken(null);
                this.Hide();
                var loginForm = new LoginForm();
                loginForm.ShowDialog();
                this.Close();
            }
        }

        private void ShowMessage(string message) {
            lblStatus.Text = message;
        }

        private void SetLoading(bool isLoading) {
            btnAddSync.Enabled = !isLoading;
            btnRefresh.Enabled = !isLoading;
            btnLogout.Enabled = !isLoading;
            listViewSyncs.Enabled = !isLoading;
            progressBar.Visible = isLoading;
        }

        protected override void Dispose(bool disposing) {
            if (disposing) {
                _syncTimer?.Stop();
                _syncTimer?.Dispose();
                _apiClient?.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}