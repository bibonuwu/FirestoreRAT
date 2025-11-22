using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Google.Cloud.Firestore;
using static FirestorePC.PcHelpers;

namespace FirestorePC
{
    /// <summary>
    /// Работа с коллекцией pcList в Cloud Firestore.
    /// Структура документа:
    /// pcList/{pcKey}:
    ///   system: { pcName, userName, ... }
    ///   online: { pcOnline, startTime, stopTime, ping, pong }
    ///   adminOpen, adminOnline, clientOpen, clientOnline (int 0/1)
    /// </summary>
    public class FirestorePcService
    {
        private readonly FirestoreDb _db;
        private const string PcCollectionName = "pcList";

        public FirestorePcService(FirestoreDb db)
        {
            _db = db;
        }

        private CollectionReference PcCollection => _db.Collection(PcCollectionName);
        private DocumentReference PcDoc(string key) => PcCollection.Document(key);

        /// <summary>
        /// Загрузка списка всех ПК.
        /// </summary>
        public async Task<List<PcItem>> GetPcListAsync()
        {
            var result = new List<PcItem>();

            QuerySnapshot snapshot = await PcCollection.GetSnapshotAsync();

            foreach (var doc in snapshot.Documents)
            {
                if (!doc.Exists) continue;

                var data = doc.ToDictionary();

                var sys = data.TryGetValue("system", out var sysObj)
                    ? sysObj as Dictionary<string, object>
                    : null;

                var online = data.TryGetValue("online", out var onlineObj)
                    ? onlineObj as Dictionary<string, object>
                    : null;

                var item = new PcItem
                {
                    Key = doc.Id,
                    InternetIp = GetStr(sys, "internetIp"),
                    Online = AsInt(online != null && online.TryGetValue("pcOnline", out var v) ? v : null),
                    StartTime = GetStr(online, "startTime"),
                    StopTime = GetStr(online, "stopTime"),

                    PcName = GetStr(sys, "pcName"),
                    UserName = GetStr(sys, "userName"),
                    RAM = GetStr(sys, "ram"),
                    LocalIp = GetStr(sys, "localIp"),
                    Country = GetStr(sys, "country"),
                    Region = GetStr(sys, "region"),
                    City = GetStr(sys, "city")
                };

                result.Add(item);
            }

            return result.OrderBy(i => i.Key).ToList();
        }

        /// <summary>
        /// Ping одного ПК – пишет online.ping, ждёт online.pong, выставляет online.pcOnline.
        /// Клиент должен отвечать, обновляя поле online.pong тем же токеном.
        /// </summary>
        public async Task<bool> PingPcAsync(string key)
        {
            var doc = PcDoc(key);
            var token = Guid.NewGuid().ToString("N");

            // пишем ping (если документа нет, UpdateAsync кинет исключение – значит клиент ещё не создавал узел)
            try
            {
                await doc.UpdateAsync("online.ping", token);
            }
            catch
            {
                // если надо — можно создать документ, но обычно его создаёт клиент
                return false;
            }

            await Task.Delay(2500);

            var snap = await doc.GetSnapshotAsync();
            string reply = "";
            if (snap.Exists && snap.ContainsField("online.pong"))
            {
                reply = snap.GetValue<string>("online.pong") ?? "";
            }

            bool online = reply == token;

            try
            {
                await doc.UpdateAsync("online.pcOnline", online ? 1 : 0);
            }
            catch { }

            return online;
        }

        /// <summary>
        /// Выставить флаги чата в 0 для одного ПК.
        /// </summary>
        public async Task SetChatOfflineAsync(string key)
        {
            var doc = PcDoc(key);

            var updates = new Dictionary<string, object>
            {
                ["clientOpen"] = 0,
                ["clientOnline"] = 0,
                ["adminOpen"] = 0,
                ["adminOnline"] = 0
            };

            try
            {
                await doc.UpdateAsync(updates);
            }
            catch
            {
                // если документа ещё нет – просто игнорируем
            }
        }
    }
}
