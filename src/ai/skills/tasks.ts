import type { SkillDefinition } from "./types";

const ACTION_PARAM = {
  type: "string" as const,
  description: "Action à effectuer.",
  enum: ["list", "add", "remove", "toggle", "clear_done"],
};

/**
 * Manage the in-app task list. Single skill = single round-trip; the
 * LLM picks the action via the `action` parameter.
 */
export const manageTasks: SkillDefinition = {
  name: "manage_tasks",
  label: "Gérer les tâches",
  category: "agentic",
  description:
    "Lit ou modifie la liste de tâches de l'utilisateur. " +
    "Actions disponibles : 'list' (énumérer), 'add' (ajouter 'text'), " +
    "'remove' (supprimer via 'id'), 'toggle' (basculer l'état via 'id'), " +
    "'clear_done' (supprimer toutes les tâches cochées). " +
    "Input : { action: 'list'|'add'|'remove'|'toggle'|'clear_done', text?: string, id?: string }.",
  parameters: {
    type: "object",
    properties: {
      action: ACTION_PARAM,
      text:   { type: "string", description: "Texte de la tâche (pour action=add)." },
      id:     { type: "string", description: "Identifiant de tâche (pour action=remove|toggle)." },
    },
    required: ["action"],
  },
  enabled: () => true,
  async execute(args, ctx) {
    const action = String(args.action ?? "");
    switch (action) {
      case "list": {
        const tasks = ctx.app.tasks;
        if (tasks.length === 0) return { ok: true, text: "Aucune tâche en cours." };
        const lines = tasks
          .map((t) => `- [${t.done ? "x" : " "}] ${t.id.slice(0, 6)} ${t.text}`)
          .join("\n");
        return { ok: true, text: `${tasks.length} tâche(s) :\n${lines}` };
      }
      case "add": {
        const text = String(args.text ?? "").trim();
        if (!text) return { ok: false, text: "Texte de tâche manquant." };
        ctx.app.addTask(text);
        ctx.notify(`Tâche ajoutée : ${text}`);
        return { ok: true, text: `Tâche ajoutée : « ${text} ».` };
      }
      case "remove": {
        const id = String(args.id ?? "");
        const target = ctx.app.tasks.find((t) => t.id === id || t.id.startsWith(id));
        if (!target) {
          const short = ctx.app.tasks.map((t) => `${t.id.slice(0, 6)} ${t.text}`).join("\n");
          return { ok: false, text: `Tâche introuvable pour id=${id}.\nTâches existantes :\n${short}` };
        }
        ctx.app.removeTask(target.id);
        ctx.notify(`Tâche supprimée : ${target.text}`);
        return { ok: true, text: `Tâche supprimée : « ${target.text} ».` };
      }
      case "toggle": {
        const id = String(args.id ?? "");
        const target = ctx.app.tasks.find((t) => t.id === id || t.id.startsWith(id));
        if (!target) return { ok: false, text: `Tâche introuvable pour id=${id}.` };
        ctx.app.toggleTask(target.id);
        ctx.notify(`Tâche mise à jour : ${target.text}`);
        return { ok: true, text: `Tâche « ${target.text} » → ${target.done ? "à faire" : "faite"}.` };
      }
      case "clear_done": {
        const removed = ctx.app.tasks.filter((t) => t.done).length;
        ctx.app.clearDoneTasks();
        ctx.notify(`${removed} tâche(s) terminée(s) effacée(s)`);
        return { ok: true, text: `${removed} tâche(s) cochée(s) supprimée(s).` };
      }
      default:
        return { ok: false, text: `Action inconnue : ${action}` };
    }
  },
};
