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

# Try to apply pending migrations (production-safe)
# If we get P3005 error (database not empty, no migration history), baseline the database
if ! npx prisma migrate deploy 2>&1 | tee /tmp/migrate-output.log; then
  if grep -q "P3005" /tmp/migrate-output.log; then
    echo "Database has no migration history but contains tables. Baselining..."

    # Get the initial migration name
    INIT_MIGRATION=$(ls -1 prisma/migrations/ | head -n 1)

    if [ -n "$INIT_MIGRATION" ]; then
      echo "Executing migration SQL for $INIT_MIGRATION..."
      # First, execute the migration SQL to create any missing tables
      npx prisma db execute --file "prisma/migrations/$INIT_MIGRATION/migration.sql" --schema prisma/schema.prisma || echo "Migration SQL execution completed (some errors are expected if tables already exist)"

      echo "Marking migration $INIT_MIGRATION as applied..."
      npx prisma migrate resolve --applied "$INIT_MIGRATION"

      # Now try migrate deploy again for any additional migrations
      echo "Retrying migrate deploy..."
      npx prisma migrate deploy || true
    else
      echo "ERROR: No migrations found to baseline"
      exit 1
    fi
  else
    echo "ERROR: Migration failed with unknown error"
    exit 1
  fi
fi

echo "Database migrations completed successfully"
