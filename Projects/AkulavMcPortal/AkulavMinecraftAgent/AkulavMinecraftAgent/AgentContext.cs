using CmlLib.Core;
using CmlLib.Core.Auth;
using CmlLib.Core.ProcessBuilder;
using Fleck;
using Microsoft.Win32;
using Newtonsoft.Json;
using System.Diagnostics;
using System.IO.Compression;
using System.Net;

namespace AkulavMinecraftAgent
{
    public class AgentSettings
    {
        public int AllocatedRam { get; set; } = 4096;
        public string Username { get; set; } = "Player";
    }

    public class AgentContext : ApplicationContext
    {
        private NotifyIcon _trayIcon;
        private WebSocketServer _server;
        private IWebSocketConnection _client;
        private Process _gameProcess;
        private bool _isGameRunning => _gameProcess != null && !_gameProcess.HasExited;
        private readonly string _root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "AkulavMinecraftAgent");
        private string _setPath => Path.Combine(_root, "settings.json");

        public AgentContext()
        {
            if (!CheckInstallation()) return;

            Directory.CreateDirectory(Path.Combine(_root, "instances"));
            SetupTray();
            SetStartup(true);

            _server = new WebSocketServer("ws://0.0.0.0:8081");
            _server.Start(socket =>
            {
                socket.OnOpen = () => { _client = socket; SendSync(); };
                socket.OnMessage = msg => Handle(msg);
                socket.OnClose = () => _client = null;
            });
        }

        private bool CheckInstallation()
        {
            // The path where the agent should live
            string targetFolder = _root;
            string targetExePath = Path.Combine(targetFolder, "AkulavAgent.exe");
            string currentExePath = Application.ExecutablePath;

            // If we are already running from the AppData folder, we stay here.
            if (currentExePath.Equals(targetExePath, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            try
            {
                // Ensure the directory exists
                if (!Directory.Exists(targetFolder)) Directory.CreateDirectory(targetFolder);

                // Copy the .exe
                File.Copy(currentExePath, targetExePath, true);

                // Copy the icon if it exists
                string iconSource = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "minecraft.ico");
                if (File.Exists(iconSource))
                {
                    File.Copy(iconSource, Path.Combine(targetFolder, "minecraft.ico"), true);
                }

                // 1. Launch the "Official" version from AppData
                ProcessStartInfo startInfo = new ProcessStartInfo(targetExePath);
                startInfo.UseShellExecute = true;
                Process.Start(startInfo);

                // 2. Kill the temporary process immediately
                Environment.Exit(0);
                return false;
            }
            catch (Exception ex)
            {
                // If this fails, we just run from the current location (Downloads folder etc)
                // This prevents the app from not starting at all.
                return true;
            }
        }

        private async void Handle(string json)
        {
            try
            {
                var cmd = JsonConvert.DeserializeObject<dynamic>(json);
                string type = (string)cmd.Type;

                if (type == "save_settings" || type == "launch")
                {
                    if (cmd.Username != null && cmd.Ram != null)
                        SaveSettings((int)cmd.Ram, (string)cmd.Username);
                }

                if (type == "kill_game")
                {
                    if (_isGameRunning)
                    {
                        _gameProcess.Kill();
                        Log("Game process terminated by user.");
                    }
                    return;
                }

                if (type == "launch")
                {
                    if (_isGameRunning) { Log("Action Denied: Game is already running!"); return; }
                    await Sync((string)cmd.PackID, (string)cmd.URL, (string)cmd.Version, (bool)(cmd.Force ?? false));
                    await Launch((string)cmd.Username, (string)cmd.PackID, (string)cmd.API);
                    SendSync();
                }
            }
            catch (Exception ex) { Log("System Error: " + ex.Message); }
        }

        private async Task Sync(string id, string url, string ver, bool force)
        {
            string path = Path.Combine(_root, "instances", id);
            string marker = Path.Combine(path, ".installed");
            if (File.Exists(marker) && File.ReadAllText(marker) == ver && !force) return;

            Log(force ? "Repairing Modpack..." : "Updating Modpack...", 0);
            if (Directory.Exists(path)) Directory.Delete(path, true);
            Directory.CreateDirectory(path);

            using (var wc = new WebClient())
            {
                wc.DownloadProgressChanged += (s, e) => Log($"Downloading: {e.ProgressPercentage}%", e.ProgressPercentage);
                await wc.DownloadFileTaskAsync(new Uri(url), Path.Combine(_root, "temp.zip"));
            }

            Log("Extracting Files...", 100);
            ZipFile.ExtractToDirectory(Path.Combine(_root, "temp.zip"), path);
            File.Delete(Path.Combine(_root, "temp.zip"));
            File.WriteAllText(marker, ver);
        }

        private async Task Launch(string user, string id, string api)
        {
            Log("Initializing Launcher...");
            string path = Path.Combine(_root, "instances", id);
            var mcPath = new MinecraftPath(path)
            {
                Assets = Path.Combine(_root, "assets"),
                Library = Directory.Exists(Path.Combine(path, "libraries")) ? Path.Combine(path, "libraries") : Path.Combine(_root, "libraries")
            };

            var launcher = new MinecraftLauncher(mcPath);
            launcher.FileProgressChanged += (sender, e) =>
            {
                if (e.TotalTasks > 0)
                {
                    int perc = (int)((double)e.ProgressedTasks / e.TotalTasks * 100);
                    Log($"Verifying: {e.Name} ({e.ProgressedTasks}/{e.TotalTasks})", perc);
                }
            };

            _gameProcess = await launcher.InstallAndBuildProcessAsync(api, new MLaunchOption
            {
                MaximumRamMb = GetSettings().AllocatedRam,
                Session = MSession.CreateOfflineSession(user)
            });

            Log("Game is starting!", 100);
            _gameProcess.Start();
            SendSync();

            _ = Task.Run(() =>
            {
                _gameProcess.WaitForExit();
                Log("Game Closed.", 0);
                SendSync();
            });
        }

        private void SendSync()
        {
            var installed = new Dictionary<string, object>();
            string instPath = Path.Combine(_root, "instances");
            if (Directory.Exists(instPath))
            {
                foreach (var dir in Directory.GetDirectories(instPath))
                {
                    string id = new DirectoryInfo(dir).Name;
                    if (File.Exists(Path.Combine(dir, ".installed")))
                        installed[id] = new { version = File.ReadAllText(Path.Combine(dir, ".installed")) };
                }
            }
            _client?.Send(JsonConvert.SerializeObject(new
            {
                type = "init_sync",
                payload = new { settings = GetSettings(), installed = installed, isGameRunning = _isGameRunning }
            }));
        }

        private void Log(string m, int p = -1) => _client?.Send(JsonConvert.SerializeObject(new { type = "status", msg = m, perc = p }));
        private void SaveSettings(int r, string u) => File.WriteAllText(_setPath, JsonConvert.SerializeObject(new AgentSettings { AllocatedRam = Math.Max(r, 4096), Username = u }));
        private AgentSettings GetSettings() => File.Exists(_setPath) ? JsonConvert.DeserializeObject<AgentSettings>(File.ReadAllText(_setPath)) : new AgentSettings();
        private void SetupTray()
{
    _trayIcon = new NotifyIcon();

    try
    {
        // Get the current assembly
        var assembly = System.Reflection.Assembly.GetExecutingAssembly();
        
        // IMPORTANT: The path is usually "YourNamespace.FileName.ico"
        // Replace 'AkulavMinecraftAgent' with your actual project namespace
        string resourceName = "AkulavMinecraftAgent.minecraft.ico";

        using (Stream stream = assembly.GetManifestResourceStream(resourceName))
        {
            if (stream != null)
            {
                _trayIcon.Icon = new System.Drawing.Icon(stream);
            }
            else
            {
                // If you get the name wrong, it will fall back to shield
                _trayIcon.Icon = System.Drawing.SystemIcons.Shield;
            }
        }
    }
    catch (Exception ex)
    {
        _trayIcon.Icon = System.Drawing.SystemIcons.Error;
        // Helpful for debugging the exact resource name in your logs
        Log("Icon Load Error: " + ex.Message); 
    }

    _trayIcon.Visible = true;
    _trayIcon.Text = "Akulav Minecraft Agent";

    var menu = new ContextMenuStrip();
    menu.Items.Add("Open Portal Folder", null, (s, e) => Process.Start("explorer.exe", _root));
    menu.Items.Add("-");
    menu.Items.Add("Exit Agent", null, (s, e) => Application.Exit());
    
    _trayIcon.ContextMenuStrip = menu;
}
        private void SetStartup(bool e) { try { var k = Registry.CurrentUser.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Run", true); if (e) k.SetValue("AkulavAgent", Application.ExecutablePath); } catch { } }
    }
}