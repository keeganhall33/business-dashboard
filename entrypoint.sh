#!/bin/sh
set -e

cat <<EOF >/usr/share/nginx/html/env.js
window.__ENV__ = {
  REACT_APP_SUPABASE_URL: "${REACT_APP_SUPABASE_URL:-}",
  REACT_APP_SUPABASE_ANON_KEY: "${REACT_APP_SUPABASE_ANON_KEY:-}"
};
EOF

exec nginx -g 'daemon off;'
