// One scan of Eurostar Snap for the route in settings.json: updates the history, sends the
// emails, and writes the dashboard data. Run every 15 minutes by .github/workflows/watch.yml.
//
//   node track.mjs                normal run
//   node track.mjs --test-mail    sends a sample of each mail style to the first recipient, changes nothing
//   node track.mjs --visible      shows the Chrome window (local debugging)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan } from './lib/scan.mjs';
import { freshData, applyScan, openOffers } from './lib/history.mjs';
import { releasedMail, baselineMail, targetMail, errorMail, send } from './lib/mail.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const flags = new Set(process.argv.slice(2));
const settings = JSON.parse(fs.readFileSync(path.join(root, 'settings.json'), 'utf8'));
const dir = path.resolve(root, process.env.DATA_DIR || 'pages');
const dataFile = path.join(dir, 'data.json');
const dashboardUrl = process.env.DASHBOARD_URL || settings.dashboardUrl || '';
// Everybody gets the movement mails (slots released or gone) and the target-date mails. The first address (owner)
// also gets the housekeeping ones: first scan, watcher broken, watcher back.
const recipients = (process.env.MAIL_TO || '').split(/[,; ]+/).filter(Boolean);
const owner = recipients[0];
const log = (m) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);

fs.mkdirSync(dir, { recursive: true });
const data = fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile, 'utf8')) : freshData(settings);
// Settings can change between runs (new target date, more adults...).
data.route = settings.route;
data.adults = settings.adults;
data.target = settings.target || null;
const byId = (ids) => ids.map((id) => data.offers.find((o) => o.id === id)).filter(Boolean);

if (flags.has('--test-mail')) {
  const open = openOffers(data);
  if (!open.length) throw new Error('no open offer in data.json to build a sample from; run a normal scan first');
  const sample = open.slice(0, 2).map((o) => ({ ...o, baseline: false, releasedAt: o.releasedAt || o.firstSeenAt }));
  const gone = data.offers.filter((o) => o.closedAt).slice(-2);
  await send(releasedMail(data, sample, gone, dashboardUrl), owner, { test: true });
  if (gone.length) await send(releasedMail(data, [], gone, dashboardUrl), owner, { test: true });
  if (data.target) {
    const offer = { ...open[0], date: data.target.date, period: data.target.slot };
    await send(targetMail(data, { kind: 'open', offer }, dashboardUrl), owner, { test: true });
    await send(targetMail(data, { kind: 'price', offer, before: offer.prices[0].price - 10 }, dashboardUrl), owner, { test: true });
  }
  log(`test mails sent to the first recipient`);
  process.exit(0);
}

const now = new Date();
data.status.lastScanAt = now.toISOString();
let snap = null;
try {
  snap = await scan({ ...settings.route, adults: settings.adults, alwaysCheck: settings.target ? [settings.target.date] : [], visible: flags.has('--visible') });
} catch (e) {
  data.status.errors++;
  data.status.lastError = String(e.message || e).split('\n')[0];
  log(`scan failed (${data.status.errors} in a row): ${data.status.lastError}`);
}

const trySend = async (what, mail, to) => {
  if (!to || !to.length) return log(`${what}: no recipient configured`), false;
  try {
    await send(mail, to);
    log(`${what}: mail sent to ${[].concat(to).length} recipient(s)`);
    return true;
  } catch (e) {
    log(`${what}: mail failed, will retry next scan (${String(e.message).split('\n')[0]})`);
    return false;
  }
};

if (snap) {
  const wasBroken = data.status.errorAlertSent;
  const first = data.status.scans === 0;
  const events = applyScan(data, snap, now);
  data.status.errors = 0;
  data.status.lastError = null;
  const unknown = Object.values(snap.dates).filter((d) => d.state === 'unknown').length;
  log(`scan ok: ${openOffers(data).length} slot(s) on sale over ${snap.calendar.length} date(s); +${events.released.length} released, -${events.closed.length} gone, ${events.priceChanges.length} price change(s)${unknown ? `, ${unknown} page(s) unreadable` : ''}`);

  // The outbox keeps what still has to be mailed, so a failed send is retried at the next scan.
  if (first) data.outbox.baseline = true;
  data.outbox.released.push(...events.released.map((o) => o.id));
  data.outbox.closed.push(...events.closed.filter((o) => o.closedReason !== 'expired').map((o) => o.id));

  if (wasBroken && (await trySend('recovery', errorMail(data, dashboardUrl, true), owner))) data.status.errorAlertSent = false;
  if (data.outbox.baseline && (await trySend('baseline', baselineMail(data, dashboardUrl), owner))) data.outbox.baseline = false;
  // One mail per scan where slots appeared or vanished (a slot whose date has passed does not count).
  if ((data.outbox.released.length || data.outbox.closed.length) && (await trySend('movement', releasedMail(data, byId(data.outbox.released), byId(data.outbox.closed), dashboardUrl), recipients))) {
    data.outbox.released = [];
    data.outbox.closed = [];
  }

  // The target date: everybody is told when it opens, and then at every change for as long as
  // the trip is ahead (price change, slot gone, slot back, other slot of that day opening).
  const t = data.target;
  if (t) {
    const key = `${t.date}|${t.slot}`;
    if (!data.targetState || data.targetState.key !== key) data.targetState = { key, open: false, price: null, everOpen: false, other: false };
    const ts = data.targetState;
    const readable = snap.dates[t.date]?.state !== 'unknown';
    const sameDay = openOffers(data).filter((o) => o.date === t.date);
    const hit = sameDay.find((o) => o.period === t.slot);
    const other = sameDay.find((o) => o.period !== t.slot);
    const price = hit ? hit.prices[hit.prices.length - 1].price : null;
    const tell = (kind, extra) => trySend(`target ${kind}`, targetMail(data, { kind, offer: hit, other, ...extra }, dashboardUrl), recipients);

    if (hit && !ts.open) {
      if (await tell(ts.everOpen ? 'reopen' : 'open')) Object.assign(ts, { open: true, everOpen: true, price });
    } else if (hit && ts.open && price !== ts.price) {
      if (await tell('price', { before: ts.price })) ts.price = price;
    } else if (!hit && ts.open && readable) {
      if (await tell('gone', { before: ts.price })) Object.assign(ts, { open: false, price: null });
    }
    // The other slot of the same day, when the wanted one is not on sale.
    if (!hit && other && !ts.other && readable) {
      if (await tell('other')) ts.other = true;
    } else if (!other && readable) ts.other = false;
  }
} else if (data.status.errors >= 6 && !data.status.errorAlertSent) {
  // Six failed scans in a row: say so once, so a broken watcher is never silent.
  if (await trySend('error alert', errorMail(data, dashboardUrl), owner)) data.status.errorAlertSent = true;
}

fs.writeFileSync(dataFile, JSON.stringify(data, null, 1));
fs.copyFileSync(path.join(root, 'site', 'index.html'), path.join(dir, 'index.html'));
