@echo off
echo ========================================
echo CryptoAI Investor - Build Script Windows
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js version:
node --version
echo.

REM Install dependencies
echo Installing dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo ========================================
echo Building Windows Setup (.exe installer)
echo ========================================
call npm run build:win
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to build Windows version
    pause
    exit /b 1
)

echo.
echo ========================================
echo Building Linux Package (.deb)
echo ========================================
call npm run build:linux
if %ERRORLEVEL% neq 0 (
    echo WARNING: Failed to build Linux version (this is normal on Windows)
    echo You can skip this step if building on Windows
)

echo.
echo ========================================
echo Build Complete!
echo ========================================
echo.
echo Output files are in the 'dist' folder:
echo - Windows Setup: dist\CryptoAI Investor-*.exe
echo - Linux DEB: dist\*.deb (if built on Linux)
echo.
echo To create a GitHub Release, run:
echo   python create_release.py
echo.
pause
