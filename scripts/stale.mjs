export const meta = {
  purpose:
    "Statements in the repository's documentation that the code no longer backs. Reads every documentation file (README, docs/, AGENTS.md, guides), takes what it names in inline code and shell blocks (a path, a command, a flag, an environment variable or constant, a package script, a Make target, a Cargo package, a call, a Node, Rust or Python version) and checks each against the repository. Skips placeholders, example paths, build output, other tools' commands and lines about removed things. Each finding has the doc and line, the claim, what was looked for, a hint (for example the file now lives elsewhere) and a confidence: high (the folder exists but the file does not, a script or flag missing from this repository's own command), medium, low (may belong to another repository or tool). Default shows high and medium.",
  params: {
    repo: "another repository to check, by path, optional (default: the one the agent works in)",
    path: "limit to one document or a folder of them, optional (default: all documentation)",
    min: "lowest confidence to show: 'high', 'medium' (default) or 'low'",
    kind: "only these kinds of claim, optional: path, env, flag, call, script, command, subcommand, version",
    max: "findings to return, default 60",
  },
  returns: "{repo, docsChecked, claimsChecked, found:{high,medium,low}, shown, cut, skipped:{history,placeholder,generated,ignored}, docs:[{doc, kind, findings:[{line, kind, claim, looked, hint?, confidence}]}]}",
  example: 'await scripts.run("stale", { path: "docs/user-guide", min: "medium" })',
};

export default async function stale({ docs: root }, { repo, path, min = "medium", kind, max = 60 } = {}) {
  const docs = repo ? root.at(repo) : root;
  const results = await docs.check({ path });
  if (path && !results.length) throw new Error(`no documentation file or folder named ${path}; scripts.run("map") lists the set`);
  const order = { high: 3, medium: 2, low: 1 };
  const kinds = kind ? new Set([].concat(kind)) : null;
  const found = { high: 0, medium: 0, low: 0 };
  const skipped = {};
  let claims = 0;
  const groups = [];
  let shown = 0, cut = 0;
  for (const r of results) {
    claims += r.checked;
    for (const [k, n] of Object.entries(r.skipped)) skipped[k] = (skipped[k] ?? 0) + n;
    const list = r.findings.filter((f) => !kinds || kinds.has(f.kind));
    for (const f of list) found[f.confidence]++;
    const keep = list.filter((f) => order[f.confidence] >= order[min]).sort((a, b) => order[b.confidence] - order[a.confidence] || a.line - b.line);
    const room = Math.max(0, max - shown);
    if (keep.length > room) cut += keep.length - room;
    const take = keep.slice(0, room);
    shown += take.length;
    if (take.length) groups.push({ doc: r.doc, kind: r.kind, findings: take });
  }
  return { repo: docs.root, docsChecked: results.length, claimsChecked: claims, found, shown, ...(cut ? { cut, note: `${cut} more findings at this confidence were cut; narrow with path or raise min` } : {}), skipped, docs: groups };
}
