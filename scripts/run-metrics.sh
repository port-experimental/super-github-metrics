#!/bin/sh
set -eu

# Validate required environment variables
for var in PORT_CLIENT_ID PORT_CLIENT_SECRET PORT_BASE_URL X_GITHUB_ORGS; do
  eval "val=\${${var}:-}"
  if [ -z "$val" ]; then
    echo "ERROR: Required environment variable $var is not set"
    exit 1
  fi
done

echo "Starting GitHub metrics collection at $(date)"
echo "Configured for organizations: $X_GITHUB_ORGS"

# Run metrics commands sequentially with fail-fast behavior
echo "========================================="
echo "1/4 Running service-metrics..."
echo "========================================="
bun run src/github/main.ts service-metrics
echo "✓ service-metrics completed successfully"
echo ""

echo "========================================="
echo "2/4 Running timeseries-service-metrics..."
echo "========================================="
bun run src/github/main.ts timeseries-service-metrics
echo "✓ timeseries-service-metrics completed successfully"
echo ""

echo "========================================="
echo "3/4 Running pr-metrics..."
echo "========================================="
bun run src/github/main.ts pr-metrics
echo "✓ pr-metrics completed successfully"
echo ""

echo "========================================="
echo "4/4 Running workflow-metrics..."
echo "========================================="
bun run src/github/main.ts workflow-metrics
echo "✓ workflow-metrics completed successfully"
echo ""

echo "========================================="
echo "All metrics collection completed successfully at $(date)"
echo "========================================="
