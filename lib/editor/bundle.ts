/**
 * Packs a project into one HTML document for the editor's live preview, so unsaved changes show
 * instantly without a server round trip. Local stylesheets and scripts are inlined; images and
 * fonts become data: URLs; links to other local pages are routed back to the editor.
 *
 * The result only ever runs inside the sandboxed runner on the preview origin (see
 * app/usercontent), never on the app origin. Pure string work, so it runs in tests too.
 */

export type BundleInput = {
  entryPath: string;
  /** Text files by path: HTML, CSS, JS, JSON, SVG... */
  text: Record<string, string>;
  /** Binary files by path, already turned into data: URLs. */
  assets: Record<string, string>;
};

/** Resolves a reference like "../img/a.png" from a file's folder. Null for external URLs. */
export function resolveRef(fromPath: string, ref: string): string | null {
  const clean = ref.trim().split(/[?#]/)[0] ?? "";
  if (!clean || /^[a-z][a-z0-9+.-]*:/i.test(clean) || clean.startsWith("//")) return null;
  const base = clean.startsWith("/") ? [] : fromPath.split("/").slice(0, -1);
  const parts = [...base];
  for (const seg of clean.replace(/^\/+/, "").split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(decodeURIComponent(seg));
  }
  return parts.join("/");
}

const escapeForTag = (code: string, tag: "script" | "style") =>
  code.replace(new RegExp(`</(${tag})`, "gi"), "<\\/$1");

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** A data: URL for a local file used as an image, font or media, if the project has it. */
function assetUrl(input: BundleInput, path: string | null): string | null {
  if (!path) return null;
  if (input.assets[path]) return input.assets[path]!;
  if (/\.svg$/i.test(path) && input.text[path] !== undefined) return svgDataUrl(input.text[path]!);
  return null;
}

export function rewriteCssUrls(css: string, cssPath: string, input: BundleInput): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (whole, _q: string, ref: string) => {
    const url = assetUrl(input, resolveRef(cssPath, ref));
    return url ? `url("${url}")` : whole;
  });
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
}

/** Runs in the preview: sends local page links back to the editor and serves local data files to fetch(). */
function previewShim(dataFiles: Record<string, string>, pagePath: string): string {
  return `<script>(function(){
var FILES=${JSON.stringify(dataFiles).replace(/</g, "\\u003c")},PAGE=${JSON.stringify(pagePath)};
function resolve(ref){var c=String(ref).split(/[?#]/)[0];if(!c||/^[a-z][a-z0-9+.-]*:/i.test(c)||c.indexOf("//")===0)return null;var p=c.charAt(0)==="/"?[]:PAGE.split("/").slice(0,-1);c.replace(/^\\/+/,"").split("/").forEach(function(s){if(!s||s===".")return;if(s==="..")p.pop();else p.push(s);});return p.join("/");}
document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(!a)return;var h=a.getAttribute("href")||"";if(!h||h.charAt(0)==="#"||a.target==="_blank")return;var p=resolve(h);if(p===null)return;e.preventDefault();parent.postMessage({type:"remaxx:navigate",path:p},"*");},true);
var f=window.fetch;window.fetch=function(u,o){var p=typeof u==="string"?resolve(u):null;if(p!==null&&Object.prototype.hasOwnProperty.call(FILES,p)){return Promise.resolve(new Response(FILES[p],{status:200,headers:{"Content-Type":/\\.json$/i.test(p)?"application/json":"text/plain"}}));}return f.apply(this,arguments);};
})();</script>`;
}

export function bundleForPreview(input: BundleInput, pagePath = input.entryPath): string {
  const source = input.text[pagePath];
  if (source === undefined) {
    return `<!doctype html><meta charset="utf-8"><body style="font:15px system-ui;padding:2rem;color:#555">Couldn't find ${pagePath.replace(/</g, "&lt;")} in this project.</body>`;
  }

  let html = source;
  const deferred: string[] = [];

  // Stylesheets → inline <style>.
  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    const rel = (attr(tag, "rel") ?? "").toLowerCase();
    const href = attr(tag, "href");
    if (!href) return tag;
    const path = resolveRef(pagePath, href);
    if (rel.split(/\s+/).includes("stylesheet") && path && input.text[path] !== undefined) {
      const media = attr(tag, "media");
      const css = escapeForTag(rewriteCssUrls(input.text[path]!, path, input), "style");
      return `<style data-file="${path.replace(/"/g, "")}"${media ? ` media="${media.replace(/"/g, "")}"` : ""}>\n${css}\n</style>`;
    }
    const url = assetUrl(input, path);
    return url ? tag.replace(href, url) : tag;
  });

  // Local scripts → inline. Deferred and module scripts move to the end so they still run after the page.
  html = html.replace(
    /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi,
    (whole, attrs: string, body: string) => {
      const src = attr(`<script${attrs}>`, "src");
      if (!src) {
        if (/\btype\s*=\s*["']?module/i.test(attrs)) {
          deferred.push(whole);
          return "";
        }
        return whole;
      }
      const path = resolveRef(pagePath, src);
      if (!path || input.text[path] === undefined || body.trim()) return whole;
      const rest = attrs.replace(
        /\s(?:src|defer|async)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi,
        "",
      );
      const inlined = `<script${rest} data-file="${path.replace(/"/g, "")}">\n${escapeForTag(input.text[path]!, "script")}\n</script>`;
      if (/\sdefer\b/i.test(attrs) || /\btype\s*=\s*["']?module/i.test(attrs)) {
        deferred.push(inlined);
        return "";
      }
      return inlined;
    },
  );

  // Inline <style> blocks and style="" attributes can point at local images and fonts too.
  html = html.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_w, open: string, css: string, close: string) =>
      open.includes("data-file=")
        ? `${open}${css}${close}`
        : `${open}${rewriteCssUrls(css, pagePath, input)}${close}`,
  );
  html = html.replace(
    /\sstyle\s*=\s*"([^"]*)"/gi,
    (_w, css: string) => ` style="${rewriteCssUrls(css, pagePath, input).replace(/"/g, "&quot;")}"`,
  );

  // Images, media, icons: src="..." and poster="..." to local files.
  html = html.replace(
    /(\s(?:src|poster)\s*=\s*)(["'])([^"']*)\2/gi,
    (whole, pre: string, q: string, ref: string) => {
      const url = assetUrl(input, resolveRef(pagePath, ref));
      return url ? `${pre}${q}${url}${q}` : whole;
    },
  );

  const dataFiles: Record<string, string> = {};
  for (const [p, t] of Object.entries(input.text)) {
    if (/\.(json|txt|md|csv|xml)$/i.test(p) && t.length < 200_000) dataFiles[p] = t;
  }
  const shim = previewShim(dataFiles, pagePath);
  html = /<head\b[^>]*>/i.test(html)
    ? html.replace(/<head\b[^>]*>/i, (h) => `${h}\n${shim}`)
    : `${shim}\n${html}`;

  const tail = deferred.join("\n");
  if (tail)
    html = /<\/body>/i.test(html)
      ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${tail}\n</body>`)
      : `${html}\n${tail}`;
  return html;
}
