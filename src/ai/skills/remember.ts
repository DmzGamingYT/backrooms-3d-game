import type { SkillDefinition } from "./types";

/**
 * Persistent facts store (key → string value) the LLM can use to
 * remember details about the user across sessions (preferences,
 * trusted webhook URLs, names, recurring constraints). Backed by
 * localStorage so survives reloads.
 *
 * Single skill = single round-trip via action discriminator.
 */
export const rememberFactSkill: SkillDefinition = {
  name: "remember_fact",
  label: "Mémoire clé/valeur",
  category: "agentic",
  description:
    "Mémoire clé → valeur persistante (localStorage). " +
    "Actions : 'list' (énumérer), 'get' (lire via 'key'), 'set' (écrire 'key'+'value'), " +
    "'delete' (effacer via 'key'). " +
    "Utile pour mémoriser les préférences de l'utilisateur d'une session à l'autre. " +
    "Input : { action: 'list'|'get'|'set'|'delete', key?: string, value?: string }.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["list", "get", "set", "delete"], description: "Action." },
      key:    { type: "string", description: "Clé (lecture/écriture/suppression)." },
      value:  { type: "string", description: "Valeur (action=set)." },
    },
    required: ["action"],
  },
  enabled: () => true,
  async execute(args, ctx) {
    const action = String(args.action ?? "");
    const key = String(args.key ?? "").trim().toLowerCase();
    const value = String(args.value ?? "");
    switch (action) {
      case "list": {
        const facts = ctx.app.rememberFacts();
        const keys = Object.keys(facts);
        if (keys.length === 0) return { ok: true, text: "Aucun fait mémorisé." };
        return { ok: true, text: keys.map((k) => `- ${k} = ${facts[k]}`).join("\n") };
      }
      case "get":
        if (!key) return { ok: false, text: "Clé manquante." };
        return { ok: true, text: ctx.app.rememberFacts()[key] ?? "(non défini)" };
      case "set":
        if (!key) return { ok: false, text: "Clé manquante." };
        if (!value) return { ok: false, text: "Valeur manquante." };
        ctx.app.rememberFact(key, value);
        ctx.notify(`Mémoire : ${key} enregistré`);
        return { ok: true, text: `Mémorisé : ${key} = ${value}` };
      case "delete":
        if (!key) return { ok: false, text: "Clé manquante." };
        ctx.app.forgetFact(key);
        ctx.notify(`Mémoire : ${key} effacé`);
        return { ok: true, text: `Oublié : ${key}` };
      default:
        return { ok: false, text: `Action inconnue : ${action}` };
    }
  },
};
