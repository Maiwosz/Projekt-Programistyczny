using DesktopClient.Models;
using DesktopClient.Services;
using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Windows.Forms;

namespace DesktopClient {
    public partial class AddSyncForm : Form {
        private ApiClient _apiClient;
        private SyncConfigManager _syncConfigManager;
        private string _currentClientId;
        private LocalSyncConfig _editingConfig;
        private bool _isEditing;

        // Controls
        private ComboBox cmbServerFolder;
        private TextBox txtLocalFolder;
        private Button btnBrowseLocal;
        private ComboBox cmbDirection;
        private NumericUpDown numInterval;
        private CheckBox chkIsActive;
        private TextBox txtAllowedExtensions;
        private TextBox txtExcludedExtensions;
        private NumericUpDown numMaxFileSize;
        private Button btnSave;
        private Button btnCancel;
        private Label lblStatus;
        private ProgressBar progressBar;

        private List<Folder> _serverFolders;

        public AddSyncForm(ApiClient apiClient, SyncConfigManager syncConfigManager, string clientId, LocalSyncConfig editConfig = null) {
            _apiClient = apiClient;
            _syncConfigManager = syncConfigManager;
            _currentClientId = clientId;
            _editingConfig = editConfig;
            _isEditing = editConfig != null;

            InitializeComponent();
            LoadServerFolders();

            if (_isEditing) {
                LoadConfigForEditing();
            }
        }

        private void InitializeComponent() {
            this.SuspendLayout();

            // Form properties
            this.Text = _isEditing ? "Edytuj synchronizację" : "Dodaj synchronizację";
            this.Size = new Size(600, 550);
            this.StartPosition = FormStartPosition.CenterParent;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;

            int yPos = 20;

            // Server folder selection
            Label lblServerFolder = new Label();
            lblServerFolder.Text = "Folder serwera:";
            lblServerFolder.Location = new Point(20, yPos);
            lblServerFolder.Size = new Size(100, 20);
            this.Controls.Add(lblServerFolder);

            cmbServerFolder = new ComboBox();
            cmbServerFolder.Location = new Point(130, yPos);
            cmbServerFolder.Size = new Size(430, 25);
            cmbServerFolder.DropDownStyle = ComboBoxStyle.DropDownList;
            this.Controls.Add(cmbServerFolder);

            yPos += 40;

            // Local folder selection
            Label lblLocalFolder = new Label();
            lblLocalFolder.Text = "Folder lokalny:";
            lblLocalFolder.Location = new Point(20, yPos);
            lblLocalFolder.Size = new Size(100, 20);
            this.Controls.Add(lblLocalFolder);

            txtLocalFolder = new TextBox();
            txtLocalFolder.Location = new Point(130, yPos);
            txtLocalFolder.Size = new Size(350, 25);
            this.Controls.Add(txtLocalFolder);

            btnBrowseLocal = new Button();
            btnBrowseLocal.Text = "Przeglądaj";
            btnBrowseLocal.Location = new Point(490, yPos);
            btnBrowseLocal.Size = new Size(70, 25);
            btnBrowseLocal.Click += BtnBrowseLocal_Click;
            this.Controls.Add(btnBrowseLocal);

            yPos += 40;

            // Sync direction
            Label lblDirection = new Label();
            lblDirection.Text = "Kierunek sync:";
            lblDirection.Location = new Point(20, yPos);
            lblDirection.Size = new Size(100, 20);
            this.Controls.Add(lblDirection);

            cmbDirection = new ComboBox();
            cmbDirection.Location = new Point(130, yPos);
            cmbDirection.Size = new Size(200, 25);
            cmbDirection.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbDirection.Items.Add("Obustronna");
            cmbDirection.Items.Add("Do klienta");
            cmbDirection.Items.Add("Od klienta");
            cmbDirection.SelectedIndex = 0;
            this.Controls.Add(cmbDirection);

            yPos += 40;

            // Sync interval
            Label lblInterval = new Label();
            lblInterval.Text = "Interwał (min):";
            lblInterval.Location = new Point(20, yPos);
            lblInterval.Size = new Size(100, 20);
            this.Controls.Add(lblInterval);

            numInterval = new NumericUpDown();
            numInterval.Location = new Point(130, yPos);
            numInterval.Size = new Size(100, 25);
            numInterval.Minimum = 1;
            numInterval.Maximum = 1440; // 24 hours
            numInterval.Value = 30;
            this.Controls.Add(numInterval);

            // Active checkbox
            chkIsActive = new CheckBox();
            chkIsActive.Text = "Aktywna";
            chkIsActive.Location = new Point(250, yPos);
            chkIsActive.Size = new Size(80, 25);
            chkIsActive.Checked = true;
            this.Controls.Add(chkIsActive);

            yPos += 50;

            // Filters section
            Label lblFilters = new Label();
            lblFilters.Text = "Filtry synchronizacji:";
            lblFilters.Font = new Font("Segoe UI", 9, FontStyle.Bold);
            lblFilters.Location = new Point(20, yPos);
            lblFilters.Size = new Size(150, 20);
            this.Controls.Add(lblFilters);

            yPos += 30;

            // Allowed extensions
            Label lblAllowed = new Label();
            lblAllowed.Text = "Dozwolone rozszerzenia (*.txt;*.doc):";
            lblAllowed.Location = new Point(20, yPos);
            lblAllowed.Size = new Size(250, 20);
            this.Controls.Add(lblAllowed);

            yPos += 25;

            txtAllowedExtensions = new TextBox();
            txtAllowedExtensions.Location = new Point(20, yPos);
            txtAllowedExtensions.Size = new Size(540, 25);
            txtAllowedExtensions.Text = ""; // Usunięto PlaceholderText
            txtAllowedExtensions.ForeColor = Color.Gray;
            txtAllowedExtensions.Enter += (s, e) => {
                if (txtAllowedExtensions.Text == "" && txtAllowedExtensions.ForeColor == Color.Gray) {
                    txtAllowedExtensions.Text = "";
                    txtAllowedExtensions.ForeColor = Color.Black;
                }
            };
            txtAllowedExtensions.Leave += (s, e) => {
                if (string.IsNullOrWhiteSpace(txtAllowedExtensions.Text)) {
                    txtAllowedExtensions.Text = "";
                    txtAllowedExtensions.ForeColor = Color.Gray;
                }
            };
            this.Controls.Add(txtAllowedExtensions);

            // Dodaj etykietę z podpowiedzią zamiast placeholder
            Label lblAllowedHint = new Label();
            lblAllowedHint.Text = "(Pozostaw puste dla wszystkich rozszerzeń)";
            lblAllowedHint.Location = new Point(20, yPos + 27);
            lblAllowedHint.Size = new Size(300, 15);
            lblAllowedHint.ForeColor = Color.Gray;
            lblAllowedHint.Font = new Font("Segoe UI", 8);
            this.Controls.Add(lblAllowedHint);

            yPos += 35;

            // Excluded extensions
            Label lblExcluded = new Label();
            lblExcluded.Text = "Wykluczone rozszerzenia (*.tmp;*.log):";
            lblExcluded.Location = new Point(20, yPos);
            lblExcluded.Size = new Size(250, 20);
            this.Controls.Add(lblExcluded);

            yPos += 25;

            txtExcludedExtensions = new TextBox();
            txtExcludedExtensions.Location = new Point(20, yPos);
            txtExcludedExtensions.Size = new Size(540, 25);
            this.Controls.Add(txtExcludedExtensions);

            yPos += 35;

            // Max file size
            Label lblMaxSize = new Label();
            lblMaxSize.Text = "Maks. rozmiar pliku (MB):";
            lblMaxSize.Location = new Point(20, yPos);
            lblMaxSize.Size = new Size(150, 20);
            this.Controls.Add(lblMaxSize);

            numMaxFileSize = new NumericUpDown();
            numMaxFileSize.Location = new Point(180, yPos);
            numMaxFileSize.Size = new Size(100, 25);
            numMaxFileSize.Minimum = 0;
            numMaxFileSize.Maximum = 10000;
            numMaxFileSize.Value = 100;
            this.Controls.Add(numMaxFileSize);

            Label lblMaxSizeNote = new Label();
            lblMaxSizeNote.Text = "(0 = bez limitu)";
            lblMaxSizeNote.Location = new Point(290, yPos + 3);
            lblMaxSizeNote.Size = new Size(100, 20);
            lblMaxSizeNote.ForeColor = Color.Gray;
            this.Controls.Add(lblMaxSizeNote);

            yPos += 50;

            // Status label
            lblStatus = new Label();
            lblStatus.Text = "";
            lblStatus.Location = new Point(20, yPos);
            lblStatus.Size = new Size(540, 20);
            lblStatus.ForeColor = Color.Blue;
            this.Controls.Add(lblStatus);

            // Progress bar
            progressBar = new ProgressBar();
            progressBar.Location = new Point(20, yPos + 25);
            progressBar.Size = new Size(540, 10);
            progressBar.Style = ProgressBarStyle.Marquee;
            progressBar.Visible = false;
            this.Controls.Add(progressBar);

            // Buttons
            btnCancel = new Button();
            btnCancel.Text = "Anuluj";
            btnCancel.Location = new Point(400, yPos + 45);
            btnCancel.Size = new Size(80, 30);
            btnCancel.DialogResult = DialogResult.Cancel;
            this.Controls.Add(btnCancel);

            btnSave = new Button();
            btnSave.Text = _isEditing ? "Zapisz" : "Dodaj";
            btnSave.Location = new Point(490, yPos + 45);
            btnSave.Size = new Size(80, 30);
            btnSave.UseVisualStyleBackColor = true;
            btnSave.Click += BtnSave_Click;
            this.Controls.Add(btnSave);

            this.ResumeLayout(false);
            this.PerformLayout();
        }

        private async void LoadServerFolders() {
            SetLoading(true);
            ShowMessage("Ładowanie folderów serwera...");

            try {
                _serverFolders = await _apiClient.GetFoldersAsync();

                cmbServerFolder.Items.Clear();
                foreach (var folder in _serverFolders) {
                    cmbServerFolder.Items.Add($"{folder.name} ({folder._id})");
                }

                if (cmbServerFolder.Items.Count > 0) {
                    cmbServerFolder.SelectedIndex = 0;
                }

                ShowMessage($"Załadowano {_serverFolders.Count} folderów");
            } catch (Exception ex) {
                ShowMessage($"Błąd ładowania folderów: {ex.Message}");
            } finally {
                SetLoading(false);
            }
        }

        private void LoadConfigForEditing() {
            if (_editingConfig == null) return;

            txtLocalFolder.Text = _editingConfig.LocalFolderPath;

            // Find and select server folder
            if (!string.IsNullOrEmpty(_editingConfig.ServerFolderId) && _serverFolders != null) {
                var folder = _serverFolders.FirstOrDefault(f => f._id == _editingConfig.ServerFolderId);
                if (folder != null) {
                    var index = _serverFolders.IndexOf(folder);
                    if (index >= 0) cmbServerFolder.SelectedIndex = index;
                }
            }

            // Set direction
            switch (_editingConfig.SyncDirection) {
                case "bidirectional":
                    cmbDirection.SelectedIndex = 0;
                    break;
                case "to-client":
                    cmbDirection.SelectedIndex = 1;
                    break;
                case "from-client":
                    cmbDirection.SelectedIndex = 2;
                    break;
            }

            numInterval.Value = _editingConfig.SyncIntervalMinutes;
            chkIsActive.Checked = _editingConfig.IsActive;

            // Load filters
            if (_editingConfig.Filters != null) {
                txtAllowedExtensions.Text = string.Join(";", _editingConfig.Filters.allowedExtensions ?? new List<string>());
                txtExcludedExtensions.Text = string.Join(";", _editingConfig.Filters.excludedExtensions ?? new List<string>());
                numMaxFileSize.Value = (_editingConfig.Filters.maxFileSize ?? 100) / (1024 * 1024); // Convert bytes to MB
            }
        }

        private void BtnBrowseLocal_Click(object sender, EventArgs e) {
            using (var folderDialog = new FolderBrowserDialog()) {
                folderDialog.Description = "Wybierz folder lokalny do synchronizacji";
                folderDialog.ShowNewFolderButton = true;

                if (folderDialog.ShowDialog() == DialogResult.OK) {
                    txtLocalFolder.Text = folderDialog.SelectedPath;
                }
            }
        }

        private async void BtnSave_Click(object sender, EventArgs e) {
            if (!ValidateInput()) return;

            SetLoading(true);
            ShowMessage(_isEditing ? "Aktualizowanie synchronizacji..." : "Dodawanie synchronizacji...");

            try {
                var config = CreateConfigFromForm();

                if (_isEditing) {
                    config.SyncId = _editingConfig.SyncId;
                    _syncConfigManager.UpdateConfig(config);
                } else {
                    // Create sync folder on server first
                    var selectedFolder = _serverFolders[cmbServerFolder.SelectedIndex];
                    var createRequest = new CreateSyncFolderRequest {
                        folderId = selectedFolder._id,
                        clientConfigs = new List<ClientConfig> {
                            new ClientConfig {
                                clientId = _currentClientId,
                                clientFolderId = Guid.NewGuid().ToString(),
                                clientFolderName = Path.GetFileName(txtLocalFolder.Text),
                                clientFolderPath = txtLocalFolder.Text,
                                syncDirection = GetSyncDirectionValue(),
                                filters = CreateFiltersFromForm()
                            }
                        }
                    };

                    var syncFolder = await _apiClient.CreateSyncFolderAsync(createRequest);

                    // Save local config
                    config.ServerFolderId = syncFolder._id;
                    _syncConfigManager.AddConfig(config);
                }

                ShowMessage(_isEditing ? "Synchronizacja zaktualizowana" : "Synchronizacja dodana");
                this.DialogResult = DialogResult.OK;
                this.Close();

            } catch (Exception ex) {
                ShowMessage($"Błąd: {ex.Message}");
            } finally {
                SetLoading(false);
            }
        }

        private bool ValidateInput() {
            if (cmbServerFolder.SelectedIndex < 0) {
                MessageBox.Show("Wybierz folder serwera", "Błąd walidacji", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }

            if (string.IsNullOrWhiteSpace(txtLocalFolder.Text)) {
                MessageBox.Show("Wybierz folder lokalny", "Błąd walidacji", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }

            if (!Directory.Exists(txtLocalFolder.Text)) {
                var result = MessageBox.Show($"Folder '{txtLocalFolder.Text}' nie istnieje. Czy chcesz go utworzyć?",
                    "Folder nie istnieje", MessageBoxButtons.YesNo, MessageBoxIcon.Question);

                if (result == DialogResult.Yes) {
                    try {
                        Directory.CreateDirectory(txtLocalFolder.Text);
                    } catch (Exception ex) {
                        MessageBox.Show($"Nie można utworzyć folderu: {ex.Message}", "Błąd", MessageBoxButtons.OK, MessageBoxIcon.Error);
                        return false;
                    }
                } else {
                    return false;
                }
            }

            return true;
        }

        private LocalSyncConfig CreateConfigFromForm() {
            var selectedFolder = _serverFolders[cmbServerFolder.SelectedIndex];

            return new LocalSyncConfig {
                LocalFolderPath = txtLocalFolder.Text,
                ServerFolderId = selectedFolder._id,
                ServerFolderName = selectedFolder.name,
                SyncDirection = GetSyncDirectionValue(),
                SyncIntervalMinutes = (int)numInterval.Value,
                IsActive = chkIsActive.Checked,
                Filters = CreateFiltersFromForm()
            };
        }

        private string GetSyncDirectionValue() {
            switch (cmbDirection.SelectedIndex) {
                case 0: return "bidirectional";
                case 1: return "to-client";
                case 2: return "from-client";
                default: return "bidirectional";
            }
        }

        private SyncFilters CreateFiltersFromForm() {
            var filters = new SyncFilters();

            // Parse allowed extensions
            if (!string.IsNullOrWhiteSpace(txtAllowedExtensions.Text)) {
                filters.allowedExtensions = txtAllowedExtensions.Text
                    .Split(';')
                    .Where(ext => !string.IsNullOrWhiteSpace(ext))
                    .Select(ext => ext.Trim())
                    .ToList();
            }

            // Parse excluded extensions
            if (!string.IsNullOrWhiteSpace(txtExcludedExtensions.Text)) {
                filters.excludedExtensions = txtExcludedExtensions.Text
                    .Split(';')
                    .Where(ext => !string.IsNullOrWhiteSpace(ext))
                    .Select(ext => ext.Trim())
                    .ToList();
            }

            // Set max file size (convert MB to bytes)
            if (numMaxFileSize.Value > 0) {
                filters.maxFileSize = (long)(numMaxFileSize.Value * 1024 * 1024);
            }

            return filters;
        }

        private void ShowMessage(string message) {
            lblStatus.Text = message;
        }

        private void SetLoading(bool isLoading) {
            btnSave.Enabled = !isLoading;
            btnBrowseLocal.Enabled = !isLoading;
            cmbServerFolder.Enabled = !isLoading;
            txtLocalFolder.Enabled = !isLoading;
            cmbDirection.Enabled = !isLoading;
            numInterval.Enabled = !isLoading;
            chkIsActive.Enabled = !isLoading;
            txtAllowedExtensions.Enabled = !isLoading;
            txtExcludedExtensions.Enabled = !isLoading;
            numMaxFileSize.Enabled = !isLoading;
            progressBar.Visible = isLoading;
        }
    }
}