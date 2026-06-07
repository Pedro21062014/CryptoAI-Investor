#!/bin/bash
echo "========================================"
echo "CryptoAI Investor - Build Script Linux"
echo "========================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed!"
    echo "Please install Node.js first"
    exit 1
fi

echo "Node.js version:"
node --version
echo ""

# Install dependencies
echo "Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install dependencies"
    exit 1
fi

echo ""
echo "========================================"
echo "Building Windows Setup (.exe installer)"
echo "========================================"
npm run build:win
if [ $? -ne 0 ]; then
    echo "WARNING: Failed to build Windows version (this is normal on Linux without Wine)"
fi

echo ""
echo "========================================"
echo "Building Linux Package (.deb)"
echo "========================================"
npm run build:linux
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to build Linux version"
    exit 1
fi

echo ""
echo "========================================"
echo "Build Complete!"
echo "========================================"
echo ""
echo "Output files are in the 'dist' folder:"
echo "- Windows Setup: dist/CryptoAI Investor-*.exe (if built)"
echo "- Linux DEB: dist/*.deb"
echo ""
echo "To create a GitHub Release, run:"
echo "  python3 create_release.py"
echo ""
