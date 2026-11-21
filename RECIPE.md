# Recipe: docs-check kit

## What it answers

Whether a repository's documentation still matches its code: which statements in README, docs/ and
AGENTS.md name a path, command, flag, environment variable, script, function or version the
repository no longer has; which docs were last changed before the code they name; what the code
offers that no doc names; broken relative links and anchors; where a name is still mentioned in
the docs after a rename. It edits Markdown files when asked: it updates a statement the code made
false, adds a missing entry, fixes a link, retires a doc.

## What it needs

- `git` and `rg` on PATH. Node 20 or later (the host's own).
- Nothing else: no keys, no network, no build step.

## What it reads and runs

- Reads the repository the agent works in (found by `git rev-parse --show-toplevel`): its tracked
  and untracked-but-not-ignored files, its package manifests, and `git log --name-only`.
- Runs `git` and `rg` through ask-kit's folder source and `git ls-files`, `git log`,
  `git check-ignore` through `docs.mjs`, with `execFile` and no shell.
- Never reads `.env*`, keys, tokens, cookies, `.npmrc`, `.netrc` or lockfiles; masks secret-shaped
  text in script output.
- Changes only Markdown, and only when the ask may act.

## Rebuild it from an empty folder

`ask-kit.toml` with a `REPO_ROOT` setting detected by `git rev-parse --show-toplevel`,
`state_key = "${REPO_ROOT}"`, one `folder` source `repo` on `${REPO_ROOT}` with credentials and
build output excluded, and one `module` source `docs`. `acts` names `docs.edit`, `docs.insert`,
`docs.create`, `docs.remove`, `repo.edit`, `repo.write` and `repo.run`: each is a
`<source>.<function>` the host holds back unless the caller asked for a change.

`md.mjs` reads Markdown: front matter skipped, fenced blocks and their language, headings with
GitHub's anchor slugs (lower case, punctuation dropped, spaces to hyphens, `-1` for a repeat),
links (inline, reference, HTML), inline code spans. From spans and from shell blocks (lines that
start with `$ `, or any line in a `sh` or `bash` block, joined across trailing backslashes) it
produces claims: a path-shaped token, an environment-variable-shaped token, a `--flag`, a call
`name()`, a command line split at `|`, `&&`, `;`.

`docs.mjs` is the module. Its `make({settings, push, cwd, act})` returns `docs`:

- `files()` picks the documentation set: `*.md` and `*.mdx` that are tracked or untracked and not
  ignored, minus CHANGELOG, LICENSE, SECURITY, node_modules, target, dist, worktrees, tests,
  fixtures, hidden folders, skills, agents, roles, prompts and rules folders, generated files and
  duplicates by content. Kinds: readme, guide, agent-guide, contributing, design, other.
- `check()` tests each claim. A path: exists relative to the repository root or the doc; else a
  suffix of a tracked path; else gitignored (skip); else missing, with a hint when a file of that
  name exists elsewhere. Confidence is high when the parent folder exists, medium when only the
  first segment does, low otherwise; one level lower for example sentences, design notes, lines
  that name another project or a root such as `~/`. Lines with "removed", "renamed", "deprecated"
  and the like are skipped. Placeholders (`<x>`, `${X}`, `foo`, `path/to`, `acme`) are skipped.
  A command: `npm`/`pnpm`/`yarn`/`bun` run scripts against every `package.json`; `cargo -p/--bin`
  against Cargo packages, bins and examples; `make`/`just` against targets; `node`, `bash`,
  `python`, `./x` against the file, and its `--flags` against that file's text; a program the
  repository defines (a `bin`, a Cargo bin, the folder name) against subcommand and flag strings in
  the code. A flag is found as `--kebab`, a quoted kebab, camel or snake form, or a clap field.
  An all-caps name is looked up as a whole word in the code, workflows and config. A Node, Rust or
  Python version is compared with `engines`, `rust-version` or `rust-toolchain`, and
  `requires-python`.
- `links()` checks relative link targets, with `.md` appended for extensionless links, and anchors
  against the target's headings, naming the nearest headings.
- `history()` is `git log --name-only` once; `drift()` takes the commits newer than a doc's last
  change that touch a source path the doc names.
- `inventory()` finds scripts, bins, env reads, flags and subcommands and tests each against the
  documentation text.
- `edit`, `insert`, `create`, `remove` throw "not in this ask" unless `act`, and refuse non-Markdown
  files, files outside the repository and files that may hold credentials.

Scripts in `scripts/`: `stale`, `links`, `drift`, `undocumented`, `mentions`, `map`, each taking
`repo` for another repository. Skills: `update-after-change`, `document-new`, `fix-readme`,
`retire-doc`. Roles: `checker`, `updater`. `instructions.md`: start from a script, open the doc
line before calling it wrong, change the docs and never the code, change only what the code made
false, leave style to the writing kit.

## Bench

`bench/questions.json`: six questions of the kinds agents work through by hand
(stale names, a rename sweep, docs behind code, broken links, undocumented flags, a README check),
put to the repository that `bench/make-fixture.sh` builds, and two script runs.
