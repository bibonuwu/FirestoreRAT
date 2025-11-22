using System;
using System.IO;
using Google.Cloud.Firestore;

namespace Shared
{
    public static class FirestoreProvider
    {
        public static FirestoreDb Db { get; }

        static FirestoreProvider()
        {
            var baseDir = AppDomain.CurrentDomain.BaseDirectory;
            var jsonPath = Path.Combine(baseDir, "bibonrat-firebase-adminsdk-fbsvc-4cd5e8496d.json");

            // путь к JSON для Google SDK
            Environment.SetEnvironmentVariable("GOOGLE_APPLICATION_CREDENTIALS", jsonPath);

            // !!! сюда поставь свой реальный id проекта из Firebase console
            const string projectId = "bibonrat";

            Db = FirestoreDb.Create(projectId);
        }
    }
}
