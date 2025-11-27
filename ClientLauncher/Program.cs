using System;
using System.Diagnostics;
using System.IO;

namespace ClientLauncher
{
    internal static class Program
    {
        [STAThread] // на всякий случай
        private static void Main()
        {
            try
            {
                // Папка, где лежит лаунчер (она же папка установки)
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;

                // Имя твоего основного EXE
                string exePath = Path.Combine(baseDir, "ClientFirestore.exe");

                // Запускаем основное приложение
                Process.Start(exePath);
            }
            catch
            {
                // Ошибку можно залогировать, но лаунчер всё равно должен быстро завершиться
            }
        }
    }
}
