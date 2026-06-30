import type { SkillDefinition } from "./types";

/**
 * Save a text payload to the user's Downloads folder via the browser's
 * anchor.download flow. The download only fires if the user has a
 * working file-system handler (all browsers); on iOS Safari a tab opens
 * with the blob content instead.
 */
export const downloadText: SkillDefinition = {
  name: "download_text",
  label: "Save text file",
  category: "agentic",
  description:
    "Enregistre un texte dans le dossier Téléchargements de l'utilisateur. " +
    "Utile pour exporter une liste, une recette, un mémo. " +
    "Input : { filename: string, content: string, mime?: string }. " +
    "mime par défaut : text/plain; charset=utf-8.",
  parameters: {
    type: "object",
    properties: {
      filename: { type: "string", description: "Nom de fichier (ex: notes-2026-06-30.md). Extension recommandée." },
      content:  { type: "string", description: "Contenu à enregistrer." },
      mime:     { type: "string", description: "Type MIME optionnel (défaut text/plain; charset=utf-8).",
                  enum: ["text/plain; charset=utf-8", "text/markdown; charset=utf-8", "application/json", "text/csv; charset=utf-8"] },
    },
    required: ["filename", "content"],
  },
  enabled: () => true,
  async execute(args, ctx) {
    const filename = String(args.filename ?? "").trim();
    const content  = String(args.content  ?? "");
    const mime     = String(args.mime ?? "text/plain; charset=utf-8");
    if (!filename) return { ok: false, text: "Nom de fichier manquant." };
    if (!/^[\w.-]+$/.test(filename)) {
      return { ok: false, text: `Nom de fichier invalide : ${filename}` };
    }
    await ctx.saveBlob(filename, new Blob([content], { type: mime }));
    ctx.notify(`${filename} enregistré dans Téléchargements`);
    return {
      ok: true,
      text: `Fichier ${filename} (${content.length} caractères, ${mime}) envoyé au dossier Téléchargements.`,
      data: { filename, mime, size: content.length },
    };
  },
};
