using DesktopClient.Services;
using System;
using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;

namespace DesktopClient {
    public partial class LoginForm : Form {
        private ApiClient _apiClient;
        private ClientManager _clientManager;
        private SessionManager _sessionManager;
        private TextBox txtUsername;
        private TextBox txtPassword;
        private Button btnLogin;
        private Button btnRegister;
        private Label lblStatus;
        private ProgressBar progressBar;
        private CheckBox chkRememberMe;

        public LoginForm() {
            InitializeComponent();
            _apiClient = new ApiClient();
            _clientManager = new ClientManager();
            _sessionManager = new SessionManager();

            // Sprawdź zapisaną sesję przy starcie
            CheckSavedSession();
        }

        private void InitializeComponent() {
            this.SuspendLayout();

            // Form properties
            this.Text = "File Manager - Logowanie";
            this.Size = new Size(400, 330);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;

            // Title label
            Label lblTitle = new Label();
            lblTitle.Text = "File Manager";
            lblTitle.Font = new Font("Segoe UI", 16, FontStyle.Bold);
            lblTitle.Location = new Point(150, 20);
            lblTitle.Size = new Size(150, 30);
            lblTitle.TextAlign = ContentAlignment.MiddleCenter;
            this.Controls.Add(lblTitle);

            // Username label
            Label lblUsername = new Label();
            lblUsername.Text = "Nazwa użytkownika:";
            lblUsername.Location = new Point(50, 70);
            lblUsername.Size = new Size(120, 23);
            this.Controls.Add(lblUsername);

            // Username textbox
            txtUsername = new TextBox();
            txtUsername.Location = new Point(50, 95);
            txtUsername.Size = new Size(300, 23);
            txtUsername.KeyDown += TxtUsername_KeyDown;
            this.Controls.Add(txtUsername);

            // Password label
            Label lblPassword = new Label();
            lblPassword.Text = "Hasło:";
            lblPassword.Location = new Point(50, 125);
            lblPassword.Size = new Size(100, 23);
            this.Controls.Add(lblPassword);

            // Password textbox
            txtPassword = new TextBox();
            txtPassword.Location = new Point(50, 150);
            txtPassword.Size = new Size(300, 23);
            txtPassword.UseSystemPasswordChar = true;
            txtPassword.KeyDown += TxtPassword_KeyDown;
            this.Controls.Add(txtPassword);

            // Remember me checkbox
            chkRememberMe = new CheckBox();
            chkRememberMe.Text = "Zapamiętaj logowanie";
            chkRememberMe.Location = new Point(50, 180);
            chkRememberMe.Size = new Size(200, 23);
            chkRememberMe.Checked = true;
            this.Controls.Add(chkRememberMe);

            // Login button
            btnLogin = new Button();
            btnLogin.Text = "Zaloguj";
            btnLogin.Location = new Point(50, 210);
            btnLogin.Size = new Size(100, 30);
            btnLogin.UseVisualStyleBackColor = true;
            btnLogin.Click += BtnLogin_Click;
            this.Controls.Add(btnLogin);

            // Register button
            btnRegister = new Button();
            btnRegister.Text = "Zarejestruj się";
            btnRegister.Location = new Point(250, 210);
            btnRegister.Size = new Size(100, 30);
            btnRegister.UseVisualStyleBackColor = true;
            btnRegister.Click += BtnRegister_Click;
            this.Controls.Add(btnRegister);

            // Status label
            lblStatus = new Label();
            lblStatus.Text = "";
            lblStatus.Location = new Point(50, 250);
            lblStatus.Size = new Size(300, 20);
            lblStatus.ForeColor = Color.Red;
            this.Controls.Add(lblStatus);

            // Progress bar
            progressBar = new ProgressBar();
            progressBar.Location = new Point(50, 275);
            progressBar.Size = new Size(300, 10);
            progressBar.Style = ProgressBarStyle.Marquee;
            progressBar.Visible = false;
            this.Controls.Add(progressBar);

            this.ResumeLayout(false);
            this.PerformLayout();

            // Set focus to username field
            this.ActiveControl = txtUsername;
        }

        private async void CheckSavedSession() {
            try {
                var sessionData = _sessionManager.LoadSession();
                if (sessionData != null) {
                    SetLoading(true);
                    ShowMessage("Sprawdzanie zapisanej sesji...", Color.Blue);

                    _apiClient.SetAuthToken(sessionData.Token);
                    var folders = await _apiClient.GetFoldersAsync();

                    if (folders != null) {
                        var clientId = await _clientManager.GetOrCreateClientIdAsync(sessionData.Username, _apiClient);

                        // DODANE: Inicjalizuj globalną synchronizację
                        Program.InitializeGlobalSync(_apiClient, clientId, sessionData.Username);

                        ShowMessage("Automatyczne logowanie zakończone sukcesem!", Color.Green);

                        var mainForm = new MainForm(_apiClient, sessionData.Username, clientId);
                        this.Hide();
                        mainForm.FormClosed += (sender, eventArgs) => this.Close();
                        mainForm.Show();
                        return;
                    }
                }
            } catch (Exception ex) {
                System.Diagnostics.Debug.WriteLine($"Błąd sprawdzenia sesji: {ex.Message}");
                _sessionManager.ClearSession();
                ShowMessage("Sesja wygasła, zaloguj się ponownie", Color.Orange);
            } finally {
                SetLoading(false);
            }
        }


        private void TxtUsername_KeyDown(object sender, KeyEventArgs e) {
            if (e.KeyCode == Keys.Enter) {
                txtPassword.Focus();
                e.SuppressKeyPress = true;
            }
        }

        private void TxtPassword_KeyDown(object sender, KeyEventArgs e) {
            if (e.KeyCode == Keys.Enter) {
                BtnLogin_Click(sender, e);
                e.SuppressKeyPress = true;
            }
        }

        private async void BtnLogin_Click(object sender, EventArgs e) {
            if (string.IsNullOrWhiteSpace(txtUsername.Text) || string.IsNullOrWhiteSpace(txtPassword.Text)) {
                ShowMessage("Wypełnij wszystkie pola", Color.Red);
                return;
            }
            SetLoading(true);
            ShowMessage("Logowanie...", Color.Blue);
            try {
                var username = txtUsername.Text.Trim();
                var loginResponse = await _apiClient.LoginAsync(username, txtPassword.Text);
                if (!string.IsNullOrEmpty(loginResponse.token)) {
                    _apiClient.SetAuthToken(loginResponse.token);
                    ShowMessage("Rejestrowanie klienta...", Color.Blue);

                    var clientId = await _clientManager.GetOrCreateClientIdAsync(username, _apiClient);

                    // DODANE: Inicjalizuj globalną synchronizację
                    Program.InitializeGlobalSync(_apiClient, clientId, username);

                    if (chkRememberMe.Checked) {
                        _sessionManager.SaveSession(username, loginResponse.token, clientId);
                    }
                    ShowMessage("Logowanie zakończone sukcesem!", Color.Green);

                    var mainForm = new MainForm(_apiClient, username, clientId);
                    this.Hide();
                    mainForm.FormClosed += (obj, args) => this.Close();
                    mainForm.Show();
                } else {
                    ShowMessage("Nieprawidłowa odpowiedź serwera", Color.Red);
                }
            } catch (Exception ex) {
                ShowMessage(ex.Message, Color.Red);
            } finally {
                SetLoading(false);
            }
        }

        private void BtnRegister_Click(object sender, EventArgs e) {
            try {
                // Otwórz stronę rejestracji w przeglądarce
                Process.Start(new ProcessStartInfo {
                    FileName = "https://localhost:3443/register.html",
                    UseShellExecute = true
                });
            } catch (Exception ex) {
                ShowMessage($"Nie można otworzyć przeglądarki: {ex.Message}", Color.Red);
            }
        }

        private void ShowMessage(string message, Color color) {
            lblStatus.Text = message;
            lblStatus.ForeColor = color;
        }

        private void SetLoading(bool isLoading) {
            btnLogin.Enabled = !isLoading;
            btnRegister.Enabled = !isLoading;
            txtUsername.Enabled = !isLoading;
            txtPassword.Enabled = !isLoading;
            chkRememberMe.Enabled = !isLoading;
            progressBar.Visible = isLoading;
        }

        protected override void Dispose(bool disposing) {
            if (disposing) {
                _apiClient?.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}