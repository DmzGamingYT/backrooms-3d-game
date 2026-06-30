import type { SkillDefinition } from "./types";

/**
 * Two-action skill for the free-form notes scratchpad:
 *   - mode=replace overwrites the whole text
 *   - mode=append concatenates to existing content (newline-separated)
 */
export const manageNotes: SkillDefinition = {
  name: "manage_notes",
  label: "Bloc-notes",
  category: "agentic",
  description:
    "Lit ou écrit dans le bloc-notes scratchpad (synchronisé auto sur le côté). " +
    "Input : { mode: 'read'|'replace'|'append', text?: string }. " +
    "Pour 'read' aucun autre champ n'est nécessaire.",
  parameters: {
    type: "object",
    properties: {
      mode: { type: "string", enum: ["read", "replace", "append"], description: "Mode d'écriture." },
      text: { type: "string", description: "Contenu à écrire (ignoré pour mode=read)." },
    },
    required: ["mode"],
  },
  enabled: () => true,
  async execute(args, ctx) {
    const mode = String(args.mode ?? "read");
    if (mode === "read") {
      const notes = ctx.app.notes.trim();
      if (!notes) return { ok: true, text: "Bloc-notes vide." };
      return { ok: true, text: notes.length > 4000 ? notes.slice(0, 4000) + "…" : notes };
    }
    const text = String(args.text ?? "");
    if (mode === "replace") {
      ctx.app.setNotes(text);
      ctx.notify("Bloc-notes remplacé");
      return { ok: true, text: `Bloc-notes remplacé (${text.length} caractères).` };
    }
    if (mode === "append") {
      const sep = ctx.app.notes.length === 0 || ctx.app.notes.endsWith("\n") ? "" : "\n";
      ctx.app.setNotes(`${ctx.app.notes}${sep}${text}`);
      ctx.notify("Note ajoutée");
      return { ok: true, text: `${text.length} caractères ajoutés au bloc-notes.` };
    }
    return { ok: false, text: `Mode invalide : ${mode}` };
  },
};
