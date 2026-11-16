// Emails: black and white, monospace, pixel-art header, thin orange rules.
// Built with tables and inline styles only, so Outlook and Gmail render it the same way.
import nodemailer from 'nodemailer';
import { searchUrl } from './scan.mjs';
import { openOffers, lastPrice, duration } from './history.mjs';

const ORANGE = '#FC4C02';
const INK = '#000000';
const GREY = '#6b6b6b';
const FONT = "'Courier New', Courier, monospace";
const PX = 5;

// Side view of a train, nose to the left. # = black, o = orange, . = empty.
const TRAIN = [
  '..........######################',
  '.......#########################',
  '.....####..##..##..##..##..##.##',
  '...######..##..##..##..##..##.##',
  '..##############################',
  '.###############################',
  'oooooooooooooooooooooooooooooooo',
  '################################',
  '...###.......###.......###......',
  '....#.........#.........#.......',
];

function pixelArt(rows) {
  const tr = rows
    .map((row) => {
      // Run-length encode the row: one cell per run of identical pixels.
      const runs = row.match(/(.)\1*/g);
      const tds = runs
        .map((run) => {
          const bg = run[0] === '#' ? INK : run[0] === 'o' ? ORANGE : null;
          return `<td width="${run.length * PX}" height="${PX}" style="font-size:0;line-height:0;${bg ? `background:${bg};` : ''}">&nbsp;</td>`;
        })
        .join('');
      // One table per row: rows have different numbers of cells, and a shared table would misalign them.
      const w = row.length * PX;
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${w}" style="border-collapse:collapse;width:${w}px"><tr>${tds}</tr></table>`;
    })
    .join('');
  return tr;
}

const fmt = (opts) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', ...opts });
const dayLabel = (date) => fmt({ weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)).replace(/\./g, '').toUpperCase();
const longDay = (date) => fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
const stamp = (iso) => fmt({ day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).replace(',', '');
const PERIOD = { morning: 'MATIN', afternoon: 'APRÈS-MIDI' };
const periodFr = { morning: 'matin', afternoon: 'après-midi' };
const money = (o, p = lastPrice(o)) => (p == null ? '—' : `${p} ${o.cur || '€'}`);

const rule = `<tr><td style="border-top:1px solid ${ORANGE};font-size:0;line-height:0;height:1px">&nbsp;</td></tr>`;
const gap = (h) => `<tr><td style="font-size:0;line-height:0;height:${h}px">&nbsp;</td></tr>`;
const label = (n, text) =>
  `<tr><td style="font:bold 11px ${FONT};letter-spacing:2px;color:${INK};padding:0 0 8px"><span style="color:${ORANGE}">${n}</span>&nbsp;&nbsp;${text}</td></tr>`;

function table(head, rows) {
  const th = head
    .map((h, i) => `<td style="font:bold 10px ${FONT};letter-spacing:1px;color:${GREY};padding:6px 10px 6px ${i ? 10 : 0}px;border-bottom:1px solid ${INK};white-space:nowrap">${h}</td>`)
    .join('');
  const trs = rows
    .map(
      (r) =>
        `<tr>${r
          .map((c, i) => `<td style="font:13px ${FONT};color:${INK};padding:7px 10px 7px ${i ? 10 : 0}px;border-bottom:1px dotted #b5b5b5;white-space:nowrap">${c}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  return `<tr><td><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse"><tr>${th}</tr>${trs}</table></td></tr>`;
}

const link = (href, text) => `<a href="${href}" style="color:${INK};text-decoration:underline;text-decoration-color:${ORANGE}">${text}</a>`;
const button = (href, text) =>
  `<tr><td><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${INK};border:1px solid ${INK};padding:11px 20px"><a href="${href}" style="font:bold 12px ${FONT};letter-spacing:2px;color:#ffffff;text-decoration:none">${text} <span style="color:${ORANGE}">&gt;&gt;</span></a></td></tr></table></td></tr>`;

function shell({ kicker, title, blocks, data, dashboardUrl }) {
  const s = data.status;
  return `<!doctype html><html lang="fr"><body style="margin:0;padding:0;background:#ffffff">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#ffffff"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:100%;border-collapse:collapse">
<tr><td><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
  <td valign="bottom">${pixelArt(TRAIN)}</td>
  <td valign="bottom" align="right" style="font:10px ${FONT};letter-spacing:2px;color:${GREY};white-space:nowrap">SNAP/WATCH<br><span style="color:${INK}">${data.route.label.toUpperCase()}</span></td>
</tr></table></td></tr>
${rule}${gap(22)}
<tr><td style="font:bold 10px ${FONT};letter-spacing:3px;color:${ORANGE}">${kicker}</td></tr>
${gap(8)}
<tr><td style="font:bold 24px ${FONT};line-height:30px;color:${INK};letter-spacing:-0.5px">${title}</td></tr>
${gap(22)}
${blocks.join(gap(26))}
${gap(28)}${rule}${gap(10)}
<tr><td style="font:10px ${FONT};line-height:16px;letter-spacing:1px;color:${GREY}">SCAN N° ${String(s.scans).padStart(4, '0')} &nbsp;·&nbsp; ${stamp(s.lastOkAt || s.lastScanAt)} (PARIS) &nbsp;·&nbsp; ${data.adults} ADULTE(S)${dashboardUrl ? ` &nbsp;·&nbsp; ${link(dashboardUrl, 'TABLEAU DE BORD')}` : ''}<br>Billets Snap : ni échangeables, ni remboursables. Heure exacte du train communiquée au plus tard 48 h avant.</td></tr>
</table></td></tr></table></body></html>`;
}

const offerUrl = (data, o) => searchUrl({ origin: data.route.origin, destination: data.route.destination, adults: data.adults, date: o.date, time: o.time });

function liveBlock(data, n) {
  const open = openOffers(data);
  if (!open.length) return [label(n, 'EN VENTE MAINTENANT'), `<tr><td style="font:13px ${FONT};color:${GREY}">Aucun billet Snap en vente pour l'instant.</td></tr>`].join('');
  const rows = open.map((o) => [
    dayLabel(o.date),
    PERIOD[o.period],
    `${o.from}${o.to ? `–${o.to}` : ''}`,
    `<b>${money(o)}</b>`,
    o.baseline ? `<span style="color:${GREY}">avant le suivi</span>` : stamp(o.releasedAt),
    link(offerUrl(data, o), 'ouvrir'),
  ]);
  return [label(n, 'EN VENTE MAINTENANT'), table(['DATE', 'CRÉNEAU', 'DÉPART', 'PRIX/PERS.', 'SORTI LE', ''], rows)].join('');
}

function closedBlock(data, closed, n) {
  const reason = { sold_out: 'vendu', closed_eve: 'fermé la veille', expired: 'date passée' };
  const rows = closed.map((o) => {
    const start = o.releasedAt || o.firstSeenAt;
    return [
      dayLabel(o.date),
      PERIOD[o.period],
      money(o),
      stamp(o.closedAt),
      `${o.baseline ? '&ge; ' : ''}${duration(new Date(o.closedAt) - new Date(start))}`,
      reason[o.closedReason] || '',
    ];
  });
  return [label(n, 'PARTIS DEPUIS LE DERNIER MAIL'), table(['DATE', 'CRÉNEAU', 'DERNIER PRIX', 'DISPARU LE', 'RESTÉ EN VENTE', ''], rows)].join('');
}

function departureBlock(data) {
  const t = data.target;
  return `<tr><td style="border-left:3px solid ${ORANGE};padding:4px 0 4px 14px;font:13px ${FONT};line-height:20px;color:${INK}"><span style="font:bold 10px ${FONT};letter-spacing:2px;color:${GREY}">VOTRE DÉPART</span><br><b style="font-size:16px">${longDay(t.date)}</b><br>${periodFr[t.slot]} · ${data.route.label} · ${data.adults} adulte(s)</td></tr>`;
}

export function releasedMail(data, released, closed, dashboardUrl) {
  const n = released.length;
  const rows = released.map((o) => [dayLabel(o.date), PERIOD[o.period], `${o.from}${o.to ? `–${o.to}` : ''}`, `<b>${money(o)}</b>`, stamp(o.releasedAt), link(offerUrl(data, o), 'réserver')]);
  const blocks = [[label('001', 'NOUVEAUX BILLETS'), table(['DATE', 'CRÉNEAU', 'DÉPART', 'PRIX/PERS.', 'VU À', ''], rows)].join('')];
  if (closed.length) blocks.push(closedBlock(data, closed, '002'));
  blocks.push(liveBlock(data, closed.length ? '003' : '002'));
  const days = [...new Set(released.map((o) => dayLabel(o.date)))];
  return {
    subject: `🚄 Snap ${data.route.label} : ${n} nouveau${n > 1 ? 'x' : ''} créneau${n > 1 ? 'x' : ''} (${days.slice(0, 3).join(', ')}${days.length > 3 ? '…' : ''})`,
    html: shell({ kicker: 'NOUVELLE SORTIE', title: `${n} créneau${n > 1 ? 'x' : ''} Snap vien${n > 1 ? 'nent' : 't'} d'ouvrir.`, blocks, data, dashboardUrl }),
  };
}

export function baselineMail(data, dashboardUrl) {
  const blocks = [
    `<tr><td style="font:13px ${FONT};line-height:21px;color:${INK}">Le suivi est en route. Voici ce qui est en vente au premier scan ; à partir de maintenant, chaque nouvelle date ou nouveau créneau déclenche un mail, et l'historique (sorties, ventes, durées) s'accumule sur le tableau de bord.</td></tr>`,
    liveBlock(data, '001'),
  ];
  if (data.target) blocks.push(departureBlock(data));
  return { subject: `🚄 Snap ${data.route.label} : suivi démarré, état des lieux`, html: shell({ kicker: 'PREMIER SCAN', title: 'État des lieux Eurostar Snap.', blocks, data, dashboardUrl }) };
}

export function targetMail(data, offer, dashboardUrl) {
  const blocks = [
    departureBlock(data),
    `<tr><td style="font:15px ${FONT};line-height:24px;color:${INK}">Créneau ${periodFr[offer.period]}, départ entre ${offer.from} et ${offer.to || '?'} :<br><b style="font-size:26px">${money(offer)}</b> par personne.</td></tr>`,
    button(offerUrl(data, offer), 'OUVRIR LA RÉSERVATION PRÉ-REMPLIE'),
    `<tr><td style="font:12px ${FONT};line-height:19px;color:${GREY}">Le lien ouvre la page Snap avec la date, ${data.adults} adulte(s) et le créneau déjà choisis : il reste à cliquer sur « Continuer », saisir les voyageurs et payer. Rien n'est réservé tant que ce n'est pas payé.</td></tr>`,
    liveBlock(data, '001'),
  ];
  return {
    subject: `🚄 C'est ouvert : Snap ${data.route.label}, ${longDay(data.target.date)} ${periodFr[offer.period]}, ${money(offer)} par personne`,
    html: shell({ kicker: 'VOTRE DATE EST EN VENTE', title: `Les billets du ${longDay(data.target.date)} sont sortis.`, blocks, data, dashboardUrl }),
  };
}

export function errorMail(data, dashboardUrl, recovered = false) {
  const text = recovered
    ? 'Le suivi fonctionne à nouveau.'
    : `Le scan échoue depuis ${data.status.errors} essais consécutifs.<br>Dernière erreur : ${String(data.status.lastError).replace(/</g, '&lt;')}`;
  const blocks = [`<tr><td style="font:13px ${FONT};line-height:21px;color:${INK}">${text}</td></tr>`];
  if (data.target) blocks.push(departureBlock(data));
  return {
    subject: recovered ? `✅ Snap ${data.route.label} : suivi reparti` : `⚠️ Snap ${data.route.label} : suivi en panne`,
    html: shell({ kicker: recovered ? 'RETOUR À LA NORMALE' : 'SUIVI EN PANNE', title: recovered ? 'Le scan répond de nouveau.' : 'Le scan ne passe plus.', blocks, data, dashboardUrl }),
  };
}

export async function send({ subject, html }, to, { test = false } = {}) {
  const { SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_USER || !SMTP_PASS) throw new Error('SMTP_USER / SMTP_PASS not set');
  const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST || 'smtp.gmail.com', port: 587, secure: false, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  await transport.sendMail({ from: `"Snap Watch" <${SMTP_USER}>`, to, subject: test ? `[TEST] ${subject}` : subject, html });
}
