#!/usr/bin/env bash
# Checks the nginx proxy against the REAL backend: the whole stack from docker-compose.example.yml (this image, the
# backend's image with NODE_ENV=production, MySQL), with demo data. docker/verify.sh checks the same container against
# a stub; this one proves what only the real backend can show: that its /api routes are reached with the prefix
# kept, that sessions work through nginx (cookies both ways, CSRF), that it sees the visitor's IP address (trust
# proxy), and that a 10 MB attachment goes through while 12 MB is refused. CI runs it (the "stack" job in e2e.yml).
#
#   docker/verify-stack.sh <base URL> <web container>      e.g. docker/verify-stack.sh http://localhost:8080 stack-web-1
#
# Uses the seeded demo admin (scripts/seed.js in the backend), so run it only against a throwaway database.
set -u
BASE="${1:?base URL, e.g. http://localhost:8080}"
WEB="${2:?the name or id of the web container}"
failures=0
pass() { echo "  ok    $1"; }
fail() {
  echo "  FAIL  $1"
  failures=$((failures + 1))
}
check() {
  local what="$1"
  shift
  if "$@" >/dev/null 2>&1; then pass "$what"; else fail "$what"; fi
}
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "The API, through nginx"
check "/api/health → 200 from the real backend" sh -c "curl -sf '$BASE/api/health' | grep -q '\"status\":\"ok\"'"
CODE="$(curl -s -o "$TMP/404.json" -w '%{http_code}' "$BASE/api/does-not-exist?x=1")"
echo "    /api/does-not-exist → $CODE $(cat "$TMP/404.json")"
check "/api/does-not-exist → 404" test "$CODE" = 404
# The backend names the path it got: /api is still on it, so nginx kept the prefix (and the query string stayed off)
check "the backend got /api/does-not-exist (prefix kept)" grep -q '"message":"Route not found: GET /api/does-not-exist"' "$TMP/404.json"

echo "A session through nginx"
# X-Forwarded-For from the client is a claim anyone can make: the backend must not take it as the visitor's address
curl -s -D "$TMP/login.h" -o "$TMP/login.json" -H 'Content-Type: application/json' -H 'X-Forwarded-For: 203.0.113.9' \
  -d '{"email":"admin@ticketflow.local","password":"password123"}' "$BASE/api/auth/login"
LOGIN_STATUS="$(head -1 "$TMP/login.h" | awk '{print $2}')"
check "POST /api/auth/login → 200" test "$LOGIN_STATUS" = 200
SESSION="$(grep -i '^set-cookie: tf_session=' "$TMP/login.h" | sed 's/^[^:]*: //; s/;.*//' | tr -d '\r')"
CSRF="$(grep -i '^set-cookie: tf_csrf=' "$TMP/login.h" | sed 's/^[^:]*: //; s/;.*//' | tr -d '\r')"
echo "    Set-Cookie: $(grep -i '^set-cookie:' "$TMP/login.h" | sed 's/=[^;]*;/=…;/' | tr -d '\r' | tr '\n' ' ')"
check "the session cookie comes back (HttpOnly)" sh -c "grep -i '^set-cookie: tf_session=' '$TMP/login.h' | grep -qi httponly"
check "the CSRF cookie comes back" test -n "$CSRF"
COOKIES="$SESSION; $CSRF"
check "GET /api/auth/me with the cookies → the admin" sh -c "curl -sf -H 'Cookie: $COOKIES' '$BASE/api/auth/me' | grep -q 'admin@ticketflow.local'"
check "GET /api/auth/me without them → 401" test "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/auth/me")" = 401

echo "The visitor's IP address (trust proxy)"
# What nginx saw as the client for that login ($remote_addr, the first field of its access log line)
CLIENT_IP="$(docker logs "$WEB" 2>/dev/null | grep '"POST /api/auth/login' | tail -1 | awk '{print $1}')"
NGINX_IP="$(docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' "$WEB")"
AUDIT_IP="$(curl -s -H "Cookie: $COOKIES" "$BASE/api/audit?action=login_success&pageSize=1" | jq -r '.entries[0].ip')"
echo "    nginx saw the client as $CLIENT_IP; nginx itself is $NGINX_IP; the audit log has $AUDIT_IP"
check "the backend recorded the visitor's address, as nginx saw it" test -n "$CLIENT_IP" -a "$AUDIT_IP" = "$CLIENT_IP"
check "not nginx's own address" sh -c "! echo ' $NGINX_IP ' | grep -q ' $AUDIT_IP '"
check "not the X-Forwarded-For the client made up" test "$AUDIT_IP" != 203.0.113.9

echo "Attachments through nginx (10 MB per file; nginx refuses bodies over 11 MB)"
TICKET="$(curl -s -H "Cookie: $COOKIES" "$BASE/api/tickets?page=1&pageSize=1" | jq -r '.items[0].id')"
TOKEN="${CSRF#tf_csrf=}"
upload() { # upload <file> → the HTTP status; the answer goes to $TMP/upload.json
  curl -s -o "$TMP/upload.json" -w '%{http_code}' -H "Cookie: $COOKIES" -H "X-CSRF-Token: $TOKEN" \
    -F "files=@$1;type=text/plain" "$BASE/api/tickets/$TICKET/attachments"
}
head -c 10000000 /dev/zero | tr '\0' 'a' >"$TMP/ten-mb.txt"
CODE="$(upload "$TMP/ten-mb.txt")"
echo "    10 MB to ticket $TICKET → $CODE $(head -c 200 "$TMP/upload.json")"
check "a 10 MB attachment is saved (201)" test "$CODE" = 201
check "with its full size" grep -q '"size_bytes":10000000' "$TMP/upload.json"
head -c $((12 * 1024 * 1024)) /dev/zero | tr '\0' 'a' >"$TMP/twelve-mb.txt"
CODE="$(upload "$TMP/twelve-mb.txt")"
check "a 12 MB attachment is refused by nginx (413)" test "$CODE" = 413

echo
if [ "$failures" -eq 0 ]; then
  echo "All checks passed."
else
  echo "$failures check(s) failed."
  exit 1
fi
