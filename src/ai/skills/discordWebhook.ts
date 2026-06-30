import type { SkillDefinition } from "./types";

/**
 * Post a single message to a Discord webhook URL configured by the user
 * (stored in BackendConfig.discordWebhookUrl, surfaced in the Backend
 * popover). Discord accepts browser CORS for webhook endpoints so this
 * works server-side-less; the webhook URL itself authenticates the
 * message.
 *
 * If no webhook URL is configured the skill returns ok=false so the
 * LLM can prompt the user instead of silently dropping the request.
 */
export const discordWebhook: SkillDefinition = {
  name: "discord_post_webhook",
  label: "Discord webhook",
  category: "communication",
  description:
    "Envoie un message à un salon Discord via son URL de webhook. " +
    "L'utilisateur doit avoir collé l'URL dans la carte Backend. " +
    "Input : { content: string, username?: string }. " +
    "Limite Discord : 2000 caractères par message.",
  parameters: {
    type: "object",
    properties: {
      content:  { type: "string", description: "Texte du message (≤ 2000 caractères)." },
      username: { type: "string", description: "Nom d'affichage (optionnel, défaut 'Solis')." },
    },
    required: ["content"],
  },
  enabled: () => true,
  async execute(args, ctx) {
    const url = ctx.app.discordWebhookUrl() ?? "";
    if (!url) return { ok: false, text: "Aucune URL de webhook Discord configurée. Demande à l'utilisateur de la coller dans la carte Backend." };
    if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(url)) {
      return { ok: false, text: "URL de webhook invalide — doit commencer par https://discord.com/api/webhooks/…" };
    }
    const content = String(args.content ?? "").slice(0, 2000);
    const username = String(args.username ?? "Solis");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, username }),
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 200);
        return { ok: false, text: `Discord a refusé (HTTP ${res.status}) : ${detail}` };
      }
      ctx.notify("Message envoyé sur Discord");
      return { ok: true, text: `Message Discord envoyé (${content.length} caractères).`, data: { status: res.status, length: content.length } };
    } catch (err) {
      return { ok: false, text: `Erreur réseau Discord : ${(err as Error)?.message ?? err}` };
    }
  },
};
