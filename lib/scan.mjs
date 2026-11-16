// Reads what the public Eurostar Snap site currently sells on one route, by browsing it in the
// installed Chrome like a visitor: the calendar gives the open dates, each date page gives the
// time slots and prices. It never goes past the search results (no booking).
import { chromium } from 'playwright';

const SITE = 'https://snap.eurostar.com';

export function searchUrl({ market = 'fr-fr', origin, destination, adults, date, time }) {
  const u = `${SITE}/${market}/search?adult=${adults}&origin=${origin}&destination=${destination}&outbound=${date}`;
  return time ? `${u}&outslot=${encodeURIComponent(time)}` : u;
}

export function parisDay(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(d);
}

async function readDate(page, opts, date) {
  await page.goto(searchUrl({ ...opts, date }), { waitUntil: 'domcontentloaded', timeout: 60000 });
  // The page ends in one of two states: slot radio buttons, or the "no Snap ticket" message.
  const state = await page
    .waitForFunction(
      (d) => {
        if (document.querySelector(`input[type=radio][data-testid^="ticket-selection-${d}"]`)) return 'slots';
        const main = document.querySelector('main');
        if (main && /aucun billet Snap|no Snap tickets?/i.test(main.innerText)) return 'none';
        return false;
      },
      date,
      { timeout: 45000, polling: 1000 },
    )
    .then((h) => h.jsonValue())
    .catch(() => 'unknown');
  if (state !== 'slots') return { state, slots: [] };

  const slots = await page.evaluate((d) => {
    const radios = [...document.querySelectorAll(`input[type=radio][data-testid^="ticket-selection-${d}"]`)];
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
      const m = text.match(/(\d+(?:[.,]\d+)?)\s*([€£])|([€£])\s*(\d+(?:[.,]\d+)?)/);
      const range = (text.match(/(\d{2}:\d{2})\s*(?:et|and)\s*(\d{2}:\d{2})/) || []).slice(1, 3);
      return {
        time,
        from: range[0] || time,
        to: range[1] || null,
        price: m ? Number((m[1] || m[4]).replace(',', '.')) : null,
        cur: m ? m[2] || m[3] : '€',
      };
    });
  }, date);
  for (const s of slots) s.period = s.time < '12:00' ? 'morning' : 'afternoon';
  return { state: 'slots', slots };
}

// Returns { dates: { 'YYYY-MM-DD': { state: 'slots'|'none'|'unknown', slots: [...] } }, calendar: [...] }
export async function scan({ origin, destination, adults, market = 'fr-fr', alwaysCheck = [], visible = false }) {
  const opts = { origin, destination, adults, market };
  // The site's bot check turns away headless browsers, so this uses a normal Chrome window
  // (minimized on a PC, on a virtual display in GitHub Actions).
  const browser = await chromium.launch({ channel: 'chrome', headless: false, args: visible ? [] : ['--start-minimized'] });
  try {
    const ctx = await browser.newContext({ locale: 'fr-FR', viewport: { width: 1280, height: 1000 } });
    const page = await ctx.newPage();

    // The calendar's own data: the list of dates with Snap tickets, month by month.
    const open = new Set();
    let calendarAnswers = 0;
    page.on('response', async (r) => {
      if (!r.url().includes('/gateway')) return;
      try {
        const q = JSON.parse(r.request().postData() || '{}');
        if (q.operationName !== 'journeyAvailabilitySearch') return;
        if (q.variables.origin !== origin || q.variables.destination !== destination) return;
        const list = (await r.json())?.data?.journeyAvailabilitySearch;
        if (Array.isArray(list)) {
          calendarAnswers++;
          list.forEach((d) => open.add(d));
        }
      } catch {
        /* not a calendar answer */
      }
    });

    await page.goto(`${SITE}/${market}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.getByTestId('destination-field').waitFor({ timeout: 45000 });
    const cookies = page.getByText(/cookies nécessaires uniquement|necessary cookies only/i).first();
    await cookies.click({ timeout: 6000 }).catch(() => {});

    const originField = page.getByTestId('origin-field');
    if (origin !== '8727100') {
      // Paris is the default origin; other origins are picked from the list (best effort).
      await originField.click();
      await page.locator(`[role=option][data-testid$="-${origin}"]`).first().click({ timeout: 8000 });
    }
    await page.getByTestId('destination-field').click();
    await page.locator(`[role=option][data-testid$="-${destination}"]`).first().click({ timeout: 8000 });
    await page.getByTestId('start-date').click();
    const deadline = Date.now() + 25000;
    while (calendarAnswers < 2 && Date.now() < deadline) await page.waitForTimeout(500);
    if (calendarAnswers === 0) throw new Error(`calendar not readable (title: "${await page.title()}")`);

    const today = parisDay();
    const calendar = [...open].filter((d) => d >= today).sort();
    const toRead = [...new Set([...calendar, ...alwaysCheck.filter((d) => d >= today)])].sort();
    const dates = {};
    for (const date of toRead) dates[date] = await readDate(page, opts, date);
    return { dates, calendar };
  } finally {
    await browser.close().catch(() => {});
  }
}
