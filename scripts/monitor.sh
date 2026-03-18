#!/bin/bash
# RRG monitoring script — run every 15 min via cron
# Checks app health + DB issues, sends Telegram DM if anything is wrong

TG_BOT_TOKEN="${RRG_TG_BOT_TOKEN}"
TG_CHAT_ID="798889754"
MONITOR_SECRET="${MONITOR_SECRET}"
APP_URL="http://127.0.0.1:3001"
STAGING_URL="http://127.0.0.1:3002"
ALERT_COOLDOWN_FILE="/tmp/rrg_monitor_last_alert"
COOLDOWN_SECONDS=3600  # Don't repeat the same alert within 1 hour

send_tg() {
  local msg="$1"
  curl -s -X POST "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
    -d chat_id="${TG_CHAT_ID}" \
    -d text="${msg}" \
    -d parse_mode="Markdown" > /dev/null
}

should_alert() {
  local key="$1"
  local last_file="${ALERT_COOLDOWN_FILE}_${key}"
  if [ -f "$last_file" ]; then
    local last=$(cat "$last_file")
    local now=$(date +%s)
    if (( now - last < COOLDOWN_SECONDS )); then
      return 1  # skip, too soon
    fi
  fi
  date +%s > "$last_file"
  return 0
}

ISSUES=()

# 1. Check main app health
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${APP_URL}/api/rrg/health" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" != "200" ]; then
  # Fallback: check if port is listening at all
  if ! curl -s --max-time 5 "${APP_URL}" > /dev/null 2>&1; then
    ISSUES+=("rrg-app DOWN (port 3001 not responding)")
  fi
fi

# 2. Check DB issues via monitor endpoint
if [ -n "$MONITOR_SECRET" ]; then
  MONITOR_RESP=$(curl -s --max-time 15 \
    -H "x-monitor-secret: ${MONITOR_SECRET}" \
    "${APP_URL}/api/rrg/admin/monitor" 2>/dev/null)

  if [ -n "$MONITOR_RESP" ]; then
    OK=$(echo "$MONITOR_RESP" | grep -o '"ok":true' | head -1)
    if [ -z "$OK" ]; then
      # Extract issues array
      DB_ISSUES=$(echo "$MONITOR_RESP" | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  for i in d.get('issues', []):
    print(i)
except: pass
" 2>/dev/null)
      if [ -n "$DB_ISSUES" ]; then
        while IFS= read -r line; do
          ISSUES+=("$line")
        done <<< "$DB_ISSUES"
      fi
    fi
  fi
fi

# 3. Send alert if issues found
if [ ${#ISSUES[@]} -gt 0 ]; then
  MSG="🚨 *RRG Alert* ($(date '+%H:%M UTC'))"$'\n'
  for issue in "${ISSUES[@]}"; do
    MSG+="• ${issue}"$'\n'
  done
  MSG+="_realrealgenuine.com_"

  # Use issue fingerprint for cooldown
  FINGERPRINT=$(echo "${ISSUES[*]}" | md5sum | cut -d' ' -f1)
  if should_alert "$FINGERPRINT"; then
    send_tg "$MSG"
  fi
fi
