export const meta = {
  purpose:
    "The documentation set of the repository: each file with its kind (readme, guide, agent-guide, contributing, design, other), title, level-2 headings, size, the date it last changed, and how many internal, external and broken links it has. Use it to see what documents exist before checking or changing them, and to find where a topic belongs.",
  params: { repo: "another repository to check, by path, optional (default: the one the agent works in)", path: "limit to one document or a folder of them, optional", design: "false leaves out design notes and plans" },
  returns: "{count, docs:[{path, kind, title, lines, bytes, sections, lastChanged, links:{internal, external, broken}}]}",
  example: 'await scripts.run("map", { path: "docs" })',
};

export default async function map({ docs: root }, { repo, path, design } = {}) {
  const docs = repo ? root.at(repo) : root;
  const r = await docs.map({ path, design });
  if (path && !r.count) throw new Error(`no documentation file or folder named ${path}`);
  const cap = 80;
  return { count: r.count, docs: r.docs.slice(0, cap), ...(r.count > cap ? { cut: r.count - cap, note: "narrow with path" } : {}) };
}
