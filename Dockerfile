FROM 460300312212.dkr.ecr.us-east-1.amazonaws.com/tr-chainguard/node:latest-dev AS builder

WORKDIR /app

# Install Bun via npm — auto-selects the correct platform binary (musl/glibc, x64/arm64)
USER root
RUN npm install -g bun --prefix /usr/local/bun
ENV PATH="/usr/local/bun/bin:${PATH}"

# Copy package files
COPY --chown=node:node package.json bun.lockb* ./

# Switch to node user for dependency installation
USER node

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy application source code
COPY --chown=node:node src/ ./src/
COPY --chown=node:node scripts/ ./scripts/

# Switch to node user
USER node

# Final stage
FROM 460300312212.dkr.ecr.us-east-1.amazonaws.com/tr-chainguard/node:latest

WORKDIR /app

# Copy Bun binary from builder
COPY --from=builder --chown=node:node /usr/local/bun /usr/local/bun

# Copy application files from builder
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./
COPY --from=builder --chown=node:node /app/src ./src
COPY --from=builder --chown=node:node /app/scripts ./scripts

# Set environment for Bun
ENV PATH="/usr/local/bun/bin:${PATH}"

# Switch to node user
USER node

# Make script executable
RUN chmod +x /app/scripts/run-metrics.sh

# Set entrypoint
ENTRYPOINT ["/app/scripts/run-metrics.sh"]
