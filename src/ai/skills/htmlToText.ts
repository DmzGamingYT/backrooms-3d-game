/**
 * Best-effort HTML → readable text converter.
 *
 * Browser-only. No parser library — we use DOMParser, drop script/style
 * and SVG noise, preserve <a> hrefs as "[text](url)", then linearise the
 * remaining tree. The output is what we feed the LLM as the page excerpt
 * — keep it short, paragraph-rich, free of markup.
 */
export function htmlToText(rawHtml: string, url: string): {
  title: string;
  text: string;
  byteLen: number;
} {
  if (typeof DOMParser === "undefined") {
    return { title: "", text: "", byteLen: 0 };
  }
  const doc = new DOMParser().parseFromString(rawHtml, "text/html");

  // Title — fallback to <title>, then to the URL hostname.
  const title =
    doc.querySelector("title")?.textContent?.trim() ||
    doc.querySelector("meta[property='og:title']")?.getAttribute("content")?.trim() ||
    safeHostname(url);

  // Strip everywhere we don't want prose from.
  doc.querySelectorAll(
    "script, style, svg, noscript, iframe, form, button, " +
    "[role='navigation'], nav, header, footer, aside, .ad, .ads",
  ).forEach((el) => el.remove());

  const out: string[] = [];

  const visit = (node: Node) => {
    if (node.nodeType === 3 /* TEXT */) {
      const txt = (node.textContent ?? "").replace(/\s+/g, " ");
      if (txt.trim()) out.push(txt);
      return;
    }
    if (!(node instanceof Element)) return;
    const tag = node.tagName.toLowerCase();
    if (tag === "br") { out.push("\n"); return; }
    if (tag === "a") {
      const text = (node.textContent ?? "").trim();
      const href = node.getAttribute("href");
      if (text) {
        if (href && href !== text && !href.startsWith("javascript:")) {
          out.push(`${text} (${href})`);
        } else {
          out.push(text);
        }
      }
      return; // don't recurse — we already captured text+href
    }
    if (/^h[1-6]$/.test(tag)) {
      out.push("\n## ");
      node.childNodes.forEach(visit);
      out.push("\n");
      return;
    }
    if (tag === "p" || tag === "div" || tag === "section" || tag === "article" || tag === "li") {
      node.childNodes.forEach(visit);
      out.push("\n");
      return;
    }
    node.childNodes.forEach(visit);
  };
  doc.body?.childNodes.forEach(visit);

  const text = out
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { title, text, byteLen: text.length };
}

function safeHostname(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}
