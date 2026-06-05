@echo off
setlocal

cd /d "%~dp0"

echo Starting Next.js for LAN access on port 3000
echo Open this from another device using your current computer IP, for example:
echo   http://YOUR-CURRENT-IP:3000
echo.
echo Keep this window open while testing the member app.
echo If Windows asks about firewall access, allow it on private networks.
echo.

npx next dev -H 0.0.0.0 -p 3000

echo.
echo Next.js stopped. Press any key to close this window.
pause >nul
