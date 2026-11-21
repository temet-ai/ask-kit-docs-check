Document a new command, flag, script or setting: put it where its neighbours are, in their form

1. Get the facts from the code, not from the request's words: the exact name, what it does, its
   arguments and flags, its default, where it is defined (`path:line`). For a flag or subcommand,
   read the parser (`repo.rg` the name); for an environment variable, the line that reads it and
   the default that line supplies; for a script, its `meta` or header comment and
   `package.json`.
2. Find where its neighbours are documented. `scripts.run("undocumented")` lists what is missing;
   `scripts.run("mentions", { term: aNeighbourName })` for a sibling command or setting shows the
   page. The thing belongs on the page and in the list or table where the siblings are: a new CLI
   flag goes in the flags table next to the other flags, not in a new section. Use
   `scripts.run("map")` when no neighbour exists, to pick the page by what a reader comes to do.
3. Copy the neighbours' form exactly: if siblings are table rows with columns name, default and
   description, write a row; if they are a bulleted list of `` `--flag` ``, one line, write a
   bullet; if each has an example, give one that runs. Match their order (alphabetical, or by
   importance) and their tense and person.
4. State the facts from step 1 and nothing else: no claim about benefits, no "easily". Give the
   default and the unit. Say what happens when it is unset.
5. Insert with `docs.insert(file, afterLine, text)` on the line of the last sibling, or `docs.edit`
   to extend a table. If a summary elsewhere counts things ("the five commands"), update the count.
6. Add a link from the places that should point to it only when siblings are linked the same way.
7. Verify: `scripts.run("undocumented")` no longer lists it; `scripts.run("stale", { path })` and
   `scripts.run("links", { path })` on the page; run an example command if it is safe.
8. Answer with the file and line where it went, the neighbours it sits beside, and the source
   `path:line` of each fact.
