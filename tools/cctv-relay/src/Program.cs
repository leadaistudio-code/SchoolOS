using System;
using System.Diagnostics;
using System.Linq;
using System.Threading;
using System.Windows.Forms;
using MyCampusView.CctvRelay.Ui;

namespace MyCampusView.CctvRelay
{
    static class Program
    {
        const string MutexName = @"Local\MyCampusView.CctvRelay";
        const string ShowEventName = @"Local\MyCampusView.CctvRelay.Show";
        const string ExitEventName = @"Local\MyCampusView.CctvRelay.Exit";

        [STAThread]
        static int Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += (_, e) => Log.Error("Unexpected error: " + e.Exception);
            AppDomain.CurrentDomain.UnhandledException += (_, e) => Log.Error("Fatal error: " + e.ExceptionObject);

            try
            {
                if (args.Contains("--uninstall")) return Uninstall();
                if (!Installer.RunningInstalled && !args.Contains("--portable")) return InstallOrOpen();
                return Run(args.Contains("--minimized"));
            }
            catch (Exception e)
            {
                Log.Error("Fatal error: " + e);
                MessageBox.Show("Something went wrong: " + e.Message, AppInfo.Name, MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
        }

        static int Run(bool minimized)
        {
            using (var mutex = new Mutex(true, MutexName, out var first))
            {
                if (!first)
                {
                    Signal(ShowEventName);
                    return 0;
                }
                Log.Info(AppInfo.Name + " " + AppInfo.Version + " starting.");
                var form = new MainForm(minimized);
                using (var show = new EventWaitHandle(false, EventResetMode.AutoReset, ShowEventName))
                using (var exit = new EventWaitHandle(false, EventResetMode.AutoReset, ExitEventName))
                using (var stop = new ManualResetEvent(false))
                {
                    var watcher = new Thread(() =>
                    {
                        while (true)
                        {
                            var which = WaitHandle.WaitAny(new WaitHandle[] { show, exit, stop });
                            if (which == 2) return;
                            try
                            {
                                if (which == 0) form.BeginInvoke(new Action(form.ShowWindow));
                                else form.BeginInvoke(new Action(form.ExitForUpdate));
                            }
                            catch (InvalidOperationException) { /* window not created yet or closing */ }
                        }
                    }) { IsBackground = true, Name = "signals" };
                    watcher.Start();
                    Application.Run(form);
                    stop.Set();
                }
                mutex.ReleaseMutex();
            }
            return 0;
        }

        /// <summary>The downloaded exe: install (or update) into the user's Programs folder and start from there.</summary>
        static int InstallOrOpen()
        {
            string installedVersion = null;
            if (Installer.IsInstalled)
            {
                var v = FileVersionInfo.GetVersionInfo(AppInfo.InstalledExe);
                installedVersion = v.FileMajorPart + "." + v.FileMinorPart + "." + v.FileBuildPart;
                if (installedVersion == AppInfo.Version)
                {
                    if (!Signal(ShowEventName)) Process.Start(AppInfo.InstalledExe);
                    return 0;
                }
            }

            bool desktop;
            using (var welcome = new WelcomeForm(installedVersion))
            {
                if (welcome.ShowDialog() != DialogResult.OK) return 0;
                desktop = welcome.DesktopShortcut;
            }

            StopRunningCopy();
            Installer.Install(desktop);
            var settings = AppSettings.Load();
            try { Installer.SetStartWithWindows(settings.StartWithWindows); } catch { }
            Process.Start(AppInfo.InstalledExe);
            return 0;
        }

        static int Uninstall()
        {
            if (MessageBox.Show("Remove " + AppInfo.Name + " from this PC?\n\nLive CCTV in MyCampusView stops working until it is installed again.",
                    AppInfo.Name, MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) != DialogResult.Yes) return 0;
            var removeSettings = MessageBox.Show("Also delete the saved connection key and recorder password?\n\nChoose No to keep them for a later reinstall.",
                AppInfo.Name, MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes;
            StopRunningCopy();
            Installer.Uninstall(removeSettings);
            MessageBox.Show(AppInfo.Name + " has been removed.", AppInfo.Name, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 0;
        }

        /// <summary>Ask a running copy to quit and wait until it has.</summary>
        static void StopRunningCopy()
        {
            if (!Signal(ExitEventName)) return;
            try
            {
                using (var m = new Mutex(false, MutexName))
                {
                    if (m.WaitOne(TimeSpan.FromSeconds(15))) m.ReleaseMutex();
                }
            }
            catch (AbandonedMutexException) { }
            Thread.Sleep(500);
        }

        static bool Signal(string name)
        {
            try
            {
                using (var e = EventWaitHandle.OpenExisting(name))
                {
                    e.Set();
                    return true;
                }
            }
            catch (WaitHandleCannotBeOpenedException) { return false; }
        }
    }
}
