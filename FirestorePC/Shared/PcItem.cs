namespace FirestorePC
{
    /// <summary>
    /// Модель строки в списке ПК.
    /// </summary>
    public class PcItem
    {
        public string Key { get; set; }
        public string InternetIp { get; set; }
        public int Online { get; set; }
        public string OnlineText => Online == 1 ? "ON" : "OFF";
        public string StartTime { get; set; }
        public string StopTime { get; set; }
        public string PcName { get; set; }
        public string UserName { get; set; }
        public string RAM { get; set; }
        public string LocalIp { get; set; }
        public string Country { get; set; }
        public string Region { get; set; }
        public string City { get; set; }
    }

    public static class PcHelpers
    {
        public static int AsInt(object o)
        {
            if (o == null) return 0;
            if (o is int i) return i;
            if (o is long l) return (int)l;
            return int.TryParse(o.ToString(), out var x) ? x : 0;
        }

        public static string GetStr(
            System.Collections.Generic.Dictionary<string, object> d,
            string key)
        {
            if (d == null) return "";
            return d.TryGetValue(key, out var v) && v != null ? v.ToString() : "";
        }
    }
}
