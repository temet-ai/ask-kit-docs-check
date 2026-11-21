export const meta = {
  purpose:
    "Broken relative links and anchors in the documentation: a link or image whose target file or folder is gone, and a link to a heading (#anchor) that the target document does not have. For a missing file it names where a file of that name is now; for a missing anchor it names the nearest headings. Web links are counted, not fetched.",
  params: { repo: "another repository to check, by path, optional (default: the one the agent works in)", path: "limit to one document or a folder of them, optional" },
  returns: "{docsChecked, internalLinks, externalLinks (not checked), broken, docs:[{doc, broken:[{line, text, target, problem, hint?, confidence}]}]}",
  example: 'await scripts.run("links")',
};

export default async function links({ docs: root }, { repo, path } = {}) {
  const docs = repo ? root.at(repo) : root;
  const res = await docs.links({ path });
  if (path && !res.length) throw new Error(`no documentation file or folder named ${path}`);
  const groups = res.filter((r) => r.broken.length).map((r) => ({ doc: r.doc, broken: r.broken.slice(0, 40) }));
  return {
    docsChecked: res.length,
    internalLinks: res.reduce((n, r) => n + r.internal, 0),
    externalLinks: res.reduce((n, r) => n + r.external, 0),
    broken: res.reduce((n, r) => n + r.broken.length, 0),
    docs: groups,
  };
}
