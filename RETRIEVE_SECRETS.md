# How to Retrieve GitHub Actions Secrets

Unfortunately, GitHub Actions secrets cannot be read back via CLI for security reasons.

## Option 1: Access via GitHub Web UI

Navigate to: https://github.com/tr/aiid209530-port-super-github-metrics/settings/secrets/actions

You'll need write access to the repository to view the secret values.

## Option 2: Ask Team Member

Ask someone who set up the original GitHub Actions workflow and has access to these values:

- `PORT_CLIENT_ID`
- `PORT_CLIENT_SECRET`
- `X_GITHUB_ORGS`
- `X_GITHUB_APP_ID`
- `X_GITHUB_APP_CLIENT_PRIVATE_KEY` (multiline PEM format)

## Option 3: Regenerate Credentials (if necessary)

### Port.io Credentials

1. Log into Port.io
2. Go to Settings → Credentials
3. Generate new client credentials
4. Update both `.env` and GitHub Actions secrets

### GitHub App Credentials

1. Go to your GitHub App settings
2. For private key: Generate a new private key (old one will still work)
3. Get the App ID from the app settings page
4. Get the Installation ID from: https://github.com/organizations/tr/settings/installations

## Variables (Already Retrieved)

These values are already in your `.env` file:

- `PORT_BASE_URL=https://api.getport.io/v1`
- `X_GITHUB_APP_INSTALLATION_ID=105252739`
- `PORT_SERVICE_BLUEPRINT=githubRepository`
- `PORT_SERVICE_METRICS_BLUEPRINT=serviceMetrics`

## Next Steps

Once you have the secret values:

1. Replace all `<REPLACE_WITH_SECRET_VALUE>` placeholders in `.env`
2. For the private key, ensure it includes the BEGIN/END lines and newlines are preserved
3. Test with: `bun run pr-metrics`
