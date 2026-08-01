using System.Diagnostics;
using System.Text;

namespace SmartErp.Shell;

/// <summary>
/// Commercial desktop entry: no browser chrome for cashiers.
/// Reads config\erp-url.txt; if missing, opens Connection Setup on the Service Helper.
/// Prefers Microsoft Edge / Chrome --app= mode (WebView-like framed window).
/// </summary>
internal static class Program
{
    private const string SetupUrl = "http://127.0.0.1:1812/erp-setup/";
    private const string DefaultLocal = "http://127.0.0.1:3001";

    [STAThread]
    private static void Main(string[] args)
    {
        var productRoot = FindProductRoot();
        var url = ReadErpUrl(productRoot) ?? (args.Length > 0 ? args[0].Trim() : null);

        if (string.IsNullOrWhiteSpace(url))
        {
            // First launch — Connection Setup wizard
            OpenUrl(SetupUrl, appMode: false);
            return;
        }

        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            OpenUrl(SetupUrl, appMode: false);
            return;
        }

        if (!OpenUrl(url, appMode: true))
        {
            // Last resort: default browser
            OpenUrl(url, appMode: false);
        }
    }

    private static string FindProductRoot()
    {
        var dir = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        // Installed next to Open-SMART-ERP.vbs / config\
        if (File.Exists(Path.Combine(dir, "config", "erp-url.txt")) ||
            Directory.Exists(Path.Combine(dir, "Print Service")))
        {
            return dir;
        }
        var parent = Directory.GetParent(dir)?.FullName;
        if (parent != null &&
            (File.Exists(Path.Combine(parent, "config", "erp-url.txt")) ||
             Directory.Exists(Path.Combine(parent, "Print Service"))))
        {
            return parent;
        }
        return dir;
    }

    private static string? ReadErpUrl(string productRoot)
    {
        var path = Path.Combine(productRoot, "config", "erp-url.txt");
        if (!File.Exists(path)) return null;
        foreach (var line in File.ReadAllLines(path, Encoding.UTF8))
        {
            var t = line.Trim();
            if (t.Length > 0 && !t.StartsWith('#')) return t;
        }
        return null;
    }

    private static bool OpenUrl(string url, bool appMode)
    {
        var browsers = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                "Google", "Chrome", "Application", "chrome.exe"),
        };

        if (appMode)
        {
            foreach (var browser in browsers)
            {
                if (!File.Exists(browser)) continue;
                try
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = browser,
                        Arguments = $"--app=\"{url}\" --new-window",
                        UseShellExecute = false,
                    });
                    return true;
                }
                catch
                {
                    /* try next */
                }
            }
        }

        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = url,
                UseShellExecute = true,
            });
            return true;
        }
        catch
        {
            return false;
        }
    }
}
