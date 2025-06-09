using DesktopClient.Services;
using System;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;

namespace DesktopClient {
    public partial class MainForm : Form {
        private readonly ApiClient _apiClient;
        private readonly string _username;
        private readonly string _clientId;
        private readonly SyncService _syncService;

        private ListView listViewSyncs;
        private Button btnRefresh;
        private Button btnNewSync;
        private Label lblStatus;
        private ProgressBar progressBar;

        public MainForm(ApiClient apiClient, string username, string clientId) {
            _apiClient = apiClient;
            _username = username;
            _clientId = clientId;
            _syncService = new SyncService(_apiClient, _clientId);

            InitializeComponent();
            LoadSynchronizations();
        }

        private void InitializeComponent() {
            this.SuspendLayout();

            // Form properties
            this.Text = $"File Manager - {_username}";
            this.Size = new Size(800, 600);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.MinimumSize = new Size(600, 400);

            // Title label
            Label lblTitle = new Label();
            lblTitle.Text = "Synchronizacje";
            lblTitle.Font = new Font("Segoe UI", 14, FontStyle.Bold);
            lblTitle.Location = new Point(20, 20);
            lblTitle.Size = new Size(200, 25);
            this.Controls.Add(lblTitle);

            // Buttons panel
            Panel panelButtons = new Panel();
            panelButtons.Location = new Point(20, 55);
            panelButtons.Size = new Size(760, 40);
            panelButtons.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            this.Controls.Add(panelButtons);

            // Refresh button
            btnRefresh = new Button();
            btnRefresh.Text = "Odśwież";
            btnRefresh.Location = new Point(0, 5);
            btnRefresh.Size = new Size(100, 30);
            btnRefresh.UseVisualStyleBackColor = true;
            btnRefresh.Click += BtnRefresh_Click;
            panelButtons.Controls.Add(btnRefresh);

            // New sync button
            btnNewSync = new Button();
            btnNewSync.Text = "Nowa synchronizacja";
            btnNewSync.Location = new Point(110, 5);
            btnNewSync.Size = new Size(150, 30);
            btnNewSync.UseVisualStyleBackColor = true;
            btnNewSync.Click += BtnNewSync_Click;
            panelButtons.Controls.Add(btnNewSync);

            // ListView for synchronizations
            listViewSyncs = new ListView();
            listViewSyncs.Location = new Point(20, 105);
            listViewSyncs.Size = new Size(760, 400);
            listViewSyncs.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            listViewSyncs.View = View.Details;
            listViewSyncs.FullRowSelect = true;
            listViewSyncs.GridLines = true;
            listViewSyncs.MultiSelect = false;
            listViewSyncs.DoubleClick += ListViewSyncs_DoubleClick;

            // Add columns
            listViewSyncs.Columns.Add("Folder", 200);
            listViewSyncs.Columns.Add("Ścieżka lokalna", 250);
            listViewSyncs.Columns.Add("Kierunek", 120);
            listViewSyncs.Columns.Add("Status", 80);
            listViewSyncs.Columns.Add("Ostatnia synchronizacja", 150);

            this.Controls.Add(listViewSyncs);

            // Status label
            lblStatus = new Label();
            lblStatus.Text = "";
            lblStatus.Location = new Point(20, 515);
            lblStatus.Size = new Size(600, 20);
            lblStatus.Anchor = AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            this.Controls.Add(lblStatus);

            // Progress bar
            progressBar = new ProgressBar();
            progressBar.Location = new Point(20, 540);
            progressBar.Size = new Size(760, 10);
            progressBar.Anchor = AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            progressBar.Style = ProgressBarStyle.Marquee;
            progressBar.Visible = false;
            this.Controls.Add(progressBar);

            this.ResumeLayout(false);
        }

        private async void LoadSynchronizations() {
            SetLoading(true);
            ShowStatus("Ładowanie synchronizacji...", Color.Blue);

            try {
                listViewSyncs.Items.Clear();

                // Pobierz wszystkie foldery użytkownika
                var folders = await _apiClient.GetFoldersAsync();

                if (folders == null || folders.Count == 0) {
                    ShowStatus("Brak folderów do synchronizacji", Color.Gray);
                    return;
                }

                // Dla każdego folderu sprawdź synchronizacje
                foreach (var folder in folders) {
                    try {
                        var syncResponse = await _apiClient.GetSyncFolderInfoAsync(folder._id);

                        if (syncResponse?.success == true && syncResponse.syncFolder?.clients?.Any() == true) {
                            // Znajdź synchronizacje dla aktualnego klienta - używamy poprawionej właściwości
                            var clientSync = syncResponse.syncFolder.clients.FirstOrDefault(c =>
                                c.client == _clientId || c.clientId == _clientId);

                            if (clientSync != null) {
                                var item = new ListViewItem(folder.name);
                                item.SubItems.Add(clientSync.clientFolderPath ?? "");
                                item.SubItems.Add(GetSyncDirectionText(clientSync.syncDirection));
                                item.SubItems.Add(clientSync.isActive ? "Aktywna" : "Nieaktywna");
                                item.SubItems.Add(clientSync.lastSyncDate?.ToString("dd.MM.yyyy HH:mm") ?? "Nigdy");
                                item.Tag = new {
                                    FolderId = folder._id,
                                    FolderName = folder.name,
                                    SyncId = clientSync._id // Używamy _id zamiast clientFolderId
                                };

                                listViewSyncs.Items.Add(item);
                            }
                        }
                    } catch (Exception ex) {
                        System.Diagnostics.Debug.WriteLine($"Błąd pobierania synchronizacji dla folderu {folder.name}: {ex.Message}");
                    }
                }

                var syncCount = listViewSyncs.Items.Count;
                ShowStatus($"Załadowano {syncCount} synchronizacji", Color.Green);

            } catch (Exception ex) {
                ShowStatus($"Błąd ładowania synchronizacji: {ex.Message}", Color.Red);
            } finally {
                SetLoading(false);
            }
        }

        private string GetSyncDirectionText(string direction) {
            switch (direction) {
                case "bidirectional":
                    return "Dwukierunkowa";
                case "to-client":
                    return "Do klienta";
                case "from-client":
                    return "Od klienta";
                default:
                    return "Nieznany";
            }
        }

        private void BtnRefresh_Click(object sender, EventArgs e) {
            LoadSynchronizations();
        }

        private void BtnNewSync_Click(object sender, EventArgs e) {
            using (var newSyncForm = new Forms.NewSyncForm(_apiClient, _clientId)) {
                if (newSyncForm.ShowDialog() == DialogResult.OK) {
                    LoadSynchronizations();
                }
            }
        }

        private void ListViewSyncs_DoubleClick(object sender, EventArgs e) {
            if (listViewSyncs.SelectedItems.Count == 0) return;

            var selectedItem = listViewSyncs.SelectedItems[0];
            var tagData = (dynamic)selectedItem.Tag;

            // Dodaj debugging
            System.Diagnostics.Debug.WriteLine($"Opening sync details:");
            System.Diagnostics.Debug.WriteLine($"Folder ID: {tagData.FolderId}");
            System.Diagnostics.Debug.WriteLine($"Sync ID: {tagData.SyncId}");
            System.Diagnostics.Debug.WriteLine($"Folder Name: {tagData.FolderName}");

            // Sprawdź czy ID nie są null lub puste
            if (string.IsNullOrEmpty(tagData.FolderId) || string.IsNullOrEmpty(tagData.SyncId)) {
                MessageBox.Show("Brak wymaganych identyfikatorów synchronizacji", "Błąd",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            using (var detailsForm = new Forms.SyncDetailsForm(
                _apiClient,
                _syncService,
                tagData.FolderId,
                tagData.SyncId,
                tagData.FolderName,
                _clientId)) { // Dodano _clientId jako parametr

                if (detailsForm.ShowDialog() == DialogResult.OK) {
                    LoadSynchronizations();
                }
            }
        }

        private void ShowStatus(string message, Color color) {
            lblStatus.Text = message;
            lblStatus.ForeColor = color;
        }

        private void SetLoading(bool isLoading) {
            btnRefresh.Enabled = !isLoading;
            btnNewSync.Enabled = !isLoading;
            progressBar.Visible = isLoading;
        }

        protected override void Dispose(bool disposing) {
            if (disposing) {
                _syncService?.Dispose();
                _apiClient?.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}