#!/usr/bin/env bash
# PHOTONIC — GitHub Push Script
# Creates the repo (if it doesn't exist) and pushes the full codebase.
set -euo pipefail

REPO_NAME="photonic-protocol"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"

if [ -z "$GITHUB_TOKEN" ]; then
  echo "Error: GITHUB_TOKEN env var not set."
  exit 1
fi

# Get authenticated username
GITHUB_USER=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/user | grep '"login"' | head -1 | sed 's/.*"login": "\(.*\)".*/\1/')

echo "GitHub user: $GITHUB_USER"
echo "Creating repo: $REPO_NAME"

# Create repo (ignore if already exists)
curl -s -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  https://api.github.com/user/repos \
  -d "{
    \"name\": \"$REPO_NAME\",
    \"description\": \"PHOTONIC — Self-Evolving Agent Commerce Protocol for Autonomous Economies. CROO Agent Hackathon 2026.\",
    \"private\": false,
    \"has_wiki\": false,
    \"has_projects\": false,
    \"auto_init\": false
  }" > /dev/null

REMOTE_URL="https://$GITHUB_USER:$GITHUB_TOKEN@github.com/$GITHUB_USER/$REPO_NAME.git"

cd /home/runner/workspace

# Init git if not already a repo (it should be — Replit manages git)
if [ ! -d .git ]; then
  git init
fi

# Configure git identity
git config user.email "photonic@hackathon.dev" || true
git config user.name "PHOTONIC Protocol" || true

# Add remote
git remote remove photonic-origin 2>/dev/null || true
git remote add photonic-origin "$REMOTE_URL"

# Stage photonic/ directory + README
git add photonic/
git add -f photonic/core/Cargo.toml 2>/dev/null || true

echo "Committing..."
git commit -m "feat: PHOTONIC Protocol v0.1.0 — all five primitives implemented

- PhotonicRegistry.sol — agent genome & fossil record storage
- PhotonicEscrow.sol   — CAP order lifecycle with BPD distribution
- PhotonicAuction.sol  — SAIP silent auction intent pool
- PhotonicVitality.sol — DRP vitality decay & resurrection bonds
- PhotonicVerifier.sol — BPD peer staking & slashing

TypeScript SDK (@photonic/sdk):
  genome.ts, bpd.ts, intent.ts, casc.ts

Rust core engine:
  bpd, genome, saip, casc, drp modules

React frontend: Agent Store, Genome Explorer, Intent Pool, BPD Dashboard, Fossil Record

CROO Agent Hackathon June 2026" 2>/dev/null || \
git commit --allow-empty -m "chore: PHOTONIC Protocol — update"

echo "Pushing to GitHub..."
git push photonic-origin HEAD:main --force

REPO_URL="https://github.com/$GITHUB_USER/$REPO_NAME"
echo ""
echo "✓ Pushed to: $REPO_URL"
echo ""
