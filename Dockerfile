FROM node:24-bookworm-slim AS client
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY src/build-client.mjs ./src/build-client.mjs
COPY mobile ./mobile
COPY public ./public
RUN node src/build-client.mjs

FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --from=client --chown=node:node /build/public ./public
COPY --chown=node:node drizzle ./drizzle
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.mjs"]
