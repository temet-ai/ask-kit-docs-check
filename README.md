# ask-kit-docs-check

An [ask-kit](https://github.com/temet-ai/ask-kit) kit that lets your coding agent's `ask` tool
check a repository's documentation against its code, and bring the docs up to date when asked. A
cheap model reads the Markdown files and the repository outside your agent's context and answers
with `path:line`, the claim in the doc and what the code has now.

Questions from its bench, of the kinds agents had worked through by hand with `rg` and `sed`:

- Which names in the docs refer to constants or settings the code no longer has?
- The TOLL_DENIED list is gone from the code. Which commit removed it, and which docs still name it?
- Which command-line flags does the tool define that no doc mentions?

## Install

You need [ask-kit](https://github.com/temet-ai/ask-kit#set-it-up), `git` and `rg` (ripgrep).

Paste this into your agent:

```
Read ~/.config/ask-kit/AGENTS.md, then add this kit: github.com/temet-ai/ask-kit-docs-check
```

Or run it yourself:

```sh
ask-kit kit install temet-ai/ask-kit-docs-check        # shows what it reads, changes and runs
ask-kit kit install temet-ai/ask-kit-docs-check --yes  # installs and enables it
```

Restart your agents so `ask` lists `docs-check`. The kit answers about the git repository your
agent works in; a question that names another repository by path is answered there.

## What it carries

| | |
|---|---|
| Scripts | `stale` (what the docs name that the repository no longer has), `links` (broken relative links and anchors), `drift` (docs last changed before the code they name, with the commits they missed), `undocumented` (scripts, bins, environment variables, flags and subcommands in the code that no doc names), `mentions` (where the docs name a word, and whether the code still has it), `map` (the documentation set: title, sections, last change, link counts) |
| Skills | `update-after-change`, `document-new`, `fix-readme`, `retire-doc`: playbooks the investigator loads when the job calls for one |
| Roles | `checker` for questions about whether docs are current or correct; `updater` for requests to update, fix or write docs |

`stale` takes what a document names in inline code and shell blocks (a path, a command, a flag, an
environment variable or constant, a package script, a Make target, a Cargo package, a call, a Node,
Rust or Python version) and checks each against the repository. It skips placeholders, example
paths, build output, other tools' commands and lines about removed things. Each finding carries a
confidence: high when the folder exists and the file does not, or when this repository's own command
lacks the flag or script; medium when a name is absent from the code; low when it may belong to
another repository or tool. The default shows high and medium.

`undocumented` finds scripts and bins in `package.json`, `Cargo.toml`, Makefiles and justfiles,
environment variables read through `process.env`, `env::var`, `os.environ` and `getenv`, and flags
and subcommands in files that parse arguments (commander, yargs, `parseArgs`, clap, argparse,
cobra, a switch on argv). It does not see configuration keys.

Each script also runs with no model: `ask-kit run docs-check stale`, or
`ask(do: "docs-check.stale")` from an agent. Every script takes `repo=<path>` for another
repository.

## What it can change

A question never changes anything. When the request asks for a change, the investigator edits
documentation: `docs.edit`, `docs.insert`, `docs.create` and `docs.remove` accept Markdown files
only and refuse a file outside the repository or one that may hold credentials. Its instructions
say to change the docs to match the code and never the reverse, to change only what the code made
false, to keep the author's wording elsewhere, and to leave prose that needs rewriting for style to
the `writing` kit. The kit also has the `repo` folder source, whose `edit`, `write` and `run` are
withheld from a question like any folder source.

What the investigator reads goes to a cloud model, so `.env*`, keys, tokens, cookies and lockfiles
are excluded from the repository folder and from the code the scripts read, and text that looks
like a secret is masked in what the scripts return.

## How well it works

`bench/questions.json` holds six questions and two script runs, each with patterns its answer must
hold, put to the small repository that `bench/make-fixture.sh` builds (run it first). It has not been run on
a model yet; `ask-kit kit test docs-check` runs it. The scripts were run without a model on three real repositories and the fixture, and `stale` reports some findings that are not defects (an example path in a
tutorial, a path that belongs to another repository named in the same sentence); the investigator
is told to open each doc line before calling it wrong.
