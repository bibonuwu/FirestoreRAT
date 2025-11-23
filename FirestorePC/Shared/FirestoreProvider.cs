using System;
using System.IO;
using Google.Cloud.Firestore;

namespace FirestorePC
{
    /// <summary>
    /// Единственный экземпляр FirestoreDb для всего приложения.
    /// </summary>
    public static class FirestoreProvider
    {
        private static readonly Lazy<FirestoreDb> _lazyDb = new Lazy<FirestoreDb>(CreateDb);

        public static FirestoreDb Db => _lazyDb.Value;

        private static FirestoreDb CreateDb()
        {
            // имя JSON файла service account – как у тебя в проекте
            const string jsonFileName = "bibonrat-680b048b12e9.json";

            // СВОЙ project id из Firebase console
            const string projectId = "bibonrat";

            var baseDir = AppDomain.CurrentDomain.BaseDirectory;
            var jsonPath = Path.Combine(baseDir, jsonFileName);

            // путь к JSON для Google SDK
            Environment.SetEnvironmentVariable("GOOGLE_APPLICATION_CREDENTIALS", jsonPath);

            return FirestoreDb.Create(projectId);
        }
    }
}
