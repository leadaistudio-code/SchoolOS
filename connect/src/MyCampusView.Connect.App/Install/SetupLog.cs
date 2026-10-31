namespace MyCampusView.Connect.App.Install;

/// <summary>Setup and manager actions, kept beside the service logs for support.</summary>
static class SetupLog
{
    static readonly object Gate = new();

    public static string PathOnDisk => System.IO.Path.Combine(AppInfo.DataDir, "logs", "setup.log");

    public static void Write(string message)
    {
        try
        {
            lock (Gate)
            {
                Directory.CreateDirectory(System.IO.Path.GetDirectoryName(PathOnDisk)!);
                File.AppendAllText(PathOnDisk, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {message}{Environment.NewLine}");
            }
        }
        catch
        {
            // Logging must never break setup.
        }
    }
}
