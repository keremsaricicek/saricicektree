FROM node:24-bookworm-slim AS client
WORKDIR /build
COPY package.json package-lock.json ./
# Install scripts are not needed to build the client (and would download the test-only ffmpeg).
RUN npm ci --ignore-scripts
COPY src/build-client.mjs ./src/build-client.mjs
COPY mobile ./mobile
COPY public ./public
RUN node src/build-client.mjs

FROM node:24-bookworm-slim
WORKDIR /app
# ffmpeg makes the playable copy and cover of uploaded videos (VIDEOS=off turns video off).
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
# Runtime dependencies only (sharp makes the smaller photo copies).
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node src ./src
COPY --from=client --chown=node:node /build/public ./public
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node scripts/backup.mjs scripts/restore.mjs ./scripts/
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.mjs"]
