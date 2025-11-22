using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;

namespace FirestorePC
{
    public partial class MainWindow : Window
    {
        private readonly FirestorePcService _pcService;

        public MainWindow()
        {
            InitializeComponent();

            _pcService = new FirestorePcService(FirestoreProvider.Db);

            Loaded += async (s, e) => await LoadPcListAsync();
        }

        private async Task LoadPcListAsync()
        {
            try
            {
                Status.Text = "Загрузка...";
                var items = await _pcService.GetPcListAsync();
                PcList.ItemsSource = items;
                Status.Text = "Загружено: " + items.Count;
            }
            catch (Exception ex)
            {
                Status.Text = "Ошибка чтения: " + ex.Message;
            }
        }

        private async void Refresh_Click(object sender, RoutedEventArgs e)
        {
            await LoadPcListAsync();
        }

        private async void PingAll_Click(object sender, RoutedEventArgs e)
        {
            var items = PcList.ItemsSource as List<PcItem>;
            if (items == null || items.Count == 0)
            {
                Status.Text = "Нет элементов";
                return;
            }

            Status.Text = "Пингую " + items.Count + "...";

            try
            {
                var tasks = items.Select(async it =>
                {
                    bool online = await _pcService.PingPcAsync(it.Key);
                    it.Online = online ? 1 : 0;

                    if (!online)
                        await _pcService.SetChatOfflineAsync(it.Key);

                    return online;
                }).ToList();

                var results = await Task.WhenAll(tasks);
                int onlineCount = results.Count(r => r);

                PcList.Items.Refresh();
                Status.Text = $"Онлайн: {onlineCount} / {items.Count}";
            }
            catch (Exception ex)
            {
                Status.Text = "Ошибка при пинге: " + ex.Message;
            }
        }

        private async void SetAllChatOffline_Click(object sender, RoutedEventArgs e)
        {
            var items = PcList.ItemsSource as List<PcItem>;
            if (items == null || items.Count == 0)
            {
                Status.Text = "Нет элементов";
                return;
            }

            Status.Text = "Обновляю чат для всех ПК...";

            try
            {
                foreach (var it in items)
                    await _pcService.SetChatOfflineAsync(it.Key);

                Status.Text = "Чат установлен в 0 для всех ПК!";
            }
            catch (Exception ex)
            {
                Status.Text = "Ошибка: " + ex.Message;
            }
        }

        private void PcList_MouseDoubleClick(object sender, System.Windows.Input.MouseButtonEventArgs e)
        {
            var item = PcList.SelectedItem as PcItem;
            if (item == null) return;

            var w = new CommandWindow(item.Key, item.PcName) { Owner = this };
            w.ShowDialog();
        }
    }
}
