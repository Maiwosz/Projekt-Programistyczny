using DesktopClient.Models;
using DesktopClient.Services;
using System;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Windows.Forms;

namespace DesktopClient {
    public partial class SyncDetailsForm : Form {
        private LocalSyncConfig _config;
        private ApiClient _apiClient;
        private SyncConfigManager _syncConfigManager;
        private string _currentClientId;

        // Controls
        private Label lblTitle;
        private GroupBox grpBasicInfo;
        private Label lblLocalPath;
        private Label lblServerFolder;
        private Label lblSyncDirection;
        private Label lblStatus;
        private Label lblLastSync;
        private Label lblInterval;

        private GroupBox grpFilters;
        private Label lblAllowedExt;
        private Label lblExcludedExt;
        private Label lblMaxFileSize;

        private GroupBox grpActions;
        private Button btnSyncNow;
        private Button btnToggleStatus;
        private Button btnOpenLocalFolder;
        private Button btnEdit;
        private Button btnDelete;
        private Button btnClose;

        private Label lblStatusBar;
        private ProgressBar progressBar;

        public SyncDetailsForm(LocalSyncConfig config, ApiClient apiClient, SyncConfigManager syncConfigManager, string currentClientId) {
            _config = config;
            _apiClient = apiClient;
            _syncConfigManager = syncConfigManager;
            _currentClientId = currentClientId;

            InitializeComponent();
            LoadSyncDetails();
        }

        private void InitializeComponent() {
            this.SuspendLayout();

            // Form properties
            this.Text = "Szczegóły synchronizacji";
            this.Size = new Size(600, 700);
            this.StartPosition = FormStartPosition.CenterParent;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;

            // Title
            lblTitle = new Label();
            lblTitle.Font = new Font("Segoe UI", 14, FontStyle.Bold);
            lblTitle.Location = new Point(20, 20);
            lblTitle.Size = new Size(540, 30);
            lblTitle.TextAlign = ContentAlignment.MiddleLeft;
            this.Controls.Add(lblTitle);

            // Basic Info Group
            grpBasicInfo = new GroupBox();
            grpBasicInfo.Text = "Informacje podstawowe";
            grpBasicInfo.Location = new Point(20, 60);
            grpBasicInfo.Size = new Size(540, 180);
            grpBasicInfo.Font = new Font("Segoe UI", 9, FontStyle.Bold);

            // Local Path
            var lblLocalPathLabel = new Label();
            lblLocalPathLabel.Text = "Folder lokalny:";
            lblLocalPathLabel.Location = new Point(15, 30);
            lblLocalPathLabel.Size = new Size(100, 20);
            lblLocalPathLabel.Font = new Font("Segoe UI", 9, FontStyle.Bold);
            grpBasicInfo.Controls.Add(lblLocalPathLabel);

            lblLocalPath = new Label();
            lblLocalPath.Location = new Point(120, 30);
            lblLocalPath.Size = new Size(400, 20);
            lblLocalPath.Font = new Font("Segoe UI", 9);
            grpBasicInfo.Controls.Add(lblLocalPath);

            // Server Folder
            var lblServerFolderLabel = new Label();
            lblServerFolderLabel.Text = "Folder serwera:";
            lblServerFolderLabel.Location = new Point(15, 55);
            lblServerFolderLabel.Size = new Size(100, 20);
            lblServerFolderLabel.Font = new Font("Segoe UI", 9, FontStyle.Bold);
            grpBasicInfo.Controls.Add(lblServerFolderLabel);

            lblServerFolder = new Label();
            lblServerFolder.Location = new Point(120, 55);
            lblServerFolder.Size = new Size(400, 20);
            lblServerFolder.Font = new Font("Segoe UI", 9);
            grpBasicInfo.Controls.Add(lblServerFolder);

            // Sync Direction
            var lblSyncDirectionLabel = new Label();
            lblSyncDirectionLabel.Text = "Kierunek sync:";
            lblSyncDirectionLabel.Location = new Point(15, 80);
            lblSyncDirectionLabel.Size = new Size(100, 20);
            lblSyncDirectionLabel.Font = new Font("Segoe UI", 9, FontStyle.Bold);
            grpBasicInfo.Controls.Add(lblSyncDirectionLabel);

            lblSyncDirection = new Label();
            lblSyncDirection.Location = new Point(120, 80);
            lblSyncDirection.Size = new Size(400, 20);
            lblSyncDirection.Font = new Font("Segoe UI", 9);
            grpBasicInfo.Controls.Add(lblSyncDirection);

            // Status
            var lblStatusLabel = new Label();
            lblStatusLabel.Text = "Status:";
            lblStatusLabel.Location = new Point(15, 105);
            lblStatusLabel.Size = new Size(100, 20);
            lblStatusLabel.Font = new Font("Segoe UI", 9, FontStyle.Bold);
            grpBasicInfo.Controls.Add(lblStatusLabel);

            lblStatus = new Label();
            lblStatus.Location = new Point(120, 105);
            lblStatus.Size = new Size(400, 20);
            lblStatus.Font = new Font("Segoe UI", 9);
            grpBasicInfo.Controls.Add(lblStatus);

            // Last Sync
            var lblLastSyncLabel = new Label();
            lblLastSyncLabel.Text = "Ostatnia sync:";
            lblLastSyncLabel.Location = new Point(15, 130);
            lblLastSyncLabel.Size = new Size(100, 20);
            lblLastSyncLabel.Font = new Font("Segoe UI", 9, FontStyle.Bold);
            grpBasicInfo.Controls.Add(lblLastSyncLabel);

            lblLastSync = new Label();
            lblLastSync.Location = new Point(120, 130);
            lblLastSync.Size = new Size(400, 20);
            lblLastSync.Font = new Font("Segoe UI", 9);
            grpBasicInfo.Controls.Add(lblLastSync);

            // Interval
            var lblIntervalLabel = new Label();
            lblIntervalLabel.Text = "Interwał (min):";
            lblIntervalLabel.Location = new Point(15, 155);
            lblIntervalLabel.Size = new Size(100, 20);
            lblIntervalLabel.Font = new Font("Segoe UI", 9, FontStyle.Bold);
            grpBasicInfo.Controls.Add(lblIntervalLabel);

            lblInterval = new Label();
            lblInterval.Location = new Point(120, 155);
            lblInterval.Size = new Size(400, 20);
            lblInterval.Font = new Font("Segoe UI", 9);
            grpBasicInfo.Controls.Add(lblInterval);

            this.Controls.Add(grpBasicInfo);

            // Filters Group
            grpFilters = new GroupBox();
            grpFilters.Text = "Filtry synchronizacji";
            grpFilters.Location = new Point(20, 260);
            grpFilters.Size = new Size(540, 120);
            grpFilters.Font = new Font("Segoe UI", 9, FontStyle.Bold);

            // Allowed Extensions
            var lblAllowedExtLabel = new Label();
            lblAllowedExtLabel.Text = "Dozwolone rozszerzenia:";
            lblAllowedExtLabel.Location = new Point(15, 30);
            lblAllowedExtLabel.Size = new Size(150, 20);
            lblAllowedExtLabel.Font = new Font("Segoe UI", 9, FontStyle.Bold);
            grpFilters.Controls.Add(lblAllowedExtLabel);

            lblAllowedExt = new Label();
            lblAllowedExt.Location = new Point(170, 30);
            lblAllowedExt.Size = new Size(350, 20);
            lblAllowedExt.Font = new Font("Segoe UI", 9);
            grpFilters.Controls.Add(lblAllowedExt);

            // Excluded Extensions
            var lblExcludedExtLabel = new Label();
            lblExcludedExtLabel.Text = "Wykluczone rozszerzenia:";
            lblExcludedExtLabel.Location = new Point(15, 55);
            lblExcludedExtLabel.Size = new Size(150, 20);
            lblExcludedExtLabel.Font = new Font("Segoe UI", 9, FontStyle.Bold);
            grpFilters.Controls.Add(lblExcludedExtLabel);

            lblExcludedExt = new Label();
            lblExcludedExt.Location = new Point(170, 55);
            lblExcludedExt.Size = new Size(350, 20);
            lblExcludedExt.Font = new Font("Segoe UI", 9);
            grpFilters.Controls.Add(lblExcludedExt);

            // Max File Size
            var lblMaxFileSizeLabel = new Label();
            lblMaxFileSizeLabel.Text = "Maksymalny rozmiar pliku:";
            lblMaxFileSizeLabel.Location = new Point(15, 80);
            lblMaxFileSizeLabel.Size = new Size(150, 20);
            lblMaxFileSizeLabel.Font = new Font("Segoe UI", 9, FontStyle.Bold);
            grpFilters.Controls.Add(lblMaxFileSizeLabel);

            lblMaxFileSize = new Label();
            lblMaxFileSize.Location = new Point(170, 80);
            lblMaxFileSize.Size = new Size(350, 20);
            lblMaxFileSize.Font = new Font("Segoe UI", 9);
            grpFilters.Controls.Add(lblMaxFileSize);

            this.Controls.Add(grpFilters);

            // Actions Group
            grpActions = new GroupBox();
            grpActions.Text = "Akcje";
            grpActions.Location = new Point(20, 400);
            grpActions.Size = new Size(540, 180);
            grpActions.Font = new Font("Segoe UI", 9, FontStyle.Bold);

            // Sync Now Button
            btnSyncNow = new Button();
            btnSyncNow.Text = "Synchronizuj teraz";
            btnSyncNow.Location = new Point(20, 30);
            btnSyncNow.Size = new Size(120, 30);
            btnSyncNow.UseVisualStyleBackColor = true;
            btnSyncNow.Click += BtnSyncNow_Click;
            grpActions.Controls.Add(btnSyncNow);

            // Toggle Status Button
            btnToggleStatus = new Button();
            btnToggleStatus.Location = new Point(150, 30);
            btnToggleStatus.Size = new Size(120, 30);
            btnToggleStatus.UseVisualStyleBackColor = true;
            btnToggleStatus.Click += BtnToggleStatus_Click;
            grpActions.Controls.Add(btnToggleStatus);

            // Open Local Folder Button
            btnOpenLocalFolder = new Button();
            btnOpenLocalFolder.Text = "Otwórz folder lokalny";
            btnOpenLocalFolder.Location = new Point(280, 30);
            btnOpenLocalFolder.Size = new Size(120, 30);
            btnOpenLocalFolder.UseVisualStyleBackColor = true;
            btnOpenLocalFolder.Click += BtnOpenLocalFolder_Click;
            grpActions.Controls.Add(btnOpenLocalFolder);

            // Edit Button
            btnEdit = new Button();
            btnEdit.Text = "Edytuj";
            btnEdit.Location = new Point(20, 70);
            btnEdit.Size = new Size(120, 30);
            btnEdit.UseVisualStyleBackColor = true;
            btnEdit.Click += BtnEdit_Click;
            grpActions.Controls.Add(btnEdit);

            // Delete Button
            btnDelete = new Button();
            btnDelete.Text = "Usuń synchronizację";
            btnDelete.Location = new Point(150, 70);
            btnDelete.Size = new Size(120, 30);
            btnDelete.UseVisualStyleBackColor = true;
            btnDelete.ForeColor = Color.Red;
            btnDelete.Click += BtnDelete_Click;
            grpActions.Controls.Add(btnDelete);

            this.Controls.Add(grpActions);

            // Close Button
            btnClose = new Button();
            btnClose.Text = "Zamknij";
            btnClose.Location = new Point(485, 600);
            btnClose.Size = new Size(75, 30);
            btnClose.UseVisualStyleBackColor = true;
            btnClose.Click += BtnClose_Click;
            this.Controls.Add(btnClose);

            // Status Bar
            lblStatusBar = new Label();
            lblStatusBar.Text = "";
            lblStatusBar.Location = new Point(20, 600);
            lblStatusBar.Size = new Size(400, 20);
            lblStatusBar.ForeColor = Color.Blue;
            this.Controls.Add(lblStatusBar);

            // Progress Bar
            progressBar = new ProgressBar();
            progressBar.Location = new Point(20, 625);
            progressBar.Size = new Size(540, 10);
            progressBar.Style = ProgressBarStyle.Marquee;
            progressBar.Visible = false;
            this.Controls.Add(progressBar);

            this.ResumeLayout(false);
            this.PerformLayout();
        }

        private void LoadSyncDetails() {
            if (_config == null) return;

            // Title
            lblTitle.Text = _config.ServerFolderName ?? "Synchronizacja";

            // Basic Info
            lblLocalPath.Text = _config.LocalFolderPath ?? "Nie ustawiono";
            lblServerFolder.Text = _config.ServerFolderName ?? "Nie ustawiono";

            // Sync Direction
            string direction;
            switch (_config.SyncDirection) {
                case "bidirectional":
                    direction = "Obustronna (dwukierunkowa)";
                    break;
                case "to-client":
                    direction = "Do klienta (pobieranie)";
                    break;
                case "from-client":
                    direction = "Od klienta (wysyłanie)";
                    break;
                default:
                    direction = "Nieznany";
                    break;
            }
            lblSyncDirection.Text = direction;

            // Status
            lblStatus.Text = _config.IsActive ? "Aktywna" : "Nieaktywna";
            lblStatus.ForeColor = _config.IsActive ? Color.Green : Color.Red;

            // Last Sync
            lblLastSync.Text = _config.LastSyncDate?.ToString("dd.MM.yyyy HH:mm:ss") ?? "Nigdy";

            // Interval
            lblInterval.Text = $"{_config.SyncIntervalMinutes} minut";

            // Filters
            if (_config.Filters != null) {
                lblAllowedExt.Text = _config.Filters.allowedExtensions?.Any() == true
                    ? string.Join(", ", _config.Filters.allowedExtensions)
                    : "Wszystkie";

                lblExcludedExt.Text = _config.Filters.excludedExtensions?.Any() == true
                    ? string.Join(", ", _config.Filters.excludedExtensions)
                    : "Brak";

                lblMaxFileSize.Text = _config.Filters.maxFileSize.HasValue
                    ? FormatFileSize(_config.Filters.maxFileSize.Value)
                    : "Bez limitu";
            } else {
                lblAllowedExt.Text = "Wszystkie";
                lblExcludedExt.Text = "Brak";
                lblMaxFileSize.Text = "Bez limitu";
            }

            // Toggle Status Button
            btnToggleStatus.Text = _config.IsActive ? "Dezaktywuj" : "Aktywuj";
            btnToggleStatus.ForeColor = _config.IsActive ? Color.Red : Color.Green;

            // Enable/disable buttons based on status
            btnSyncNow.Enabled = _config.IsActive;
        }

        private string FormatFileSize(long bytes) {
            string[] sizes = { "B", "KB", "MB", "GB", "TB" };
            double len = bytes;
            int order = 0;
            while (len >= 1024 && order < sizes.Length - 1) {
                order++;
                len = len / 1024;
            }
            return $"{len:0.##} {sizes[order]}";
        }

        private async void BtnSyncNow_Click(object sender, EventArgs e) {
            if (!_config.IsActive) {
                MessageBox.Show("Synchronizacja jest nieaktywna. Najpierw ją aktywuj.",
                    "Informacja", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            SetLoading(true);
            ShowMessage("Rozpoczynam synchronizację...");

            try {
                // Aktualizuj aktywność klienta
                await _apiClient.UpdateClientActivityAsync(_currentClientId);

                // Zaktualizuj datę ostatniej synchronizacji
                _config.LastSyncDate = DateTime.Now;
                _syncConfigManager.UpdateConfig(_config);

                ShowMessage("Synchronizacja zakończona pomyślnie");
                LoadSyncDetails(); // Odśwież dane
            } catch (Exception ex) {
                ShowMessage($"Błąd synchronizacji: {ex.Message}");
                MessageBox.Show($"Błąd podczas synchronizacji: {ex.Message}",
                    "Błąd", MessageBoxButtons.OK, MessageBoxIcon.Error);
            } finally {
                SetLoading(false);
            }
        }

        private void BtnToggleStatus_Click(object sender, EventArgs e) {
            _config.IsActive = !_config.IsActive;
            _syncConfigManager.UpdateConfig(_config);
            LoadSyncDetails();
            ShowMessage($"Synchronizacja została {(_config.IsActive ? "aktywowana" : "dezaktywowana")}");
            this.DialogResult = DialogResult.OK; // Odśwież główne okno
        }

        private void BtnOpenLocalFolder_Click(object sender, EventArgs e) {
            if (string.IsNullOrEmpty(_config.LocalFolderPath)) {
                MessageBox.Show("Ścieżka do folderu lokalnego nie jest ustawiona.",
                    "Informacja", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            try {
                if (Directory.Exists(_config.LocalFolderPath)) {
                    System.Diagnostics.Process.Start("explorer.exe", _config.LocalFolderPath);
                } else {
                    MessageBox.Show("Folder lokalny nie istnieje.",
                        "Błąd", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
            } catch (Exception ex) {
                MessageBox.Show($"Nie można otworzyć folderu: {ex.Message}",
                    "Błąd", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void BtnEdit_Click(object sender, EventArgs e) {
            var editForm = new AddSyncForm(_apiClient, _syncConfigManager, _currentClientId, _config);
            if (editForm.ShowDialog() == DialogResult.OK) {
                // Odśwież konfigurację
                _config = _syncConfigManager.GetConfig(_config.SyncId);
                LoadSyncDetails();
                this.DialogResult = DialogResult.OK; // Odśwież główne okno
            }
        }

        private async void BtnDelete_Click(object sender, EventArgs e) {
            var result = MessageBox.Show($"Czy na pewno chcesz usunąć synchronizację '{_config.ServerFolderName}'?\n\nTa operacja nie może zostać cofnięta.",
                "Usuwanie synchronizacji", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);

            if (result == DialogResult.Yes) {
                SetLoading(true);
                ShowMessage("Usuwam synchronizację...");

                try {
                    await _apiClient.DeleteSyncFolderAsync(_config.ServerFolderId, _currentClientId);
                    _syncConfigManager.RemoveConfig(_config.SyncId);
                    ShowMessage("Synchronizacja została usunięta");
                    this.DialogResult = DialogResult.OK;
                    this.Close();
                } catch (Exception ex) {
                    ShowMessage($"Błąd usuwania: {ex.Message}");
                    MessageBox.Show($"Błąd podczas usuwania synchronizacji: {ex.Message}",
                        "Błąd", MessageBoxButtons.OK, MessageBoxIcon.Error);
                } finally {
                    SetLoading(false);
                }
            }
        }

        private void BtnClose_Click(object sender, EventArgs e) {
            this.Close();
        }

        private void ShowMessage(string message) {
            lblStatusBar.Text = message;
        }

        private void SetLoading(bool isLoading) {
            btnSyncNow.Enabled = !isLoading && _config.IsActive;
            btnToggleStatus.Enabled = !isLoading;
            btnOpenLocalFolder.Enabled = !isLoading;
            btnEdit.Enabled = !isLoading;
            btnDelete.Enabled = !isLoading;
            btnClose.Enabled = !isLoading;
            progressBar.Visible = isLoading;
        }
    }
}