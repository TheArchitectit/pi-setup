#!/usr/bin/env bash
#
# scripts/deploy.sh — Authoritative publish pipeline for pi-setup.
#
# Port of pi-mega-compact's scripts/deploy.sh, trimmed for pi-setup's shape
# (no native deps, no schema-health check, no Playwright smoke). The
# CRITICAL dashboard-bundle-ship gate is retained: it verifies the React
# dashboard-client/dist bundle is built AND listed by `npm pack --dry-run`
# BEFORE `npm publish` — preventing the class of regression where the
# dashboard bundle was missing from the published package.
#
# Enforces (in order):
#   1. Clean git tree (no uncommitted changes).
#   2. Full gate: build + test + typecheck + regression_check.
#   3. Build the React dashboard (npm run build:dashboard).
#   4. CRITICAL VERIFY: confirm extensions/dashboard-client/dist/index.html
#      exists AND is listed by `npm pack --dry-run` — fail with exit 1 if
#      missing (this is exactly the missing-bundle regression we prevent).
#   5. Bump package.json + package-lock.json version to <new-version>.
#   6. Commit the version bump (package.json + package-lock.json + dist).
#   7. Tag (annotated) + push BEFORE publish — a push failure aborts before
#      an irreversible npm publish.
#   8. npm publish (the only valid distribution path).
#   9. Create GitHub release with notes from the commit log.
#  10. Print post-publish device instructions.
#
# Distribution is npm-only. NEVER produce or rely on a .tgz tarball
# (`npm pack`) for shipping, and NEVER symlink into ~/.pi/agent/extensions/
# as a release path — both bypass pi's package manager and do not propagate
# to other devices.
#
# Usage:
#   ./scripts/deploy.sh 0.1.1
#
# Exit codes: non-zero on any failure (set -euo pipefail). Nothing is
# published if any step fails.

set -euo pipefail

# --- args --------------------------------------------------------------------
if [[ $# -ne 1 ]]; then
	echo "usage: $0 <new-version>" >&2
	echo "  e.g. $0 0.1.1" >&2
	exit 2
fi

NEW_VERSION="$1"
NEW_VERSION="${NEW_VERSION#v}" # strip leading 'v'

if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
	echo "[deploy] ERROR: '$NEW_VERSION' is not a valid semver." >&2
	exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "[deploy] pi-setup publish pipeline → v$NEW_VERSION"
echo "[deploy] working dir: $ROOT"

# --- 1. clean git tree --------------------------------------------------------
if ! git diff --quiet; then
	echo "[deploy] ERROR: working tree has unstaged changes. Commit or stash first." >&2
	git diff --stat >&2 || true
	exit 1
fi
if ! git diff --cached --quiet; then
	echo "[deploy] ERROR: index has staged but uncommitted changes. Commit first." >&2
	exit 1
fi
echo "[deploy] git tree clean."

# --- 2. full gate -------------------------------------------------------------
echo "[deploy] running gate: build + test + typecheck + regression_check + audit"
npm test
npm run typecheck
python3 scripts/regression_check.py --all
node scripts/audit-gate.mjs
echo "[deploy] gate green."

# --- 3. build the React dashboard --------------------------------------------
echo "[deploy] building React dashboard (npm run build:dashboard)"
npm run build:dashboard

# --- 4. CRITICAL VERIFY: dashboard bundle is present AND in the tarball -------
DASHBOARD_INDEX="extensions/dashboard-client/dist/index.html"
if [[ ! -f "$DASHBOARD_INDEX" ]]; then
	echo "[deploy] ERROR: $DASHBOARD_INDEX missing after build:dashboard." >&2
	echo "[deploy]        This is the missing-bundle regression — ABORTING before publish." >&2
	exit 1
fi
echo "[deploy] $DASHBOARD_INDEX exists."

# Verify npm pack actually lists the dashboard bundle (dry-run only — no .tgz).
if ! npm pack --dry-run --json 2>/dev/null |
	grep -q "extensions/dashboard-client/dist/index.html"; then
	echo "[deploy] ERROR: 'npm pack --dry-run' does NOT list" >&2
	echo "[deploy]        extensions/dashboard-client/dist/index.html." >&2
	echo "[deploy]        Check package.json#files. ABORTING before publish." >&2
	exit 1
fi
echo "[deploy] dashboard bundle verified in npm pack output."

# --- 5. bump version ----------------------------------------------------------
CURRENT_VERSION="$(node -e "console.log(require('./package.json').version)")"
if [[ "$CURRENT_VERSION" == "$NEW_VERSION" ]]; then
	echo "[deploy] package.json already at v$NEW_VERSION."
else
	echo "[deploy] bumping package.json $CURRENT_VERSION → $NEW_VERSION"
	npm version "$NEW_VERSION" --no-git-tag-version
fi

# --- 6. commit version bump + dashboard dist if changed ----------------------
if git diff --quiet -- package.json package-lock.json extensions/dashboard-client/dist; then
	echo "[deploy] nothing to commit (version already set, dist unchanged)."
else
	echo "[deploy] committing version bump + dashboard dist"
	git add package.json package-lock.json extensions/dashboard-client/dist
	git commit -m "chore(release): v$NEW_VERSION

Release v$NEW_VERSION published via scripts/deploy.sh.

Co-Authored-By: pi-setup deploy.sh <noreply@pi-setup>"
fi

# --- 7. tag + push BEFORE publish --------------------------------------------
TAG="v$NEW_VERSION"
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
	echo "[deploy] tag $TAG already exists; skipping tag creation."
else
	echo "[deploy] creating tag $TAG"
	git tag -a "$TAG" -m "Release v$NEW_VERSION"
fi
echo "[deploy] pushing commits + tags (git push --follow-tags)"
if ! git push --follow-tags 2>/dev/null; then
	echo "[deploy] git push --follow-tags failed; setting upstream and retrying"
	CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
	git push --set-upstream origin "$CURRENT_BRANCH" --follow-tags
fi

# --- 7b. verify the tag reached origin ----------------------------------------
if ! git ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null 2>&1; then
	echo "[deploy] pushing tag $TAG explicitly (not found on origin after --follow-tags)"
	git push origin "$TAG"
fi

# --- 8. publish (npm only) ----------------------------------------------------
echo "[deploy] publishing to npm (npm publish — the only valid distribution path)"
npm publish
echo "[deploy] published v$NEW_VERSION to npm."

# --- 9. create GitHub release with notes ------------------------------------
PREV_TAG=$(git describe --tags --abbrev=0 "$TAG^" 2>/dev/null || true)
if [ -n "$PREV_TAG" ]; then
	RELEASE_NOTES=$(git log --pretty=format:"- %s" "$PREV_TAG..$TAG" 2>/dev/null | grep -vE "^- chore\(release\)|^- chore: (sync|clean|rebuild)" | sed -n '1,15p' || true)
else
	RELEASE_NOTES=$(git log --pretty=format:"- %s" "$TAG" 2>/dev/null | sed -n '1,15p' || true)
fi
RELEASE_NOTES="${RELEASE_NOTES:-(no commit notes extracted)}"
if command -v gh >/dev/null 2>&1; then
	echo "[deploy] creating GitHub release $TAG with notes"
	gh release create "$TAG" --target "$(git rev-list -n 1 "$TAG")" \
		--title "v$NEW_VERSION" \
		--notes "$(printf '## What changed\n\n%s\n\n**Install:** \`pi update --extensions\`' "$RELEASE_NOTES")" \
		2>/dev/null || echo "[deploy] WARN: gh release create failed (gh not authenticated or release exists) — skipping"
else
	echo "[deploy] WARN: gh CLI not installed — skipping GitHub release creation. Tag $TAG is pushed."
fi

# --- 10. post-publish device instructions ------------------------------------
echo
echo "============================================================"
echo " PUBLISHED v$NEW_VERSION — post-publish device steps"
echo "============================================================"
echo "On EACH device running pi-setup:"
echo
echo "  1. Update the extension from the registry (npm-only, no .tgz):"
echo "       pi update --extensions"
echo
echo "  2. Confirm the installed version is v$NEW_VERSION:"
echo "       find ~/.pi/agent/extensions -path '*pi-setup/package.json' \\"
echo "           -exec grep -m1 '\"version\"' {} \\;"
echo
echo "  3. Verify the dashboard server serves the React bundle (NOT the"
echo "     old static HTML — this is the missing-bundle regression check):"
echo "       curl -sS http://localhost:9330/ | grep -E 'id=\"root\"|<div id=\"root\">'"
echo "       # expected: a match containing id=\"root\" (React mount point)"
echo
echo "     If no match: the bundle did not ship. Re-run ./scripts/deploy.sh"
echo "     with a patch bump; do NOT hot-patch via .tgz or symlink."
echo "============================================================"
echo "[deploy] done."
