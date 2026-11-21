interface Claim { line: number; kind: "path" | "env" | "flag" | "call" | "script" | "command" | "subcommand" | "version"; claim: string; looked: string; hint?: string; confidence: "high" | "medium" | "low" }
interface DocCheck { doc: string; kind: DocKind; checked: number; skipped: Record<string, number>; findings: Claim[] }
interface DocLinks { doc: string; internal: number; external: number; broken: { line: number; text: string; target: string; problem: "file missing" | "anchor missing"; confidence: "high" | "low"; hint?: string }[] }
type DocKind = "readme" | "guide" | "agent-guide" | "contributing" | "design" | "other";

declare const docs: {
  root: string; // the repository's top folder
  act: boolean; // true when this ask may change things

  // The documentation set: Markdown files that are docs. Left out: CHANGELOG, LICENSE, SECURITY, files in node_modules, target,
  // dist, worktrees, tests, fixtures, hidden folders (.claude, .github), skills, agents, roles, prompts and rules folders,
  // generated files, and copies of a file already listed. kind: design is docs/design, plans, adr, rfc, research, notes: they
  // describe intent, so a finding there is one confidence level lower. design: false leaves them out.
  files(o?: { design?: boolean }): Promise<{ path: string; kind: DocKind }[]>;

  // One document read: title, headings with their GitHub anchors, links, and the claims it makes (what check() will test).
  parse(file: string): Promise<{ path: string; title: string | null; lines: number; headings: { level: number; text: string; anchor: string; line: number }[]; links: { line: number; text: string; target: string }[]; claims: { line: number; kind: string; value: string }[] }>;

  // What each document says that the repository does not back (see scripts/stale). path: one document or a folder. Returns every
  // finding at every confidence, per document; the stale script filters and caps them.
  check(o?: { path?: string }): Promise<DocCheck[]>;

  // Broken relative links and anchors per document. Web links are counted, not fetched.
  links(o?: { path?: string }): Promise<DocLinks[]>;

  // Every documentation line that contains `term` (code blocks included): whole text, exact case unless ignoreCase.
  // fixed: false treats term as a regular expression. `total` is the real count; the array holds at most max (default 60).
  mentions(term: string, o?: { ignoreCase?: boolean; fixed?: boolean; max?: number; design?: boolean }): Promise<{ file: string; line: number; text: string }[] & { total: number; complete: boolean }>;

  // Docs older than the code they name; see scripts/drift. min: fewest commits since; depth: commits of history read (default 5000).
  drift(o?: { path?: string; min?: number; design?: boolean; depth?: number }): Promise<any>;
  // The documentation set with titles, sections, last change and link counts; see scripts/map.
  map(o?: { path?: string; design?: boolean }): Promise<any>;
  // What the code offers and which of it no doc names; see scripts/undocumented. kind: script, bin, make, just, env, flag, subcommand.
  inventory(o?: { kind?: string | string[]; max?: number }): Promise<any>;

  // Commits newest first, each with its files (merges left out). Use it to find when a doc or a source last changed.
  history(max?: number): Promise<{ sha: string; date: string; subject: string; files: string[] }[]>;
  // The newest commit that changed a file: { sha, date, subject } or null.
  lastChange(file: string): Promise<{ index: number; sha: string; date: string; subject: string } | null>;
  // What the manifests declare: package name and version, npm scripts, bins, Cargo packages and bins, Make targets, engines.
  manifests(): Promise<{ packageName: string | null; version: string | null; scripts: string[]; bins: string[]; cargoPackages: string[]; cargoBins: string[]; makeTargets: string[]; justRecipes: string[]; engines: string | null; rust: string | null; python: string | null }>;

  // The same client for another repository or folder inside one: docs.at("/path/to/repo").
  at(dir: string): typeof docs;

  // ---- changing calls: Markdown files only (.md, .mdx). Each throws "not in this ask" unless this ask may act, and refuses a file
  // that is not Markdown, is outside the repository, or may hold credentials. The code is never edited to match a document.
  // Replace `from` with `to`: exactly one occurrence, or all with { all: true }. Returns the line of the first change.
  edit(file: string, from: string, to: string, o?: { all?: boolean }): Promise<{ file: string; replaced: number; line: number }>;
  // Insert text after line `afterLine` (1-based; 0 puts it at the top). Insert a table row, a list item or a section.
  insert(file: string, afterLine: number, text: string): Promise<{ file: string; insertedAt: number; lines: number }>;
  // Create a new Markdown file (folders are made). Throws when it exists.
  create(file: string, text: string): Promise<{ file: string; bytes: number }>;
  // Delete a Markdown file with `git rm` when it is tracked. Links to it are not fixed: run scripts.run("mentions") and scripts.run("links") after.
  remove(file: string): Promise<{ file: string; removed: boolean; viaGit: boolean }>;
};

// The code of the repository as one searchable text (no docs, lockfiles, binaries or credentials) and the documentation as another.
// find(token) returns the first whole-word hit { path, line } or null. Use it for "does the code still have this name".
interface Corpus { files: { path: string; text: string }[]; find(token: string, o?: { before?: RegExp; after?: RegExp }): { path: string; line: number } | null }
declare namespace docs { function codeCorpus(): Promise<Corpus>; function docsCorpus(): Promise<Corpus> }
