Fix a README's install and usage section against what the package provides

1. Find what the package provides. `docs.manifests()` gives the package name, version, scripts,
   bins, Cargo packages and bins, Make targets and the Node, Rust or Python version it needs. For
   how it is installed or distributed, read what is there: `package.json` (`bin`, `files`,
   `publishConfig`), `Cargo.toml`, `pyproject.toml`, a `Formula` or install script, the release
   workflow in `.github/workflows`.
2. List every command the README tells a reader to run: `docs.parse("README.md").claims` with
   `kind: "command"`, and the fenced blocks. `scripts.run("stale", { path: "README.md", min:
   "low" })` shows which fail. For each one:
   - an install command: the package or formula name must be the name the manifest declares, and
     the registry line must match where it is published (`repo.rg` the release workflow);
   - a command the reader types after install: its binary must be in `bins`, its subcommands and
     flags must be in the code (the `stale` finding says which are not);
   - `npm run x`, `make x`, `cargo run -p x`: the script, target or package must exist;
   - a prerequisite version: it must match `engines`, `rust-version` or `requires-python`.
3. Run what is safe to run: `--help` of the binary shows what the program says it has. Never run
   an install, a publish or a command that writes.
4. Edit only the lines the checks show to be wrong, with `docs.edit`. Keep the README's order,
   headings and voice. If the install section is missing a step the package needs (a
   prerequisite, a setup command), add it where the existing steps are, as one more step.
5. If the README opens with a feature list, has no usage example, or is a pointer to a docs folder
   that does not exist, do not restructure it here: list that in the answer for the caller.
6. Verify with `scripts.run("stale", { path: "README.md" })` and `scripts.run("links", { path:
   "README.md" })`.
7. Answer with the lines changed (old to new), the source of each correction, and what is still
   unverified (a command you could not run).
