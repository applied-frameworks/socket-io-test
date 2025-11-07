#!/bin/bash
set -e

echo "Building frontend client..."

# Navigate to application directory
cd /var/app/staging

# Install client dependencies
echo "Installing client dependencies..."
cd client
npm install

# Build the client
echo "Building client production bundle..."
npm run build

echo "Client build completed successfully"
