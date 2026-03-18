#!/bin/bash
# Add voucher routes to realrealgenuine.com nginx config
# Insert after the /api/creator/ block

CONF="/etc/nginx/sites-enabled/realrealgenuine.com"

# Check if voucher routes already exist
if grep -q 'location /voucher/' "$CONF"; then
  echo "Voucher routes already exist in nginx config"
  exit 0
fi

# Find line number of the closing brace after /api/creator/ block
LINE=$(awk '/location \/api\/creator\//,/\}/' "$CONF" | grep -c '')
INSERT_AFTER=$(awk '/location \/api\/creator\//{ start=NR } start && /\}/{ print NR; exit }' "$CONF")

if [ -z "$INSERT_AFTER" ]; then
  echo "ERROR: Could not find /api/creator/ block"
  exit 1
fi

# Create the text to insert
BLOCK='
    # ── Voucher routes ───────────────────────────────────────────────────
    location /voucher/ {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # ── Voucher API routes ───────────────────────────────────────────────
    location /api/voucher/ {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }'

# Insert after the found line
sudo sed -i "${INSERT_AFTER}a\\${BLOCK}" "$CONF"

# Test nginx config
sudo nginx -t
if [ $? -eq 0 ]; then
  sudo systemctl reload nginx
  echo "Voucher routes added and nginx reloaded successfully"
else
  echo "ERROR: nginx config test failed!"
  exit 1
fi
