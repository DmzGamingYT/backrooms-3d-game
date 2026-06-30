import type { SkillDefinition } from "./types";
import { fetchViaCors } from "./corsFetch";
import { htmlToText } from "./htmlToText";

const PARAM_URL = {
  type: "string" as const,
  description: "URL complète (https://…). Doit pointer vers une page publique.",
};

/**
 * Browse a public URL and return readable text. Best-effort:
 *
 *   1. Try direct fetch (works for CORS-friendly sites like MDN,
 *      many blogs, raw GitHub).
 *   2. Fall back to corsproxy.io / allorigins for opaque servers.
 *   3. Cap output to ~60 KB so the model context isn't blown out.
 *   4. Surface the title + truncated prose to the LLM.
 *
 * DO NOT use this skill to POST credentials, write to a remote,
 * or interact with stateful apps — it's read-only by design.
 */
export const browseUrl: SkillDefinition = {
  name: "browse_url",
  label: "Browse URL",
  category: "browsing",
  description:
    "Lit une page web publique et renvoie son titre + texte lisible. " +
    "Utile pour citer un article, vérifier une information, extraire un mode d'emploi. " +
    "Input : { url: string }. Sortie : title + extrait markdown (~60 KB max).",
  parameters: {
    type: "object",
    properties: { url: PARAM_URL },
    required: ["url"],
  },
  enabled: () => true,
  async execute(args, ctx) {
    const raw = String(args.url ?? "").trim();
    if (!raw) return { ok: false, text: "URL manquante." };
    let parsed: URL;
    try { parsed = new URL(raw); }
    catch { return { ok: false, text: `URL invalide : ${raw}` }; }
    if (!/^https?:$/.test(parsed.protocol)) {
      return { ok: false, text: "Seuls les protocoles http/https sont autorisés." };
    }

    const outcome = await fetchViaCors(parsed.toString(), { capBytes: 60_000 });
    if (!outcome.ok) {
      ctx.notify(`Navigation impossible vers ${parsed.hostname}`);
      return {
        ok: false,
        text: `Impossible de lire ${parsed.toString()} — ${outcome.error ?? "réseau/CORS"}`,
      };
    }
    const { title, text } = htmlToText(outcome.body, parsed.toString());
    const header = `URL: ${parsed.toString()}\nVia: ${outcome.via}\nStatus: ${outcome.status}\nTitle: ${title || "(sans titre)"}\n`;
    if (!text) {
      return { ok: true, text: `${header}\n(Page vide ou non textuelle — probablement un script/JS-only.)` };
    }
    const excerpt = text.length > 8000 ? `${text.slice(0, 8000)}…` : text;
    return {
      ok: true,
      text: `${header}\n${excerpt}`,
      data: { via: outcome.via, status: outcome.status, truncated: outcome.truncated, length: text.length },
    };
  },
};
