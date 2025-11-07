#!/bin/bash
set -e

echo "Running Prisma database migrations..."

# Navigate to application directory
cd /var/app/staging

# Generate Prisma Client
npx prisma generate

# Push database schema (for SQLite or PostgreSQL)
npx prisma db push --skip-generate

echo "Database migrations completed successfully"
