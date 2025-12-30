using CmlLib.Core;
using CmlLib.Core.Auth;
using CmlLib.Core.ProcessBuilder;
using Fleck;
using Newtonsoft.Json;
using System.IO;

namespace AkulavMinecraftAgent
{
    internal class GameLauncher
    {
        private readonly int ram;
        private readonly string username;
        private readonly string gameVersion;
        private readonly string modpackName;
        private readonly IWebSocketConnection _client;
        private readonly string _rootPath = @"C:\AkulavMinecraftAgent";

        public GameLauncher(int ram, string username, string modpackName, string api, IWebSocketConnection client)
        {
            this.ram = ram;
            this.username = username;
            this.modpackName = modpackName;
            this.gameVersion = api; // This is the version ID for CmlLib (e.g., 1.20.1-forge-47.4.6)
            this._client = client;
        }

        private void SendStatus(string msg, int perc = -1)
        {
            var data = new { type = "status", msg = msg, perc = perc };
            _client?.Send(JsonConvert.SerializeObject(data));
        }

        public async Task LaunchGameAsync()
        {
            // Each modpack gets its own folder inside the Agent directory
            var instancePath = Path.Combine(_rootPath, "instances", modpackName);
            var minecraftPath = new MinecraftPath(instancePath);

            // IMPORTANT: Share assets/libraries with the root to save disk space
            minecraftPath.Assets = Path.Combine(_rootPath, "assets");
            minecraftPath.Library = Path.Combine(_rootPath, "libraries");

            var launcher = new MinecraftLauncher(minecraftPath);

            // Forward CmlLib progress to the website
            launcher.ByteProgressChanged += (sender, args) =>
            {
                if (args.TotalBytes > 0)
                {
                    int progressPercentage = (int)((args.ProgressedBytes * 100) / args.TotalBytes);
                    SendStatus($"Downloading assets...", progressPercentage);
                }
            };

            var session = MSession.CreateOfflineSession(username);
            var launchOption = new MLaunchOption
            {
                MaximumRamMb = ram,
                Session = session
            };

            SendStatus("Preparing game files...");

            // Use InstallAndBuild because it handles missing vanilla files automatically
            var process = await launcher.InstallAndBuildProcessAsync(gameVersion, launchOption);

            SendStatus("Game is starting!", 100);
            process.Start();

            // Notify website when the game actually closes
            Task.Run(() => {
                process.WaitForExit();
                SendStatus("Game closed. Agent standing by.");
            });
        }
    }
}