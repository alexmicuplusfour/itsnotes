#!/bin/bash
set -e

# Find the latest SQL dump file
LATEST_DUMP=$(find /docker-entrypoint-initdb.d/dumps -name "pg_dump-*.sql" | sort -r | head -n 1)

if [ -z "$LATEST_DUMP" ]; then
  echo "No SQL dump file found — starting with a fresh database."
  exit 0
fi

echo "Initializing database with dump file: $LATEST_DUMP"

# Execute the SQL dump
# Set the transaction_timeout parameter to 0 to avoid compatibility issues
echo "SET transaction_timeout = 0;" > /tmp/init.sql
cat "$LATEST_DUMP" >> /tmp/init.sql

# Execute the modified SQL dump
psql -v ON_ERROR_STOP=0 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f /tmp/init.sql

echo "Database initialization completed successfully!"