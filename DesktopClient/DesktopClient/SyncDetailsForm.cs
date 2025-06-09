using DesktopClient.Models;
using DesktopClient.Services;
using System;
using System.Drawing;
using System.Windows.Forms;

namespace DesktopClient.Forms {
    public partial class SyncDetailsForm : Form {
        private readonly ApiClient _apiClient;
        private readonly SyncService _syncService;
        private readonly string _folderId;
        private readonly string _syncId;
        private readonly string _folderName;
        private SyncClientInfo _syncInfo;

        private TextBox txtFolderPath;
        private ComboBox cmbSyncDirection;
        private CheckBox chkIsActive;
        private Button btnSave;
        private Button btnDelete;
        private Button btnForceSync;
        private Button btnCancel;
        private Label lblStatus;

        public SyncDetailsForm(ApiClient apiClient, SyncService syncService, string folderId, string syncId, string folderName) {
            _apiClient = apiClient;
            _syncService = syncService;
            _folderId = folderId;
            _syncId = syncId;
            _folderName = folderName;

            InitializeComponent();
            LoadSyncDetails();
        }

        private void InitializeComponent() {
            this.SuspendLayout();

            // Form properties
            this.Text = $"Szczegóły synchronizacji - {_folderName}";
            this.Size = new Size(500, 350);
            this.StartPosition = FormStartPosition.CenterParent;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;

            // Folder path
            Label lblFolderPath = new Label();
            lblFolderPath.Text = "Ścieżka lokalna:";
            lblFolderPath.Location = new Point(20, 20);
            lblFolderPath.Size = new Size(100, 20);
            this.Controls.Add(lblFolderPath);

            txtFolderPath = new TextBox();
            txtFolderPath.Location = new Point(20, 45);
            txtFolderPath.Size = new Size(350, 25);
            this.Controls.Add(txtFolderPath);

            Button btnBrowse = new Button();
            btnBrowse.Text = "...";
            btnBrowse.Location = new Point(380, 45);
            btnBrowse.Size = new Size(30, 25);
            btnBrowse.Click += BtnBrowse_Click;
            this.Controls.Add(btnBrowse);

            // Sync direction
            Label lblSyncDirection = new Label();
            lblSyncDirection.Text = "Kierunek synchronizacji:";
            lblSyncDirection.Location = new Point(20, 85);
            lblSyncDirection.Size = new Size(150, 20);
            this.Controls.Add(lblSyncDirection);

            cmbSyncDirection = new ComboBox();
            cmbSyncDirection.Location = new Point(20, 110);
            cmbSyncDirection.Size = new Size(200, 25);
            cmbSyncDirection.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbSyncDirection.Items.AddRange(new object[] {
                new { Text = "Dwukierunkowa", Value = "bidirectional" },
                new { Text = "Do klienta", Value = "to-client" },
                new { Text = "Od klienta", Value = "from-client" }
            });
            cmbSyncDirection.DisplayMember = "Text";
            cmbSyncDirection.ValueMember = "Value";
            this.Controls.Add(cmbSyncDirection);

            // Active checkbox
            chkIsActive = new CheckBox();
            chkIsActive.Text = "Synchronizacja aktywna";
            chkIsActive.Location = new Point(20, 150);
            chkIsActive.Size = new Size(200, 25);
            this.Controls.Add(chkIsActive);

            // Status label
            lblStatus = new Label();
            lblStatus.Location = new Point(20, 190);
            lblStatus.Size = new Size(450, 40);
            lblStatus.ForeColor = Color.Blue;
            this.Controls.Add(lblStatus);

            // Buttons panel
            Panel panelButtons = new Panel();
            panelButtons.Location = new Point(20, 250);
            panelButtons.Size = new Size(450, 40);
            this.Controls.Add(panelButtons);

            btnSave = new Button();
            btnSave.Text = "Zapisz";
            btnSave.Location = new Point(0, 5);
            btnSave.Size = new Size(80, 30);
            btnSave.Click += BtnSave_Click;
            panelButtons.Controls.Add(btnSave);

            btnDelete = new Button();
            btnDelete.Text = "Usuń";
            btnDelete.Location = new Point(90, 5);
            btnDelete.Size = new Size(80, 30);
            btnDelete.Click += BtnDelete_Click;
            panelButtons.Controls.Add(btnDelete);

            btnForceSync = new Button();
            btnForceSync.Text = "Wymuś sync";
            btnForceSync.Location = new Point(180, 5);
            btnForceSync.Size = new Size(100, 30);
            btnForceSync.Click += BtnForceSync_Click;
            panelButtons.Controls.Add(btnForceSync);

            btnCancel = new Button();
            btnCancel.Text = "Anuluj";
            btnCancel.Location = new Point(290, 5);
            btnCancel.Size = new Size(80, 30);
            btnCancel.DialogResult = DialogResult.Cancel;
            panelButtons.Controls.Add(btnCancel);

            this.CancelButton = btnCancel;
            this.ResumeLayout(false);
        }

        private async void LoadSyncDetails() {
            SetControlsEnabled(false);
            ShowStatus("Ładowanie szczegółów synchronizacji...", Color.Blue);

            try {
                System.Diagnostics.Debug.WriteLine($"Loading sync details for folder: {_folderId}, sync: {_syncId}");

                var response = await _apiClient.GetSyncDetailsAsync(_folderId, _syncId);

                System.Diagnostics.Debug.WriteLine($"API Response - Success: {response?.success}, Sync: {response?.sync != null}");

                if (response?.success == true && response.sync != null) {
                    _syncInfo = response.sync;
                    PopulateForm();
                    ShowStatus("Szczegóły załadowane", Color.Green);
                } else {
                    var errorMessage = response?.message ?? response?.error ?? "Nieznany błąd";
                    ShowStatus($"Błąd ładowania szczegółów: {errorMessage}", Color.Red);
                    System.Diagnostics.Debug.WriteLine($"API Error: {errorMessage}");
                }
            } catch (Exception ex) {
                ShowStatus($"Błąd: {ex.Message}", Color.Red);
                System.Diagnostics.Debug.WriteLine($"Exception in LoadSyncDetails: {ex}");
            } finally {
                SetControlsEnabled(true);
            }
        }

        private void PopulateForm() {
            txtFolderPath.Text = _syncInfo.clientFolderPath ?? "";

            foreach (dynamic item in cmbSyncDirection.Items) {
                if (item.Value == _syncInfo.syncDirection) {
                    cmbSyncDirection.SelectedItem = item;
                    break;
                }
            }

            chkIsActive.Checked = _syncInfo.isActive;
        }

        private void BtnBrowse_Click(object sender, EventArgs e) {
            using (var folderDialog = new FolderBrowserDialog()) {
                folderDialog.SelectedPath = txtFolderPath.Text;
                if (folderDialog.ShowDialog() == DialogResult.OK) {
                    txtFolderPath.Text = folderDialog.SelectedPath;
                }
            }
        }

        private async void BtnSave_Click(object sender, EventArgs e) {
            if (string.IsNullOrWhiteSpace(txtFolderPath.Text)) {
                MessageBox.Show("Proszę wybrać ścieżkę folderu", "Błąd", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            SetControlsEnabled(false);
            ShowStatus("Zapisywanie...", Color.Blue);

            try {
                var settings = new UpdateSyncSettingsRequest {
                    clientFolderPath = txtFolderPath.Text,
                    syncDirection = ((dynamic)cmbSyncDirection.SelectedItem).Value,
                    isActive = chkIsActive.Checked
                };

                var response = await _apiClient.UpdateSyncSettingsAsync(_folderId, _syncId, settings);
                if (response.success) {
                    ShowStatus("Zapisano pomyślnie", Color.Green);
                    this.DialogResult = DialogResult.OK;
                    this.Close();
                } else {
                    ShowStatus($"Błąd zapisu: {response.message}", Color.Red);
                }
            } catch (Exception ex) {
                ShowStatus($"Błąd zapisu: {ex.Message}", Color.Red);
            } finally {
                SetControlsEnabled(true);
            }
        }

        private async void BtnDelete_Click(object sender, EventArgs e) {
            var result = MessageBox.Show(
                "Czy na pewno chcesz usunąć tę synchronizację?",
                "Potwierdzenie usunięcia",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question);

            if (result != DialogResult.Yes) return;

            SetControlsEnabled(false);
            ShowStatus("Usuwanie...", Color.Blue);

            try {
                var response = await _apiClient.DeleteSyncFolderAsync(_folderId, _syncId);
                if (response.success) {
                    ShowStatus("Usunięto pomyślnie", Color.Green);
                    this.DialogResult = DialogResult.OK;
                    this.Close();
                } else {
                    ShowStatus($"Błąd usuwania: {response.message}", Color.Red);
                }
            } catch (Exception ex) {
                ShowStatus($"Błąd usuwania: {ex.Message}", Color.Red);
            } finally {
                SetControlsEnabled(true);
            }
        }

        private async void BtnForceSync_Click(object sender, EventArgs e) {
            SetControlsEnabled(false);
            ShowStatus("Wymuszanie synchronizacji...", Color.Blue);

            try {
                await _syncService.PerformSyncAsync(_folderId);
                ShowStatus("Synchronizacja zakończona", Color.Green);
            } catch (Exception ex) {
                ShowStatus($"Błąd synchronizacji: {ex.Message}", Color.Red);
            } finally {
                SetControlsEnabled(true);
            }
        }

        private void ShowStatus(string message, Color color) {
            lblStatus.Text = message;
            lblStatus.ForeColor = color;
        }

        private void SetControlsEnabled(bool enabled) {
            txtFolderPath.Enabled = enabled;
            cmbSyncDirection.Enabled = enabled;
            chkIsActive.Enabled = enabled;
            btnSave.Enabled = enabled;
            btnDelete.Enabled = enabled;
            btnForceSync.Enabled = enabled;
        }
    }
}