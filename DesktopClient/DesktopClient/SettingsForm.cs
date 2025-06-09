using System;
using System.Drawing;
using System.Windows.Forms;

namespace DesktopClient.Forms {
    public partial class SettingsForm : Form {
        private NumericUpDown numSyncInterval;
        private Label lblCurrentStatus;
        private Button btnSave;
        private Button btnCancel;
        private Label lblIntervalMinutes;

        public SettingsForm() {
            InitializeComponent();
            LoadCurrentSettings();
        }

        private void InitializeComponent() {
            this.SuspendLayout();

            // Form properties
            this.Text = "Ustawienia synchronizacji";
            this.Size = new Size(400, 200);
            this.StartPosition = FormStartPosition.CenterParent;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;

            // Title label
            Label lblTitle = new Label();
            lblTitle.Text = "Ustawienia synchronizacji";
            lblTitle.Font = new Font("Segoe UI", 12, FontStyle.Bold);
            lblTitle.Location = new Point(20, 20);
            lblTitle.Size = new Size(200, 25);
            this.Controls.Add(lblTitle);

            // Sync interval label
            Label lblSyncInterval = new Label();
            lblSyncInterval.Text = "Częstotliwość synchronizacji:";
            lblSyncInterval.Location = new Point(20, 60);
            lblSyncInterval.Size = new Size(160, 23);
            this.Controls.Add(lblSyncInterval);

            // Sync interval numeric up down
            numSyncInterval = new NumericUpDown();
            numSyncInterval.Location = new Point(190, 58);
            numSyncInterval.Size = new Size(80, 23);
            numSyncInterval.Minimum = 1;
            numSyncInterval.Maximum = 1440; // Maksymalnie co 24 godziny
            numSyncInterval.Value = 5;
            this.Controls.Add(numSyncInterval);

            // Minutes label
            lblIntervalMinutes = new Label();
            lblIntervalMinutes.Text = "minut";
            lblIntervalMinutes.Location = new Point(280, 60);
            lblIntervalMinutes.Size = new Size(40, 23);
            this.Controls.Add(lblIntervalMinutes);

            // Current status label
            lblCurrentStatus = new Label();
            lblCurrentStatus.Text = "";
            lblCurrentStatus.Location = new Point(20, 90);
            lblCurrentStatus.Size = new Size(350, 20);
            lblCurrentStatus.ForeColor = Color.Blue;
            this.Controls.Add(lblCurrentStatus);

            // Save button
            btnSave = new Button();
            btnSave.Text = "Zapisz";
            btnSave.Location = new Point(220, 120);
            btnSave.Size = new Size(75, 30);
            btnSave.UseVisualStyleBackColor = true;
            btnSave.Click += BtnSave_Click;
            this.Controls.Add(btnSave);

            // Cancel button
            btnCancel = new Button();
            btnCancel.Text = "Anuluj";
            btnCancel.Location = new Point(305, 120);
            btnCancel.Size = new Size(75, 30);
            btnCancel.UseVisualStyleBackColor = true;
            btnCancel.DialogResult = DialogResult.Cancel;
            btnCancel.Click += BtnCancel_Click;
            this.Controls.Add(btnCancel);

            this.AcceptButton = btnSave;
            this.CancelButton = btnCancel;

            this.ResumeLayout(false);
        }

        private void LoadCurrentSettings() {
            try {
                if (Program.GlobalSyncService != null) {
                    var currentInterval = Program.GlobalSyncService.GetCurrentSyncInterval();
                    numSyncInterval.Value = currentInterval;

                    var isRunning = Program.GlobalSyncService.IsAutoSyncRunning;
                    lblCurrentStatus.Text = isRunning
                        ? $"Synchronizacja aktywna (co {currentInterval} min)"
                        : "Synchronizacja zatrzymana";
                    lblCurrentStatus.ForeColor = isRunning ? Color.Green : Color.Orange;
                }
            } catch (Exception ex) {
                lblCurrentStatus.Text = $"Błąd wczytywania ustawień: {ex.Message}";
                lblCurrentStatus.ForeColor = Color.Red;
            }
        }

        private void BtnSave_Click(object sender, EventArgs e) {
            try {
                var newInterval = (int)numSyncInterval.Value;
                Program.UpdateSyncInterval(newInterval);

                MessageBox.Show(
                    $"Ustawienia zostały zapisane.\nNowa częstotliwość synchronizacji: co {newInterval} min",
                    "Sukces",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);

                this.DialogResult = DialogResult.OK;
                this.Close();
            } catch (Exception ex) {
                MessageBox.Show(
                    $"Błąd zapisywania ustawień: {ex.Message}",
                    "Błąd",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
        }

        private void BtnCancel_Click(object sender, EventArgs e) {
            this.DialogResult = DialogResult.Cancel;
            this.Close();
        }
    }
}