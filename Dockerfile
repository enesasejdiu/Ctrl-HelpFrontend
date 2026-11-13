# Production image of the TicketFlow frontend. README "Docker" explains how to build and run it.
# Two stages: "build" runs Vite (npm ci + npm run build); the final image is nginx serving dist/ and passing /api on to
# the backend. Node, the source code and node_modules never get into the final image.

# Both pinned to exact versions, so a rebuild never silently changes them. Update them on purpose.
ARG NODE_IMAGE=node:24.22.3-alpine3.24
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.30.6-alpine3.24

# ---- build: the static files ----
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Baked into the JavaScript bundle at build time (public values, never secrets). /api keeps the API on the page's own
# origin, through nginx (see "Sessions" in README.md). The Sentry settings are optional.
ARG VITE_API_URL=/api
ARG VITE_SENTRY_DSN=
ARG VITE_SENTRY_ENVIRONMENT=
ARG VITE_SENTRY_RELEASE=
RUN VITE_API_URL="$VITE_API_URL" \
    VITE_SENTRY_DSN="$VITE_SENTRY_DSN" \
    VITE_SENTRY_ENVIRONMENT="$VITE_SENTRY_ENVIRONMENT" \
    VITE_SENTRY_RELEASE="$VITE_SENTRY_RELEASE" \
    npm run build

# ---- final image: nginx, as the unprivileged "nginx" user (uid 101), on port 8080 ----
FROM ${NGINX_IMAGE}

# Where /api goes: the backend's address, without a path. Overridable with docker run -e API_URL=...
# NGINX_ENTRYPOINT_LOCAL_RESOLVERS: the entrypoint puts the container's DNS server into ${NGINX_LOCAL_RESOLVERS}, so
# nginx can look the backend up when a request comes in (see docker/default.conf.template).
ENV API_URL=http://api:5050 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1

COPY docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY docker/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

USER nginx
EXPOSE 8080

# Healthy while nginx answers /healthz (busybox wget; there is no curl in Alpine)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]
