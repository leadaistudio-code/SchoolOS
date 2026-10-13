; MyCampusView Tally Connector — NSIS hooks

!macro customInstall
  DetailPrint "MyCampusView Tally Connector files installed."
  DetailPrint "Next: open the app, pair with your school, then Install service."
!macroend

!macro customUnInstall
  DetailPrint "Removing auto-start service…"
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Unregister-ScheduledTask -TaskName ''MyCampusView Tally Connector'' -Confirm:$$false -ErrorAction SilentlyContinue"'
!macroend
