/**
 * Strip every Markdown artefact so TTS reads the reply naturally and the
 * transcript shows clean prose. Conservative — only handles shapes small
 * open models actually emit; doesn't try to be a full CommonMark → text
 * converter.
 *
 *   "**hello**"   -> "hello"
 *   "# Title"     -> "Title"
 *   "- bullet"    -> "bullet"
 *   "[text](url)" -> "text"
 */
export function stripMarkdown(s: string): string {
  if (!s) return "";
  return s
    .replace(/```[\s\S]*?```/g, "")              // fenced code blocks
    .replace(/`([^`]+)`/g, "$1")                 // inline code
    .replace(/^[ \t]*#{1,6}[ \t]*?/gm, "")       // ATX headings
    .replace(/\*\*([^*]+)\*\*/g, "$1")            // bold **text**
    .replace(/__([^_]+)__/g, "$1")                // bold __text__
    .replace(/\*([^*]+)\*/g, "$1")                // italic *text*
    .replace(/_([^_]+)_/g, "$1")                  // italic _text_
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")      // links → text
    .replace(/^[ \t]*[-*+][ \t]+/gm, "")          // bullet prefixes
    .replace(/^[ \t]*>\s?/gm, "")                 // blockquote
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
