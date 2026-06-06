#!/bin/bash

# Create import directory structure
IMPORT_DIR="./itsnotes-import-temp"

# Create directory with proper permissions if it doesn't exist
if [ ! -d "$IMPORT_DIR" ]; then
  echo "Creating import directory: $IMPORT_DIR"
  mkdir -p "$IMPORT_DIR"
  chmod 777 "$IMPORT_DIR"
else
  echo "Import directory already exists: $IMPORT_DIR"
  # Ensure permissions are correct
  chmod 777 "$IMPORT_DIR"
fi

echo "Import directory setup complete!"