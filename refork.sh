#!/usr/bin/env bash
# Rebuild this fork on an upstream scriptc release: main mirrors the release, every patch branch
# sits on it, light-integration is the release plus the patches cherry-picked in order. FORK.md
# describes the patches and the verification that follows a run.
#
#   ./refork.sh [<ref>] [--no-build]
#
# The script copies itself before it starts, since it checks out branches that do not carry it.
set -euo pipefail
if [ -z "${REFORK_COPY:-}" ]; then
  copy=$(mktemp)
  cp "$0" "$copy"
  REFORK_COPY=1 exec bash "$copy" "$@"
fi
cd "$(git rev-parse --show-toplevel)"

PATCHES=(ts-unknown-fields generic-method-slots census-typed-keys census-report generic-record-return async-return-union generic-unknown-fields async-dynamic-return workspace-source-js fork-docs)
declare -A DEP=([generic-unknown-fields]=ts-unknown-fields)

BASE=""
BUILD=1
for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=0 ;;
    -*) echo "usage: refork.sh [<ref>] [--no-build]" >&2; exit 2 ;;
    *) BASE=$arg ;;
  esac
done

[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "refork: commit or stash the checkout's changes first" >&2; exit 1; }
git fetch -q upstream --tags
[ -n "$BASE" ] || BASE=$(git tag -l 'v*' --sort=-v:refname | head -1)
BASE_SHA=$(git rev-parse --verify "$BASE^{commit}")
TAG=$(git describe --tags --abbrev=0 "$BASE_SHA")
if [ "$(git rev-parse "$TAG^{commit}")" != "$BASE_SHA" ] && [ -n "$(git diff --stat "$TAG" "$BASE_SHA" -- native/)" ]; then
  echo "refork: native/ changed between $TAG and $BASE, so the published LLVM helper no longer matches; base on $TAG or build the helper from native/ first" >&2
  exit 1
fi
echo "== base $BASE ($(git rev-parse --short "$BASE_SHA"))"

declare -A OLD
for p in "${PATCHES[@]}"; do OLD[$p]=$(git rev-parse "$p"); done
git branch -f light-integration-prev light-integration
git checkout -q --detach "$BASE_SHA"
git branch -f main "$BASE_SHA"

for p in "${PATCHES[@]}"; do
  d=${DEP[$p]:-}
  if [ -n "$d" ]; then
    onto=$(git rev-parse "$d")
    from=${OLD[$d]}
  else
    onto=$BASE_SHA
    from=$(git merge-base upstream/main "${OLD[$p]}")
  fi
  echo "== rebase $p"
  git rebase -q --onto "$onto" "$from" "$p" || { echo "refork: conflict in $p; resolve it, git rebase --continue, then rerun" >&2; exit 1; }
done

git checkout -q fork-docs
sed -i "s/^Current base: \*\*v[0-9.]*\*\* (\`[0-9a-f]*\`)\./Current base: **$BASE** (\`$(git rev-parse --short "$BASE_SHA")\`)./" FORK.md
git diff --quiet FORK.md || git commit -q -am "Rebase the fork on $BASE"

echo "== light-integration = $BASE + patches"
git checkout -q -B light-integration "$BASE_SHA"
for p in "${PATCHES[@]}"; do
  d=${DEP[$p]:-}
  if [ -n "$d" ]; then from=$(git rev-parse "$d"); else from=$BASE_SHA; fi
  git cherry-pick "$from..$p" >/dev/null || { echo "refork: conflict while picking $p onto light-integration; resolve it, git cherry-pick --continue, then rerun" >&2; exit 1; }
done
echo "== $(git rev-list --count "$BASE_SHA..HEAD") commits on $BASE:"
git log --oneline "$BASE_SHA..HEAD"

[ "$BUILD" = 1 ] || exit 0
export PATH="${ZIG:-$HOME/.local/zig/zig-x86_64-linux-0.16.0}:$PATH"
PNPM="npx -y pnpm@11.1.3"
VERSION=$(node -p "require('./packages/cli/package.json').version")
echo "== build $VERSION"
git diff --quiet light-integration-prev HEAD -- pnpm-lock.yaml || $PNPM install --frozen-lockfile --config.confirm-modules-purge=false
$PNPM build
$PNPM --filter @scriptc/runtime-linux-x64-gnu run build:native
HELPER=packages/llvm-linux-x64-gnu/bin/scriptc-llvm-codegen
helper_version() { "$HELPER" version --format=json 2>/dev/null | grep -o '"scriptc_package_version":"[^"]*"' | cut -d'"' -f4; }
if [ "$(helper_version)" != "$VERSION" ]; then
  echo "== LLVM helper $VERSION"
  tmp=$(mktemp -d)
  (cd "$tmp" && npm pack -q "@scriptc/llvm-linux-x64-gnu@$VERSION" >/dev/null && tar xzf "scriptc-llvm-linux-x64-gnu-$VERSION.tgz")
  install -m 755 "$tmp/package/bin/scriptc-llvm-codegen" "$HELPER"
  rm -rf "$tmp"
  [ "$(helper_version)" = "$VERSION" ] || { echo "refork: the LLVM helper does not report $VERSION" >&2; exit 1; }
fi
echo "== scriptc-dev $(SCRIPTC_NO_CACHE=1 node packages/cli/dist/main.js --version)"
