# ============================================================================
# Dockerfile — same two-round (multi-stage) style as skyCommand, kept light.
# Round 1: install/build with Node.js.  Round 2: clean runtime with Node + Python.
# ============================================================================
ARG NODE_VERSION=20

# --- Round 1: build / install dependencies -----------------------------------
FROM node:${NODE_VERSION}-slim AS node-builder
WORKDIR /app
# copy the shopping list first (better caching), then install
COPY package*.json ./
RUN npm install --omit=dev
# copy the rest of the code
COPY . .

# --- Round 2: clean production runtime (Node.js + Python) ---------------------
FROM node:${NODE_VERSION}-slim AS production

# install Python + the forecasting library (light: numpy only)
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip curl \
    && pip3 install --no-cache-dir --break-system-packages numpy \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# run as a non-root user (safety), same as skyCommand
RUN groupadd -g 1001 nodejs \
    && useradd -r -u 1001 -g nodejs -m -d /home/app app

# bring the finished app over from Round 1
COPY --from=node-builder --chown=app:nodejs /app/node_modules ./node_modules
COPY --chown=app:nodejs . .

ENV NODE_ENV=production \
    PORT=5000 \
    MIGRATE_ON_BOOT=true
EXPOSE 5000
USER app

# self health-check every 30s, same as skyCommand
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

# press play
CMD ["node", "server/index.js"]
