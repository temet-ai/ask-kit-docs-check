// The three whole-repository reports of the docs-check kit: which documents are older than the code
// they name (drift), what the code offers that no document names (inventory), and the shape of the
// documentation set (map).
import fs from "node:fs";
import path from "node:path";
import { kebab, snake, camel, pascal, readText, mask, WELL_KNOWN_ENV, UNIVERSAL_FLAGS } from "./docs.mjs";
import { claims as claimsOf, pathOf, words } from "./md.mjs";

const DAY = 86_400_000;
const TEST_PATH = /(^|\/)(tests?|__tests__|spec|e2e|fixtures?|bench|examples?|samples?|testdata)\//i;
const TEST_FILE = /(\.|_)(test|spec)\.\w+$|(^|\/)test_\w+\.py$|_test\.(go|rs)$/;

// ---- drift ----------------------------------------------------------------------------------------
/**
 * For each document that names source paths: when it last changed, and the commits to those paths
 * after that. A document no commit touches after the code did is not listed.
 */
export async function drift(api, o = {}) {
  const I = api._internals;
  const commits = await api.history(o.depth ?? 5000);
  const docs = await I.docFiles({ design: o.design });
  const only = o.path ? docs.filter((d) => d.path === o.path || d.path.startsWith(o.path.replace(/\/?$/, "/"))) : docs;
  const docSet = new Set(docs.map((d) => d.path));
  const out = [];
  let noHistory = 0, noSources = 0;
  for (const d of only) {
    const last = I.lastChange(commits, d.path);
    if (!last) { noHistory++; continue; }
    const parsed = await I.parseDoc(d.path);
    const named = new Set();
    for (const c of claimsOf(parsed)) {
      const toks = c.kind === "path" ? [c.value] : c.kind === "command" ? words(c.value).filter((w) => pathOf(w)) : [];
      for (const t of toks) {
        const p = I.existingPath(t, d.path);
        if (p && !/\.mdx?$/i.test(p) && !docSet.has(p)) named.add(p);
      }
    }
    for (const l of parsed.links) {
      if (/^[a-z][a-z0-9+.-]*:|^#/i.test(l.target)) continue;
      const p = I.existingPath(l.target.split("#")[0].split("?")[0], d.path);
      if (p && !/\.mdx?$/i.test(p) && !docSet.has(p) && !/\.(png|jpe?g|gif|svg|webp|mp4)$/i.test(p)) named.add(p);
    }
    const sources = [...named].slice(0, 60);
    if (!sources.length) { noSources++; continue; }
    const newer = commits.slice(0, last.index);
    const by = new Map();
    const hits = [];
    for (const c of newer) {
      let hit = null;
      for (const f of c.files) {
        if (docSet.has(f) || /\.mdx?$/i.test(f)) continue;
        const s = sources.find((s) => f === s || f.startsWith(s + "/"));
        if (s) { hit = s; by.set(s, (by.get(s) ?? 0) + 1); }
      }
      if (hit) hits.push(c);
    }
    if (hits.length < (o.min ?? 1)) continue;
    const days = Math.round((Date.parse(hits[0].date) - Date.parse(last.date)) / DAY);
    out.push({
      doc: d.path, kind: d.kind, docLastChanged: `${last.sha} ${last.date.slice(0, 10)} ${last.subject.slice(0, 70)}`,
      sources: sources.length, commitsSince: hits.length, newestCodeChange: `${hits[0].sha} ${hits[0].date.slice(0, 10)} ${mask(hits[0].subject).slice(0, 70)}`, daysBehind: days,
      mostChanged: [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([p, n]) => `${p} (${n})`),
      recent: hits.slice(1, 3).map((c) => `${c.sha} ${c.date.slice(0, 10)} ${mask(c.subject).slice(0, 70)}`),
    });
  }
  out.sort((a, b) => b.commitsSince - a.commitsSince);
  return { docs: only.length, historyDepth: commits.length, withoutHistory: noHistory, withoutSourcePaths: noSources, drifted: out.length, items: out };
}

// ---- map ------------------------------------------------------------------------------------------
export async function map(api, o = {}) {
  const I = api._internals;
  const commits = await api.history(o.depth ?? 5000);
  const docs = await I.docFiles({ design: o.design });
  const only = o.path ? docs.filter((d) => d.path === o.path || d.path.startsWith(o.path.replace(/\/?$/, "/"))) : docs;
  const out = [];
  for (const d of only) {
    const p = await I.parseDoc(d.path);
    const l = await I.linksOf(d.path);
    const last = I.lastChange(commits, d.path);
    out.push({
      path: d.path, kind: d.kind, title: p.title, lines: p.lines, bytes: p.bytes,
      sections: p.headings.filter((h) => h.level === 2).map((h) => h.text).slice(0, 12),
      lastChanged: last ? last.date.slice(0, 10) : null,
      links: { internal: l.internal, external: l.external, broken: l.broken.length },
    });
  }
  return { count: out.length, docs: out };
}

// ---- inventory --------------------------------------------------------------------------------------
const lineOf = (file, pos) => file.text.slice(0, pos).split("\n").length;
const ENV_PATTERNS = [
  /process\.env\.([A-Z][A-Z0-9_]{2,})/g,
  /process\.env\[\s*["']([A-Z][A-Z0-9_]{2,})["']\s*\]/g,
  /env::var(?:_os)?\(\s*"([A-Z][A-Z0-9_]{2,})"/g,
  /\benv!\(\s*"([A-Z][A-Z0-9_]{2,})"/g,
  /os\.environ(?:\.get)?[\[(]\s*["']([A-Z][A-Z0-9_]{2,})["']/g,
  /(?:os\.)?getenv\(\s*["']([A-Z][A-Z0-9_]{2,})["']/g,
  /Deno\.env\.get\(\s*["']([A-Z][A-Z0-9_]{2,})["']/g,
  /\benv\s*=\s*"([A-Z][A-Z0-9_]{2,})"/g,
  /ENV\[\s*["']([A-Z][A-Z0-9_]{2,})["']\s*\]/g,
];
const PARSER_FILE = /process\.argv|parseArgs|commander|yargs|\bclap\b|argparse|std::env::args|getopts|cobra|click\.|optparse/;

export async function inventory(api, o = {}) {
  const I = api._internals;
  const code = await api.codeCorpus();
  const dcorp = await api.docsCorpus();
  const man = await I.manifests();
  const max = o.max ?? 25;
  const wanted = o.kind ? new Set([].concat(o.kind)) : null;
  const items = [];
  const add = (kind, name, where, extra = {}) => items.push({ kind, name, where, ...extra });
  const prod = code.files.filter((f) => !TEST_PATH.test(f.path) && !TEST_FILE.test(f.path));

  // package.json scripts, bins, Cargo bins, make and just targets
  const LIFE = /^(pre|post)(install|publish|prepare|pack|version|test|build|start)$|^(prepare|prepublish|prepublishOnly|prepack|postpack|install|postinstall|preinstall)$/;
  for (const [name, files] of man.scripts) {
    if (LIFE.test(name)) continue;
    const f = code.files.find((x) => x.path === files[0]);
    const m = f?.text.search(new RegExp(`"${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*:`));
    add("script", name, `${files[0]}${m >= 0 ? ":" + lineOf(f, m) : ""}`);
  }
  for (const b of man.pkgBins) add("bin", b, "package.json");
  for (const b of man.cargoBins) add("bin", b, "Cargo.toml");
  for (const t of man.make) if (!/^\.|^(all|clean|help)$/.test(t)) add("make", t, "Makefile");
  for (const t of man.just) add("just", t, "justfile");

  const seenEnv = new Map();
  for (const f of prod) {
    if (/\.(md|txt)$/.test(f.path)) continue;
    for (const re of ENV_PATTERNS) {
      re.lastIndex = 0;
      for (const m of f.text.matchAll(re)) {
        const n = m[1];
        if (WELL_KNOWN_ENV.has(n) || /^(NODE_ENV|TRUE|FALSE|NULL|UTF|TODO)$|^(GITHUB|RUNNER|CARGO)_/.test(n)) continue;
        if (!seenEnv.has(n)) seenEnv.set(n, `${f.path}:${lineOf(f, m.index)}`);
      }
    }
    for (const m of f.text.matchAll(/const\s*\{([^}]{1,300})\}\s*=\s*process\.env/g)) {
      for (const part of m[1].split(",")) { const n = part.trim().split(/[\s:=]/)[0]; if (/^[A-Z][A-Z0-9_]{2,}$/.test(n) && !WELL_KNOWN_ENV.has(n) && !seenEnv.has(n)) seenEnv.set(n, `${f.path}:${lineOf(f, m.index)}`); }
    }
  }
  for (const [n, w] of seenEnv) add("env", n, w);

  // flags and subcommands, from files that parse arguments
  const parsers = prod.filter((f) => PARSER_FILE.test(f.text) && !/\.(json|ya?ml|toml|lock)$/.test(f.path));
  const flags = new Map(), subs = new Map();
  for (const f of parsers) {
    for (const m of f.text.matchAll(/["'`](--[a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?=[=\s"'`<\[])/g)) {
      if (flags.has(m[1])) continue;
      const ls = f.text.lastIndexOf("\n", m.index) + 1;
      const line = f.text.slice(ls, f.text.indexOf("\n", m.index) === -1 ? undefined : f.text.indexOf("\n", m.index));
      // A flag handed to another program (cargo, git, curl ...) is not this program's own.
      if (/\b(cargo|git|npm|npx|pnpm|docker|curl|jq|rg|gh|rustc|python3?|make|ssh|rsync|tar|find|grep|sed|execFile|spawn|exec)\b/.test(line) && !/\.(option|long|flag|argument)\(|\boption|\bflags?\b/.test(line)) continue;
      flags.set(m[1], `${f.path}:${lineOf(f, m.index)}`);
    }
    if (/parseArgs/.test(f.text)) for (const m of f.text.matchAll(/["']?([a-z][a-z0-9]*(?:-[a-z0-9]+)*)["']?\s*:\s*\{\s*type\s*:\s*["'](?:string|boolean)["']/g)) { const n = "--" + m[1]; if (!flags.has(n)) flags.set(n, `${f.path}:${lineOf(f, m.index)}`); }
    for (const m of f.text.matchAll(/\.long\(\s*"([a-z][a-z0-9-]+)"\s*\)|\blong\s*=\s*"([a-z][a-z0-9-]+)"/g)) { const n = "--" + (m[1] ?? m[2]); if (!flags.has(n)) flags.set(n, `${f.path}:${lineOf(f, m.index)}`); }
    if (/\.rs$/.test(f.path)) {
      for (const m of f.text.matchAll(/#\[arg\(([^\]]*)\)\]\s*(?:\/\/\/[^\n]*\n\s*)*(?:pub\s+)?(\w+)\s*:/g)) {
        if (/\blong\b/.test(m[1]) && !/long\s*=/.test(m[1])) { const n = "--" + kebab(m[2]); if (!flags.has(n)) flags.set(n, `${f.path}:${lineOf(f, m.index)}`); }
      }
      for (const m of f.text.matchAll(/#\[derive\([^\]]*Subcommand[^\]]*\)\]\s*(?:pub\s+)?enum\s+\w+\s*\{([\s\S]*?)\n\}/g)) {
        for (const v of m[1].matchAll(/^\s{2,8}([A-Z]\w*)\s*(?:[{(,]|$)/gm)) { const n = kebab(v[1]); if (!subs.has(n)) subs.set(n, `${f.path}:${lineOf(f, m.index)}`); }
      }
      let first = true;
      for (const m of f.text.matchAll(/Command::new\(\s*"([a-z][\w-]*)"\s*\)/g)) { if (first) { first = false; continue; } if (!subs.has(m[1])) subs.set(m[1], `${f.path}:${lineOf(f, m.index)}`); }
    }
    for (const m of f.text.matchAll(/\.command\(\s*["']([a-z][\w-]*)/g)) if (!subs.has(m[1])) subs.set(m[1], `${f.path}:${lineOf(f, m.index)}`);
    for (const m of f.text.matchAll(/add_parser\(\s*["']([a-z][\w-]*)/g)) if (!subs.has(m[1])) subs.set(m[1], `${f.path}:${lineOf(f, m.index)}`);
    for (const m of f.text.matchAll(/\bUse:\s*"([a-z][\w-]*)/g)) if (!subs.has(m[1])) subs.set(m[1], `${f.path}:${lineOf(f, m.index)}`);
    if (/process\.argv|\.argv\b|\bargs\[/.test(f.text)) for (const m of f.text.matchAll(/\bcase\s+["']([a-z][\w-]{2,})["']\s*:/g)) if (!subs.has(m[1])) subs.set(m[1], `${f.path}:${lineOf(f, m.index)}`);
  }
  for (const [n, w] of flags) if (n !== "--help" && n !== "--version") add("flag", n, w);
  for (const [n, w] of subs) add("subcommand", n, w);

  // which of them does a document name
  const named = (it) => {
    if (it.kind === "flag") return !!dcorp.find(it.name);
    if (it.kind === "subcommand") return !!dcorp.find(it.name, { before: /[\w]/, after: /[\w]/ }) || !!dcorp.find(pascal(it.name), { before: /[\w]/, after: /[\w]/ });
    if (it.kind === "env") return !!dcorp.find(it.name, { before: /[\w]/, after: /[\w]/ });
    return !!dcorp.find(it.name, { before: /[\w]/, after: /[\w]/ });
  };
  const kinds = {};
  for (const it of items) {
    if (wanted && !wanted.has(it.kind)) continue;
    const k = (kinds[it.kind] ??= { detected: 0, undocumented: [] });
    k.detected++;
    if (!named(it)) k.undocumented.push({ name: it.name, where: it.where });
  }
  const result = {};
  for (const [k, v] of Object.entries(kinds)) {
    result[k] = { detected: v.detected, undocumentedCount: v.undocumented.length, undocumented: v.undocumented.slice(0, max), ...(v.undocumented.length > max ? { cut: v.undocumented.length - max } : {}) };
  }
  return {
    docs: (await I.docFiles()).length,
    ...result,
    detectedFrom: { argumentParserFiles: parsers.length, sourceFiles: prod.length },
    notDetected: "configuration keys (no generic source), arguments read by hand outside a parser file, flags a parser builds from a table",
  };
}
