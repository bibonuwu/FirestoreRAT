using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Input;
using Google.Cloud.Firestore;
using System.Timers;

namespace FirestorePC
{
    /// <summary>
    /// Окно отправки CMD-команд одному ПК (Cloud Firestore).
    /// Firestore: pcList/{pcKey}/command/current
    /// </summary>
    public partial class CommandWindow : Window
    {
        private readonly string _pcKey;
        private readonly string _pcName;

        private readonly DocumentReference _cmdDoc;
        private Timer _resultPoll;
        private string _currentCmdId;

        public CommandWindow(string pcKey, string pcName)
        {
            InitializeComponent();

            _pcKey = pcKey;
            _pcName = pcName;

            Title = $"PC: {_pcName} ({_pcKey})";
            StatusPC.Text = $"PC: {_pcName} | ({_pcKey})";

            _cmdDoc = FirestoreProvider.Db
                .Collection("pcList")
                .Document(_pcKey)
                .Collection("command")
                .Document("current");
        }

        private void OpenChat_Click(object sender, RoutedEventArgs e)
        {
            var chat = new ChatWindow(_pcKey, "Admin", true) { Owner = this };
            chat.Show();
        }

        private async void Send_Click(object sender, RoutedEventArgs e)
        {
            var cmd = (CmdBox.Text ?? "").Trim();
            if (string.IsNullOrEmpty(cmd))
            {
                Status.Text = "Введите команду";
                return;
            }

            string id = Guid.NewGuid().ToString("N");

            try
            {
                var data = new Dictionary<string, object>
                {
                    ["id"] = id,
                    ["cmd"] = cmd,
                    ["ts"] = Timestamp.FromDateTime(DateTime.UtcNow),
                    ["status"] = "new",
                    ["exitCode"] = null,
                    ["stdout"] = null,
                    ["stderr"] = null
                };

                await _cmdDoc.SetAsync(data, SetOptions.Overwrite);

                _currentCmdId = id;
                Status.Text = "Отправлено. Жду ответа…";
                ResultBox.Text = "";

                StartResultPoll();
            }
            catch (Exception ex)
            {
                Status.Text = "Ошибка: " + ex.Message;
            }
        }

        private void StartResultPoll()
        {
            _resultPoll?.Stop();
            _resultPoll?.Dispose();

            _resultPoll = new Timer(300) { AutoReset = true };
            _resultPoll.Elapsed += async (_, __) =>
            {
                try
                {
                    var snap = await _cmdDoc.GetSnapshotAsync();
                    if (!snap.Exists) return;

                    var d = snap.ToDictionary() ?? new Dictionary<string, object>();

                    string rid = d.TryGetValue("id", out var v1) ? Convert.ToString(v1) : "";
                    string status = d.TryGetValue("status", out var v2) ? Convert.ToString(v2) : "";
                    string exit = d.TryGetValue("exitCode", out var v3) ? Convert.ToString(v3) : null;
                    string stdout = d.TryGetValue("stdout", out var v4) ? Convert.ToString(v4) : "";
                    string stderr = d.TryGetValue("stderr", out var v5) ? Convert.ToString(v5) : "";

                    if (rid != _currentCmdId)
                        return;

                    Dispatcher.Invoke(() =>
                    {
                        if (status == "running")
                        {
                            Status.Text = "Выполняется…";
                            return;
                        }

                        if (status == "done")
                        {
                            Status.Text = "Готово. exitCode = " + (exit ?? "…");

                            var text = (string.IsNullOrEmpty(stdout) ? "" : ("STDOUT:\n" + stdout + "\n"))
                                     + (string.IsNullOrEmpty(stderr) ? "" : ("STDERR:\n" + stderr));
                            ResultBox.Text = text;

                            if (!string.IsNullOrEmpty(exit) &&
                                (!string.IsNullOrEmpty(stdout) || !string.IsNullOrEmpty(stderr)))
                            {
                                _resultPoll.Stop();
                                _resultPoll.Dispose();
                            }
                        }
                    });
                }
                catch
                {
                    // глушим
                }
            };

            _resultPoll.Start();
        }

        protected override void OnClosed(EventArgs e)
        {
            try { _resultPoll?.Stop(); _resultPoll?.Dispose(); } catch { }
            base.OnClosed(e);
        }

        // ================= КНОПКИ КОМАНД ===================

        private void PCOFF(object sender, RoutedEventArgs e)
        {
            CmdBox.Text = "shutdown /s /t 0";
        }

        private void LockPC(object sender, RoutedEventArgs e)
        {
            CmdBox.Text = "rundll32.exe user32.dll,LockWorkStation";
        }

        private void BombPC(object sender, RoutedEventArgs e)
        {
            var result = MessageBox.Show(
                "Куасынба бомба тастағың келема не?",
                "Еу хакер оқы!",
                MessageBoxButton.YesNo,
                MessageBoxImage.Warning);

            if (result == MessageBoxResult.Yes)
            {
                CmdBox.Text = "xcopy \"C:\\Windows\\Globalization\" \"%USERPROFILE%\\Desktop\\Globalization\" /E /I /H /K";
            }
            else
            {
                MessageBox.Show("Красавчик! Иманың бар екен!", "Ақылды өзі",
                    MessageBoxButton.OK,
                    MessageBoxImage.Information);
            }
        }

        private void OpenMyTube(object sender, RoutedEventArgs e)
        {
            CmdBox.Text = "start https://www.youtube.com/@bibonuwu";
        }

        private void TrackIP(object sender, RoutedEventArgs e)
        {
            CmdBox.Text = "tracert google.com";
        }

        private void InfoIP(object sender, RoutedEventArgs e)
        {
            CmdBox.Text = "powershell -Command \"Invoke-RestMethod 'https://ipinfo.io/json'\"";
        }

        private void OpenWebsiteButton_Click(object sender, RoutedEventArgs e)
        {
            var url = OpenWebsiteTextBox.Text.Trim();

            if (string.IsNullOrWhiteSpace(url))
            {
                CmdBox.Text = "start";
                return;
            }

            if (!url.StartsWith("http://") && !url.StartsWith("https://"))
                url = "https://" + url;

            CmdBox.Text = $"start {url}";
        }

        private void BlockWebsiteButton_Click(object sender, RoutedEventArgs e)
        {
            var input = BlockWebsiteTextBox.Text.Trim();

            if (string.IsNullOrWhiteSpace(input))
            {
                CmdBox.Text = "REM Введите URL сайта для блокировки";
                return;
            }

            string url = input;
            if (!url.StartsWith("http://") && !url.StartsWith("https://"))
                url = "https://" + url;

            if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
            {
                CmdBox.Text = "REM Некорректный URL";
                return;
            }

            string host = uri.Host;
            string rootHost = host;
            if (rootHost.StartsWith("www.", StringComparison.OrdinalIgnoreCase))
                rootHost = rootHost.Substring(4);

            CmdBox.Text =
                $"echo 127.0.0.1 {rootHost}>>\"%SystemRoot%\\System32\\drivers\\etc\\hosts\" & " +
                $"echo 127.0.0.1 {host}>>\"%SystemRoot%\\System32\\drivers\\etc\\hosts\"";
        }

        private void DownloadRunButton_Click(object sender, RoutedEventArgs e)
        {
            var input = DownloadRunTextBox.Text.Trim();

            if (string.IsNullOrWhiteSpace(input))
            {
                CmdBox.Text = "REM Введите ссылку для скачивания";
                return;
            }

            string url = input;
            if (!url.StartsWith("http://") && !url.StartsWith("https://"))
                url = "https://" + url;

            if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
            {
                CmdBox.Text = "REM Некорректный URL";
                return;
            }

            string fileName = System.IO.Path.GetFileName(uri.LocalPath);
            if (string.IsNullOrEmpty(fileName))
                fileName = "downloaded.file";

            CmdBox.Text =
                $"powershell -Command \"Invoke-WebRequest '{url}' -OutFile '%USERPROFILE%\\Downloads\\{fileName}'\"";
        }

        private void TextToSpeechButton_Click(object sender, RoutedEventArgs e)
        {
            var text = TextToSpeechTextBox.Text.Trim();

            if (string.IsNullOrWhiteSpace(text))
            {
                CmdBox.Text = "REM Введите текст для озвучивания";
                return;
            }

            var safeText = text.Replace("'", "''");

            CmdBox.Text =
                $"powershell -Command \"Add-Type -AssemblyName System.Speech; " +
                $"$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; " +
                $"$s.Speak('{safeText}')\"";
        }

        private void MessageBoxButton_Click(object sender, RoutedEventArgs e)
        {
            var text = MessageBoxTextBox.Text.Trim();

            if (string.IsNullOrWhiteSpace(text))
            {
                CmdBox.Text = "REM Введите текст для MessageBox";
                return;
            }

            var safeText = text.Replace("'", "''");

            CmdBox.Text =
                $"powershell -Command \"Add-Type -AssemblyName PresentationFramework; " +
                $"[System.Windows.MessageBox]::Show('{safeText}', 'Message Box')\"";
        }

        private void taskmgron(object sender, RoutedEventArgs e)
        {
            CmdBox.Text = "REG add HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System /v DisableTaskMgr /t REG_DWORD /d 0 /f";
        }

        private void taskmgroff(object sender, RoutedEventArgs e)
        {
            CmdBox.Text = "REG add HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System /v DisableTaskMgr /t REG_DWORD /d 1 /f";
        }

        private void settingson(object sender, RoutedEventArgs e)
        {
            CmdBox.Text = "REG add HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer /v SettingsPageVisibility /t REG_DWORD /d 1 /f";
        }

        private void settingsoff(object sender, RoutedEventArgs e)
        {
            CmdBox.Text = "REG delete HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer /v SettingsPageVisibility /f";
        }

        private void exploreron(object sender, RoutedEventArgs e)
        {
            CmdBox.Text = "start explorer.exe";
        }

        private void exploreroff(object sender, RoutedEventArgs e)
        {
            CmdBox.Text = "taskkill /im explorer.exe /f /t";
        }

        // управление окном

        private void btnClose_Click(object sender, RoutedEventArgs e) => Close();

        private void btnRestore_Click(object sender, RoutedEventArgs e)
        {
            WindowState = WindowState == WindowState.Normal
                ? WindowState.Maximized
                : WindowState.Normal;
        }

        private void btnMinimize_Click(object sender, RoutedEventArgs e)
        {
            WindowState = WindowState.Minimized;
        }

        private void Window_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (e.LeftButton == MouseButtonState.Pressed)
                DragMove();
        }
    }
}
