FROM node:22-bookworm-slim AS build

ENV NEXT_TELEMETRY_DISABLED=1 BACKEND_URL=http://api:8000
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/web/scripts ./apps/web/scripts
RUN npm ci --no-audit --no-fund
COPY apps/web ./apps/web
RUN npm run build --workspace @slope-twin/web

FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
