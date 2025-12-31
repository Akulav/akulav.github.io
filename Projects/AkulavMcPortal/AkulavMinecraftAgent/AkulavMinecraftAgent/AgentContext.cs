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
        public string Username { get; set; } = "Steve";
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
        private readonly string _currentVersion = "2.2.2"; // Incremented
        private NotifyIcon _trayIcon;
        private WebSocketServer _server;
        private IWebSocketConnection _client;
        private Process _gameProcess;
        private System.Timers.Timer _updateTimer;

        private readonly string _root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "AkulavMinecraftAgent");
        private readonly string _modpackUrl = "https://raw.githubusercontent.com/Akulav/akulav.github.io/refs/heads/main/Projects/AkulavMcPortal/modpacks/modpacks.json";
        private readonly string _agentVersionUrl = "https://raw.githubusercontent.com/Akulav/akulav.github.io/refs/heads/main/Projects/AkulavMcPortal/modpacks/agent_version.json";

        private string _logPath => Path.Combine(_root, "agent.log");
        private string _setPath => Path.Combine(_root, "settings.json");
        private bool _isGameRunning => _gameProcess != null && !_gameProcess.HasExited;

        public AgentContext()
        {
            Directory.CreateDirectory(_root);
            LogToFile("--- Session Started ---");

            HandleUpdateCleanup();
            if (!CheckInstallation()) return;

            Directory.CreateDirectory(Path.Combine(_root, "instances"));
            SetupTray();
            SetStartup(true);

            StartSocketServer();

            _updateTimer = new System.Timers.Timer(120000);
            _updateTimer.Elapsed += async (s, e) => await ManualUpdateCheck(false);
            _updateTimer.Start();
        }

        private void StartSocketServer()
        {
            try
            {
                _server = new WebSocketServer("ws://0.0.0.0:8081");
                _server.Start(socket =>
                {
                    socket.OnOpen = () => { _client = socket; SendSync(); };
                    socket.OnMessage = msg => Handle(msg);
                    socket.OnClose = () => _client = null;
                });
            }
            catch (Exception ex) { LogToFile("WS Error: " + ex.Message); }
        }

        public async Task ManualUpdateCheck(bool verbose)
        {
            LogToFile("Checking for updates...");
            await CheckForAgentUpdates();
            await AutoUpdateLoop();
            if (verbose) MessageBox.Show("Update check finished.", "Akulav Agent");
        }

        private async Task CheckForAgentUpdates()
        {
            try
            {
                using var client = new HttpClient();
                var json = await client.GetStringAsync(_agentVersionUrl);
                var latest = JsonConvert.DeserializeObject<AgentVersionInfo>(json);
                if (latest.version != _currentVersion) UpdateAgent(latest.url);
            }
            catch (Exception ex) { LogToFile("Update Check Error: " + ex.Message); }
        }

        private void UpdateAgent(string url)
        {
            try
            {
                string downloadPath = Path.Combine(_root, "AkulavAgent_new.exe");
                using (var wc = new WebClient()) wc.DownloadFile(new Uri(url), downloadPath);
                string batchPath = Path.Combine(_root, "update.bat");
                string targetExe = Path.Combine(_root, "AkulavAgent.exe");
                string script = $"@echo off\ntimeout /t 2 /nobreak > nul\ndel \"{targetExe}\"\nmove \"{downloadPath}\" \"{targetExe}\"\nstart \"\" \"{targetExe}\" --updated\ndel \"%~f0\"";
                File.WriteAllText(batchPath, script);
                Process.Start(new ProcessStartInfo(batchPath) { CreateNoWindow = true, UseShellExecute = false });
                Environment.Exit(0);
            }
            catch (Exception ex) { LogToFile("Update Execution Error: " + ex.Message); }
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
                        LogToFile($"Auto-Updating Modpack: {pack.Name}");
                        await Sync(pack.ID, pack.URL, pack.Version, false);
                        SendSync();
                    }
                }
            }
            catch (Exception ex) { LogToFile("Loop Error: " + ex.Message); }
        }

        private async Task Sync(string id, string url, string ver, bool force)
        {
            string path = Path.Combine(_root, "instances", id);
            string marker = Path.Combine(path, ".installed");
            if (File.Exists(marker) && File.ReadAllText(marker) == ver && !force) return;

            LogToFile($"Syncing {id}...");

            // Clean installation: Delete old folder first (Restored from old code)
            if (Directory.Exists(path)) Directory.Delete(path, true);
            Directory.CreateDirectory(path);

            using (var wc = new WebClient())
            {
                wc.DownloadProgressChanged += (s, e) => Log($"Sync: {e.ProgressPercentage}%", e.ProgressPercentage);
                await wc.DownloadFileTaskAsync(new Uri(url), Path.Combine(_root, "temp.zip"));
            }

            ZipFile.ExtractToDirectory(Path.Combine(_root, "temp.zip"), path);
            File.Delete(Path.Combine(_root, "temp.zip"));
            File.WriteAllText(marker, ver);
        }

        private async Task Launch(string user, string id, string api)
        {
            try
            {
                LogToFile($"Launching {id}...");
                string path = Path.Combine(_root, "instances", id);

                // Restored library fallback logic from the old working code
                var mcPath = new MinecraftPath(path)
                {
                    Assets = Path.Combine(_root, "assets"),
                    Library = Directory.Exists(Path.Combine(path, "libraries")) ? Path.Combine(path, "libraries") : Path.Combine(_root, "libraries")
                };

                var launcher = new MinecraftLauncher(mcPath);
                launcher.FileProgressChanged += (s, e) =>
                {
                    if (e.TotalTasks > 0) Log($"Verifying: {e.Name}", (int)((double)e.ProgressedTasks / e.TotalTasks * 100));
                };

                var option = new MLaunchOption
                {
                    MaximumRamMb = GetSettings().AllocatedRam,
                    Session = MSession.CreateOfflineSession(user)
                };

                // Build process
                _gameProcess = await launcher.InstallAndBuildProcessAsync(api, option);


                _gameProcess.Start();
                SendSync();

                _ = Task.Run(() =>
                {
                    _gameProcess.WaitForExit();
                    LogToFile($"Exit Code: {_gameProcess.ExitCode}");
                    SendSync();
                });
            }
            catch (Exception ex) { LogToFile("LAUNCH ERROR: " + ex.ToString()); }
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
            menu.Items.Add("Open Portal Folder", null, (s, e) => Process.Start("explorer.exe", _root));
            menu.Items.Add("Check for Updates", null, async (s, e) => await ManualUpdateCheck(true));
            menu.Items.Add("Clear Log", null, (s, e) => ClearLog());
            menu.Items.Add("-");
            menu.Items.Add("Exit", null, (s, e) => { _trayIcon.Visible = false; Application.Exit(); });
            _trayIcon.ContextMenuStrip = menu;
        }

        private void LogToFile(string m)
        {
            try { File.AppendAllText(_logPath, $"[{DateTime.Now:HH:mm:ss}] {m}{Environment.NewLine}"); Log(m); } catch { }
        }

        private void ClearLog() { try { File.WriteAllText(_logPath, $"[{DateTime.Now}] Log Cleared.{Environment.NewLine}"); } catch { } }

        private bool CheckInstallation()
        {
            string targetExe = Path.Combine(_root, "AkulavAgent.exe");
            if (Application.ExecutablePath.Equals(targetExe, StringComparison.OrdinalIgnoreCase)) return true;
            try { File.Copy(Application.ExecutablePath, targetExe, true); Process.Start(new ProcessStartInfo(targetExe) { UseShellExecute = true }); Environment.Exit(0); return false; } catch { return true; }
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
            catch (Exception ex) { LogToFile("WS Handler Error: " + ex.Message); }
        }

        private void HandleUpdateCleanup()
        {
            string[] args = Environment.GetCommandLineArgs();
            foreach (var arg in args) if (arg == "--updated") LogToFile("Updated successfully to v" + _currentVersion);
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