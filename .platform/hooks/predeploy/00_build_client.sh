#!/bin/bash
set -ex  # Added -x for verbose output

echo "========== Building frontend client =========="
echo "Current directory: $(pwd)"
echo "Directory contents:"
ls -la

# Navigate to application directory
echo "Navigating to /var/app/staging..."
cd /var/app/staging
echo "Current directory after cd: $(pwd)"
echo "Contents of /var/app/staging:"
ls -la

# Check if client directory exists
if [ ! -d "client" ]; then
  echo "ERROR: client directory not found!"
  ls -la
  exit 1
fi

# Install client dependencies
echo "Installing client dependencies..."
cd client
echo "Current directory: $(pwd)"
echo "package.json exists: $(ls -la package.json 2>/dev/null || echo 'NOT FOUND')"
npm install --include=dev

# Build the client
echo "Building client production bundle..."
npm run build

echo "Build output:"
ls -la dist/

echo "========== Client build completed successfully =========="
