// Checks whether Eurostar Snap tickets are on sale for one date, by opening the public
// Snap search page in the locally installed Chrome, exactly like a visitor would.
// Prints one JSON line on stdout. It never goes past the search results (no booking).
//
//   node watch.mjs --origin 8727100 --destination 7015400 --date 2026-12-06 --adults 2 [--visible] [--shot file.png]
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
    return acc;
  }, []),
);
for (const k of ['origin', 'destination', 'date']) {
  if (!args[k] || args[k] === true) {
    console.log(JSON.stringify({ status: 'error', error: `missing --${k}` }));
    process.exit(2);
  }
}
const adults = Number(args.adults || 1);
const market = args.market || 'fr-fr';
const base = `https://snap.eurostar.com/${market}/search?adult=${adults}&origin=${args.origin}&destination=${args.destination}&outbound=${args.date}`;

const result = { status: 'error', date: args.date, adults, url: base, slots: [], checkedAt: new Date().toISOString() };
let browser;
try {
  // The site's bot check turns away headless browsers, so this uses a normal Chrome window.
  // It starts minimized so it does not take the keyboard focus while you work.
  browser = await chromium.launch({ channel: 'chrome', headless: false, args: args.visible ? [] : ['--start-minimized'] });
  const ctx = await browser.newContext({ locale: 'fr-FR', viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // The page ends in one of two states: slot radio buttons, or the "no Snap ticket" message.
  const state = await page
    .waitForFunction(
      (date) => {
        if (document.querySelector(`input[type=radio][data-testid^="ticket-selection-${date}"]`)) return 'slots';
        const main = document.querySelector('main');
        if (main && /aucun billet Snap|no Snap tickets?/i.test(main.innerText)) return 'none';
        return false;
      },
      args.date,
      { timeout: 60000, polling: 1000 },
    )
    .then((h) => h.jsonValue())
    .catch(() => null);

  if (state === 'slots') {
    result.slots = await page.evaluate((date) => {
      const radios = [...document.querySelectorAll(`input[type=radio][data-testid^="ticket-selection-${date}"]`)];
      return radios.map((r) => {
        const time = r.getAttribute('data-testid').slice(-5);
        // Walk up until the block that holds this slot's own price and time range.
        let el = r;
        let text = '';
        for (let i = 0; i < 8 && el.parentElement; i++) {
          el = el.parentElement;
          text = (el.innerText || '').replace(/\s+/g, ' ').trim();
          if (/€|£/.test(text)) break;
        }
        const price = (text.match(/(\d+(?:[.,]\d+)?)\s*[€£]|[€£]\s*(\d+(?:[.,]\d+)?)/) || [])[0] || null;
        const range = (text.match(/(\d{2}:\d{2})\s*(?:et|and)\s*(\d{2}:\d{2})/) || []).slice(1, 3);
        return { time, from: range[0] || time, to: range[1] || null, price };
      });
    }, args.date);
    for (const s of result.slots) {
      s.period = s.time < '12:00' ? 'morning' : 'afternoon';
      s.url = `${base}&outslot=${encodeURIComponent(s.time)}`;
    }
    result.status = 'available';
  } else if (state === 'none') {
    result.status = 'unavailable';
  } else {
    result.status = 'error';
    result.error = `page did not reach a known state (title: "${await page.title()}")`;
  }
  if (args.shot && args.shot !== true) await page.screenshot({ path: args.shot }).catch(() => {});
} catch (e) {
  result.status = 'error';
  result.error = String(e.message || e).split('\n')[0];
} finally {
  if (browser) await browser.close().catch(() => {});
}
console.log(JSON.stringify(result));
