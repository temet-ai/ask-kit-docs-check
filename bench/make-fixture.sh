#!/bin/sh
# Builds the repository the bench questions are about, in bench/fixtures/ankh (ignored by git).
# Dates, names and messages are fixed, so the answers do not change. Run it once before the bench.
set -e
here=$(cd "$(dirname "$0")" && pwd)
repo="$here/fixtures/ankh"
rm -rf "$repo"
mkdir -p "$repo/src" "$repo/docs"
cd "$repo"
export GIT_AUTHOR_NAME="Sam Vimes" GIT_AUTHOR_EMAIL="vimes@example.com" GIT_COMMITTER_NAME="Sam Vimes" GIT_COMMITTER_EMAIL="vimes@example.com"
git init -q -b main
git config commit.gpgsign false
c() { GIT_AUTHOR_DATE="$1T12:00:00+00:00" GIT_COMMITTER_DATE="$1T12:00:00+00:00" git commit -q -m "$2"; }

cat > package.json <<'J'
{ "name": "ankh", "version": "0.1.0", "bin": { "ankh": "src/cli.mjs" }, "scripts": { "test": "node --test" } }
J
cat > src/cli.mjs <<'J'
const args = process.argv.slice(2);
const values = { patrol: args.includes("--patrol"), city: args.includes("--city") ? args[args.indexOf("--city") + 1] : null, rota: args.includes("--rota") };
const limit = Number(process.env.ANKH_WATCH_LIMIT ?? 8);
const TOLL_ALLOWED = ["gate", "bridge"];
const TOLL_DENIED = ["alley"];
console.log(values, limit, TOLL_ALLOWED, TOLL_DENIED);
J
cat > README.md <<'J'
# ankh

A small city tool. Run `ankh --city NAME` to pick a city. Set `ANKH_WATCH_LIMIT` to cap the watch. Set `ANKH_GUILD` to pick a guild. The code is in `src/cli.mjs`.
See the [guide](docs/guide.md).
J
cat > docs/guide.md <<'J'
# Guide

## Tolls

The `TOLL_ALLOWED` list holds the gates that charge a toll. The old `TOLL_DENIED` list is checked first. The code is in `src/cli.mjs`.

## Flags

`ankh --patrol` walks the streets. The [setup page](docs/setup.md) and the [limits section](#limits) say more.
J
git add -A; c 2026-02-01 "Add the ankh tool and its guide"
grep -v TOLL_DENIED src/cli.mjs > src/cli.tmp; mv src/cli.tmp src/cli.mjs
echo "console.log(TOLL_ALLOWED);" >> src/cli.mjs
git add -A; c 2026-02-10 "Remove the TOLL_DENIED list from the CLI"
echo "// watch rota" >> src/cli.mjs
git add -A; c 2026-02-12 "Add a watch rota to the CLI"
