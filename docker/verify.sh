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
for path in '/admin/users?page=2' '/admin/audit-log?user=3'; do
  check "deep link $path → 200" test "$(status "$BASE$path")" = 200
  check "deep link $path is index.html" body_has "$BASE$path" '<div id="root">'
  check "deep link $path → Cache-Control: no-cache" header_is "$BASE$path" 'cache-control: no-cache'
done

echo "Assets"
ASSET="$(curl -s "$BASE/" | grep -o '/assets/[^"]*\.js' | head -1)"
if [ -n "$ASSET" ]; then pass "index.html links a script: $ASSET"; else fail "index.html links a script under /assets/"; fi
check "$ASSET → 200" test "$(status "$BASE$ASSET")" = 200
check "$ASSET → immutable for a year" header_is "$BASE$ASSET" 'cache-control: public, max-age=31536000, immutable'
check "$ASSET is gzipped when asked" header_is "$BASE$ASSET" 'content-encoding: gzip' -H 'Accept-Encoding: gzip'
check "/assets/missing.js → 404 (not index.html)" test "$(status "$BASE/assets/missing.js")" = 404
check "/missing.png → 404 (not index.html)" test "$(status "$BASE/missing.png")" = 404
check "/favicon.ico → 404 (there is none; favicon.svg is the icon)" test "$(status "$BASE/favicon.ico")" = 404

echo "Files without a hash (public/)"
check "/favicon.svg → 200" test "$(status "$BASE/favicon.svg")" = 200
check "/favicon.svg → cached for an hour" header_is "$BASE/favicon.svg" 'cache-control: public, max-age=3600'

echo "Health"
check "/healthz → 200" test "$(status "$BASE/healthz")" = 200
check "/healthz says ok" body_has "$BASE/healthz" '^ok$'

echo "Security headers"
for path in / /tickets/5 "$ASSET" /assets/missing.js /favicon.svg /healthz; do
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
check "cookies reach the backend" sh -c "curl -s -H 'Cookie: tf_session=abc' '$BASE/api/echo' | grep -q '\"cookie\":\"tf_session=abc\"'"
check "the backend's Set-Cookie comes back unchanged" header_is "$BASE/api/echo" 'set-cookie: tf_stub=1; Path=/; HttpOnly; SameSite=Lax'
check "/api/does-not-exist → 404 from the backend" test "$(status "$BASE/api/does-not-exist")" = 404
check "/api/does-not-exist is the backend's JSON, not index.html" body_has "$BASE/api/does-not-exist" '"message":"Route not found'
check "/api/does-not-exist → application/json" header_is "$BASE/api/does-not-exist" 'content-type: application/json'
check "/api/x.json goes to the backend too (not the file rule)" body_has "$BASE/api/does-not-exist.json" '"message":"Route not found'
BIG="$(mktemp)"
head -c $((10 * 1024 * 1024)) /dev/zero >"$BIG"
check "a 10 MB upload reaches the backend (limit 11 MB)" sh -c "curl -s -X POST --data-binary '@$BIG' '$BASE/api/echo' | grep -q '\"bytes\":10485760'"
head -c $((12 * 1024 * 1024)) /dev/zero >"$BIG"
check "a 12 MB upload is refused by nginx (413)" test "$(status -X POST --data-binary "@$BIG" "$BASE/api/echo")" = 413
rm -f "$BIG"

echo "Files in the image"
FILES="$(docker exec "$CONTAINER" find / -xdev \( -name node_modules -o -name '*.map' -o -name '.env*' -o -name package.json -o -name '*.jsx' \) -print 2>/dev/null)"
if [ -z "$FILES" ]; then pass "no node_modules, source maps, .env, package.json or source files"; else fail "unexpected files: $FILES"; fi
check "no node binary" sh -c "! docker exec '$CONTAINER' sh -c 'command -v node'"
echo "    served files:"
docker exec "$CONTAINER" find /usr/share/nginx/html -type f | sort | sed 's/^/      /'

# Last, because it changes the served index.html (an HTML comment at the end; harmless for the checks after this)
echo "A new deploy is picked up without a hard refresh"
ETAG="$(headers "$BASE/" | sed -n 's/^etag: //p')"
echo "    index.html ETag: $ETAG"
check "index.html has an ETag" test -n "$ETAG"
check "unchanged index.html → 304 (the browser asks every time, cheaply)" test "$(status -H "If-None-Match: $ETAG" "$BASE/")" = 304
docker exec -u 0 "$CONTAINER" sh -c 'echo "<!-- redeploy check -->" >> /usr/share/nginx/html/index.html'
check "after a new build: the same request → 200 with the new page" test "$(status -H "If-None-Match: $ETAG" "$BASE/")" = 200
check "after a new build: a deep link gets the new page too" body_has "$BASE/tickets/5" 'redeploy check'

echo
if [ "$failures" -eq 0 ]; then
  echo "All checks passed."
else
  echo "$failures check(s) failed."
  exit 1
fi
