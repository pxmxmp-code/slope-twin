FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY --chown=node:node --chmod=644 package.json package-lock.json ./
COPY --chown=node:node --chmod=644 apps/web/package.json ./apps/web/package.json
COPY --chown=node:node --chmod=644 apps/web/scripts/copy-cesium.mjs ./apps/web/scripts/copy-cesium.mjs
RUN npm ci --no-audit --no-fund

FROM dependencies AS development
ENV NODE_ENV=development NEXT_TELEMETRY_DISABLED=1
COPY --chown=node:node apps/web ./apps/web
RUN chown node:node /app /app/apps /app/apps/web /app/apps/web/public \
    && chmod 755 /app /app/apps /app/apps/web /app/apps/web/public
WORKDIR /app/apps/web
USER node
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM dependencies AS build
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 BACKEND_URL=http://api:8000
COPY --chown=node:node apps/web ./apps/web
RUN npm run build --workspace @slope-twin/web

FROM node:22-bookworm-slim AS production
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
