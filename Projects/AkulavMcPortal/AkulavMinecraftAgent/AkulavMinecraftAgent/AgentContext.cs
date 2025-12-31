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

    public class ModpackInfo
    {
        public string ID { get; set; }
        public string Name { get; set; }
        public string Version { get; set; }
        public string URL { get; set; }
        public string API { get; set; }
    }

    public class AgentVersionInfo
    {
        public string version { get; set; }
        public string url { get; set; }
    }

    public class AgentContext : ApplicationContext
    {
        // CHANGE THIS EVERY TIME YOU RELEASE A NEW VERSION
        private readonly string _currentVersion = "2.0.1";

        private NotifyIcon _trayIcon;
        private WebSocketServer _server;
        private IWebSocketConnection _client;
        private Process _gameProcess;
        private System.Timers.Timer _updateTimer;

        private readonly string _root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "AkulavMinecraftAgent");
        private readonly string _modpackUrl = "https://raw.githubusercontent.com/Akulav/akulav.github.io/refs/heads/main/Projects/AkulavMcPortal/modpacks/modpacks.json";
        private readonly string _agentVersionUrl = "https://raw.githubusercontent.com/Akulav/akulav.github.io/refs/heads/main/Projects/AkulavMcPortal/modpacks/agent_version.json";

        private string _setPath => Path.Combine(_root, "settings.json");
        private bool _isGameRunning => _gameProcess != null && !_gameProcess.HasExited;

        public AgentContext()
        {
            // If launched with "cleanup" argument, wait and delete the temp file
            HandleUpdateCleanup();

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

            _updateTimer = new System.Timers.Timer(120000);
            _updateTimer.Elapsed += async (s, e) =>
            {
                await CheckForAgentUpdates();
                await AutoUpdateLoop();
            };
            _updateTimer.Start();
        }

        private async Task CheckForAgentUpdates()
        {
            try
            {
                using var client = new HttpClient();
                var json = await client.GetStringAsync(_agentVersionUrl);
                var latest = JsonConvert.DeserializeObject<AgentVersionInfo>(json);

                if (latest.version != _currentVersion)
                {
                    Log($"New Agent version found: {latest.version}. Updating...");

                    string downloadPath = Path.Combine(_root, "AkulavAgent_new.exe");
                    using (var wc = new WebClient())
                    {
                        await wc.DownloadFileTaskAsync(new Uri(latest.url), downloadPath);
                    }

                    // Create a batch file to swap the EXEs and restart
                    string batchPath = Path.Combine(_root, "update.bat");
                    string currentExe = Application.ExecutablePath;
                    string targetExe = Path.Combine(_root, "AkulavAgent.exe");

                    string script = $@"
@echo off
timeout /t 2 /nobreak > nul
del ""{targetExe}""
move ""{downloadPath}"" ""{targetExe}""
start """" ""{targetExe}"" --updated
del ""%~f0""
";
                    File.WriteAllText(batchPath, script);
                    Process.Start(new ProcessStartInfo(batchPath) { CreateNoWindow = true, UseShellExecute = false });
                    Environment.Exit(0);
                }
            }
            catch { /* Silent fail */ }
        }

        private void HandleUpdateCleanup()
        {
            // If the app was just updated, we could show a notification here
            string[] args = Environment.GetCommandLineArgs();
            foreach (var arg in args)
            {
                if (arg == "--updated")
                {
                    // Optional: Log or notify that update was successful
                }
            }
        }

        private async Task AutoUpdateLoop()
        {
            if (_isGameRunning) return;
            try
            {
                using var client = new HttpClient();
                var json = await client.GetStringAsync(_modpackUrl);
                var remotePacks = JsonConvert.DeserializeObject<List<ModpackInfo>>(json);

                foreach (var pack in remotePacks)
                {
                    string marker = Path.Combine(_root, "instances", pack.ID, ".installed");
                    if (File.Exists(marker) && File.ReadAllText(marker) != pack.Version)
                    {
                        Log($"Update detected: {pack.Name}...");
                        await Sync(pack.ID, pack.URL, pack.Version, false);
                        SendSync();
                    }
                }
            }
            catch { }
        }

        private bool CheckInstallation()
        {
            string targetExe = Path.Combine(_root, "AkulavAgent.exe");
            if (Application.ExecutablePath.Equals(targetExe, StringComparison.OrdinalIgnoreCase)) return true;
            try
            {
                Directory.CreateDirectory(_root);
                File.Copy(Application.ExecutablePath, targetExe, true);
                Process.Start(new ProcessStartInfo(targetExe) { UseShellExecute = true });
                Environment.Exit(0); return false;
            }
            catch { return true; }
        }

        private void SetupTray()
        {
            _trayIcon = new NotifyIcon();
            try
            {
                var assembly = System.Reflection.Assembly.GetExecutingAssembly();
                using (Stream s = assembly.GetManifestResourceStream("AkulavMinecraftAgent.minecraft.ico"))
                {
                    _trayIcon.Icon = s != null ? new System.Drawing.Icon(s) : System.Drawing.SystemIcons.Shield;
                }
            }
            catch { _trayIcon.Icon = System.Drawing.SystemIcons.Shield; }
            _trayIcon.Visible = true;
            _trayIcon.Text = $"Akulav Agent v{_currentVersion}";
            var menu = new ContextMenuStrip();
            menu.Items.Add("Open Folder", null, (s, e) => Process.Start("explorer.exe", _root));
            menu.Items.Add("Exit", null, (s, e) => { _trayIcon.Visible = false; Application.Exit(); });
            _trayIcon.ContextMenuStrip = menu;
        }

        private async void Handle(string json)
        {
            try
            {
                var cmd = JsonConvert.DeserializeObject<dynamic>(json);
                string type = (string)cmd.Type;
                if (type == "save_settings" || type == "launch") SaveSettings((int)cmd.Ram, (string)cmd.Username);
                if (type == "kill_game" && _isGameRunning) _gameProcess.Kill();
                if (type == "launch" && !_isGameRunning)
                {
                    await Sync((string)cmd.PackID, (string)cmd.URL, (string)cmd.Version, (bool)(cmd.Force ?? false));
                    await Launch((string)cmd.Username, (string)cmd.PackID, (string)cmd.API);
                    SendSync();
                }
            }
            catch (Exception ex) { Log("Error: " + ex.Message); }
        }

        private async Task Sync(string id, string url, string ver, bool force)
        {
            string path = Path.Combine(_root, "instances", id);
            string marker = Path.Combine(path, ".installed");
            if (File.Exists(marker) && File.ReadAllText(marker) == ver && !force) return;
            Log(force ? "Repairing..." : "Updating...", 0);
            Directory.CreateDirectory(path);
            using (var wc = new WebClient())
            {
                wc.DownloadProgressChanged += (s, e) => Log($"Syncing: {e.ProgressPercentage}%", e.ProgressPercentage);
                await wc.DownloadFileTaskAsync(new Uri(url), Path.Combine(_root, "temp.zip"));
            }
            ZipFile.ExtractToDirectory(Path.Combine(_root, "temp.zip"), path, true);
            File.Delete(Path.Combine(_root, "temp.zip"));
            File.WriteAllText(marker, ver);
        }

        private async Task Launch(string user, string id, string api)
        {
            string path = Path.Combine(_root, "instances", id);
            var launcher = new MinecraftLauncher(new MinecraftPath(path) { Assets = Path.Combine(_root, "assets"), Library = Path.Combine(_root, "libraries") });
            launcher.FileProgressChanged += (s, e) => { if (e.TotalTasks > 0) Log("Preparing Assets...", (int)((double)e.ProgressedTasks / e.TotalTasks * 100)); };
            _gameProcess = await launcher.InstallAndBuildProcessAsync(api, new MLaunchOption { MaximumRamMb = GetSettings().AllocatedRam, Session = MSession.CreateOfflineSession(user) });
            Log("Launching Minecraft...", 100);
            _gameProcess.Start();
            SendSync();
            _ = Task.Run(() => { _gameProcess.WaitForExit(); SendSync(); });
        }

        private void SendSync()
        {
            var inst = new Dictionary<string, object>();
            if (Directory.Exists(Path.Combine(_root, "instances")))
            {
                foreach (var d in Directory.GetDirectories(Path.Combine(_root, "instances")))
                {
                    if (File.Exists(Path.Combine(d, ".installed")))
                        inst[new DirectoryInfo(d).Name] = new { version = File.ReadAllText(Path.Combine(d, ".installed")) };
                }
            }
            _client?.Send(JsonConvert.SerializeObject(new { type = "init_sync", payload = new { settings = GetSettings(), installed = inst, isGameRunning = _isGameRunning, version = _currentVersion } }));
        }

        private void Log(string m, int p = -1) => _client?.Send(JsonConvert.SerializeObject(new { type = "status", msg = m, perc = p }));
        private void SaveSettings(int r, string u) => File.WriteAllText(_setPath, JsonConvert.SerializeObject(new AgentSettings { AllocatedRam = Math.Max(r, 4096), Username = u }));
        private AgentSettings GetSettings() => File.Exists(_setPath) ? JsonConvert.DeserializeObject<AgentSettings>(File.ReadAllText(_setPath)) : new AgentSettings();
        private void SetStartup(bool e) { try { var k = Registry.CurrentUser.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Run", true); if (e) k.SetValue("AkulavAgent", "\"" + Application.ExecutablePath + "\""); } catch { } }
    }
}