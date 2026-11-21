// Markdown reading for the docs-check kit: headings and their anchors, links, code spans and fenced
// blocks, and from those the things a document claims exist (a path, a command, a flag, an
// environment variable, a call). Nothing here touches the repository; docs.mjs checks the claims.

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([\w+#.-]*)/;
const SHELL_LANGS = new Set(["sh", "bash", "shell", "zsh", "console", "terminal", "shellsession", "fish"]);
const EXTS = "md|mdx|json|jsonc|toml|yaml|yml|mjs|cjs|js|jsx|ts|tsx|rs|py|sh|bash|zsh|go|rb|java|kt|swift|c|h|cpp|hpp|css|scss|html|txt|lock|cfg|ini|conf|xml|sql|proto|svg|png|jpg|jpeg|gif|php|lua|nix|mk|plist|service|timer|env";
const PATH_RE = new RegExp(`^(?:[.~]{0,2}/)?[\\w@.+\\-\\[\\]]+(?:/[\\w@.+\\-\\[\\]]*)*(?:\\.(?:${EXTS}))?/?$`);
const EXT_RE = new RegExp(`\\.(?:${EXTS})$`);

/** GitHub's heading anchor: lower case, punctuation dropped, spaces to hyphens. */
export function slug(text) {
  return String(text).trim().toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "").replace(/\s/g, "-");
}

const plainHeading = (t) =>
  t.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/`([^`]*)`/g, "$1").replace(/<[^>]+>/g, "").replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, "$1").trim();

/** Replace code spans with spaces of the same width, and return them with their columns. */
function spans(line) {
  const out = [];
  let clean = line;
  const re = /(`+)((?:[^`]|(?!\1)`+)+?)\1(?!`)/g;
  let m;
  while ((m = re.exec(line))) {
    out.push({ text: m[2].replace(/^ (.*) $/, "$1"), col: m.index });
    clean = clean.slice(0, m.index) + " ".repeat(m[0].length) + clean.slice(m.index + m[0].length);
  }
  return { spans: out, clean };
}

/**
 * Read a Markdown file's text. Returns title, headings (with anchor slugs), the set of anchors,
 * links, inline code spans and fenced blocks, each with 1-based line numbers.
 */
export function parseMarkdown(text) {
  const lines = String(text).split(/\r?\n/);
  const r = { raw: lines, title: null, headings: [], anchors: new Set(), links: [], spans: [], blocks: [], lines: lines.length, proseLines: [] };
  let i = 0;
  if (lines[0]?.trim() === "---") {
    for (let j = 1; j < Math.min(lines.length, 60); j++) if (/^(---|\.\.\.)\s*$/.test(lines[j])) { i = j + 1; break; }
  }
  const seen = new Map();
  let block = null;
  let comment = false;
  for (; i < lines.length; i++) {
    const line = lines[i];
    const n = i + 1;
    if (block) {
      const f = line.match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
      if (f && f[1][0] === block.fence[0] && f[1].length >= block.fence.length) { r.blocks.push(block); block = null; }
      else block.lines.push({ n, text: line });
      continue;
    }
    const f = line.match(FENCE);
    if (f && !(f[1][0] === "`" && /`/.test(line.slice(f[0].length)))) { block = { line: n, fence: f[1], lang: (f[2] || "").toLowerCase(), lines: [] }; continue; }
    if (comment) { if (line.includes("-->")) comment = false; continue; }
    if (/^\s*<!--/.test(line) && !line.includes("-->")) { comment = true; continue; }
    if (/^\s*<!--.*-->\s*$/.test(line)) continue;
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      const t = plainHeading(h[2]);
      let s = slug(t);
      const c = seen.get(s) ?? 0;
      seen.set(s, c + 1);
      if (c) s = `${s}-${c}`;
      r.headings.push({ level: h[1].length, text: t, slug: s, line: n });
      r.anchors.add(s);
      if (h[1].length === 1 && !r.title) r.title = t;
    }
    for (const m of line.matchAll(/<(?:a|h\d|div|span)\b[^>]*\b(?:id|name)=["']([^"']+)["']/gi)) r.anchors.add(m[1]);
    const { spans: sp, clean } = spans(line);
    for (const s of sp) r.spans.push({ line: n, text: s.text, col: s.col });
    for (const m of clean.matchAll(/(!?)\[((?:[^\[\]]|\[[^\]]*\])*)\]\(\s*(<[^>]+>|[^()\s]*(?:\([^()\s]*\)[^()\s]*)*)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g)) {
      r.links.push({ line: n, text: m[2], target: m[3].replace(/^<|>$/g, ""), image: m[1] === "!" });
    }
    const ref = clean.match(/^\s{0,3}\[([^\]]+)\]:\s*(\S+)/);
    if (ref) r.links.push({ line: n, text: ref[1], target: ref[2].replace(/^<|>$/g, ""), image: false, ref: true });
    for (const m of clean.matchAll(/<(?:a|img)\b[^>]*\b(?:href|src)=["']([^"']+)["']/gi)) r.links.push({ line: n, text: "", target: m[1], image: false, html: true });
    r.proseLines.push({ n, text: clean });
  }
  if (block) r.blocks.push(block);
  return r;
}

// ---- claims -------------------------------------------------------------------------------

const ENV_RE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;
const COMMAND_WORDS = new Set(["npm", "pnpm", "yarn", "bun", "npx", "cargo", "make", "just", "node", "python", "python3", "bash", "sh", "deno", "tsx", "source", "uv", "pipx"]);

/** Split a shell line into words, honouring simple quotes. */
export function words(line) {
  const out = [];
  const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/** Split one shell line into simple commands at |, ||, &&, ; (outside quotes). */
export function segments(line) {
  const out = [];
  let cur = "", q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if ((c === "|" || c === "&" || c === ";") ) { out.push(cur); cur = ""; if ((c === "|" || c === "&") && line[i + 1] === c) i++; continue; }
    if (c === ">" || c === "<") { cur += " "; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** The path a token names, without a trailing :line or #L10, or null when it is not path-shaped. */
export function pathOf(tok) {
  let t = String(tok).trim().replace(/[.,;:]+$/, "").replace(/(?::\d+(?:[-:]\d+)?|#L\d+(?:-L?\d+)?)$/, "");
  if (!t || t.length > 160 || /\s/.test(t) || /:\/\//.test(t) || t.startsWith("@") || t.startsWith("-")) return null;
  if (!PATH_RE.test(t)) return null;
  if (!t.includes("/") && !EXT_RE.test(t)) return null;
  if (/^\d+(\.\d+)+$/.test(t)) return null;
  return t;
}

/**
 * What one inline code span claims, or null. kind: path | env | flag | command | ident.
 * A span such as `npm run build` or `ask-kit kit link <dir>` is a command: docs.mjs decides
 * whether its first word is a program of this repository.
 */
export function classifySpan(raw) {
  let s = String(raw).trim().replace(/^\$\s+/, "");
  if (!s || s.length > 200 || s.includes("\n")) return null;
  if (/^[A-Z][A-Z0-9_]*=/.test(s) && !/\s/.test(s.split("=")[0])) {
    const name = s.split("=")[0];
    return ENV_RE.test(name) ? { kind: "env", value: name } : null;
  }
  if (ENV_RE.test(s)) return { kind: "env", value: s };
  const flag = s.match(/^(--[a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?:[= ]\S*)?$/i);
  if (flag) return { kind: "flag", value: flag[1] };
  const ws = words(s);
  if (ws.length >= 2 || (ws.length === 1 && /^\.{1,2}\//.test(ws[0]) && !pathOf(ws[0]))) return { kind: "command", value: s };
  if (ws.length === 1) {
    const p = pathOf(s);
    if (p) return { kind: "path", value: p };
    const call = s.match(/^((?:[A-Za-z_]\w*(?:\.|::|#))*[A-Za-z_]\w{2,})\(\s*[^()]{0,40}\)$/);
    if (call) return { kind: "ident", value: call[1].split(/\.|::|#/).pop(), full: call[1] };
  }
  return null;
}

const SKIP_BLOCK_LANGS = new Set(["json", "jsonc", "toml", "yaml", "yml", "js", "javascript", "ts", "typescript", "tsx", "jsx", "rust", "rs", "python", "py", "go", "ruby", "java", "c", "cpp", "css", "html", "xml", "sql", "diff", "ini", "mermaid", "dockerfile", "mjs", "cjs", "kotlin", "swift", "csv", "markdown", "md", "text", "txt", "plaintext", "output", "log"]);

/** Lines of a fenced block that are shell commands, joined across trailing backslashes. */
function shellLines(block) {
  const lang = block.lang;
  if (SKIP_BLOCK_LANGS.has(lang)) return [];
  const onlyPrompt = lang === "" || lang === "console" || lang === "terminal" || lang === "shellsession";
  const out = [];
  let heredoc = null;
  let acc = null;
  for (const l of block.lines) {
    let t = l.text;
    if (heredoc) { if (t.trim() === heredoc) heredoc = null; continue; }
    if (acc) { acc.text += " " + t.trim().replace(/\\$/, ""); if (!/\\$/.test(t)) { out.push(acc); acc = null; } continue; }
    t = t.trim();
    if (!t || t.startsWith("#")) continue;
    if (onlyPrompt && !/^\$\s+/.test(t)) continue;
    t = t.replace(/^\$\s+/, "");
    const hd = t.match(/<<-?\s*['"]?(\w+)['"]?/);
    if (hd) heredoc = hd[1];
    if (/\\$/.test(t)) { acc = { n: l.n, text: t.replace(/\\$/, "") }; continue; }
    out.push({ n: l.n, text: t });
  }
  if (acc) out.push(acc);
  return out;
}

/** Every claim in a parsed document: {line, kind, value, from: "span" | "block", text}. */
export function claims(parsed) {
  const out = [];
  const lineText = new Map(parsed.proseLines.map((p) => [p.n, p.text]));
  for (const s of parsed.spans) {
    const c = classifySpan(s.text);
    if (c) {
      const prev = lineText.get(s.line - 1) ?? "";
      out.push({ line: s.line, col: s.col + prev.length + 1, from: "span", text: s.text, ...c, context: prev + " " + (lineText.get(s.line) ?? ""), raw: (parsed.raw?.[s.line - 2] ?? "") + " " + (parsed.raw?.[s.line - 1] ?? "") });
    }
  }
  for (const b of parsed.blocks) {
    for (const l of shellLines(b)) {
      for (const seg of segments(l.text)) {
        out.push({ line: l.n, from: "block", kind: "command", value: seg, text: l.text, context: "" });
      }
    }
  }
  return out;
}
