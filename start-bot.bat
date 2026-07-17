@echo off
REM ============================================================
REM  ClipForge Discord bot launcher
REM  Double-click this file to start the bot.
REM  Keep the black window OPEN while you want the bot online.
REM  Close the window (or press Ctrl+C) to stop the bot.
REM ============================================================
cd /d "%~dp0"
echo.
echo   Starting the ClipForge Discord bot...
echo   Leave this window open. Closing it stops the bot.
echo.
call npx tsx apps/bot/src/index.ts
echo.
echo   The bot has stopped. Press any key to close this window.
pause >nul
