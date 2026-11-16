#!/usr/bin/env bash
# Checks a running frontend container the way a browser and an operator would see it (README "Docker").
# CI runs it on every pull request (the docker job in .github/workflows/frontend-ci.yml), against the built image and
# a stub backend (docker/stub-backend.mjs) that echoes what it receives. Run it by hand the same way:
#
#   docker/verify.sh <base URL> <web container name>      e.g. docker/verify.sh http://localhost:8080 web
#
# Prints one line per check and exits non-zero if any failed.
set -u
BASE="${1:?base URL, e.g. http://localhost:8080}"
CONTAINER="${2:?the name of the web container}"
failures=0

pass() { echo "  ok    $1"; }
fail() {
  echo "  FAIL  $1"
  failures=$((failures + 1))
}
# check "<what>" <command...>: passes when the command succeeds
check() {
  local what="$1"
  shift
  if "$@" >/dev/null 2>&1; then pass "$what"; else fail "$what"; fi
}
# Response headers (lower-cased names) and the status line of a GET
headers() { curl -s -o /dev/null -D - "$@" | tr -d '\r' | sed 's/^\([^:]*\):/\L\1:/'; }
status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
# header_is <url> <"name: value"> [extra curl options...]
header_is() { headers "$1" "${@:3}" | grep -qx "$2"; }
body_has() { curl -s "$1" | grep -q "$2"; }

echo "Container"
check "runs as the unprivileged nginx user (uid 101), not root" sh -c "docker exec '$CONTAINER' id -u | grep -qx 101"
echo "    $(docker exec "$CONTAINER" id)"
check "the health check reports healthy" sh -c "docker inspect --format '{{.State.Health.Status}}' '$CONTAINER' | grep -qx healthy"

echo "Pages"
check "/ → 200" test "$(status "$BASE/")" = 200
check "/ is index.html" body_has "$BASE/" '<div id="root">'
check "/ → Cache-Control: no-cache" header_is "$BASE/" 'cache-control: no-cache'
check "deep link /tickets/5 → 200" test "$(status "$BASE/tickets/5")" = 200
check "deep link /tickets/5 is index.html" body_has "$BASE/tickets/5" '<div id="root">'
check "deep link /tickets/5 → Cache-Control: no-cache" header_is "$BASE/tickets/5" 'cache-control: no-cache'

echo "Assets"
ASSET="$(curl -s "$BASE/" | grep -o '/assets/[^"]*\.js' | head -1)"
if [ -n "$ASSET" ]; then pass "index.html links a script: $ASSET"; else fail "index.html links a script under /assets/"; fi
check "$ASSET → 200" test "$(status "$BASE$ASSET")" = 200
check "$ASSET → immutable for a year" header_is "$BASE$ASSET" 'cache-control: public, max-age=31536000, immutable'
check "$ASSET is gzipped when asked" header_is "$BASE$ASSET" 'content-encoding: gzip' -H 'Accept-Encoding: gzip'
check "/assets/missing.js → 404 (not index.html)" test "$(status "$BASE/assets/missing.js")" = 404
check "/missing.png → 404 (not index.html)" test "$(status "$BASE/missing.png")" = 404

echo "Health"
check "/healthz → 200" test "$(status "$BASE/healthz")" = 200
check "/healthz says ok" body_has "$BASE/healthz" '^ok$'

echo "Security headers"
for path in / /tickets/5 "$ASSET" /assets/missing.js /healthz; do
  check "$path: X-Content-Type-Options: nosniff" header_is "$BASE$path" 'x-content-type-options: nosniff'
  check "$path: X-Frame-Options: DENY" header_is "$BASE$path" 'x-frame-options: DENY'
  check "$path: Content-Security-Policy" sh -c "curl -s -o /dev/null -D - '$BASE$path' | grep -qi '^content-security-policy: default-src .self.'"
  check "$path: Permissions-Policy" header_is "$BASE$path" 'permissions-policy: camera=(), microphone=(), geolocation=()'
done
check "/: Referrer-Policy: strict-origin-when-cross-origin" header_is "$BASE/" 'referrer-policy: strict-origin-when-cross-origin'
check "/set-password: Referrer-Policy: no-referrer" header_is "$BASE/set-password" 'referrer-policy: no-referrer'
check "/set-password?token=x: Referrer-Policy: no-referrer" header_is "$BASE/set-password?token=x" 'referrer-policy: no-referrer'
check "/forgot-password: Referrer-Policy: no-referrer" header_is "$BASE/forgot-password" 'referrer-policy: no-referrer'
check "/set-passwordx: not no-referrer" header_is "$BASE/set-passwordx" 'referrer-policy: strict-origin-when-cross-origin'
check "no nginx version in Server" sh -c "curl -s -o /dev/null -D - '$BASE/' | tr -d '\r' | grep -i '^server:' | grep -vq '[0-9]'"

echo "API proxy (stub backend)"
check "/api/health → 200 from the backend" body_has "$BASE/api/health" '"stub":true'
ECHO="$(curl -s -H 'X-Forwarded-For: 203.0.113.9' "$BASE/api/echo?x=1")"
echo "    the backend received: $ECHO"
check "the path and query arrive unchanged" sh -c "echo '$ECHO' | grep -q '\"url\":\"/api/echo?x=1\"'"
check "Host is forwarded (the name the browser used)" sh -c "echo '$ECHO' | grep -q '\"host\":\"localhost\"'"
check "X-Real-IP is set" sh -c "echo '$ECHO' | grep -q '\"x-real-ip\":\"'"
check "X-Forwarded-For keeps the earlier hop and adds the client" sh -c "echo '$ECHO' | grep -q '\"x-forwarded-for\":\"203.0.113.9, '"
check "X-Forwarded-Proto is set" sh -c "echo '$ECHO' | grep -q '\"x-forwarded-proto\":\"http\"'"
check "cookies pass through" sh -c "curl -s -H 'Cookie: tf_session=abc' '$BASE/api/echo' | grep -q '\"cookie\":\"tf_session=abc\"'"
# /api/ answers carry the API's own security headers only: nginx adds none of the page's (they used to arrive twice,
# e.g. "X-Content-Type-Options: nosniff, nosniff"). The stub backend sends none, so none at all may arrive here.
API_HEADERS="$(curl -s -o /dev/null -D - "$BASE/api/health" | tr -d '\r' | tr 'A-Z' 'a-z')"
for header in content-security-policy x-content-type-options x-frame-options referrer-policy permissions-policy; do
  check "/api/health: no $header added by nginx" sh -c "! printf '%s' \"$API_HEADERS\" | grep -q '^$header:'"
done
BIG="$(mktemp)"
head -c $((11 * 1024 * 1024)) /dev/zero >"$BIG"
check "an 11 MB upload reaches the backend (limit 60 MB)" test "$(status -X POST --data-binary "@$BIG" "$BASE/api/echo")" = 200
head -c $((61 * 1024 * 1024)) /dev/zero >"$BIG"
check "a 61 MB upload is refused by nginx (413)" test "$(status -X POST --data-binary "@$BIG" "$BASE/api/echo")" = 413
rm -f "$BIG"

echo "Files in the image"
FILES="$(docker exec "$CONTAINER" find / -xdev \( -name node_modules -o -name '*.map' -o -name '.env*' -o -name package.json -o -name '*.jsx' \) -print 2>/dev/null)"
if [ -z "$FILES" ]; then pass "no node_modules, source maps, .env, package.json or source files"; else fail "unexpected files: $FILES"; fi
check "no node binary" sh -c "! docker exec '$CONTAINER' sh -c 'command -v node'"
echo "    served files:"
docker exec "$CONTAINER" find /usr/share/nginx/html -type f | sort | sed 's/^/      /'

echo
if [ "$failures" -eq 0 ]; then
  echo "All checks passed."
else
  echo "$failures check(s) failed."
  exit 1
fi
