export const meta = {
  purpose:
    "Which documents have not been touched since the code they describe changed, by git history. For each document it takes the source files and folders it names (paths in code spans and shell blocks, links to code), finds the commit that last changed the document, and counts the commits to those sources after it, with the newest code change, the most changed sources and two more recent commits. Most commits first. A document that names no source path is not listed. A drifted document is a place to look, not proof that it is wrong: run stale on it, then read the commits.",
  params: {
    repo: "another repository to check, by path, optional (default: the one the agent works in)",
    path: "limit to one document or a folder of them, optional",
    min: "fewest commits since to list, default 1",
    design: "false leaves out design notes, plans and decision records (default true)",
  },
  returns: "{docs, historyDepth, withoutHistory, withoutSourcePaths, drifted, items:[{doc, kind, docLastChanged:'sha date subject', sources, commitsSince, newestCodeChange:'sha date subject', daysBehind, mostChanged:['path (n)'], recent:['sha date subject' (the two before the newest)]}]}",
  example: 'await scripts.run("drift", { path: "README.md" })',
};

export default async function driftScript({ docs: root }, { repo, path, min = 1, design } = {}) {
  const docs = repo ? root.at(repo) : root;
  const r = await docs.drift({ path, min, design });
  const cap = 30;
  return { ...r, items: r.items.slice(0, cap), ...(r.items.length > cap ? { cut: r.items.length - cap } : {}) };
}
