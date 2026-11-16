// Turns successive scans into a history of "offers": one offer = one time slot of one travel
// date, from the scan where it appeared to the scan where it was gone.
import { parisDay } from './scan.mjs';

export function freshData(settings) {
  return {
    route: settings.route,
    adults: settings.adults,
    target: settings.target || null,
    status: { scans: 0, lastScanAt: null, lastOkAt: null, errors: 0, errorAlertSent: false, lastError: null },
    targetNotified: null,
    outbox: { released: [], closed: [], baseline: false },
    offers: [],
  };
}

function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Applies one successful scan. Returns what changed: { released, closed, priceChanges }.
export function applyScan(data, snap, now = new Date()) {
  const at = now.toISOString();
  const today = parisDay(now);
  const baseline = data.status.scans === 0;
  const prevOk = data.status.lastOkAt;
  const events = { released: [], closed: [], priceChanges: [] };
  const seen = new Set();

  for (const o of data.offers.filter((x) => !x.closedAt)) {
    const day = snap.dates[o.date];
    if (day && day.state === 'unknown') {
      seen.add(`${o.date}|${o.period}`); // page unreadable this time: keep the offer as it is
      continue;
    }
    const slot = day && day.state === 'slots' ? day.slots.find((s) => s.period === o.period) : null;
    if (slot) {
      seen.add(`${o.date}|${o.period}`);
      o.lastSeenAt = at;
      const last = o.prices[o.prices.length - 1];
      if (slot.price != null && last && slot.price !== last.price) {
        o.prices.push({ at, price: slot.price });
        events.priceChanges.push({ offer: o, from: last.price, to: slot.price });
      }
    } else {
      o.closedAt = at;
      // Snap stops selling the day before travel: a slot that vanishes then was not necessarily sold.
      o.closedReason = o.date <= today ? 'expired' : o.date === addDays(today, 1) ? 'closed_eve' : 'sold_out';
      events.closed.push(o);
    }
  }

  for (const [date, day] of Object.entries(snap.dates)) {
    if (day.state !== 'slots') continue;
    for (const s of day.slots) {
      if (seen.has(`${date}|${s.period}`)) continue;
      const o = {
        id: `${date}|${s.period}|${at}`,
        date,
        period: s.period,
        time: s.time,
        from: s.from,
        to: s.to,
        cur: s.cur,
        // On the very first scan the real release time is unknown: the slot was already on sale.
        baseline,
        releasedAt: baseline ? null : at,
        notBefore: baseline ? null : prevOk, // release happened between notBefore and releasedAt
        firstSeenAt: at,
        lastSeenAt: at,
        closedAt: null,
        closedReason: null,
        prices: [{ at, price: s.price }],
      };
      data.offers.push(o);
      if (!baseline) events.released.push(o);
    }
  }

  data.status.scans++;
  data.status.lastOkAt = at;
  return events;
}

export const openOffers = (data) =>
  data.offers.filter((o) => !o.closedAt).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

export const lastPrice = (o) => o.prices[o.prices.length - 1].price;

// "3 j 4 h", "5 h 20", "40 min"
export function duration(ms) {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${String(min % 60).padStart(2, '0')}`;
  return `${Math.floor(h / 24)} j ${h % 24} h`;
}
