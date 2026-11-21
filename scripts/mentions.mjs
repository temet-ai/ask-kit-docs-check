export const meta = {
  purpose:
    "Where the documentation names a word, and whether the code still has it. Use after a rename or removal (is the old name still in the docs?) and before changing a documented thing (which docs name it?). Whole-word, case-sensitive by default. Searches every line of every documentation file, code blocks included. Also counts the files of the code that still mention the term.",
  params: {
    repo: "another repository to check, by path, optional (default: the one the agent works in)",
    term: "the name to look for (a plain string)",
    ignoreCase: "match any case, default false",
    max: "document lines to return, default 40",
  },
  returns: "{term, inDocs:{lines, files, hits:[{file, line, text}], cut?}, inCode:{files, first:[path:line]}}",
  example: 'await scripts.run("mentions", { term: "GIT_ALLOWED" })',
};

export default async function mentions({ docs: root }, { repo, term, ignoreCase = false, max = 40 } = {}) {
  const docs = repo ? root.at(repo) : root;
  if (!term) throw new Error("term is required");
  const all = await docs.mentions(term, { ignoreCase, max: 5000 });
  const w = new RegExp(`(?<![\\w-])${term.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}(?![\\w-])`, ignoreCase ? "i" : "");
  const hits = all.filter((h) => w.test(h.text));
  const code = await docs.codeCorpus();
  const files = new Set();
  const first = [];
  for (const f of code.files) {
    const m = f.text.match(w);
    if (m) { files.add(f.path); if (first.length < 5) first.push(`${f.path}:${f.text.slice(0, m.index).split("\n").length}`); }
  }
  return {
    term,
    inDocs: { lines: hits.length, files: new Set(hits.map((h) => h.file)).size, hits: hits.slice(0, max), ...(hits.length > max ? { cut: hits.length - max } : {}) },
    inCode: { files: files.size, first },
  };
}
