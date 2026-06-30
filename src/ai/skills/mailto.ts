import type { SkillDefinition } from "./types";

/**
 * Open the user's mail client pre-filled with a to/subject/body triplet
 * via a `mailto:` URL. The user still has to press "Send" in their mail
 * client — we cannot actually send email from a browser without a
 * backend.
 */
export const openMailto: SkillDefinition = {
  name: "open_mailto",
  label: "Mailto link",
  category: "communication",
  description:
    "Ouvre un mail pré-rempli dans le client mail de l'utilisateur. " +
    "L'utilisateur devra appuyer sur Envoyer — un navigateur ne peut pas envoyer de mail tout seul. " +
    "Le client mail s'ouvre avec destinataire, sujet et corps déjà remplis. " +
    "Input : { to: string, subject: string, body: string }.",
  parameters: {
    type: "object",
    properties: {
      to:      { type: "string", description: "Adresse destinataire (ex: amie@domaine.fr)." },
      subject: { type: "string", description: "Sujet du mail." },
      body:    { type: "string", description: "Corps du mail (Markdown léger autorisé, souvent converti en texte)." },
    },
    required: ["to", "subject", "body"],
  },
  enabled: () => true,
  async execute(args, ctx) {
    const to = String(args.to ?? "").trim();
    const subject = String(args.subject ?? "").trim();
    const body = String(args.body ?? "");
    if (!to) return { ok: false, text: "Adresse destinataire manquante." };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return { ok: false, text: `Adresse invalide : ${to}` };
    }
    ctx.openMailto(to, subject, body);
    ctx.notify("Mail ouvert dans votre client mail");
    return { ok: true, text: `Mail pré-rempli pour ${to} (sujet : « ${subject || "(sans sujet)"} »).`, data: { to, subject, length: body.length } };
  },
};
