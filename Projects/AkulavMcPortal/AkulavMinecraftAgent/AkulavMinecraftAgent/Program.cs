namespace AkulavMinecraftAgent
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            // Run the app using our custom context (No Form1 shown)
            Application.Run(new AgentContext());
        }
    }
}