# Build only after approving Cloud Run costs. Never copy a developer Codex home.
FROM node:22.23.2-bookworm-slim
ARG CODEX_VERSION=0.165.0
RUN npm install --global @openai/codex@${CODEX_VERSION} --no-audit --no-fund \
    && mkdir -p /app/scripts /app/src && chown -R node:node /app
COPY --chown=node:node scripts/runner.mjs scripts/limits.mjs /app/scripts/
COPY --chown=node:node src/security.js src/limits.js /app/src/
USER node
WORKDIR /app
CMD ["node", "scripts/runner.mjs"]
