FROM node:22-bookworm-slim
WORKDIR /app
# Qloo's official harness provides `qloo mcp`, the local MCP server the Taste Council talks to over stdio.
RUN npm install --global @qloo/qloo-harness@0.1.26 && qloo --version
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && ./node_modules/.bin/esbuild server/prod.ts --bundle --platform=node --format=esm --outfile=dist/server.mjs --packages=external
# Run the server and its qloo child as the unprivileged node user. It writes household data to
# AGORA_DATA_DIR (default /app/.agora-data) and may rebuild the household card into dist/.
RUN mkdir -p /app/.agora-data && chown -R node:node /app/.agora-data /app/dist /app/server/mcp/apps
USER node
ENV NODE_ENV=production
# The harness keeps its private state here. The credential comes from the QLOO_API_KEY secret, never the image.
ENV QLOO_HOME=/tmp/qloo
EXPOSE 8080
CMD ["node", "dist/server.mjs"]
