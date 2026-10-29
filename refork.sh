#!/usr/bin/env bash
# Rebuild this fork on an upstream scriptc release: main mirrors the release, every patch branch
# sits on it, light-integration is the release plus the patches cherry-picked in order. FORK.md
# describes the patches and FORK-UPDATE.md the repeatable update flow.
#
#   ./refork.sh [<ref>] [--no-build] [--check] [--tests] [--coverage] [--corpus] [--all]
#
#   --check     preflight only: tag, native/ helper match, tsc-ts pin, light/widecode drift
#   --no-build  stop after the branches are rebuilt (use this while resolving conflicts)
#   --tests     after building, run the focused patch tests and the ts7 baseline check
#   --coverage  after building, run the six-shard coverage sweep (~10 minutes)
#   --corpus    after building, run the six-shard full corpus (~40 to 80 minutes)
#   --all       --tests --coverage --corpus
#
# The script copies itself before it starts, since it checks out branches that do not carry it.
set -euo pipefail
if [ -z "${REFORK_COPY:-}" ]; then
  copy=$(mktemp)
  cp "$0" "$copy"
  REFORK_COPY=1 exec bash "$copy" "$@"
fi
cd "$(git rev-parse --show-toplevel)"

PATCHES=(tsc-ts-0.0.10 census-report generic-record-return async-return-union generic-unknown-fields async-dynamic-return workspace-source-js abstract-method-lookups fork-docs)
declare -A DEP=()

BASE=""
BUILD=1
CHECK_ONLY=0
RUN_TESTS=0
RUN_COVERAGE=0
RUN_CORPUS=0
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1; BUILD=0 ;;
    --no-build) BUILD=0 ;;
    --tests) RUN_TESTS=1 ;;
    --coverage) RUN_COVERAGE=1 ;;
    --corpus) RUN_CORPUS=1 ;;
    --all) RUN_TESTS=1; RUN_COVERAGE=1; RUN_CORPUS=1 ;;
    -*) echo "usage: refork.sh [<ref>] [--no-build] [--check] [--tests] [--coverage] [--corpus] [--all]" >&2; exit 2 ;;
    *) BASE=$arg ;;
  esac
done

NODE_DIR="${NODE_DIR:-$HOME/.nvm/versions/node/v24.22.0}"
if [ -d "$NODE_DIR/bin" ]; then export PATH="$NODE_DIR/bin:$PATH"; fi
PNPM="${PNPM:-npx -y pnpm@11.1.3}"
ZIG_DIR="${ZIG:-$HOME/.local/zig/zig-x86_64-linux-0.16.0}"

[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "refork: commit or stash the checkout's changes first" >&2; exit 1; }

# ── preflight ────────────────────────────────────────────────────────────
git fetch -q upstream --tags
[ -n "$BASE" ] || BASE=$(git tag -l 'v*' --sort=-v:refname | head -1)
BASE_SHA=$(git rev-parse --verify "$BASE^{commit}")
TAG=$(git describe --tags --abbrev=0 "$BASE_SHA")
if [ "$(git rev-parse "$TAG^{commit}")" != "$BASE_SHA" ] && [ -n "$(git diff --stat "$TAG" "$BASE_SHA" -- native/)" ]; then
  echo "refork: native/ changed between $TAG and $BASE, so the published LLVM helper no longer matches; base on $TAG or build the helper from native/ first" >&2
  exit 1
fi
echo "== base $BASE ($(git rev-parse --short "$BASE_SHA"))"
echo "== node $(node --version) (tests want .node-version's 24.22.0)"

TSC_TS_TAG=$(git show "$BASE_SHA:packages/compiler/package.json" | sed -n 's/.*"tsc-ts": "\([^"]*\)".*/\1/p')
if [ -n "$TSC_TS_TAG" ]; then
  echo "== tsc-ts at base: $TSC_TS_TAG"
  if git rev-parse --verify -q tsc-ts-0.0.10 >/dev/null; then
    TSC_TS_PATCH=$(git show "tsc-ts-0.0.10:packages/compiler/package.json" | sed -n 's/.*"tsc-ts": "\([^"]*\)".*/\1/p')
    if [ -n "$TSC_TS_PATCH" ] && [ "$(printf '%s\n%s\n' "$TSC_TS_TAG" "$TSC_TS_PATCH" | sort -V | tail -1)" = "$TSC_TS_TAG" ]; then
      echo "refork: warn: the base already pins tsc-ts $TSC_TS_TAG; drop the tsc-ts-0.0.10 branch from PATCHES" >&2
    fi
  fi
fi

external_notes=0
check_external() {
  local light="$HOME/Projects/light" wide="$HOME/Projects/widecode" name stale
  [ -d "$light/packages/light" ] || return 0
  name=$(node -p "require('$light/packages/light/package.json').name" 2>/dev/null || true)
  [ -n "$name" ] || return 0
  echo "== external light $name ($(git -C "$light" rev-parse --short HEAD 2>/dev/null || echo nogit))"
  if [ -n "$(git -C "$light" status --porcelain --untracked-files=no 2>/dev/null)" ]; then
    echo "refork: warn: $light has uncommitted changes; verify from a worktree or commit them" >&2
    external_notes=$((external_notes + 1))
  fi
  [ -d "$wide" ] || return 0
  echo "== external widecode ($(git -C "$wide" rev-parse --short HEAD 2>/dev/null || echo nogit))"
  if [ -n "$(git -C "$wide" status --porcelain --untracked-files=no 2>/dev/null)" ]; then
    echo "refork: warn: $wide has uncommitted changes; verify from a worktree or commit them" >&2
    external_notes=$((external_notes + 1))
  fi
  stale=$(node - "$wide" "$name" <<'NODE'
const fs = require("node:fs");
const cp = require("node:child_process");
const root = process.argv[2];
const name = process.argv[3];
const base = name.split("/").pop();
const files = cp
  .execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter((f) => f === "package.json" || f.endsWith("/package.json"));
const out = new Set();
for (const file of files) {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(root + "/" + file, "utf8"));
  } catch {
    continue;
  }
  for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    for (const [dep, spec] of Object.entries(pkg[section] ?? {})) {
      if (spec === "workspace:*" && dep !== name && dep.split("/").pop() === base)
        out.add(file + ": " + dep);
    }
  }
}
console.log([...out].join("\n"));
NODE
)
  if [ -n "$stale" ]; then
    echo "refork: warn: widecode still names a different light package; light now publishes $name:" >&2
    printf '%s\n' "$stale" | sed 's/^/  /' >&2
    echo "  rename the workspace dependency, reinstall in widecode, then verify." >&2
    external_notes=$((external_notes + 1))
  fi
}
check_external

if [ "$CHECK_ONLY" = 1 ]; then
  echo "== preflight only; no branches changed"
  exit 0
fi

# ── rebase every patch branch onto the base ──────────────────────────────
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
  git rebase -q --onto "$onto" "$from" "$p" || {
    echo "refork: conflict in $p; resolve it, git rebase --continue, then rerun the same command." >&2
    echo "refork: finish every branch fix before running with --tests, --coverage or --corpus." >&2
    exit 1
  }
done

git checkout -q fork-docs
sed -i "s/^Current base: \*\*v[0-9.]*\*\* (\`[0-9a-f]*\`)\./Current base: **$BASE** (\`$(git rev-parse --short "$BASE_SHA")\`)./" FORK.md
git diff --quiet FORK.md || git commit -q -am "Rebase the fork on $BASE"

echo "== light-integration = $BASE + patches"
git checkout -q -B light-integration "$BASE_SHA"
for p in "${PATCHES[@]}"; do
  d=${DEP[$p]:-}
  if [ -n "$d" ]; then from=$(git rev-parse "$d"); else from=$BASE_SHA; fi
  git cherry-pick "$from..$p" >/dev/null || {
    echo "refork: conflict while picking $p onto light-integration; resolve it, git cherry-pick --continue, then rerun" >&2
    exit 1
  }
done
echo "== $(git rev-list --count "$BASE_SHA..HEAD") commits on $BASE:"
git log --oneline "$BASE_SHA..HEAD"

if [ "$BUILD" = 1 ]; then
  # ── build once ────────────────────────────────────────────────────────
  export PATH="$ZIG_DIR:$PATH"
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
elif [ "$RUN_TESTS$RUN_COVERAGE$RUN_CORPUS" = "000" ]; then
  echo "== stopped before build (--no-build); rerun with --tests/--coverage/--corpus when branches are final"
  exit 0
else
  echo "== using the existing build (--no-build)"
fi

# ── optional gates ──────────────────────────────────────────────────────
run_focused_tests() {
  echo "== focused patch tests"
  SCRIPTC_TEST_WORKERS=2 $PNPM exec vitest run tests/harness/llvm-differential.test.ts -t '494[4-9]|4956|5791|5813|690[34]'
  $PNPM exec vitest run tests/harness/diagnostics.test.ts tests/harness/workspace-source-js.test.ts \
    packages/compiler/test/class-method-mutations.test.ts packages/compiler/src/diagnostics/envelope.test.ts \
    packages/compiler/test/runtime-optional-precision.test.ts
  $PNPM exec vitest run tests/harness/coverage.test.ts -t 'slow path'
  $PNPM test:ts7 --baselines-only
}

run_shards() {
  local label=$1 file=$2 logs
  logs=$(mktemp -d)
  echo "== $label (6 shards, logs in $logs)"
  for i in 1 2 3 4 5 6; do
    SCRIPTC_TEST_SHARD=$i/6 $PNPM exec vitest run "$file" >"$logs/$i.log" 2>&1 &
  done
  wait || true
  if grep -hE '^\s+× |Test Files +[0-9]+ failed|FAIL |Error:' "$logs"/*.log; then
    echo "refork: $label failed; logs kept in $logs" >&2
    exit 1
  fi
  echo "== $label passed"
  rm -rf "$logs"
}

[ "$RUN_TESTS" = 1 ] && run_focused_tests
[ "$RUN_COVERAGE" = 1 ] && run_shards "coverage sweep" tests/harness/coverage.test.ts
[ "$RUN_CORPUS" = 1 ] && run_shards "full corpus" tests/harness/llvm-differential.test.ts

if [ "$RUN_TESTS$RUN_COVERAGE$RUN_CORPUS" = "000" ]; then
  echo "== no gates requested; next: --tests, --coverage, then --corpus for the shipping gate"
fi
