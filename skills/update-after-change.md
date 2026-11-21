Bring the docs up to date after a code change: find every doc that names the changed thing and change only what is now false

1. Write down the change as facts: what was removed, renamed, moved or added, and what it is
   called before and after. For a commit: `repo.git("show", sha, "--stat")`, then the diff of the
   changed files. A rename gives two names; a removal gives one; a new thing gives one.
2. Find every doc that names the old thing. `scripts.run("mentions", { term: oldName })` for each
   name, then once more for the path (`src/old.mjs`) and for a flag or command written the way a
   reader would type it (`--old-flag`, `tool old-sub`). `docs.parse(file).claims` shows how a doc
   states things. Names inside design notes, plans and decision records record what was decided at
   the time: leave them, and say you left them.
3. For each hit, open the passage (`repo.read(file, { from, to })`) and decide:
   - a statement the change made false (the file moved, the flag is gone, the default changed):
     change it;
   - a statement still true: leave it, even if it reads as dated;
   - a history line ("renamed from X", "was removed in"): leave it;
   - an example that no longer runs: change the example, and run the command if it is safe.
4. Make the smallest edit that makes the sentence true. Replace the name or the value; keep the
   sentence. When a whole sentence describes behaviour that is gone, delete the sentence, not the
   paragraph around it. If the change needs a paragraph rewritten for sense, do the factual edit,
   and list the passage in the answer for the `writing` kit.
5. A removed thing leaves links and anchors behind: `scripts.run("links")` after the edits. A
   renamed heading breaks `#anchor` links in other docs.
6. If the change adds a thing the docs should describe, switch to `skills.read("document-new")`.
7. Verify: `scripts.run("stale", { path })` for each doc you changed, `scripts.run("mentions",
   { term: oldName })` (what remains must be history lines or design notes), and for a
   version number or default, `repo.rg` the value in the code once more.
8. Answer with the files and lines changed, each as old text to new text, and what you left alone
   on purpose.
