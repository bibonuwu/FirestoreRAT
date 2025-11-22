using Google.Cloud.Firestore;
using System;
using System.Collections.Generic;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using Google.Cloud.Firestore;
using System.Timers;


namespace ClientFirestore
{
    /// <summary>
    /// Логика взаимодействия для ChatWindow.xaml
    /// </summary>
    public partial class ChatWindow : Window
    {
        private readonly string _pcKey;
        private readonly string _me;
        private readonly bool _iAmAdmin;

        private Timer _peerPoll;
        private Timer _poll;
        private int _lastCount = 0;

        private DocumentReference PcDoc =>
            FirestoreProvider.Db.Collection("pcList").Document(_pcKey);

        private CollectionReference MessagesCol =>
            PcDoc.Collection("chatMessages");

        public ChatWindow(string pcKey, string myDisplayName, bool iAmAdmin)
        {
            InitializeComponent();

            _pcKey = pcKey;
            _me = myDisplayName;
            _iAmAdmin = iAmAdmin;

            Title = $"Chat – {_pcKey} ({_me})";

            Loaded += ChatWindow_Loaded;
            Closing += ChatWindow_Closing;
        }

        private async void ChatWindow_Loaded(object sender, RoutedEventArgs e)
        {
            MsgList.ItemsSource = null;
            _lastCount = 0;

            try
            {
                if (_iAmAdmin)
                {
                    await PcDoc.UpdateAsync(new Dictionary<string, object>
                    {
                        ["adminOnline"] = 1,
                        ["adminOpen"] = 1
                    });
                }
                else
                {
                    await PcDoc.UpdateAsync(new Dictionary<string, object>
                    {
                        ["clientOnline"] = 1,
                        ["clientOpen"] = 1
                    });
                }
            }
            catch { }

            StartPoll();
            StartPeerPresencePoll();
        }

        private void StartPeerPresencePoll()
        {
            _peerPoll = new Timer(1000) { AutoReset = true };
            _peerPoll.Elapsed += async (_, __) =>
            {
                try
                {
                    var snap = await PcDoc.GetSnapshotAsync();
                    if (!snap.Exists) return;

                    string onlineField = _iAmAdmin ? "clientOnline" : "adminOnline";
                    string openField = _iAmAdmin ? "clientOpen" : "adminOpen";

                    int onlineVal = snap.ContainsField(onlineField)
                        ? snap.GetValue<int>(onlineField)
                        : 0;
                    int openVal = snap.ContainsField(openField)
                        ? snap.GetValue<int>(openField)
                        : 0;

                    bool peerOnline = onlineVal == 1;
                    bool peerOpen = openVal == 1;

                    Dispatcher.Invoke(() =>
                    {
                        Title = $"Chat – {_pcKey} ({_me}) — " +
                                (peerOnline ? "собеседник онлайн" : "собеседник офлайн");

                        if (!_iAmAdmin && !peerOpen && IsVisible)
                            Close();
                    });
                }
                catch { }
            };
            _peerPoll.Start();
        }

        private void StartPoll()
        {
            _poll = new Timer(1000) { AutoReset = true };
            _poll.Elapsed += async (_, __) =>
            {
                try
                {
                    var snap = await MessagesCol
    .OrderBy("ts")
    .GetSnapshotAsync();


                    var msgs = new List<Message>();

                    foreach (var doc in snap.Documents)
                    {
                        var data = doc.ToDictionary();

                        string sender = data.TryGetValue("sender", out var v1) ? Convert.ToString(v1) : "";
                        string body = data.TryGetValue("text", out var v2) ? Convert.ToString(v2) : "";

                        string time = "";
                        if (doc.ContainsField("ts"))
                        {
                            var ts = doc.GetValue<Timestamp>("ts");
                            time = ts.ToDateTime().ToLocalTime().ToString("HH:mm");
                        }

                        msgs.Add(new Message
                        {
                            Sender = sender,
                            Body = body,
                            Time = time,
                            IsMine = string.Equals(sender, _me, StringComparison.OrdinalIgnoreCase)
                        });
                    }

                    Dispatcher.Invoke(() =>
                    {
                        MsgList.ItemsSource = msgs;
                        if (msgs.Count > _lastCount)
                        {
                            _lastCount = msgs.Count;
                            if (MsgList.Items.Count > 0)
                                MsgList.ScrollIntoView(MsgList.Items[MsgList.Items.Count - 1]);
                        }
                    });
                }
                catch { }
            };
            _poll.Start();
        }

        private async Task TrimMessagesAsync()
        {
            const int maxMessages = 6;

            var snap = await MessagesCol
    .OrderBy("ts")
    .GetSnapshotAsync();


            if (snap.Count <= maxMessages)
                return;

            int toDelete = snap.Count - maxMessages;
            foreach (var doc in snap.Documents.Take(toDelete))
            {
                await doc.Reference.DeleteAsync();
            }
        }

        private async Task SendAsync()
        {
            var text = (Input.Text ?? "").Trim();
            if (text.Length == 0) return;

            Input.Clear();

            var data = new Dictionary<string, object>
            {
                ["sender"] = _me,
                ["text"] = text,
                ["ts"] = Timestamp.FromDateTime(DateTime.UtcNow)
            };

            await MessagesCol.AddAsync(data);
            await TrimMessagesAsync();
        }

        private async void Send_Click(object sender, RoutedEventArgs e)
        {
            await SendAsync();
        }

        private async void Input_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter &&
                !Keyboard.IsKeyDown(Key.LeftShift) &&
                !Keyboard.IsKeyDown(Key.RightShift))
            {
                e.Handled = true;
                await SendAsync();
            }
        }

        private async void ChatWindow_Closing(object sender, System.ComponentModel.CancelEventArgs e)
        {
            try
            {
                _poll?.Stop(); _poll?.Dispose();

                if (_iAmAdmin)
                {
                    await PcDoc.UpdateAsync(new Dictionary<string, object>
                    {
                        ["adminOpen"] = 0,
                        ["adminOnline"] = 0
                    });
                }
                else
                {
                    await PcDoc.UpdateAsync(new Dictionary<string, object>
                    {
                        ["clientOpen"] = 0,
                        ["clientOnline"] = 0
                    });
                }
            }
            catch { }
        }

        public sealed class Message
        {
            public string Sender { get; set; }
            public string Body { get; set; }
            public string Time { get; set; }
            public bool IsMine { get; set; }
        }

        // управление окном

        private void btnClose_Click(object sender, RoutedEventArgs e)
        {
            Close();
        }

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
