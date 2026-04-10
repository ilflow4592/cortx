# Auto-update Setup

Cortx uses `tauri-plugin-updater` with signature verification. To enable
auto-updates for a real release, complete these steps once.

## 1. Generate a signing keypair

Run on your dev machine (NOT in CI):

```bash
npx tauri signer generate -w ~/.tauri/cortx.key
```

This creates two files:
- `~/.tauri/cortx.key` — private key (keep secret, never commit)
- `~/.tauri/cortx.key.pub` — public key

Copy the public key contents:

```bash
cat ~/.tauri/cortx.key.pub
```

## 2. Paste public key into tauri.conf.json

Open `src-tauri/tauri.conf.json` and replace the empty `pubkey`:

```json
"plugins": {
  "updater": {
    "pubkey": "<paste-public-key-here>",
    "endpoints": [
      "https://github.com/<your-org>/cortx/releases/latest/download/latest.json"
    ]
  }
}
```

Also update the endpoint URL to match your actual GitHub org/repo.

## 3. Add GitHub secrets

Go to GitHub repo → Settings → Secrets and variables → Actions, add:

| Secret name | Value |
|-------------|-------|
| `TAURI_SIGNING_PRIVATE_KEY` | contents of `~/.tauri/cortx.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | the password you used (if any) |

## 4. Update release workflow

The `tauri-action` in `.github/workflows/release.yml` automatically:
- Signs build artifacts if `TAURI_SIGNING_PRIVATE_KEY` env is set
- Generates `latest.json` containing version + signatures
- Uploads both the installer and `latest.json` to the release

Add the signing env vars to the workflow's `env:` block. See
`.github/workflows/release.yml` for the updated version.

## 5. Release flow

```bash
# Bump version in src-tauri/tauri.conf.json and src-tauri/Cargo.toml
git add -A && git commit -m "chore: release v0.2.0"
git tag v0.2.0
git push origin main v0.2.0
```

The release workflow builds signed artifacts and publishes `latest.json`.

## 6. How users get updates

Once a new signed release is published:
- Users running an older version can open Cortx
- Click **Cmd+K → Check for Updates** (manual)
- Or an automatic check runs on app startup (see `src/App.tsx`)
- Users click Download & Install → app downloads → restart

## Manual check via Command Palette

Open `Cmd+K` → type "update" → **Check for Updates**.

## Development

In dev mode (`npm run tauri dev`), the updater endpoint is still queried.
If it fails, the dialog will show an error — this is expected until the
public key and endpoint are configured.

## Troubleshooting

**"Signature mismatch"** — the private key used to sign doesn't match the
public key in `tauri.conf.json`. Regenerate the keypair.

**"No update found"** — either there's genuinely no new version, or
`latest.json` isn't at the expected URL. Check the endpoint in your browser.

**"Network error"** — `connect-src` in CSP must allow the GitHub release URL.
Already permitted in `tauri.conf.json` via `https://github.com` isn't listed
by default — add it if you change the endpoint.
