@echo off
REM MyCampusView Tally Connector — headless sync host
setlocal
set ELECTRON_RUN_AS_NODE=1
set MCV_TALLY_CONNECTOR_SERVICE=1

REM This script lives in resources\service\ when installed.
set "HERE=%~dp0"
set "APP_EXE=%HERE%..\..\MyCampusView Tally Connector.exe"
set "RUNNER=%HERE%runner.mjs"

if not exist "%APP_EXE%" (
  echo MyCampusView Tally Connector.exe not found at "%APP_EXE%"
  exit /b 1
)

"%APP_EXE%" "%RUNNER%"
endlocal
