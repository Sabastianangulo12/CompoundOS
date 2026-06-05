@echo off
setlocal

cd /d "%~dp0"

set "EXPO_NO_TELEMETRY=1"
echo Starting Expo Go for iPhone in LAN mode
echo.
echo Keep this window open while testing on your phone.
echo If Windows asks about firewall access, allow it on private networks.
echo.

"C:\Program Files\nodejs\node.exe" "node_modules\expo\bin\cli" start --lan --max-workers 1 --port 3002

echo.
echo Expo Go stopped. Press any key to close this window.
pause >nul
