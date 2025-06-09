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
        private readonly SessionManager _sessionManager;

        private ListView listViewSyncs;
        private Button btnRefresh;
        private Button btnNewSync;
        private Button btnLogout;
        private Label lblStatus;
        private ProgressBar progressBar;
        private Button btnSettings;

        private NotifyIcon notifyIcon;
        private ContextMenuStrip trayMenu;

        // Flaga do kontrolowania minimalizacji do tray
        private bool _allowVisible = true;

        public MainForm(ApiClient apiClient, string username, string clientId) {
            _apiClient = apiClient;
            _username = username;
            _clientId = clientId;

            // Użyj globalnej instancji synchronizacji zamiast tworzenia nowej
            _syncService = Program.GlobalSyncService ?? new SyncService(_apiClient, _clientId);
            _sessionManager = new SessionManager();

            // Dodaj obsługę zdarzeń synchronizacji dla UI
            _syncService.OnSyncStatusChanged += OnSyncStatusChanged;
            _syncService.OnSyncError += OnSyncError;

            InitializeComponent();
            LoadSynchronizations();
            InitializeTrayIcon();
        }

        private void InitializeComponent() {
            this.SuspendLayout();

            // Form properties
            this.Text = $"File Manager - {_username}";
            this.Size = new Size(800, 600);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.MinimumSize = new Size(600, 400);

            // Header panel
            Panel headerPanel = new Panel();
            headerPanel.Location = new Point(20, 20);
            headerPanel.Size = new Size(760, 35);
            headerPanel.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            this.Controls.Add(headerPanel);

            // Title label
            Label lblTitle = new Label();
            lblTitle.Text = "Synchronizacje";
            lblTitle.Font = new Font("Segoe UI", 14, FontStyle.Bold);
            lblTitle.Location = new Point(0, 5);
            lblTitle.Size = new Size(200, 25);
            headerPanel.Controls.Add(lblTitle);

            // Logout button (top right)
            btnLogout = new Button();
            btnLogout.Text = "Wyloguj";
            btnLogout.Location = new Point(660, 0);
            btnLogout.Size = new Size(100, 30);
            btnLogout.UseVisualStyleBackColor = true;
            btnLogout.BackColor = Color.FromArgb(220, 53, 69);
            btnLogout.ForeColor = Color.White;
            btnLogout.FlatStyle = FlatStyle.Flat;
            btnLogout.FlatAppearance.BorderSize = 0;
            btnLogout.Click += BtnLogout_Click;
            btnLogout.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            headerPanel.Controls.Add(btnLogout);

            // Settings button
            btnSettings = new Button();
            btnSettings.Text = "Ustawienia";
            btnSettings.Location = new Point(550, 0);
            btnSettings.Size = new Size(100, 30);
            btnSettings.UseVisualStyleBackColor = true;
            btnSettings.Click += BtnSettings_Click;
            btnSettings.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            headerPanel.Controls.Add(btnSettings);

            // Buttons panel
            Panel panelButtons = new Panel();
            panelButtons.Location = new Point(20, 65);
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
            listViewSyncs.Location = new Point(20, 115);
            listViewSyncs.Size = new Size(760, 390);
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
            this.Resize += MainForm_Resize;
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

        private void BtnLogout_Click(object sender, EventArgs e) {
            var result = MessageBox.Show(
                "Czy na pewno chcesz się wylogować?\n\nUwaga: Synchronizacja w tle zostanie zatrzymana.",
                "Potwierdzenie wylogowania",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question);

            if (result == DialogResult.Yes) {
                try {
                    // Odłącz obsługę zdarzeń
                    if (_syncService != null) {
                        _syncService.OnSyncStatusChanged -= OnSyncStatusChanged;
                        _syncService.OnSyncError -= OnSyncError;
                    }

                    // Zatrzymaj globalną synchronizację
                    Program.StopGlobalSync();

                    _sessionManager.ClearSession();
                    _apiClient.SetAuthToken(null);

                    ShowStatus("Wylogowywanie...", Color.Blue);

                    // Ustaw flagę aby pozwolić na ukrycie okna
                    _allowVisible = true;
                    this.Hide();
                    Program.ShowLoginForm();
                    this.Close();

                } catch (Exception ex) {
                    MessageBox.Show($"Błąd podczas wylogowywania: {ex.Message}",
                        "Błąd", MessageBoxButtons.OK, MessageBoxIcon.Error);
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
            btnLogout.Enabled = !isLoading;
            progressBar.Visible = isLoading;
        }

        private void BtnSettings_Click(object sender, EventArgs e) {
            using (var settingsForm = new Forms.SettingsForm()) {
                settingsForm.ShowDialog();
            }
        }

        private void InitializeTrayIcon() {
            // Utwórz menu kontekstowe dla ikony w trayu
            trayMenu = new ContextMenuStrip();

            var showItem = new ToolStripMenuItem("Pokaż", null, (s, e) => {
                _allowVisible = true;
                Show();
                WindowState = FormWindowState.Normal;
                ShowInTaskbar = true;
            });

            var syncNowItem = new ToolStripMenuItem("Synchronizuj teraz", null, async (s, e) => {
                if (_syncService != null) {
                    try {
                        ShowStatus("Ręczna synchronizacja...", Color.Blue);
                        await _syncService.PerformSyncAsync();
                        ShowBalloonTip("Synchronizacja zakończona", "Wszystkie foldery zostały zsynchronizowane", ToolTipIcon.Info);
                    } catch (Exception ex) {
                        ShowBalloonTip("Błąd synchronizacji", $"Wystąpił błąd: {ex.Message}", ToolTipIcon.Error);
                    }
                }
            });

            var settingsItem = new ToolStripMenuItem("Ustawienia", null, (s, e) => {
                _allowVisible = true;
                Show();
                WindowState = FormWindowState.Normal;
                ShowInTaskbar = true;
                BtnSettings_Click(s, e);
            });

            var exitItem = new ToolStripMenuItem("Zakończ", null, (s, e) => {
                var result = MessageBox.Show(
                    "Czy na pewno chcesz zamknąć aplikację?\n\nSynchronizacja w tle zostanie zatrzymana.",
                    "Zamknięcie aplikacji",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question);

                if (result == DialogResult.Yes) {
                    _allowVisible = true;
                    Application.Exit();
                }
            });

            trayMenu.Items.AddRange(new ToolStripItem[] {
                showItem,
                new ToolStripSeparator(),
                syncNowItem,
                settingsItem,
                new ToolStripSeparator(),
                exitItem
            });

            // Utwórz ikonę w trayu
            notifyIcon = new NotifyIcon();
            notifyIcon.Text = $"File Manager - {_username}";
            notifyIcon.ContextMenuStrip = trayMenu;

            // Użyj domyślnej ikony aplikacji lub ustaw własną
            notifyIcon.Icon = this.Icon ?? SystemIcons.Application;

            // Obsługa podwójnego kliknięcia na ikonę
            notifyIcon.DoubleClick += (s, e) => {
                _allowVisible = true;
                Show();
                WindowState = FormWindowState.Normal;
                ShowInTaskbar = true;
            };

            notifyIcon.Visible = true;
        }

        private void ShowBalloonTip(string title, string text, ToolTipIcon icon) {
            if (notifyIcon != null) {
                notifyIcon.ShowBalloonTip(3000, title, text, icon);
            }
        }

        // POPRAWIONA WERSJA - usuwa pętlę nieskończoności
        protected override void SetVisibleCore(bool value) {
            // Jeśli chcemy ukryć okno i nie jest to minimalizacja, ukryj do tray
            if (!value && _allowVisible && WindowState != FormWindowState.Minimized) {
                _allowVisible = false;
                base.SetVisibleCore(false);
                return;
            }

            // W innych przypadkach użyj standardowego zachowania
            base.SetVisibleCore(_allowVisible && value);
        }

        protected override void OnFormClosing(FormClosingEventArgs e) {
            if (e.CloseReason == CloseReason.UserClosing) {
                e.Cancel = true;
                _allowVisible = false;
                Hide();
                ShowInTaskbar = false;
                ShowBalloonTip("File Manager", "Aplikacja została zminimalizowana do paska zadań", ToolTipIcon.Info);
                return;
            }
            base.OnFormClosing(e);
        }

        private void MainForm_Resize(object sender, EventArgs e) {
            if (WindowState == FormWindowState.Minimized) {
                _allowVisible = false;
                Hide();
                ShowInTaskbar = false;
                ShowBalloonTip("File Manager", "Aplikacja została zminimalizowana do paska zadań", ToolTipIcon.Info);
            }
        }

        private void OnSyncStatusChanged(string status) {
            if (InvokeRequired) {
                Invoke(new Action<string>(OnSyncStatusChanged), status);
                return;
            }

            ShowStatus($"Synchronizacja: {status}", Color.Blue);
        }

        private void OnSyncError(string message, Exception ex) {
            if (InvokeRequired) {
                Invoke(new Action<string, Exception>(OnSyncError), message, ex);
                return;
            }

            ShowStatus($"Błąd: {message}", Color.Red);
        }

        protected override void Dispose(bool disposing) {
            if (disposing) {
                // Odłącz obsługę zdarzeń, ale nie dispose globalnej synchronizacji
                if (_syncService != null) {
                    _syncService.OnSyncStatusChanged -= OnSyncStatusChanged;
                    _syncService.OnSyncError -= OnSyncError;
                }

                // Dispose ikony w trayu
                if (notifyIcon != null) {
                    notifyIcon.Visible = false;
                    notifyIcon.Dispose();
                }

                trayMenu?.Dispose();

                // NIE wywołuj _syncService?.Dispose() - to robi Program.StopGlobalSync()
                _apiClient?.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}