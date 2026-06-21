#!/bin/sh
set -e

# The app runs as the non-root user "nodeuser" (UID 1001). Some data directories
# are bind mounts, and Docker creates a bind-mount target on the host owned by
# root — so nodeuser can't write to it. That's what breaks the Markdown Mirror
# with EACCES. We're still root at this point in startup, so fix ownership of the
# writable data dirs here, then drop to nodeuser to run the app.
for dir in "$MD_MIRROR_PATH" /app/uploads /app/backups; do
  [ -n "$dir" ] && [ -d "$dir" ] || continue
  # Only chown when it isn't already nodeuser-owned, so restarts stay fast.
  if [ "$(stat -c %u "$dir" 2>/dev/null)" != "1001" ]; then
    chown nodeuser:nodejs "$dir" || true
  fi
done

exec su-exec nodeuser:nodejs "$@"
