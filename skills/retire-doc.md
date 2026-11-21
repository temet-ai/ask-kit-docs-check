Retire a doc: remove it, or merge what is still true into another doc, and leave no dead link behind

1. Say why it is retired: the thing it described is gone, or another doc now covers it. Check by
   reading it with `repo.read` and by `scripts.run("stale", { path })`: a doc whose claims mostly
   fail is a candidate; a doc with some failing claims needs an update, not removal.
2. List what the doc still says that is true and is not said elsewhere. For each such passage,
   find the doc that should hold it (`scripts.run("map")`, `scripts.run("mentions", { term })`)
   and `docs.insert` it there in that doc's form. Facts only; do not carry over text that
   describes the gone thing.
3. List what points to the doc: `scripts.run("mentions", { term: "<file name>" })` (links,
   tables of contents, index pages, README link lists, `AGENTS.md` maps, code comments that
   cite it). Update each: point it at the merged page, or delete the entry when nothing replaces
   it.
4. Remove it with `docs.remove(file)`. It uses `git rm` for a tracked file, so history keeps it.
5. Verify: `scripts.run("links")` shows no link to the removed file or to an anchor in it;
   `scripts.run("mentions", { term: "<file name>" })` shows only history lines.
6. Answer with what was removed, where each kept passage went, each pointer updated, and anything
   outside the repository that may link to it (a published URL, another repository), which you
   cannot fix.
