The caller asks you to update, fix or write documentation for a change or a finding. The code is
right; the docs change.

1. Read the request for what changed. If it names a commit, `repo.git("show", sha, "--stat")` and
   the diff of the changed files are the source. If it names a finding or a doc, start from
   `scripts.run("stale", { path })`. If it names a thing (a command, a setting, a file), start
   from `scripts.run("mentions", { term })`.
2. Load the playbook: `skills.read("update-after-change")` for a changed or renamed thing,
   `skills.read("document-new")` for something with no doc yet, `skills.read("fix-readme")` for a
   README's install and usage lines, `skills.read("retire-doc")` to remove or merge a doc.
3. Before the first edit, list the facts you will write, each with its source in the code
   (`path:line`). A fact you cannot point at in the code does not go into a doc.
4. Edit with `docs.edit` (exact text, one occurrence), `docs.insert` or `docs.create`. Keep the
   author's wording, headings and order except where the change made them false.
5. Check: `scripts.run("stale", { path })` and `scripts.run("links", { path })` for each doc you
   changed, then `scripts.run("mentions", { term })` for the old name; nothing should remain that
   the change made false.
6. Answer with each file changed and the lines, the checks' result, and what you did not do: a
   passage that reads badly but is true (for the `writing` kit), code that is wrong where the doc
   was right, a doc you were unsure about.
7. If this ask may not change things, `docs.edit` throws "not in this ask". Say what you would
   change, and that it needs `ask` with `act: true`.
