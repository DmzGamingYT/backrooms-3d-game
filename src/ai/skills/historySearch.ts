import type { SkillDefinition } from "./types";

/**
 * Search the persisted Solis transcript (user + assistant entries) for
 * a keyword or phrase. Returns up to `limit` matches with timestamps.
 * Implicit cap (8) keeps model context tight.
 */
export const searchHistory: SkillDefinition = {
  name: "search_history",
  label: "Recherche historique",
  category: "agentic",
  description:
    "Cherche un mot ou une phrase dans l'historique de conversation Solis. " +
    "Renvoie les tours correspondants (avec horodatage). " +
    "Input : { query: string, limit?: number }. " +
    "limit par défaut : 8 ; maximum : 20.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Mot-clé ou phrase à chercher (sensible à la casse)." },
      limit: { type: "number", description: "Nombre maximum de résultats (défaut 8, max 20)." },
    },
    required: ["query"],
  },
  enabled: () => true,
  async execute(args, ctx) {
    const q = String(args.query ?? "").trim();
    if (!q) return { ok: false, text: "Query manquante." };
    const limit = Math.max(1, Math.min(20, Number(args.limit ?? 8)));
    const text = ctx.app.findHistory(q, limit).trim();
    if (!text) return { ok: true, text: `Aucun passage de l'historique ne contient « ${q} ».` };
    return { ok: true, text };
  },
};
