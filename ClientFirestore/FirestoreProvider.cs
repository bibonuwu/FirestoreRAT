using System;
using System.IO;
using System.Windows;
using Google.Cloud.Firestore;

namespace ClientFirestore
{
    public static class FirestoreProvider
    {
        private static readonly Lazy<FirestoreDb> _lazyDb = new Lazy<FirestoreDb>(CreateDb);

        public static FirestoreDb Db => _lazyDb.Value;

        private static FirestoreDb CreateDb()
        {
            // projectId – ТОЧНО такой же, как написано сверху в Firebase console
            const string projectId = "bibonrat";   // пример, подставь свой

            const string jsonFileName = "bibonrat-680b048b12e9.json";
            string path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, jsonFileName);

            if (!File.Exists(path))
            {
                MessageBox.Show("Не найден файл ключа: " + path,
                                "Firestore", MessageBoxButton.OK, MessageBoxImage.Error);
            }

            Environment.SetEnvironmentVariable("GOOGLE_APPLICATION_CREDENTIALS", path);
            return FirestoreDb.Create(projectId);
        }
    }
}
