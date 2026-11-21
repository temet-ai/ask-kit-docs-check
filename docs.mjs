// A client for the documentation of one repository: which Markdown files are documentation, what
// each of them claims exists (a path, a command, a flag, an environment variable, a script, a link,
// an anchor), whether the repository still has it, which docs were last changed before the code they
// name, and what the code offers that no doc names. It reads the repository and the git history.
// When the caller asked for a change (`act`) it can edit Markdown files, and only Markdown files:
// the code is never edited to match a document.
//
// Three checks. A change needs `act`. Credentials are never read (.env*, keys, tokens, cookies),
// and text that looks like a secret is masked in what comes back, because the investigator is a
// cloud model. Programs run without a shell, with a timeout.
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { drift, map, inventory } from "./report.mjs";
import { parseMarkdown, claims as claimsOf, words, pathOf, slug } from "./md.mjs";

const notInThisAsk = (what) => {
  throw new Error(`not in this ask: ${what} changes things, and the caller did not ask for a change (act: true), so nothing was done. Answer what you can, and say that this needs \`ask\` with act: true. Do not look for another way to do it.`);
};
const deny = (why) => { throw new Error(`not allowed: ${why}`); };

const LEVELS = ["low", "medium", "high"];
const down = (c, n = 1) => LEVELS[Math.max(0, LEVELS.indexOf(c) - n)];
const SECRET = /\b(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_\w{20,}|xox[abprs]-[\w-]{10,}|AKIA[0-9A-Z]{16}|eyJ[\w-]{20,}\.[\w-]{10,}\.[\w-]+)/g;
const mask = (s) => String(s ?? "").replace(SECRET, "***");

const SKIP_DIRS = new Set(["node_modules", "target", "dist", "build", "out", "vendor", "third_party", "worktrees", "fixtures", "__fixtures__", "testdata", "snapshots", "__snapshots__", "coverage", ".git", "venv", ".venv", "__pycache__"]);
const GENERATED_ROOTS = new Set(["node_modules", "target", "dist", "build", "out", "coverage", "tmp", "temp", "cache", "venv", "__pycache__", "bundle"]);
const NOT_DOC = /^(CHANGELOG|CHANGES|HISTORY|RELEASES?|LICENSE|LICENCE|NOTICE|THIRD-PARTY-NOTICES|CODE_OF_CONDUCT|COPYING|PULL_REQUEST_TEMPLATE)/i;
const DESIGN_DIR = /(^|\/)(design|designs|adr|adrs|rfc|rfcs|proposals?|plans?|worklogs?|research|reports?|retros?|specs?|notes|decisions|history|archive|rejected)(\/|$)/i;
const SECRET_FILE = /(^|\/)(\.env(\.(?!example|sample|template)[^/]*)?|[^/]*\.(pem|key|p12|pfx|keystore)|id_(rsa|ed25519|ecdsa)[^/]*|credentials[^/]*|[^/]*secret[^/]*|[^/]*token[^/]*|[^/]*cookie[^/]*|auth\.json|\.npmrc|\.netrc)$/i;
const NOT_CODE_EXT = /\.(md|mdx|png|jpe?g|gif|ico|svg|webp|woff2?|ttf|otf|eot|pdf|zip|gz|tgz|wasm|mp[34]|mov|webm|lock|map|bin|sqlite3?|db|class|jar|so|dylib|exe|dll|snap)$/i;
const LOCKFILES = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|poetry\.lock|uv\.lock|Gemfile\.lock|go\.sum|composer\.lock|npm-shrinkwrap\.json)$|\.min\.(js|css)$/;
const UNIVERSAL_FLAGS = new Set(["--help", "--version", "--verbose", "--quiet", "--yes", "--force", "--dry-run", "--json", "--no-color", "--color", "--debug", "--silent"]);
const WELL_KNOWN_ENV = new Set(["PATH", "HOME", "USER", "SHELL", "EDITOR", "VISUAL", "PAGER", "TERM", "LANG", "TZ", "PWD", "TMPDIR", "NO_COLOR", "FORCE_COLOR", "CI", "NODE_ENV", "DEBUG", "RUST_LOG", "RUST_BACKTRACE", "LC_ALL", "XDG_CONFIG_HOME", "XDG_STATE_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "XDG_RUNTIME_DIR", "LD_LIBRARY_PATH", "NODE_OPTIONS", "GITHUB_TOKEN", "GH_TOKEN", "SSH_AUTH_SOCK", "DISPLAY", "WAYLAND_DISPLAY", "COLORTERM", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "GITHUB_ACTIONS", "GITHUB_OUTPUT", "GITHUB_ENV", "GITHUB_PATH", "GITHUB_SHA", "GITHUB_REF", "GITHUB_WORKSPACE", "RUNNER_OS", "RUNNER_TEMP", "CARGO_HOME", "RUSTFLAGS", "RUSTUP_HOME", "GOPATH", "VIRTUAL_ENV", "PYTHONPATH", "MAKEFLAGS", "LOGNAME", "HOSTNAME", "COLUMNS", "LINES", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "COMSPEC", "SHLVL", "OLDPWD"]);
const VENDOR_ENV = /^(ANTHROPIC|OPENAI|CLAUDE_CODE|CLAUDE|AWS|GOOGLE|AZURE|NPM|NODE|CARGO|RUST|RUSTUP|XDG|LC|DOCKER|KUBE|OPENROUTER|DEEPSEEK|GEMINI|GROQ|MISTRAL|COHERE|HF|HUGGINGFACE|GITHUB|GH|GITLAB|SSH|GPG|PYTHON|JAVA|MAVEN|GRADLE|TERM|LD|DYLD)_/;
const NOT_ENV = /^(ERR|EAI|SIG|HTTP|HTTPS|ACME|EXAMPLE|MY|YOUR|FOO|BAR|XXX|TODO|FIXME|NOTE|UTF|ISO|RFC|SHA|MD5|API|JSON|YAML|TOML|CSV|HTML|URL|CPU|GPU|RAM|USD|EUR)_/;
const HISTORY = /\b(old(er)?|removed|deprecated|legacy|renamed|formerly|previously|no longer|used to|replaced by|superseded|retired|dropped|obsolete|gone)\b/i;
const EXAMPLE = /\b(e\.g\.|eg:|for example|for instance|such as|example|i\.e\.|like this|hypothetical|sample|say you have)\b/i;
const RUNTIME = /\b(creates?|created|writes?|written|generates?|generated|outputs?|produces?|saves?|saved|emits?|downloads?|downloaded|cache[sd]?|installs? (to|into)|logs? (to|in)|appears?|lands?|ends up)\b/i;
const NPM_BUILTIN = new Set(["install", "i", "add", "ci", "update", "up", "upgrade", "uninstall", "remove", "rm", "ls", "list", "publish", "pack", "link", "unlink", "init", "exec", "x", "view", "info", "audit", "outdated", "config", "cache", "login", "logout", "whoami", "version", "help", "why", "dlx", "create", "store", "prune", "rebuild", "dedupe", "fund", "pkg", "prefix", "root", "bin", "set", "get", "patch", "import", "licenses", "workspaces", "self-update", "global", "cache", "dev", "unplug", "info", "explain", "run", "run-script", "test", "t", "tst", "start", "stop", "restart", "-v", "-h"]);

const readText = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return null; } };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const lc = (s) => s.toLowerCase();

function exec(cmd, args, { cwd, timeoutMs = 60_000, input } = {}) {
  return new Promise((resolve) => {
    const child = execFile(cmd, args, { cwd, timeout: timeoutMs, maxBuffer: 256 << 20, encoding: "utf8", env: { ...process.env, GIT_PAGER: "cat", GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" } }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, out: stdout ?? "", err: stderr ?? "" });
    });
    if (input != null) child.stdin.end(input);
  });
}

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[_\s]+/g, "-").toLowerCase();
const snake = (s) => kebab(s).replace(/-/g, "_");
const camel = (s) => kebab(s).replace(/-(\w)/g, (_, c) => c.toUpperCase());
const pascal = (s) => camel(s).replace(/^\w/, (c) => c.toUpperCase());

/** A body of text made of many files, searched for whole words, with the file and line of a hit. */
class Corpus {
  constructor(files) {
    this.files = files; // {path, text, start}
    let pos = 0;
    this.parts = [];
    for (const f of files) { f.start = pos; this.parts.push(f.text); pos += f.text.length + 2; }
    this.text = this.parts.join("\n\0");
    this.size = this.text.length;
  }
  where(pos) {
    let lo = 0, hi = this.files.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.files[mid].start <= pos) lo = mid; else hi = mid - 1; }
    const f = this.files[lo];
    return { path: f.path, line: f.text.slice(0, pos - f.start).split("\n").length, file: f };
  }
  /** First whole-word occurrence of `tok`: not preceded or followed by a word character or a hyphen. */
  find(tok, { before = /[\w-]/, after = /[\w-]/, from = 0, test } = {}) {
    if (!tok) return null;
    let i = this.text.indexOf(tok, from);
    let guard = 0;
    while (i !== -1 && guard++ < 5000) {
      const p = this.text[i - 1] ?? "\n";
      const n = this.text[i + tok.length] ?? "\n";
      const b = tok.startsWith("-") ? /[\w-]/ : before;
      if (!b.test(p) && !after.test(n)) {
        const w = this.where(i);
        if (!test || test(w)) return w;
      }
      i = this.text.indexOf(tok, i + 1);
    }
    return null;
  }
}

export function make({ settings, push, cwd, act }) {
  return makeDocs({ root: settings?.REPO_ROOT || cwd || process.cwd(), push, act: !!act });
}

export function makeDocs({ root: start, push = () => {}, act = false }) {
  let root = path.resolve(start);
  const S = {}; // caches
  const note = (detail, ms) => push({ kind: "docs", detail: String(detail).slice(0, 200), ms });
  const rel = (abs) => path.relative(root, abs).split(path.sep).join("/");

  async function git(...args) {
    const t = Date.now();
    const r = await exec("git", args, { cwd: root });
    note(`git ${args.join(" ")}`, Date.now() - t);
    return r;
  }

  async function init() {
    if (S.ready) return;
    const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: root });
    S.git = top.code === 0;
    if (S.git) root = top.out.trim();
    S.ready = true;
  }

  // ---- the file list ------------------------------------------------------------------------
  async function fileList() {
    await init();
    if (S.files) return S.files;
    let list = [];
    if (S.git) {
      const r = await git("ls-files", "-z", "--cached", "--others", "--exclude-standard");
      list = r.out.split("\0").filter(Boolean);
    } else {
      const walk = (d, pre) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          if (SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue;
          if (e.isDirectory()) walk(path.join(d, e.name), pre + e.name + "/");
          else list.push(pre + e.name);
        }
      };
      try { walk(root, ""); } catch { /* unreadable */ }
    }
    S.files = [...new Set(list)].filter((f) => !SECRET_FILE.test(f));
    S.dirs = new Set();
    S.byBase = new Map();
    for (const f of S.files) {
      const parts = f.split("/");
      for (let i = 1; i < parts.length; i++) S.dirs.add(parts.slice(0, i).join("/"));
      const b = parts[parts.length - 1];
      if (!S.byBase.has(b)) S.byBase.set(b, []);
      S.byBase.get(b).push(f);
    }
    return S.files;
  }
  const exists = (r) => { try { return fs.existsSync(path.join(root, r)); } catch { return false; } };
  const isDir = (r) => { try { return fs.statSync(path.join(root, r)).isDirectory(); } catch { return false; } };

  // ---- which Markdown files are documentation ---------------------------------------------------
  const docKind = (p) => {
    const base = p.split("/").pop();
    if (/^(AGENTS|CLAUDE|GEMINI)\.md$/i.test(base)) return "agent-guide";
    if (/^README/i.test(base)) return DESIGN_DIR.test(p) ? "design" : "readme";
    if (/^CONTRIBUTING/i.test(base)) return "contributing";
    if (DESIGN_DIR.test(p)) return "design";
    if (/^(docs?|guides?|documentation|wiki|manual)\//i.test(p) || /(^|\/)(docs?|guides?)\//i.test(p)) return "guide";
    return "other";
  };

  async function docFiles(o = {}) {
    const files = await fileList();
    const key = JSON.stringify([o.design, o.limit]);
    if (S.docs && S.docsKey === key) return S.docs;
    const out = [];
    const hashes = new Set();
    for (const f of files) {
      if (!/\.mdx?$/i.test(f)) continue;
      const parts = f.split("/");
      const base = parts[parts.length - 1];
      if (parts.slice(0, -1).some((s) => SKIP_DIRS.has(s) || s.startsWith("."))) continue;
      if (/^(tests?|spec)$/i.test(parts[0]) || /(^|\/)(tests?|__tests__)\//.test(f)) continue;
      if (NOT_DOC.test(base)) continue;
      if (parts.slice(0, -1).some((s) => /^(skills?|roles|agents|prompts|templates|rules)$/i.test(s)) || base === "SKILL.md") continue;
      if (!exists(f)) continue;
      const head = (readText(path.join(root, f)) ?? "").slice(0, 600);
      if (/(do not edit|auto-?generated|generated (by|from|file)|@generated)/i.test(head.split("\n").slice(0, 6).join("\n"))) continue;
      const kind = docKind(f);
      if (kind === "design" && o.design === false) continue;
      const full = readText(path.join(root, f)) ?? "";
      const h = crypto.createHash("sha1").update(full).digest("hex");
      if (full.length > 200 && hashes.has(h)) continue;
      hashes.add(h);
      out.push({ path: f, kind, size: head.length });
    }
    out.sort((a, b) => a.path.localeCompare(b.path));
    S.docs = out; S.docsKey = key;
    return out;
  }

  const parsedCache = new Map();
  async function parseDoc(p) {
    await init();
    const abs = path.join(root, p);
    let st;
    try { st = fs.statSync(abs); } catch { throw new Error(`no such file: ${p}`); }
    const k = parsedCache.get(p);
    if (k && k.mtime === st.mtimeMs) return k.parsed;
    const text = readText(abs) ?? "";
    const parsed = parseMarkdown(text);
    parsed.text = text;
    parsed.path = p;
    parsed.bytes = st.size;
    parsedCache.set(p, { mtime: st.mtimeMs, parsed });
    return parsed;
  }

  // ---- what the repository provides -------------------------------------------------------------
  async function manifests() {
    if (S.man) return S.man;
    const files = await fileList();
    const m = { scripts: new Map(), pkgNames: [], bins: new Set(), cargoPackages: new Set(), cargoBins: new Set(), examples: new Set(), make: new Set(), just: new Set(), aliases: new Set(), engines: null, pkgBins: new Set(), nvmrc: null, rust: null, python: null, version: null, pkgName: null, hasPackageJson: false, hasCargo: false, hasMake: false };
    for (const f of files) {
      const base = f.split("/").pop();
      const abs = path.join(root, f);
      if (f.split("/").some((s) => s === "node_modules")) continue;
      if (base === "package.json") {
        const j = readJson(abs); if (!j) continue;
        m.hasPackageJson = true;
        for (const k of Object.keys(j.scripts ?? {})) { if (!m.scripts.has(k)) m.scripts.set(k, []); m.scripts.get(k).push(f); }
        if (j.name) m.pkgNames.push(j.name);
        if (typeof j.bin === "string" && j.name) { m.bins.add(j.name.replace(/^@[^/]+\//, "")); m.pkgBins.add(j.name.replace(/^@[^/]+\//, "")); }
        else for (const k of Object.keys(j.bin ?? {})) { m.bins.add(k); m.pkgBins.add(k); }
        if (f === "package.json") { m.version = j.version ?? null; m.pkgName = j.name ?? null; m.engines = j.engines?.node ?? null; }
      } else if (base === "Cargo.toml") {
        m.hasCargo = true;
        let sec = "";
        for (const line of (readText(abs) ?? "").split("\n")) {
          const h = line.match(/^\s*\[+([^\]]+)\]+/);
          if (h) { sec = h[1].trim(); continue; }
          const n = line.match(/^\s*name\s*=\s*"([^"]+)"/);
          if (n && sec === "package") { m.cargoPackages.add(n[1]); m.bins.add(n[1]); if (files.includes(path.posix.join(path.posix.dirname(f), "src/main.rs").replace(/^\.\//, ""))) m.cargoBins.add(n[1]); }
          if (n && sec === "bin") { m.cargoBins.add(n[1]); m.bins.add(n[1]); }
          const rv = line.match(/^\s*rust-version\s*=\s*"([^"]+)"/);
          if (rv && !m.rust) m.rust = rv[1];
          const al = line.match(/^\s*([\w-]+)\s*=/);
          if (al && (sec === "alias")) m.aliases.add(al[1]);
        }
        const dir = path.posix.dirname(f);
        for (const g of files) {
          const gd = path.posix.dirname(g);
          if (gd === (dir === "." ? "src/bin" : `${dir}/src/bin`) && g.endsWith(".rs")) m.cargoBins.add(path.posix.basename(g, ".rs")), m.bins.add(path.posix.basename(g, ".rs"));
          if (gd === (dir === "." ? "examples" : `${dir}/examples`) && g.endsWith(".rs")) m.examples.add(path.posix.basename(g, ".rs"));
        }
      } else if (base === ".cargo/config.toml" || (f.endsWith(".cargo/config.toml") || f.endsWith(".cargo/config"))) {
        let sec = "";
        for (const line of (readText(abs) ?? "").split("\n")) {
          const h = line.match(/^\s*\[+([^\]]+)\]+/); if (h) { sec = h[1].trim(); continue; }
          const al = line.match(/^\s*([\w-]+)\s*=/); if (al && sec === "alias") m.aliases.add(al[1]);
        }
      } else if (/^(GNUmakefile|Makefile|makefile)$/.test(base)) {
        m.hasMake = true;
        for (const x of (readText(abs) ?? "").matchAll(/^([A-Za-z0-9_.-]+(?:\s+[A-Za-z0-9_.-]+)*)\s*:(?![=])/gm)) for (const t of x[1].split(/\s+/)) m.make.add(t);
      } else if (/^[Jj]ustfile$/.test(base)) {
        m.hasJust = true;
        for (const x of (readText(abs) ?? "").matchAll(/^@?([A-Za-z][\w-]*)[^:=\n]*:(?!=)/gm)) m.just.add(x[1]);
      } else if (base === ".nvmrc" && f === ".nvmrc") m.nvmrc = (readText(abs) ?? "").trim().replace(/^v/, "");
      else if (base === "rust-toolchain.toml" || base === "rust-toolchain") {
        const ch = (readText(abs) ?? "").match(/channel\s*=\s*"([^"]+)"/) ?? (readText(abs) ?? "").match(/^(\d+\.\d+[\w.]*)\s*$/m);
        if (ch && !m.rust) m.rust = ch[1];
      } else if (base === "pyproject.toml" && f === "pyproject.toml") {
        const rp = (readText(abs) ?? "").match(/requires-python\s*=\s*"([^"]+)"/);
        if (rp) m.python = rp[1];
        let sec = "";
        for (const line of (readText(abs) ?? "").split("\n")) {
          const h = line.match(/^\s*\[+([^\]]+)\]+/); if (h) { sec = h[1].trim(); continue; }
          const al = line.match(/^\s*([\w-]+)\s*=/); if (al && sec === "project.scripts") m.bins.add(al[1]);
        }
      }
    }
    m.bins.add(path.basename(root));
    for (const f of files) { const p = f.split("/"); if (p.length === 2 && p[0] === "bin") m.bins.add(p[1].replace(/\.\w+$/, "")); }
    S.man = m;
    return m;
  }

  // The code and config of the repository as one searchable text (no docs, no lockfiles, no secrets).
  async function codeCorpus() {
    if (S.code) return S.code;
    const files = await fileList();
    const out = [];
    let total = 0;
    for (const f of files) {
      if (NOT_CODE_EXT.test(f) || LOCKFILES.test(f)) continue;
      const parts = f.split("/");
      if (parts.slice(0, -1).some((s) => SKIP_DIRS.has(s) || s === "results")) continue;
      let st; try { st = fs.statSync(path.join(root, f)); } catch { continue; }
      if (!st.isFile() || st.size > 1_000_000 || total + st.size > 60_000_000) continue;
      const text = readText(path.join(root, f));
      if (text == null || text.includes("\0")) continue;
      total += text.length;
      out.push({ path: f, text });
    }
    S.code = new Corpus(out);
    S.code.skipped = files.length - out.length;
    return S.code;
  }
  async function docsCorpus() {
    if (S.dtext) return S.dtext;
    const ds = await docFiles();
    S.dtext = new Corpus(ds.map((d) => ({ path: d.path, text: readText(path.join(root, d.path)) ?? "" })));
    return S.dtext;
  }

  const PH_SEG = /^(foo|bar|baz|qux|xxx+|yyy+|zzz|abc|path|to|dir|name|filename|file|x|y|z|some|placeholder)$/i;
  const placeholder = (p) =>
    /[<>{}*$|]|\.\.\.|…|\[[^\]]*\]|%[sd]/.test(p) ||
    p.split("/").some((seg) => /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(seg) || /^acme([-_.]|$)/i.test(seg) || PH_SEG.test(seg.replace(/\.\w+$/, "")) || /^(my|your|some|foo|example|sample)[-_]/i.test(seg));

  // ---- checking a path ------------------------------------------------------------------------
  async function ignored(r) {
    if (!S.git) return false;
    const x = await exec("git", ["check-ignore", "-q", "--", r], { cwd: root, timeoutMs: 10_000 });
    return x.code === 0;
  }

  /** Where a path named in a document points: {rel} for a file or folder inside the repository, or {skip} with why. */
  function resolvePath(p, docPath) {
    if (p.startsWith("~")) return { skip: "home" };
    const docDir = path.posix.dirname(docPath);
    let cands = [];
    if (p.startsWith("/")) {
      if (p.startsWith(root + "/")) cands = [p.slice(root.length + 1)]; else return { skip: "absolute" };
    } else if (p.startsWith("./") || p.startsWith("../")) cands = [path.posix.normalize(path.posix.join(docDir, p))];
    else cands = [...new Set([path.posix.normalize(p), path.posix.normalize(path.posix.join(docDir, p))])];
    cands = cands.map((c) => c.replace(/\/$/, ""));
    if (cands.some((c) => c.startsWith("../") || c === "..")) return { skip: "outside" };
    return { cands };
  }

  /**
   * Check one path named in a document. Returns null when it exists or cannot be judged, else a
   * finding {looked, hint, confidence, skip?}.
   */
  async function checkPath(p, docPath, { command = false } = {}) {
    await fileList();
    const r = resolvePath(p, docPath);
    if (r.skip) return null;
    for (const c of r.cands) if (c && exists(c)) return null;
    const trail = p.endsWith("/");
    const bare = p.replace(/\/$/, "");
    const hasExt = /\.[A-Za-z0-9]{1,8}$/.test(bare);
    const segs = bare.split("/");
    const cand = r.cands[0];
    if (!cand) return null;
    if (GENERATED_ROOTS.has(cand.split("/")[0]) || GENERATED_ROOTS.has(segs[0])) return { skip: "generated" };
    if (placeholder(p)) return { skip: "placeholder" };
    if (!hasExt && !trail && segs.length < 2) return null;
    // A suffix of a real path (the document names it from a package folder).
    const sfx = "/" + cand.replace(/^\.\//, "");
    if (hasExt && segs.length === 1) {
      const same = S.byBase.get(bare) ?? [];
      if (same.length) return null;
    }
    if (S.files.some((f) => f.endsWith(sfx)) || [...S.dirs].some((d) => d.endsWith(sfx))) return null;
    if (await ignored(cand)) return { skip: "ignored" };
    const base = segs[segs.length - 1];
    const moved = (S.byBase.get(base) ?? []).filter((f) => exists(f)).slice(0, 4);
    const parent = path.posix.dirname(cand);
    const firstSeg = cand.split("/")[0];
    let confidence;
    if (segs.length === 1) confidence = command ? "medium" : "low";
    else if (parent === "." || S.dirs.has(parent) || exists(parent)) confidence = "high";
    else if (S.dirs.has(firstSeg) || exists(firstSeg)) confidence = "medium";
    else confidence = "low";
    if (moved.length && confidence !== "high") confidence = "high";
    if (moved.length && /^\.{1,2}\//.test(p)) confidence = "medium";
    const looked = r.cands.join(" or ");
    const hint = moved.length ? `a file named ${base} exists at ${moved.join(", ")}` : (confidence === "high" ? `${parent === "." ? "the repository root" : parent + "/"} exists but has no ${base}` : confidence === "medium" ? `${firstSeg}/ exists but not ${parent}/` : `${firstSeg} is not in this repository`);
    return { looked: `file or folder ${looked}`, hint, confidence };
  }

  // ---- checking a flag, subcommand, env var, call, script -----------------------------------------
  async function hasFlag(flag, scope) {
    const code = scope ?? (await codeCorpus());
    const k = kebab(flag.replace(/^-+/, ""));
    const forms = [`--${k}`, `"${k}"`, `'${k}'`, `"${camel(k)}"`, `'${camel(k)}'`, `"${snake(k)}"`, "`" + k + "`"];
    for (const t of forms) {
      const w = code.find(t, { before: t.startsWith("-") ? /[\w-]/ : /[\w]/, after: t.startsWith("-") ? /[\w-]/ : /[\w]/ });
      if (w) return w;
    }
    // clap derive: a field `foo_bar: bool` in a file that uses clap becomes --foo-bar
    const sn = snake(k);
    const w = code.find(sn, { before: /[\w]/, after: /[\w]/, test: (w) => /clap|#\[arg|#\[command/.test(w.file.text) && new RegExp(`\\b${sn}\\s*:`).test(w.file.text) });
    return w;
  }
  async function hasSub(name, scope) {
    const code = scope ?? (await codeCorpus());
    const k = kebab(name);
    for (const t of [`"${k}"`, `'${k}'`, `"${snake(k)}"`, `"${camel(k)}"`, `'${camel(k)}'`, `case ${k}:`, "`" + k + "`"]) {
      const w = code.find(t, { before: /[\w]/, after: /[\w]/ });
      if (w) return w;
    }
    return code.find(pascal(k), { before: /[\w]/, after: /[\w]/, test: (w) => /Subcommand|enum\s+\w*Command|clap/.test(w.file.text) });
  }
  const hasEnv = async (name) => (await codeCorpus()).find(name, { before: /[\w]/, after: /[\w]/ });
  const hasIdent = async (name) => (await codeCorpus()).find(name, { before: /[\w]/, after: /[\w]/ });

  // ---- the check over one document ---------------------------------------------------------------
  async function checkDoc(p, { design = true } = {}) {
    const doc = await parseDoc(p);
    const kind = docKind(p);
    const man = await manifests();
    const found = [];
    const skipped = { history: 0, placeholder: 0, generated: 0, ignored: 0, external: 0 };
    let checked = 0;
    const emit = (line, ckind, claim, res, ctx = "", extra = {}, col = -1, raw = "") => {
      let conf = res.confidence;
      if (EXAMPLE.test(ctx)) conf = down(conf);
      if (ckind === "path" && col >= 0) {
        const before = ctx.slice(0, col);
        // Another project's file: "mike's `x`", "in mike", "mike-ask `x`", or a path relative to a root the line names (~/, $VAR).
        if (/\b\w+['’]s\s*$/.test(before) || /[\w]+-[\w-]+\s+$/.test(before) || /\b(in|from|of)\s+(the\s+)?[\w-]+(\s+(repo|repository|project|package|crate))?[,:]?\s*$/.test(before) && /\b(repo|repository|project|package|crate|mike)\b/i.test(before)) conf = down(conf);
      }
      if (ckind === "path" && /(~\/|\$[A-Z{]|<[a-z-]+>)/.test(raw)) conf = down(conf);
      if (RUNTIME.test(ctx) && ckind === "path") conf = down(conf);
      if (kind === "design") conf = down(conf);
      found.push({ line, kind: ckind, claim: mask(claim).slice(0, 160), looked: res.looked, ...(res.hint ? { hint: res.hint } : {}), confidence: conf, ...extra });
    };
    const seen = new Set();
    for (const c of claimsOf(doc)) {
      if (HISTORY.test(c.context ?? "") && c.from === "span") { skipped.history++; continue; }
      const key = `${c.line}|${c.kind}|${c.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (c.kind === "path") {
        checked++;
        const res = await checkPath(c.value, p);
        if (res?.skip) { skipped[res.skip] = (skipped[res.skip] ?? 0) + 1; continue; }
        if (res) emit(c.line, "path", c.value, res, c.context, {}, c.col ?? -1, c.raw ?? "");
      } else if (c.kind === "env") {
        if (WELL_KNOWN_ENV.has(c.value) || NOT_ENV.test(c.value)) continue;
        checked++;
        if (!(await hasEnv(c.value))) emit(c.line, "env", c.value, { looked: `the name ${c.value} in code, scripts and config`, confidence: VENDOR_ENV.test(c.value) ? "low" : "medium", hint: VENDOR_ENV.test(c.value) ? "it may be another program's variable" : "no file of the repository mentions it (an environment variable or a constant)" }, c.context);
      } else if (c.kind === "flag") {
        if (UNIVERSAL_FLAGS.has(c.value)) continue;
        checked++;
        if (!(await hasFlag(c.value))) emit(c.line, "flag", c.value, { looked: `${c.value} in code and config`, confidence: "low", hint: "it may belong to another tool" }, c.context);
      } else if (c.kind === "ident") {
        checked++;
        if (!(await hasIdent(c.value))) emit(c.line, "call", c.full, { looked: `the name ${c.value} in code`, confidence: /[a-z][A-Z]|_/.test(c.value) && c.value.length >= 6 ? "medium" : "low", hint: "no file of the repository has it" }, c.context);
      } else if (c.kind === "command") {
        for (const f of await checkCommand(c.value, p, man)) { checked++; emit(c.line, f.kind, c.value, f, c.context); }
        checked++;
      }
    }
    // versions
    for (const f of versionClaims(doc, man)) { checked++; found.push({ ...f, confidence: kind === "design" ? down(f.confidence) : f.confidence }); }
    return { doc: p, kind, checked, skipped, findings: found };
  }

  function versionClaims(doc, man) {
    const out = [];
    for (const { n, text } of doc.proseLines) {
      let m;
      if (man.engines) {
        const minNode = man.engines.match(/>=?\s*v?(\d+)/)?.[1];
        if (minNode && (m = text.match(/\bNode(?:\.js)?\s*v?(?:>=?\s*)?(\d{2})(?:\.\d+)*\+/i)) && m[1] !== minNode && !HISTORY.test(text))
          out.push({ line: n, kind: "version", claim: `Node ${m[1]}+`, looked: `engines.node in package.json is ${man.engines}`, confidence: "medium" });
      }
      if (man.rust && (m = text.match(/\bRust\s*v?(1\.\d+)(?:\.\d+)?\+?/i))) {
        const want = String(man.rust).match(/1\.\d+/)?.[0];
        if (want && want !== m[1] && !HISTORY.test(text)) out.push({ line: n, kind: "version", claim: `Rust ${m[1]}`, looked: `rust-version or rust-toolchain says ${man.rust}`, confidence: "medium" });
      }
      if (man.python && (m = text.match(/\bPython\s*(3\.\d+)\+?/i))) {
        const want = man.python.match(/3\.\d+/)?.[0];
        if (want && want !== m[1] && !HISTORY.test(text)) out.push({ line: n, kind: "version", claim: `Python ${m[1]}`, looked: `requires-python in pyproject.toml says ${man.python}`, confidence: "medium" });
      }
    }
    return out;
  }

  /** Check one shell command a document shows. Returns findings (maybe none). */
  async function checkCommand(text, docPath, man) {
    const out = [];
    let ws = words(text);
    while (ws.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(ws[0]) || ["sudo", "time", "exec", "env", "command"].includes(ws[0]))) {
      const e = ws[0].match(/^([A-Z][A-Z0-9_]+)=/);
      if (e && !WELL_KNOWN_ENV.has(e[1]) && /_/.test(e[1]) && !(await hasEnv(e[1]))) out.push({ kind: "env", looked: `the name ${e[1]} in code, scripts and config`, confidence: "low", hint: "set in front of a command; no file of the repository mentions it" });
      ws.shift();
    }
    if (!ws.length) return out;
    if (/[<$]|\{|\[/.test(ws[0])) return out;
    let first = ws[0];
    if (first === "npx" || (first === "npm" && ws[1] === "exec")) { ws = ws.slice(first === "npx" ? 1 : 2).filter((w, i, a) => i > 0 || !w.startsWith("-")); first = ws[0]; if (!first) return out; if (!man.bins.has(first)) return out; }
    const rest = ws.slice(1);
    const hasPh = (w) => /[<$]|\{|\.\.\.|…/.test(w);
    if (["npm", "pnpm", "yarn", "bun"].includes(first)) {
      const sub = rest.find((w) => !w.startsWith("-"));
      let script = null, implicit = false;
      if (sub === "run" || sub === "run-script") script = rest.slice(rest.indexOf(sub) + 1).find((w) => !w.startsWith("-"));
      else if (first === "npm" && ["test", "t", "tst", "start", "stop", "restart"].includes(sub)) { script = sub === "t" || sub === "tst" ? "test" : sub; implicit = true; }
      else if (first !== "npm" && sub && !NPM_BUILTIN.has(sub) && /^[\w:-]+$/.test(sub)) script = sub;
      else if (first !== "npm" && (sub === "test" || sub === "start")) { script = sub; implicit = true; }
      if (script && !hasPh(script) && !man.scripts.has(script)) {
        if (!man.hasPackageJson) out.push({ kind: "script", looked: `script ${script} in any package.json`, confidence: "low", hint: "the repository has no package.json" });
        else out.push({ kind: "script", looked: `script ${script} in package.json (${[...man.scripts.keys()].slice(0, 12).join(", ") || "none"})`, confidence: implicit ? "medium" : "high" });
      }
      return out;
    }
    if (first === "cargo") {
      const sub = rest.find((w) => !w.startsWith("-"));
      if (!man.hasCargo) { if (sub === "run" || sub === "build" || sub === "test") out.push({ kind: "command", looked: "a Cargo.toml", confidence: "low", hint: "the repository has no Cargo.toml" }); return out; }
      for (let i = 0; i < rest.length; i++) {
        const w = rest[i];
        let val = null, what = null;
        const m = w.match(/^(--package|--bin|--example|-p)(?:=(.+))?$/);
        if (m) { what = m[1]; val = m[2] ?? rest[i + 1]; }
        if (!what || !val || hasPh(val)) continue;
        const pool = what === "--bin" ? man.cargoBins : what === "--example" ? man.examples : man.cargoPackages;
        if (!pool.has(val) && !(what === "--bin" && man.cargoPackages.has(val))) out.push({ kind: "command", looked: `${what === "-p" ? "package" : what.replace("--", "")} ${val} in Cargo.toml (${[...pool].slice(0, 12).join(", ")})`, confidence: "high" });
      }
      return out;
    }
    if (first === "make" || first === "just") {
      const t = rest.find((w) => !w.startsWith("-") && !w.includes("="));
      const pool = first === "make" ? man.make : man.just;
      const have = first === "make" ? man.hasMake : man.hasJust;
      if (t && !hasPh(t) && !pool.has(t)) out.push({ kind: "command", looked: `target ${t} in the ${first === "make" ? "Makefile" : "justfile"}`, confidence: have ? "high" : "low", ...(have ? {} : { hint: `the repository has no ${first === "make" ? "Makefile" : "justfile"}` }) });
      return out;
    }
    let scriptFile = null;
    let args = rest;
    if (["node", "python", "python3", "bash", "sh", "deno", "tsx", "source", "uv", "bun"].includes(first)) {
      const i = rest.findIndex((w) => !w.startsWith("-") && !["run", "-m", "-c", "-e"].includes(w));
      const a = rest[i];
      if (a && !hasPh(a) && pathOf(a)) {
        const res = await checkPath(a, docPath, { command: true });
        if (res && !res.skip) out.push({ kind: "path", looked: res.looked, hint: res.hint, confidence: res.confidence === "low" ? "medium" : res.confidence });
        const resolved = resolvePath(a, docPath).cands?.find((c) => exists(c));
        if (resolved) { scriptFile = resolved; args = rest.slice(i + 1); }
        else return out;
      } else return out;
    } else if (/^\.{0,2}\/|^[\w.-]+\//.test(first) && pathOf(first) && !hasPh(first)) {
      const res = await checkPath(first, docPath, { command: true });
      if (res && !res.skip) { out.push({ kind: "path", looked: res.looked, hint: res.hint, confidence: res.confidence === "low" ? "medium" : res.confidence }); return out; }
      if (res?.skip) return out;
      const resolved = resolvePath(first, docPath).cands?.find((c) => exists(c));
      if (!resolved) return out;
      scriptFile = resolved;
    } else if (man.bins.has(first)) {
      // The repository's own program: its subcommands and flags must exist in its code.
      const subs = [];
      const plain = rest.filter((w) => !w.startsWith("-"));
      if (plain.length >= 3 && plain.every((w) => /^[a-z']+[.,]?$/.test(w)) && plain.some((w) => /^(is|are|was|not|the|a|an|to|of|for|with|yet|and|or|it)$/.test(w))) return out;
      for (const w of rest) { if (subs.length < 2 && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(w)) subs.push(w); else break; }
      const code = await codeCorpus();
      for (const s of subs) if (!(await hasSub(s, code))) { out.push({ kind: "subcommand", looked: `subcommand ${s} of ${first} in code`, confidence: "medium", hint: "no string, case label or enum variant with that name" }); break; }
      for (const w of rest) {
        const m = w.match(/^(--[a-z][a-z0-9-]*)/i);
        if (m && !UNIVERSAL_FLAGS.has(m[1]) && !hasPh(m[1]) && !(await hasFlag(m[1], code))) out.push({ kind: "flag", looked: `${m[1]} in the code of ${first}`, confidence: "high", hint: "the command is this repository's own" });
      }
      return out;
    } else return out;
    if (scriptFile) {
      const body = readText(path.join(root, scriptFile));
      if (body != null && !isDir(scriptFile)) {
        for (const w of args) {
          const m = w.match(/^(--[a-z][a-z0-9-]*)/i);
          if (m && !UNIVERSAL_FLAGS.has(m[1]) && !hasPh(m[1])) {
            const k = kebab(m[1].slice(2));
            if (!new RegExp(`(^|[^\\w-])(--${k}|${k}|${camel(k)}|${snake(k)})([^\\w-]|$)`).test(body) && !(await hasFlag(m[1]))) out.push({ kind: "flag", looked: `${m[1]} in ${scriptFile} and the code`, confidence: "high", hint: `${scriptFile} exists but does not mention it` });
          }
        }
      }
    }
    return out;
  }

  // ---- links --------------------------------------------------------------------------------------
  async function linksOf(p) {
    const doc = await parseDoc(p);
    await fileList();
    const out = [];
    let internal = 0, external = 0;
    const docDir = path.posix.dirname(p);
    for (const l of doc.links) {
      const t = l.target.trim();
      if (!t || /^(mailto:|tel:|data:|javascript:)/i.test(t) || /\{\{|\{%|<%|\$\{/.test(t)) continue;
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t) || t.startsWith("//")) { external++; continue; }
      internal++;
      let [file, anchor] = [t, null];
      const hi = t.indexOf("#");
      if (hi !== -1) { file = t.slice(0, hi); anchor = t.slice(hi + 1); }
      file = file.replace(/\?.*$/, "");
      try { file = decodeURIComponent(file); anchor = anchor == null ? null : decodeURIComponent(anchor); } catch { /* keep */ }
      let target = p;
      if (file) {
        const base = file.startsWith("/") ? file.slice(1) : path.posix.join(docDir, file);
        target = path.posix.normalize(base).replace(/\/$/, "");
        if (target.startsWith("..")) continue;
        if (!exists(target)) {
          if (!path.posix.extname(target) && exists(target + ".md")) target += ".md";
          else {
            const bn = path.posix.basename(target);
            const cand = (S.byBase.get(bn) ?? []).filter((f) => exists(f)).slice(0, 4);
            out.push({ line: l.line, text: mask(l.text).slice(0, 60), target: t, problem: "file missing", confidence: file.startsWith("/") ? "low" : "high", ...(cand.length ? { hint: `a file named ${bn} exists at ${cand.join(", ")}` } : {}) });
            continue;
          }
        }
      }
      if (anchor && !/^(L\d+|user-content|fn|fnref)/.test(anchor) && /\.mdx?$/i.test(target)) {
        const d = target === p ? doc : await parseDoc(target);
        const a = anchor.toLowerCase();
        if (!d.anchors.has(anchor) && !d.anchors.has(a)) {
          const near = [...d.anchors].filter((s) => s.includes(a) || a.includes(s) || lev(s, a) <= 3).slice(0, 3);
          out.push({ line: l.line, text: mask(l.text).slice(0, 60), target: t, problem: "anchor missing", confidence: "high", hint: near.length ? `${target} has headings ${near.map((x) => "#" + x).join(", ")}` : `${target} has no heading that makes #${anchor}` });
        }
      }
    }
    return { doc: p, internal, external, broken: out };
  }
  const lev = (a, b) => {
    if (Math.abs(a.length - b.length) > 3) return 9;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  };

  // ---- history --------------------------------------------------------------------------------------
  async function history(max = 5000) {
    if (S.hist) return S.hist;
    await init();
    if (!S.git) return (S.hist = []);
    const r = await git("log", `-n${max}`, "--no-merges", "--name-only", "--format=@@%h\x1f%cI\x1f%s");
    const commits = [];
    let cur = null;
    for (const line of r.out.split("\n")) {
      if (line.startsWith("@@")) { const [sha, date, subject] = line.slice(2).split("\x1f"); cur = { sha, date, subject, files: [] }; commits.push(cur); }
      else if (line && cur) cur.files.push(line);
    }
    return (S.hist = commits);
  }
  const lastChange = (commits, p) => {
    const i = commits.findIndex((c) => c.files.includes(p));
    return i === -1 ? null : { index: i, sha: commits[i].sha, date: commits[i].date, subject: commits[i].subject };
  };

  // ---- the API ---------------------------------------------------------------------------------------
  const api = {
    get root() { return root; },
    act,

    async files(o = {}) {
      const ds = await docFiles(o);
      return ds.map(({ path: p, kind }) => ({ path: p, kind }));
    },
    parse: async (p) => {
      const d = await parseDoc(p);
      return { path: p, title: d.title, lines: d.lines, headings: d.headings.map(({ level, text, slug, line }) => ({ level, text, anchor: slug, line })), links: d.links.map(({ line, text, target }) => ({ line, text, target })), claims: claimsOf(d).map(({ line, kind, value }) => ({ line, kind, value })) };
    },
    async check(o = {}) {
      await init();
      const ds = o.path ? (await docFiles()).filter((d) => d.path === o.path || d.path.startsWith(o.path.replace(/\/?$/, "/"))) : await docFiles();
      const targets = ds.length ? ds.map((d) => d.path) : (o.path && exists(o.path) ? [o.path] : []);
      const results = [];
      for (const p of targets) results.push(await checkDoc(p));
      return results;
    },
    async links(o = {}) {
      await init();
      const ds = o.path ? (await docFiles()).filter((d) => d.path === o.path || d.path.startsWith(o.path.replace(/\/?$/, "/"))) : await docFiles();
      const targets = ds.length ? ds.map((d) => d.path) : (o.path && exists(o.path) ? [o.path] : []);
      const res = [];
      for (const p of targets) res.push(await linksOf(p));
      return res;
    },
    async mentions(term, o = {}) {
      await init();
      const ds = await docFiles({ design: o.design });
      const re = o.fixed === false ? new RegExp(term, o.ignoreCase ? "i" : "") : new RegExp(String(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), o.ignoreCase ? "i" : "");
      const out = [];
      let total = 0;
      for (const d of ds) {
        (readText(path.join(root, d.path)) ?? "").split("\n").forEach((t, i) => { if (re.test(t)) { total++; if (out.length < (o.max ?? 60)) out.push({ file: d.path, line: i + 1, text: mask(t.trim()).slice(0, 200) }); } });
      }
      return Object.assign(out, { total, complete: total === out.length });
    },
    async history(max) { return history(max); },
    lastChange: async (p) => { const c = await history(); return lastChange(c, p); },

    async manifests() {
      const m = await manifests();
      return { packageName: m.pkgName, version: m.version, scripts: [...m.scripts.keys()], bins: [...m.bins], cargoPackages: [...m.cargoPackages], cargoBins: [...m.cargoBins], makeTargets: [...m.make], justRecipes: [...m.just], engines: m.engines, rust: m.rust, python: m.python };
    },
    codeCorpus, docsCorpus,
    drift: (o) => drift(api, o),
    map: (o) => map(api, o),
    inventory: (o) => inventory(api, o),
    _internals: { existingPath: (p, docPath) => { const r = resolvePath(p, docPath); return r.cands?.find((c) => c && exists(c)) ?? null; }, SKIP_DIRS, checkDoc, linksOf, parseDoc, docFiles, fileList, manifests, history, lastChange, exists, isDir, rel: (a) => rel(a), S: () => S },

    // ---- changing calls: Markdown files only ----------------------------------------------------
    async edit(file, from, to, o = {}) {
      if (!act) notInThisAsk(`docs.edit(${file})`);
      const abs = markdownTarget(file);
      const text = fs.readFileSync(abs, "utf8");
      const count = text.split(from).length - 1;
      if (!from) deny("empty text to replace");
      if (count === 0) throw new Error(`text not found in ${file}`);
      if (count > 1 && !o.all) throw new Error(`text occurs ${count} times in ${file}; pass more context or { all: true }`);
      const next = o.all ? text.split(from).join(to) : text.replace(from, () => to);
      fs.writeFileSync(abs, next);
      note(`edit ${file}`, 0);
      return { file, replaced: o.all ? count : 1, line: text.slice(0, text.indexOf(from)).split("\n").length };
    },
    async insert(file, afterLine, text) {
      if (!act) notInThisAsk(`docs.insert(${file})`);
      const abs = markdownTarget(file);
      const lines = fs.readFileSync(abs, "utf8").split("\n");
      if (!Number.isInteger(afterLine) || afterLine < 0 || afterLine > lines.length) throw new Error(`afterLine must be 0..${lines.length}`);
      lines.splice(afterLine, 0, ...String(text).replace(/\n$/, "").split("\n"));
      fs.writeFileSync(abs, lines.join("\n"));
      note(`insert ${file}`, 0);
      return { file, insertedAt: afterLine + 1, lines: String(text).replace(/\n$/, "").split("\n").length };
    },
    async create(file, text) {
      if (!act) notInThisAsk(`docs.create(${file})`);
      const abs = markdownTarget(file, true);
      if (fs.existsSync(abs)) throw new Error(`${file} exists; use docs.edit or docs.insert`);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, text);
      note(`create ${file}`, 0);
      return { file, bytes: Buffer.byteLength(text) };
    },
    async remove(file) {
      if (!act) notInThisAsk(`docs.remove(${file})`);
      const abs = markdownTarget(file);
      const r = await git("rm", "-q", "--", file);
      if (r.code !== 0) fs.rmSync(abs);
      note(`remove ${file}`, 0);
      return { file, removed: true, viaGit: r.code === 0 };
    },
    at(dir) { return makeDocs({ root: path.resolve(root, dir), push, act }); },
  };

  function markdownTarget(file, isNew = false) {
    const abs = path.resolve(root, file);
    if (!abs.startsWith(root + path.sep)) deny("the file is outside the repository");
    if (!/\.mdx?$/i.test(abs)) deny("docs changes only Markdown files; the code is never edited to match a document");
    if (SECRET_FILE.test(rel(abs))) deny("that file can hold credentials");
    if (abs.split(path.sep).some((s) => s === "node_modules" || s === ".git")) deny("not a documentation file");
    if (!isNew && !fs.existsSync(abs)) throw new Error(`no such file: ${file}`);
    return abs;
  }

  return api;
}

export { Corpus, kebab, snake, camel, pascal, readText, readJson, mask, SECRET_FILE, WELL_KNOWN_ENV, UNIVERSAL_FLAGS, LEVELS, down, HISTORY };
