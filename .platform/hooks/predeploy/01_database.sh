#!/bin/bash
set -e

echo "Running Prisma database migrations..."

# Load environment variables
if [ -f /opt/elasticbeanstalk/deployment/env ]; then
  source /opt/elasticbeanstalk/deployment/env
fi

# Navigate to application directory
cd /var/app/staging

# Debug: Print DATABASE_URL (masked)
echo "DATABASE_URL is set: ${DATABASE_URL:+yes}"

# Generate Prisma Client
npx prisma generate

# Apply pending migrations (production-safe)
npx prisma migrate deploy

echo "Database migrations completed successfully"
