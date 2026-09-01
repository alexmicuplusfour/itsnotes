#!/bin/sh
# Fills in the app's base path at container start, so one published image
# serves both root deployments and subpath deployments (e.g. /itsnotes).
#
# The image is built with the sentinel /__ITSNOTES_BASE__/ baked into the
# few files that reference the app's own address (index.html plus the main
# JS and CSS bundles). Pristine copies live in /usr/share/nginx/templates;
# this script rewrites them into the live html directory on every start, so
# changing BASE_PATH is just a restart, never a rebuild.
set -eu

SENTINEL='/__ITSNOTES_BASE__/'
TEMPLATE_DIR=/usr/share/nginx/templates
HTML_DIR=/usr/share/nginx/html

# Normalize BASE_PATH: default empty (root deploy), strip trailing slashes,
# require a leading slash when set.
BASE_PATH="${BASE_PATH:-}"
BASE_PATH="$(printf '%s' "$BASE_PATH" | sed 's:/*$::')"
if [ -n "$BASE_PATH" ]; then
  case "$BASE_PATH" in
    /*) ;;
    *) BASE_PATH="/$BASE_PATH" ;;
  esac
  # Restrict to characters that are safe in URLs and in the sed script below.
  # Anything else (&, #, \, spaces, ...) would corrupt the substitution
  # silently, so refuse to start instead.
  if printf '%s' "$BASE_PATH" | grep -q '[^A-Za-z0-9/._-]'; then
    echo "[itsnotes-client] ERROR: BASE_PATH '$BASE_PATH' contains unsupported characters." >&2
    echo "[itsnotes-client] Use only letters, digits, '/', '-', '_' and '.' (e.g. BASE_PATH=/itsnotes)." >&2
    exit 1
  fi
fi

# Rewrite each templated file into place. "$BASE_PATH/" is "/" for root
# deploys and "/itsnotes/" for BASE_PATH=/itsnotes.
for tpl in "$TEMPLATE_DIR"/*; do
  name="$(basename "$tpl")"
  case "$name" in
    index.html) target="$HTML_DIR/index.html" ;;
    *)          target="$HTML_DIR/assets/$name" ;;
  esac
  sed "s#$SENTINEL#$BASE_PATH/#g" "$tpl" > "$target"
  # A missed sentinel means a broken app (requests to /__ITSNOTES_BASE__/...),
  # so fail loudly rather than serve a white page.
  if grep -q '__ITSNOTES_BASE__' "$target"; then
    echo "[itsnotes-client] ERROR: substitution left sentinels in $target — refusing to start." >&2
    exit 1
  fi
done

if [ -n "$BASE_PATH" ]; then
  echo "[itsnotes-client] Serving under base path: $BASE_PATH"
else
  echo "[itsnotes-client] Serving at the root path"
fi

cp /etc/nginx/conf.d/default.conf.template /etc/nginx/conf.d/default.conf
exec nginx -g "daemon off;"
