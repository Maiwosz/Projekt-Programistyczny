using DesktopClient.Services;
using System;
using System.Windows.Forms;

namespace DesktopClient {
    internal static class Program {
        // Globalne instancje dla synchronizacji w tle
        public static SyncService GlobalSyncService { get; private set; }
        public static ApiClient GlobalApiClient { get; private set; }
        public static SessionManager GlobalSessionManager { get; private set; }
        public static string CurrentUsername { get; private set; }

        [STAThread]
        static void Main() {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            GlobalSessionManager = new SessionManager();

            // Uruchom aplikację z LoginForm jako głównym formularzem
            ShowLoginForm();

            Application.Run();
        }

        public static void ShowLoginForm() {
            var loginForm = new LoginForm();
            loginForm.FormClosed += (s, e) => {
                // Zatrzymaj synchronizację gdy zamykamy aplikację
                StopGlobalSync();

                // Jeśli to ostatni formularz, zamknij aplikację
                if (Application.OpenForms.Count == 0) {
                    Application.Exit();
                }
            };
            loginForm.Show();
        }

        public static void InitializeGlobalSync(ApiClient apiClient, string clientId, string username) {
            GlobalApiClient = apiClient;
            CurrentUsername = username;

            // Wczytaj ustawienia użytkownika
            var userSettings = GlobalSessionManager.LoadUserSettings(username);

            GlobalSyncService = new SyncService(apiClient, clientId);
            GlobalSyncService.StartAutoSync(userSettings.SyncIntervalMinutes);
        }

        public static void UpdateSyncInterval(int intervalMinutes) {
            if (GlobalSyncService != null && !string.IsNullOrEmpty(CurrentUsername)) {
                GlobalSyncService.UpdateSyncInterval(intervalMinutes);

                // Zapisz nowe ustawienia
                var userSettings = new UserSettings {
                    SyncIntervalMinutes = intervalMinutes,
                    LastModified = DateTime.UtcNow
                };
                GlobalSessionManager.SaveUserSettings(CurrentUsername, userSettings);
            }
        }

        public static void StopGlobalSync() {
            GlobalSyncService?.StopAutoSync();
            GlobalSyncService?.Dispose();
            GlobalSyncService = null;
            CurrentUsername = null;
        }
    }
}