# Production image of the TicketFlow frontend. README "Docker" explains how to build and run it.
# Two stages: "build" runs Vite (npm ci + npm run build); the final image is nginx serving dist/ and passing /api on to
# the backend. Node, the source code and node_modules never get into the final image.

# Node: the project's version (.nvmrc, package.json "engines", CI), pinned to major.minor. nginx: an exact version.
# Update them on purpose.
ARG NODE_IMAGE=node:22.22-alpine
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.30.6-alpine3.24

# ---- build: the static files ----
FROM ${NODE_IMAGE} AS build
WORKDIR /app
# Only the package files first: this layer (npm ci) is reused until they change, so a source-only change rebuilds fast
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Baked into the JavaScript bundle at build time, so PUBLIC values only, never secrets. /api keeps the API on the
# page's own origin, through nginx (see "Sessions" in README.md); don't put an environment's address here. The Sentry
# settings are optional.
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

# Which commit the image was built from: docker build --build-arg VCS_REF=$(git rev-parse HEAD)
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="TicketFlow frontend" \
      org.opencontainers.image.description="The TicketFlow web app: static files served by nginx, /api passed to the backend" \
      org.opencontainers.image.source="https://github.com/enesasejdiu/Ctrl-HelpFrontend" \
      org.opencontainers.image.revision="${VCS_REF}"

# BACKEND_URL (the backend's address, without a path) is read when the container starts, not baked in: one image for
# every environment. docker/backend-url.envsh fills it in (default http://api:5050; the older name API_URL still
# works). NGINX_ENTRYPOINT_LOCAL_RESOLVERS: the entrypoint puts the container's DNS server into
# ${NGINX_LOCAL_RESOLVERS}, so nginx can look the backend up when a request comes in (docker/default.conf.template).
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1

COPY --chmod=0755 docker/backend-url.envsh /docker-entrypoint.d/05-backend-url.envsh
COPY docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY docker/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

USER nginx
EXPOSE 8080

# Healthy while nginx answers /healthz (busybox wget; there is no curl in Alpine)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]
