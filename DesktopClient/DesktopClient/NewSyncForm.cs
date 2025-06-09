using DesktopClient.Models;
using DesktopClient.Services;
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;

namespace DesktopClient.Forms {
    public partial class NewSyncForm : Form {
        private readonly ApiClient _apiClient;
        private readonly string _clientId;
        private List<Folder> _serverFolders;

        private ComboBox cmbServerFolder;
        private TextBox txtLocalPath;
        private Button btnBrowse;
        private ComboBox cmbSyncDirection;
        private Button btnCreate;
        private Button btnCancel;
        private Label lblStatus;

        public NewSyncForm(ApiClient apiClient, string clientId) {
            _apiClient = apiClient;
            _clientId = clientId;
            InitializeComponent();
            LoadServerFolders();
        }

        private void InitializeComponent() {
            this.SuspendLayout();

            // Form properties
            this.Text = "Nowa synchronizacja";
            this.Size = new Size(500, 300);
            this.StartPosition = FormStartPosition.CenterParent;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;

            // Server folder label
            Label lblServerFolder = new Label();
            lblServerFolder.Text = "Folder na serwerze:";
            lblServerFolder.Location = new Point(20, 20);
            lblServerFolder.Size = new Size(150, 20);
            this.Controls.Add(lblServerFolder);

            // Server folder combo
            cmbServerFolder = new ComboBox();
            cmbServerFolder.Location = new Point(20, 45);
            cmbServerFolder.Size = new Size(440, 25);
            cmbServerFolder.DropDownStyle = ComboBoxStyle.DropDownList;
            this.Controls.Add(cmbServerFolder);

            // Local path label
            Label lblLocalPath = new Label();
            lblLocalPath.Text = "Folder lokalny:";
            lblLocalPath.Location = new Point(20, 80);
            lblLocalPath.Size = new Size(150, 20);
            this.Controls.Add(lblLocalPath);

            // Local path textbox
            txtLocalPath = new TextBox();
            txtLocalPath.Location = new Point(20, 105);
            txtLocalPath.Size = new Size(350, 25);
            txtLocalPath.ReadOnly = true;
            this.Controls.Add(txtLocalPath);

            // Browse button
            btnBrowse = new Button();
            btnBrowse.Text = "Wybierz...";
            btnBrowse.Location = new Point(380, 105);
            btnBrowse.Size = new Size(80, 25);
            btnBrowse.UseVisualStyleBackColor = true;
            btnBrowse.Click += BtnBrowse_Click;
            this.Controls.Add(btnBrowse);

            // Sync direction label
            Label lblSyncDirection = new Label();
            lblSyncDirection.Text = "Kierunek synchronizacji:";
            lblSyncDirection.Location = new Point(20, 140);
            lblSyncDirection.Size = new Size(150, 20);
            this.Controls.Add(lblSyncDirection);

            // Sync direction combo
            cmbSyncDirection = new ComboBox();
            cmbSyncDirection.Location = new Point(20, 165);
            cmbSyncDirection.Size = new Size(200, 25);
            cmbSyncDirection.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbSyncDirection.Items.AddRange(new object[] {
                new { Text = "Dwukierunkowa", Value = "bidirectional" },
                new { Text = "Do klienta", Value = "to-client" },
                new { Text = "Od klienta", Value = "from-client" }
            });
            cmbSyncDirection.DisplayMember = "Text";
            cmbSyncDirection.ValueMember = "Value";
            cmbSyncDirection.SelectedIndex = 0;
            this.Controls.Add(cmbSyncDirection);

            // Status label
            lblStatus = new Label();
            lblStatus.Location = new Point(20, 200);
            lblStatus.Size = new Size(440, 20);
            lblStatus.ForeColor = Color.Red;
            this.Controls.Add(lblStatus);

            // Buttons panel
            Panel panelButtons = new Panel();
            panelButtons.Location = new Point(20, 230);
            panelButtons.Size = new Size(440, 35);
            this.Controls.Add(panelButtons);

            // Cancel button
            btnCancel = new Button();
            btnCancel.Text = "Anuluj";
            btnCancel.Location = new Point(275, 5);
            btnCancel.Size = new Size(80, 25);
            btnCancel.UseVisualStyleBackColor = true;
            btnCancel.Click += BtnCancel_Click;
            panelButtons.Controls.Add(btnCancel);

            // Create button
            btnCreate = new Button();
            btnCreate.Text = "Utwórz";
            btnCreate.Location = new Point(360, 5);
            btnCreate.Size = new Size(80, 25);
            btnCreate.UseVisualStyleBackColor = true;
            btnCreate.Click += BtnCreate_Click;
            panelButtons.Controls.Add(btnCreate);

            this.ResumeLayout(false);
        }

        private async void LoadServerFolders() {
            try {
                lblStatus.Text = "Ładowanie folderów z serwera...";
                lblStatus.ForeColor = Color.Blue;

                _serverFolders = await _apiClient.GetFoldersAsync();

                cmbServerFolder.Items.Clear();
                if (_serverFolders?.Any() == true) {
                    foreach (var folder in _serverFolders) {
                        cmbServerFolder.Items.Add(new { Text = folder.name, Value = folder._id });
                    }
                    cmbServerFolder.DisplayMember = "Text";
                    cmbServerFolder.ValueMember = "Value";
                    lblStatus.Text = "";
                } else {
                    lblStatus.Text = "Brak dostępnych folderów na serwerze";
                    lblStatus.ForeColor = Color.Orange;
                }
            } catch (Exception ex) {
                lblStatus.Text = $"Błąd ładowania folderów: {ex.Message}";
                lblStatus.ForeColor = Color.Red;
            }
        }

        private void BtnBrowse_Click(object sender, EventArgs e) {
            using (var folderDialog = new FolderBrowserDialog()) {
                folderDialog.Description = "Wybierz folder do synchronizacji";
                folderDialog.ShowNewFolderButton = true;

                if (folderDialog.ShowDialog() == DialogResult.OK) {
                    txtLocalPath.Text = folderDialog.SelectedPath;
                }
            }
        }

        private async void BtnCreate_Click(object sender, EventArgs e) {
            if (!ValidateForm()) {
                return;
            }

            try {
                btnCreate.Enabled = false;
                btnCancel.Enabled = false;
                lblStatus.Text = "Tworzenie synchronizacji...";
                lblStatus.ForeColor = Color.Blue;

                var selectedServerFolder = (dynamic)cmbServerFolder.SelectedItem;
                var selectedSyncDirection = (dynamic)cmbSyncDirection.SelectedItem;

                var response = await _apiClient.AddFolderToSyncAsync(
                    _clientId,
                    txtLocalPath.Text,
                    selectedServerFolder.Value.ToString(),
                    System.IO.Path.GetFileName(txtLocalPath.Text)
                );

                if (response?.success == true) {
                    this.DialogResult = DialogResult.OK;
                    this.Close();
                } else {
                    lblStatus.Text = response?.syncFolder != null ?
                        "Synchronizacja została utworzona" :
                        "Błąd podczas tworzenia synchronizacji";
                    lblStatus.ForeColor = response?.syncFolder != null ? Color.Green : Color.Red;

                    if (response?.syncFolder != null) {
                        this.DialogResult = DialogResult.OK;
                        this.Close();
                    }
                }
            } catch (Exception ex) {
                lblStatus.Text = $"Błąd: {ex.Message}";
                lblStatus.ForeColor = Color.Red;
            } finally {
                btnCreate.Enabled = true;
                btnCancel.Enabled = true;
            }
        }

        private void BtnCancel_Click(object sender, EventArgs e) {
            this.DialogResult = DialogResult.Cancel;
            this.Close();
        }

        private bool ValidateForm() {
            if (cmbServerFolder.SelectedItem == null) {
                lblStatus.Text = "Wybierz folder na serwerze";
                lblStatus.ForeColor = Color.Red;
                return false;
            }

            if (string.IsNullOrWhiteSpace(txtLocalPath.Text)) {
                lblStatus.Text = "Wybierz folder lokalny";
                lblStatus.ForeColor = Color.Red;
                return false;
            }

            if (!System.IO.Directory.Exists(txtLocalPath.Text)) {
                lblStatus.Text = "Wybrany folder lokalny nie istnieje";
                lblStatus.ForeColor = Color.Red;
                return false;
            }

            if (cmbSyncDirection.SelectedItem == null) {
                lblStatus.Text = "Wybierz kierunek synchronizacji";
                lblStatus.ForeColor = Color.Red;
                return false;
            }

            return true;
        }
    }
}