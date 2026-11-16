// Emails: near-black page, light grey type, large tight headings, small uppercase pill labels,
// pixel-art header and thin orange rules. Tables and inline styles only, so Outlook and Gmail
// render it the same way.
import nodemailer from 'nodemailer';
import { searchUrl } from './scan.mjs';
import { openOffers, lastPrice, duration } from './history.mjs';

const ORANGE = '#FC4C02';
const BG = '#111111';
const CARD = '#171717';
const FG = '#cccccc';
const MUTE = '#7d7d7d';
const HAIR = '#2b2b2b';
const SANS = "Geist, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO = "'Geist Mono', Consolas, 'Courier New', monospace";
const PX = 5;

// Side view of a train, nose to the left. # = light, o = orange, . = empty.
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
  return rows
    .map((row) => {
      // Run-length encode the row: one cell per run of identical pixels.
      const tds = row
        .match(/(.)\1*/g)
        .map((run) => {
          const bg = run[0] === '#' ? FG : run[0] === 'o' ? ORANGE : null;
          return `<td width="${run.length * PX}" height="${PX}"${bg ? ` bgcolor="${bg}"` : ''} style="font-size:0;line-height:0;${bg ? `background:${bg};` : ''}">&nbsp;</td>`;
        })
        .join('');
      // One table per row: rows have different numbers of cells, and a shared table would misalign them.
      const w = row.length * PX;
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${w}" style="border-collapse:collapse;width:${w}px"><tr>${tds}</tr></table>`;
    })
    .join('');
}

const fmt = (opts) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', ...opts });
const dayLabel = (date) => fmt({ weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)).replace(/\./g, '');
const longDay = (date) => fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
const stamp = (iso) => fmt({ day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).replace(',', '');
const periodFr = { morning: 'matin', afternoon: 'après-midi' };
const money = (o, p = lastPrice(o)) => (p == null ? '—' : `${p} ${o.cur || '€'}`);

const row = (html, style = '') => `<tr><td style="${style}">${html}</td></tr>`;
const gap = (h) => `<tr><td style="font-size:0;line-height:0;height:${h}px">&nbsp;</td></tr>`;
const rule = (color = HAIR) => `<tr><td style="border-top:1px solid ${color};font-size:0;line-height:0;height:1px">&nbsp;</td></tr>`;
const text = (html, color = FG) => row(html, `font:15px/23px ${SANS};color:${color}`);

// Small uppercase label in a pill, with its number in orange.
const pill = (n, label) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border:1px solid #4d4d4d;border-radius:999px;padding:5px 14px;font:bold 10px ${SANS};letter-spacing:1.2px;color:${FG};white-space:nowrap"><span style="color:${ORANGE}">${n}</span>&nbsp;&nbsp;${label.toUpperCase()}</td></tr></table>`;

function card(n, label, inner) {
  return `<tr><td bgcolor="${CARD}" style="background:${CARD};padding:20px 20px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">
${row(pill(n, label), 'padding-bottom:10px')}${inner}</table></td></tr>`;
}

function table(head, rows) {
  const th = head
    .map((h, i) => `<td style="font:bold 9px ${SANS};letter-spacing:1.1px;color:${MUTE};padding:8px 8px 8px ${i ? 8 : 0}px;border-bottom:1px solid ${HAIR};white-space:nowrap">${h.toUpperCase()}</td>`)
    .join('');
  const trs = rows
    .map(
      (r) =>
        `<tr>${r.map((c, i) => `<td style="font:13px ${MONO};color:${FG};padding:9px 8px 9px ${i ? 8 : 0}px;border-bottom:1px solid ${HAIR};white-space:nowrap">${c}</td>`).join('')}</tr>`,
    )
    .join('');
  return `<tr><td><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse"><tr>${th}</tr>${trs}</table></td></tr>`;
}

const link = (href, label) => `<a href="${href}" style="color:${FG};text-decoration:underline;text-decoration-color:${ORANGE}">${label}</a>`;
const strong = (s) => `<b style="color:#ffffff">${s}</b>`;
const button = (href, label) =>
  row(
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${FG}" style="background:${FG};border-radius:999px;padding:12px 24px"><a href="${href}" style="font:bold 11px ${SANS};letter-spacing:1.2px;color:${BG};text-decoration:none">${label.toUpperCase()} &nbsp;<span style="color:${ORANGE}">&rarr;</span></a></td></tr></table>`,
  );

function shell({ kicker, title, blocks, data, dashboardUrl }) {
  const s = data.status;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"></head>
<body bgcolor="${BG}" style="margin:0;padding:0;background:${BG}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${BG}" style="background:${BG}"><tr><td align="center" style="padding:32px 14px 40px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="620" style="width:620px;max-width:100%;border-collapse:collapse">
<tr><td style="padding-bottom:14px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
  <td valign="bottom" style="font:600 20px ${SANS};letter-spacing:-0.5px;color:${FG}">Snap Watch</td>
  <td valign="bottom" align="right" style="font:500 12px ${SANS};color:${MUTE};white-space:nowrap">${data.route.label}</td>
</tr></table></td></tr>
${rule(ORANGE)}${gap(34)}
${row(pixelArt(TRAIN))}${gap(26)}
${row(kicker.toUpperCase(), `font:bold 10px ${SANS};letter-spacing:1.6px;color:${ORANGE}`)}
${gap(10)}
${row(title, `font:600 34px/36px ${SANS};letter-spacing:-1.6px;color:${FG}`)}
${gap(28)}
${blocks.join(gap(18))}
${gap(30)}${rule()}${gap(12)}
${row(
  `Scan n° ${String(s.scans).padStart(4, '0')} &nbsp;·&nbsp; ${stamp(s.lastOkAt || s.lastScanAt)} (Paris) &nbsp;·&nbsp; ${data.adults} adulte(s)${dashboardUrl ? ` &nbsp;·&nbsp; ${link(dashboardUrl, 'Tableau de bord')}` : ''}<br>Billets Snap : ni échangeables, ni remboursables. Heure exacte du train communiquée au plus tard 48 h avant.`,
  `font:12px/19px ${SANS};color:${MUTE}`,
)}
</table></td></tr></table></body></html>`;
}

const offerUrl = (data, o) => searchUrl({ origin: data.route.origin, destination: data.route.destination, adults: data.adults, date: o.date, time: o.time });
const depart = (o) => `${o.from}${o.to ? `–${o.to}` : ''}`;

function liveBlock(data, n) {
  const open = openOffers(data);
  if (!open.length) return card(n, 'En vente maintenant', text("Aucun billet Snap en vente pour l'instant.", MUTE));
  const rows = open.map((o) => [
    dayLabel(o.date),
    periodFr[o.period],
    depart(o),
    strong(money(o)),
    o.baseline ? `<span style="color:${MUTE}">avant le suivi</span>` : stamp(o.releasedAt),
    link(offerUrl(data, o), 'ouvrir'),
  ]);
  return card(n, 'En vente maintenant', table(['Date', 'Créneau', 'Départ', 'Prix/pers.', 'Sorti le', ''], rows));
}

function closedBlock(data, closed, n) {
  const reason = { sold_out: 'vendu', closed_eve: 'fermé la veille', expired: 'date passée' };
  const rows = closed.map((o) => {
    const start = o.releasedAt || o.firstSeenAt;
    return [dayLabel(o.date), periodFr[o.period], money(o), stamp(o.closedAt), `${o.baseline ? '&ge; ' : ''}${duration(new Date(o.closedAt) - new Date(start))}`, `<span style="color:${MUTE}">${reason[o.closedReason] || ''}</span>`];
  });
  return card(n, 'Partis depuis le dernier mail', table(['Date', 'Créneau', 'Dernier prix', 'Disparu le', 'Resté en vente', ''], rows));
}

// The departure date, always recalled: thin orange line on the left.
function departureBlock(data) {
  const t = data.target;
  return `<tr><td style="border-left:1px solid ${ORANGE};padding:2px 0 2px 16px"><table role="presentation" cellpadding="0" cellspacing="0" border="0">
${row('VOTRE DÉPART', `font:bold 10px ${SANS};letter-spacing:1.4px;color:${MUTE};padding-bottom:4px`)}
${row(longDay(t.date), `font:600 22px/26px ${SANS};letter-spacing:-0.6px;color:#ffffff`)}
${row(`${periodFr[t.slot]} · ${data.route.label} · ${data.adults} adulte(s)`, `font:14px/22px ${SANS};color:${FG}`)}
</table></td></tr>`;
}

export function releasedMail(data, released, closed, dashboardUrl) {
  const n = released.length;
  const rows = released.map((o) => [dayLabel(o.date), periodFr[o.period], depart(o), strong(money(o)), stamp(o.releasedAt), link(offerUrl(data, o), 'réserver')]);
  const blocks = [card('001', 'Nouveaux billets', table(['Date', 'Créneau', 'Départ', 'Prix/pers.', 'Vu à', ''], rows))];
  if (closed.length) blocks.push(closedBlock(data, closed, '002'));
  blocks.push(liveBlock(data, closed.length ? '003' : '002'));
  if (data.target) blocks.push(gap(6), departureBlock(data));
  const days = [...new Set(released.map((o) => dayLabel(o.date)))];
  return {
    subject: `🚄 Snap ${data.route.label} : ${n} nouveau${n > 1 ? 'x' : ''} créneau${n > 1 ? 'x' : ''} (${days.slice(0, 3).join(', ')}${days.length > 3 ? '…' : ''})`,
    html: shell({ kicker: `Eurostar Snap · ${n} nouveau${n > 1 ? 'x' : ''} créneau${n > 1 ? 'x' : ''}`, title: 'Nouveaux billets sur la plateforme.', blocks, data, dashboardUrl }),
  };
}

export function baselineMail(data, dashboardUrl) {
  const blocks = [
    text("Le suivi est en route. Voici ce qui est en vente au premier scan ; à partir de maintenant, chaque nouvelle date ou nouveau créneau déclenche un mail, et l'historique (sorties, ventes, durées) s'accumule sur le tableau de bord."),
    liveBlock(data, '001'),
  ];
  if (data.target) blocks.push(gap(6), departureBlock(data));
  return { subject: `🚄 Snap ${data.route.label} : suivi démarré, état des lieux`, html: shell({ kicker: 'Premier scan', title: 'État des lieux Eurostar Snap.', blocks, data, dashboardUrl }) };
}

// Mails about the target date, sent to everybody: first opening, then every change afterwards.
// Their subject always starts with "Votre départ" (the Outlook rule keeps those in the inbox).
//   kind: 'open' | 'reopen' | 'price' | 'gone' | 'other'
export function targetMail(data, { kind, offer, other, before }, dashboardUrl) {
  const t = data.target;
  const date = longDay(t.date);
  const slot = periodFr[t.slot];
  const big = (o) => row(`<span style="font:600 56px/56px ${SANS};letter-spacing:-3px;color:#ffffff">${money(o)}</span><span style="font:15px ${SANS};color:${MUTE}"> &nbsp;par personne</span>`);
  const how = text(`Le lien ouvre la page Snap avec la date, ${data.adults} adulte(s) et le créneau déjà choisis : il reste à cliquer sur « Continuer », saisir les voyageurs et payer. Rien n'est réservé tant que ce n'est pas payé.`, MUTE);
  const book = (o) => [big(o), text(`Créneau ${periodFr[o.period]}, départ entre ${o.from} et ${o.to || '?'}.`), button(offerUrl(data, o), 'Ouvrir la réservation pré-remplie'), how];
  const cur = offer?.cur || '€';
  const v = {
    open: { kicker: 'Votre date est en vente', title: `Les billets du ${date} sont sortis.`, subject: `c'est ouvert, ${date} ${slot}, ${offer && money(offer)} par personne`, body: () => book(offer) },
    reopen: { kicker: 'De nouveau en vente', title: `Le créneau ${slot} du ${date} est revenu.`, subject: `de nouveau en vente, ${date} ${slot}, ${offer && money(offer)} par personne`, body: () => book(offer) },
    price: {
      kicker: before != null && offer && lastPrice(offer) > before ? 'Le prix monte' : 'Le prix baisse',
      title: `${before} ${cur} → ${offer && money(offer)} par personne.`,
      subject: `le prix passe de ${before} ${cur} à ${offer && money(offer)} (${date} ${slot})`,
      body: () => book(offer),
    },
    gone: {
      kicker: 'Plus en vente',
      title: `Le créneau ${slot} du ${date} n'est plus proposé.`,
      subject: `le créneau ${slot} du ${date} n'est plus en vente`,
      body: () => [
        text(`Dernier prix vu : ${before} ${cur} par personne. Il peut revenir : le suivi continue et préviendra.`),
        ...(other ? [text(`Le créneau ${periodFr[other.period]} du même jour est encore en vente :`), ...book(other)] : []),
      ],
    },
    other: {
      kicker: 'Autre créneau en vente',
      title: `Le ${date}, seul le créneau ${other && periodFr[other.period]} est en vente.`,
      subject: `seul le créneau ${other && periodFr[other.period]} est en vente pour le ${date}`,
      body: () => [text(`Le créneau ${slot} n'est pas proposé pour l'instant. Le suivi continue et préviendra s'il sort.`), ...book(other)],
    },
  }[kind];
  const blocks = [departureBlock(data), gap(4), ...v.body(), gap(6), liveBlock(data, '001')];
  return { subject: `🚄 Votre départ : ${v.subject}`, html: shell({ kicker: v.kicker, title: v.title, blocks, data, dashboardUrl }) };
}

export function errorMail(data, dashboardUrl, recovered = false) {
  const body = recovered
    ? 'Le suivi fonctionne à nouveau.'
    : `Le scan échoue depuis ${data.status.errors} essais consécutifs.<br>Dernière erreur : ${String(data.status.lastError).replace(/</g, '&lt;')}`;
  const blocks = [text(body)];
  if (data.target) blocks.push(gap(6), departureBlock(data));
  return {
    subject: recovered ? `✅ Snap ${data.route.label} : suivi reparti` : `⚠️ Snap ${data.route.label} : suivi en panne`,
    html: shell({ kicker: recovered ? 'Retour à la normale' : 'Suivi en panne', title: recovered ? 'Le scan répond de nouveau.' : 'Le scan ne passe plus.', blocks, data, dashboardUrl }),
  };
}

export async function send({ subject, html }, to, { test = false } = {}) {
  const { SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_USER || !SMTP_PASS) throw new Error('SMTP_USER / SMTP_PASS not set');
  const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST || 'smtp.gmail.com', port: 587, secure: false, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  await transport.sendMail({ from: `"Snap Watch" <${SMTP_USER}>`, to, subject: test ? `[TEST] ${subject}` : subject, html });
}
