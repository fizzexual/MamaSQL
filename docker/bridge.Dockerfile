# syntax=docker/dockerfile:1
FROM node:22-alpine
WORKDIR /app

# The bridge only needs the DB drivers — install from its own slim manifest.
COPY server/package.json ./package.json
RUN npm install --omit=dev

COPY server/bridge.mjs ./bridge.mjs

ENV BRIDGE_PORT=5174
EXPOSE 5174
CMD ["node", "bridge.mjs"]
