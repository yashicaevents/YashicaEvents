// ============================================================
//  DATOVÁ VRSTVA
//  Frontend volá jen API.call(akce, data). Co je za tím, řeší adaptér:
//   • DemoAdapter   – fiktivní data v localStorage, e-maily jen simulované
//   • RemoteAdapter – Google Apps Script nad Google Sheetem (ostrá verze)
//  Přechod na jinou databázi = nový adaptér se stejnými akcemi (viz docs/ARCHITEKTURA.md).
// ============================================================
(function () {
  const P = window.PLATFORM;
  const DEMO = !P.API_URL;
  const YES = 'ANO', NO = 'NE', PENDING = 'čeká';
  const KEY = 'eventdesk-demo-v4';

  // ---------- pomocné ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const pad = (n) => String(n).padStart(2, '0');
  const MONTHS = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
  const DAYS = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
  const clone = (x) => JSON.parse(JSON.stringify(x));
  function fail(msg, code) { const e = new Error(msg); e.code = code || ''; return e; }
  /** Tajný odkaz účastníka (správa registrace). */
  function parseToken(raw) {
    const s = String(raw || '').trim();
    const m = s.match(/[?&#]t=([\w-]{6,64})/);
    if (m) return m[1];
    return /^[\w-]{6,64}$/.test(s) ? s : '';
  }
  /** Obsah QR vstupenky: „EVT1.<kód>“ (v demu navíc „.<data>“). Žádná osobní data naostro. */
  const QR_PREFIX = 'EVT1.';
  function parseQr(raw) {
    const m = String(raw || '').trim().match(/^EVT1\.([\w-]{6,64})(?:\.([\w-]+))?$/i);
    return m ? m[1] : '';
  }
  /** Datum akce bez času = celý den. */
  function dayDate(iso) { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
  const fmt = {
    day(iso) { const d = dayDate(iso); return `${d.getDate()}. ${d.getMonth() + 1}.`; },
    date(iso) { const d = dayDate(iso); return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`; },
    long(iso) { const d = dayDate(iso); return `${DAYS[d.getDay()]} ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; },
    weekday(iso) { return DAYS[dayDate(iso).getDay()]; },
    stamp(iso) { if (!iso) return ''; const d = new Date(iso); return `${d.getDate()}. ${d.getMonth() + 1}. ${pad(d.getHours())}:${pad(d.getMinutes())}`; },
    time(iso) { if (!iso) return ''; const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; },
    num(n) { return n == null ? '—' : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); },
  };
  /** Kdy se spustí automatizace „X dní před akcí“ (v 9:00). */
  function automationAt(ev, kind) {
    const a = ev.automations && ev.automations[kind];
    if (!a || !a.enabled || !a.daysBefore) return null;
    const d = dayDate(ev.date); d.setDate(d.getDate() - a.daysBefore); d.setHours(9, 0, 0, 0);
    return d;
  }
  /** URL veřejných stránek. Čisté adresy /klient/akce, přes landing.html (viz _redirects). */
  const urls = {
    root() { return document.baseURI.replace(/[?#].*$/, '').replace(/[^/]*$/, ''); }, // respektuje <base> v landing.html
    /** Čisté adresy (/cez/dukovany) potřebují přesměrování na hostingu; ze souboru (file://) jdou jen přes ?c=&e=. */
    pretty() { return location.protocol !== 'file:' && P.PRETTY_URLS !== false; },
    client(c) { return urls.pretty() ? urls.root() + c.slug : urls.root() + 'landing.html?c=' + encodeURIComponent(c.slug); },
    event(c, ev) { return urls.pretty() ? urls.root() + c.slug + '/' + ev.slug : urls.root() + 'landing.html?c=' + encodeURIComponent(c.slug) + '&e=' + encodeURIComponent(ev.slug); },
    ticket(token) { return urls.root() + 'vstupenka.html#t=' + encodeURIComponent(token); }, // za # → neposílá se serveru
    scanner() { return urls.root() + 'scanner.html'; },
  };

  // ============================================================
  //  REMOTE ADAPTER – Apps Script (POST text/plain = bez CORS preflightu)
  // ============================================================
  const RemoteAdapter = {
    async call(action, data) {
      let res;
      try {
        res = await fetch(P.API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(Object.assign({ action }, data || {})),
        });
      } catch (e) { throw fail('Bez spojení se serverem. Zkuste to prosím znovu.', 'OFFLINE'); }
      let json;
      try { json = await res.json(); } catch (e) { throw fail('Server odpověděl nesrozumitelně. Zkuste to znovu.'); }
      if (!json.ok) throw fail(json.error || 'Něco se pokazilo.', json.code);
      return json;
    },
  };

  // ============================================================
  //  DEMO ADAPTER – napodobuje Code.gs, data v localStorage
  // ============================================================
  const SEED = window.DEMO_SEED;
  let memory = null;

  function fresh() {
    const now = new Date();
    const s = { version: SEED.version, clients: clone(SEED.clients), events: [], people: {}, campaigns: {}, clockOffset: 0, last: '', activity: [] };
    SEED.events.forEach((e) => {
      const ev = clone(e); delete ev.demoPeople; ev.demo = true;
      s.events.push(ev);
      s.campaigns[ev.id] = {};
      SEED.generatePeople(e, now).forEach((p) => { p.qr = p.qr || 'q' + p.token.slice(5); s.people[p.token] = p; });
    });
    return s;
  }
  function load() {
    if (memory) return memory;
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.version === SEED.version && s.people) return (memory = s);
    } catch (e) {}
    memory = fresh(); save(memory);
    return memory;
  }
  function save(s) { memory = s; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  // jiná karta (např. skener) změnila data → načíst znovu
  window.addEventListener('storage', (e) => { if (e.key === KEY) { memory = null; document.dispatchEvent(new CustomEvent('demo:changed')); } });

  const now = (s) => new Date(Date.now() + (s.clockOffset || 0));
  const evById = (s, id) => s.events.find((e) => e.id === id);
  const clientById = (s, id) => s.clients.find((c) => c.id === id);
  const peopleOf = (s, id) => Object.values(s.people).filter((p) => p.event === id);
  function log(s, ev, text) { s.activity.unshift({ at: now(s).toISOString(), event: ev, text }); s.activity.length = Math.min(s.activity.length, 80); }

  /** Plánovač: když (simulovaný) čas dosáhl automatizace, „rozešle“ e-maily (jen záznam, nic se neodesílá). */
  function tick(s) {
    s.events.forEach((ev) => {
      ['rsvp', 'remind'].forEach((kind) => {
        const at = automationAt(ev, kind);
        const c = s.campaigns[ev.id] || (s.campaigns[ev.id] = {});
        if (!at || c[kind] || now(s) < at || now(s) > dayDate(ev.date).setHours(23, 59)) return;
        let n = 0;
        peopleOf(s, ev.id).forEach((p) => {
          if (p.attendance === NO) return;
          p.mails.push({ kind: kind === 'remind' && p.attendance !== YES ? 'nudge' : kind, at: at.toISOString() }); n++;
        });
        c[kind] = { ranAt: at.toISOString(), count: n };
        log(s, ev.id, (kind === 'rsvp' ? 'Výzva k potvrzení účasti' : 'Připomínka') + ' rozeslána (simulace): ' + n + ' e-mailů');
      });
    });
  }

  function pickDiet(ev, x) { const d = ev.registration.diets, want = String(x || '').split(',').map((y) => y.trim()); const out = d.filter((y) => want.indexOf(y) >= 0); return out.length ? out.join(', ') : d[0]; }
  function pickTransport(ev, x) {
    const r = ev.registration, t = r.transport || [], v = String(x || ''), pre = r.busOption + ' – ';
    if (r.busOption && (r.busRoutes || []).indexOf(v.slice(pre.length)) >= 0 && v.indexOf(pre) === 0) return v;
    return t.indexOf(v) >= 0 ? v : (t[0] || '');
  }
  function details(ev, d) {
    const max = ev.registration.maxGuests || 0;
    const guests = Math.max(0, Math.min(max, parseInt(d.guests, 10) || 0));
    const names = d.guestNames || [], diets = d.guestDiets || [];
    const guestNames = [], guestDiets = [];
    for (let i = 0; i < guests; i++) {
      guestNames.push(String(names[i] || '').trim().slice(0, 80) || 'Doprovod ' + (i + 1));
      guestDiets.push(pickDiet(ev, diets[i]));
    }
    return { diet: pickDiet(ev, d.diet), transport: pickTransport(ev, d.transport), allergies: String(d.allergies || '').trim().slice(0, 200), guests, guestNames, guestDiets };
  }
  function needPin(d) { if (String(d.pin) !== String(P.DEMO_SCANNER_PIN)) throw fail('Nesprávný PIN.', 'AUTH'); }
  const person = (s, raw) => s.people[parseToken(raw)];
  const byQr = (s, raw) => { const q = parseQr(raw) || String(raw || ''); return Object.values(s.people).find((p) => p.qr && p.qr === q); };
  function publicPerson(p) { const o = clone(p); delete o.email; delete o.mails; delete o.qr; return o; }
  function scanPerson(p) { const o = publicPerson(p); o.qr = p.qr; return o; }
  function qrText(p) { return QR_PREFIX + p.qr + (DEMO ? '.' + demoPack(p) : ''); }
  function publicEvent(ev) { const o = clone(ev); delete o.demo; return o; }

  function stats(s, evId) {
    const st = { registered: 0, persons: 0, yes: 0, no: 0, pending: 0, yesPeople: 0, noPeople: 0, pendingPeople: 0, expected: 0, arrived: 0, arrivedPeople: 0, guests: 0, diets: {}, transport: {}, allergies: 0 };
    peopleOf(s, evId).forEach((p) => {
      const n = 1 + p.guests;
      st.registered++; st.persons += n; st.guests += p.guests;
      if (p.attendance === YES) {
        st.yes += n; st.yesPeople++;
        String(p.diet).split(', ').forEach((x) => (st.diets[x] = (st.diets[x] || 0) + 1));
        p.guestDiets.forEach((g) => (st.diets[g] = (st.diets[g] || 0) + 1));
        if (p.transport) st.transport[p.transport] = (st.transport[p.transport] || 0) + n;
        if (p.allergies) st.allergies++;
      } else if (p.attendance === NO) { st.no += n; st.noPeople++; } else { st.pending += n; st.pendingPeople++; }
      if (p.arrivedAt) { st.arrivedPeople++; st.arrived += 1 + (p.guestsArrived == null ? p.guests : p.guestsArrived); }
    });
    st.expected = st.yes;
    return st;
  }
  const scanStats = (s, id) => { const x = stats(s, id); return { expected: x.expected, arrived: x.arrived }; };

  // QR v demu nese i data přihlášky (?d=…), aby skener na jiném zařízení vstupenku poznal.
  function b64e(str) { return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function b64d(str) { return decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/')))); }
  function demoPack(p) {
    return b64e(JSON.stringify([p.event, p.name, p.dept || '', p.guests, p.attendance, p.diet, p.guestDiets || [], p.guestNames || [], p.allergies || '', p.transport || '']));
  }
  function importFromRaw(s, raw) {
    const mq = String(raw || '').trim().match(/^EVT1\.([\w-]{6,64})\.([\w-]+)$/i);
    if (!mq || byQr(s, mq[1])) return;
    const token = 'imp-' + mq[1], m = [0, mq[2]];
    let x;
    try { x = JSON.parse(b64d(m[1])); } catch (e) { return; }
    const ev = Array.isArray(x) && evById(s, x[0]);
    if (!ev || typeof x[1] !== 'string') return;
    s.people[token] = Object.assign({
      token, qr: mq[1], event: ev.id, name: x[1].slice(0, 80), email: '', dept: String(x[2]).slice(0, 80),
      attendance: [YES, NO, PENDING].indexOf(x[4]) >= 0 ? x[4] : PENDING, registered: now(s).toISOString(), attendanceAt: '',
      arrivedAt: '', guestsArrived: null, mails: [], source: 'qr-import',
    }, details(ev, { guests: x[3], diet: x[5], guestDiets: x[6], guestNames: x[7], allergies: x[8], transport: x[9] }));
  }

  // ---------- akce (stejné názvy jako v Code.gs) ----------
  const A = {
    // ===== veřejné =====
    /** Stránka klienta nebo akce podle adresy /klient[/akce]. */
    site(s, d) {
      const c = s.clients.find((x) => x.slug === String(d.client || '').toLowerCase());
      if (!c) throw fail('Tuhle stránku jsme nenašli.', 'NOT_FOUND');
      const events = s.events.filter((e) => e.clientId === c.id && e.status === 'published').sort((a, b) => a.date.localeCompare(b.date));
      let event = null;
      if (d.event) {
        event = events.find((e) => e.slug === String(d.event).toLowerCase());
        if (!event) throw fail('Tuhle akci jsme nenašli. Zkontrolujte prosím odkaz.', 'NOT_FOUND');
      }
      return { client: clone(c), events: events.map(publicEvent), event: event ? publicEvent(event) : null, privacy: clone(SEED.privacy || {}), now: now(s).toISOString() };
    },
    register(s, d) {
      const ev = evById(s, d.event);
      if (d.website) return { existing: false };            // skryté pole proti robotům
      if (d.consent !== true) throw fail('Potvrďte prosím souhlas se zpracováním údajů.');
      if (!ev || ev.status !== 'published') throw fail('Registrace na tuto akci není otevřená.');
      const name = String(d.name || '').replace(/\s+/g, ' ').trim();
      const email = String(d.email || '').trim().toLowerCase();
      if (name.split(' ').length < 2) throw fail('Napište jméno i příjmení.');
      if (!/^[a-z0-9_][a-z0-9._%+-]*@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) throw fail('Zkontrolujte e-mail.');
      const doms = ev.registration.emailDomains || [];
      if (doms.length && !doms.some((x) => email.endsWith('@' + x))) throw fail('Registrovat se můžete jen s firemním e-mailem (@' + doms.join(', @') + ').');
      const ex = peopleOf(s, ev.id).find((p) => p.email === email);
      if (ex) { ex.mails.push({ kind: 'confirm', at: now(s).toISOString(), resend: true }); s.last = ex.token; return { existing: true, token: ex.token }; }
      if (ev.registration.deadline && now(s) > new Date(ev.registration.deadline)) throw fail('Registrace na tuto akci je už uzavřená.');
      if (now(s) > dayDate(ev.date).setHours(23, 59)) throw fail('Akce už proběhla.');
      const rnd = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
      const token = rnd(), qr = rnd();
      const at = now(s).toISOString();
      s.people[token] = Object.assign({
        token, qr, event: ev.id, name, email, dept: String(d.dept || '').trim().slice(0, 60),
        attendance: ev.automations.confirm.confirmsAttendance ? YES : PENDING,
        registered: at, attendanceAt: ev.automations.confirm.confirmsAttendance ? at : '',
        arrivedAt: '', guestsArrived: null,
        mails: ev.automations.confirm.enabled ? [{ kind: 'confirm', at }] : [], source: 'web',
      }, details(ev, d));
      s.last = token;
      log(s, ev.id, 'Nová registrace: ' + name);
      return { existing: false, token };
    },
    ticket(s, d) {
      const p = person(s, d.token);
      if (!p) throw fail('Vstupenku jsme nenašli. Zkontrolujte odkaz z e-mailu.', 'NOT_FOUND');
      const ev = evById(s, p.event);
      return { ticket: Object.assign(publicPerson(p), { qrText: qrText(p) }), event: publicEvent(ev), client: clone(clientById(s, ev.clientId)), now: now(s).toISOString() };
    },
    rsvp(s, d) {
      const p = person(s, d.token);
      if (!p) throw fail('Vstupenku jsme nenašli.', 'NOT_FOUND');
      const ev = evById(s, p.event);
      if (now(s) > dayDate(ev.date).setHours(23, 59)) throw fail('Akce už proběhla.');
      const attend = [YES, NO].indexOf(d.attend) >= 0 ? d.attend : null;
      if (attend !== NO && d.guests != null) Object.assign(p, details(ev, d));
      if (attend && attend !== p.attendance) {
        p.attendance = attend; p.attendanceAt = now(s).toISOString();
        log(s, ev.id, p.name + (attend === YES ? ' potvrdil(a) účast' : ' zrušil(a) účast'));
      }
      return { ticket: Object.assign(publicPerson(p), { qrText: qrText(p) }), event: publicEvent(ev), client: clone(clientById(s, ev.clientId)), now: now(s).toISOString() };
    },

    // ===== skener (v demu PIN, naostro tajný klíč skeneru) =====
    scannerEvents(s, d) {
      needPin(d);
      return { events: s.events.filter((e) => e.status !== 'draft').map((e) => ({ id: e.id, name: e.name, city: e.city, date: e.date, maxGuests: e.registration.maxGuests || 0, client: clientById(s, e.clientId).name })) };
    },
    checkin(s, d) {
      needPin(d);
      const p = byQr(s, d.qr);
      if (!p) return { result: 'unknown', stats: scanStats(s, d.event) };
      if (d.event && p.event !== d.event) return { result: 'other', person: scanPerson(p), otherEvent: publicEvent(evById(s, p.event)), stats: scanStats(s, d.event) };
      if (p.arrivedAt) return { result: 'duplicate', person: Object.assign(scanPerson(p), { arrivedAt: fmt.time(p.arrivedAt) }), stats: scanStats(s, d.event) };
      p.arrivedAt = now(s).toISOString(); p.guestsArrived = p.guests;
      log(s, p.event, 'Příchod: ' + p.name);
      return { result: 'ok', person: Object.assign(scanPerson(p), { arrivedAt: fmt.time(p.arrivedAt) }), stats: scanStats(s, d.event) };
    },
    undo(s, d) {
      needPin(d);
      const p = byQr(s, d.qr);
      if (p) { p.arrivedAt = ''; p.guestsArrived = null; log(s, p.event, 'Zrušen příchod: ' + p.name); }
      return { stats: scanStats(s, d.event) };
    },
    setGuests(s, d) {
      needPin(d);
      const p = byQr(s, d.qr);
      if (p) p.guestsArrived = Math.max(0, Math.min(evById(s, p.event).registration.maxGuests || 0, parseInt(d.n, 10) || 0));
      return { stats: scanStats(s, d.event) };
    },
    search(s, d) {
      needPin(d);
      const q = norm(d.q).trim();
      if (q.length < 2) return { results: [] };
      const results = peopleOf(s, d.event)
        .filter((p) => norm(p.name).includes(q))
        .slice(0, 8)
        .map((p) => ({ qr: p.qr, name: p.name, dept: p.dept, guests: p.guests, attendance: p.attendance, arrivedAt: fmt.time(p.arrivedAt) }));
      return { results };
    },
    stats(s, d) { needPin(d); return { stats: scanStats(s, d.event) }; },

    // ===== administrace – jen pro budoucí platformu (pozdeji-platforma/), jednoduchá verze ji nepoužívá =====
    overview(s) {
      return {
        now: now(s).toISOString(),
        clients: s.clients.map((c) => Object.assign(clone(c), { eventCount: s.events.filter((e) => e.clientId === c.id).length })),
        events: s.events.slice().sort((a, b) => a.date.localeCompare(b.date)).map((e) => ({ event: clone(e), stats: stats(s, e.id) })),
        activity: s.activity.slice(0, 12),
      };
    },
    dashboard(s, d) {
      const ev = evById(s, d.event);
      if (!ev) throw fail('Akce neexistuje.', 'NOT_FOUND');
      const list = peopleOf(s, ev.id);
      const byDay = {};
      list.forEach((p) => { const d = new Date(p.registered); const k = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); byDay[k] = (byDay[k] || 0) + 1; });
      return {
        now: now(s).toISOString(), event: clone(ev), client: clone(clientById(s, ev.clientId)), stats: stats(s, ev.id),
        byDay, campaigns: A.campaigns(s, d).campaigns,
        activity: s.activity.filter((a) => a.event === ev.id).slice(0, 8),
        recentArrivals: list.filter((p) => p.arrivedAt).sort((a, b) => b.arrivedAt.localeCompare(a.arrivedAt)).slice(0, 8).map((p) => ({ name: p.name, at: p.arrivedAt, guests: p.guestsArrived })),
      };
    },
    participants(s, d) {
      const q = norm(d.q).trim();
      let rows = peopleOf(s, d.event).filter((p) =>
        (!q || norm(p.name + ' ' + p.email + ' ' + p.dept).includes(q)) &&
        (!d.status || (d.status === 'arrived' ? !!p.arrivedAt : p.attendance === d.status)) &&
        (!d.diet || p.diet === d.diet) &&
        (!d.transport || p.transport === d.transport));
      const key = d.sort || 'registered';
      const dir = d.dir === 'asc' ? 1 : -1;
      rows.sort((a, b) => String(a[key] || '').localeCompare(String(b[key] || ''), 'cs') * dir);
      const total = rows.length, size = d.size || 25, page = Math.max(0, d.page || 0);
      if (!d.all) rows = rows.slice(page * size, page * size + size);
      return { total, rows: rows.map((p) => { const o = clone(p); delete o.mails; return o; }) };
    },
    participant(s, d) {
      const p = person(s, d.token);
      if (!p) throw fail('Účastník neexistuje.', 'NOT_FOUND');
      return { person: clone(p) };
    },
    setAttendance(s, d) {
      const p = person(s, d.token);
      if (!p || [YES, NO, PENDING].indexOf(d.attend) < 0) throw fail('Neplatná změna.');
      p.attendance = d.attend; p.attendanceAt = now(s).toISOString();
      log(s, p.event, 'Organizátor změnil účast: ' + p.name + ' → ' + d.attend);
      return { person: clone(p) };
    },
    resend(s, d) {
      const p = person(s, d.token);
      if (!p) throw fail('Účastník neexistuje.', 'NOT_FOUND');
      p.mails.push({ kind: 'confirm', at: now(s).toISOString(), resend: true });
      return { person: clone(p) };
    },
    campaigns(s, d) {
      const ev = evById(s, d.event);
      const list = peopleOf(s, ev.id);
      const sent = (kind) => list.reduce((n, p) => n + p.mails.filter((m) => m.kind === kind || (kind === 'remind' && m.kind === 'nudge')).length, 0);
      const c = s.campaigns[ev.id] || {};
      const t = now(s);
      const out = [
        { key: 'confirm', title: 'Potvrzení registrace a QR vstupenka', trigger: 'Ihned po registraci',
          audience: 'Každý nový registrovaný', enabled: ev.automations.confirm.enabled, sent: sent('confirm'),
          note: ev.automations.confirm.confirmsAttendance ? 'Registrace zároveň potvrzuje účast.' : 'Účast se potvrzuje později.' },
      ];
      ['rsvp', 'remind'].forEach((k) => {
        const a = ev.automations[k], at = automationAt(ev, k);
        out.push({
          key: k,
          title: k === 'rsvp' ? 'Opětovné potvrzení účasti + QR znovu' : 'Připomínka před akcí',
          trigger: a.daysBefore + ' dní před akcí' + (at ? ' · ' + fmt.stamp(at.toISOString()) : ''),
          audience: k === 'rsvp' ? 'Všichni kromě „Nepřijdu“ · tlačítka Přijdu / Nepřijdu' : 'Potvrzení: „kdyby cokoliv, dejte vědět“ · neodpovězení: výzva k odpovědi',
          enabled: a.enabled, daysBefore: a.daysBefore,
          scheduledAt: at ? at.toISOString() : null,
          ranAt: c[k] ? c[k].ranAt : null,
          sent: sent(k),
          willSend: a.enabled && !c[k] ? list.filter((p) => p.attendance !== NO).length : 0,
          state: !a.enabled ? 'off' : c[k] ? 'done' : at && at > t ? 'scheduled' : 'due',
        });
      });
      return { campaigns: out };
    },
    outbox(s, d) {
      const mails = [];
      peopleOf(s, d.event).forEach((p) => p.mails.forEach((m) => mails.push({ token: p.token, name: p.name, email: p.email, kind: m.kind, at: m.at, resend: !!m.resend })));
      mails.sort((a, b) => b.at.localeCompare(a.at));
      return { total: mails.length, mails: mails.slice(0, d.limit || 50) };
    },
    saveClient(s, d) {
      const c = d.client || {};
      const name = String(c.name || '').trim();
      if (!name) throw fail('Zadejte název klienta.');
      const slug = slugify(c.slug || name);
      let ex = c.id && clientById(s, c.id);
      if (s.clients.some((x) => x.slug === slug && (!ex || x.id !== ex.id))) throw fail('Adresa /' + slug + ' už je obsazená.');
      const data = { name, slug, web: String(c.web || ''), logo: c.logo || '', logoNegative: c.logoNegative || c.logo || '', colors: c.colors || { primary: '#2F5BEA', dark: '#151827', light: '#F4F5F8' }, font: c.font || 'Instrument Sans', brandNote: c.brandNote || '', contact: c.contact || '' };
      if (ex) Object.assign(ex, data); else { ex = Object.assign({ id: 'c-' + Math.random().toString(36).slice(2, 8) }, data); s.clients.push(ex); }
      return { client: clone(ex) };
    },
    saveEvent(s, d) {
      const e = d.event || {};
      if (!clientById(s, e.clientId)) throw fail('Vyberte klienta.');
      if (!String(e.name || '').trim()) throw fail('Zadejte název akce.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) throw fail('Zadejte datum akce.');
      const slug = slugify(e.slug || e.city || e.name);
      let ex = e.id && evById(s, e.id);
      if (s.events.some((x) => x.clientId === e.clientId && x.slug === slug && (!ex || x.id !== ex.id))) throw fail('Adresa …/' + slug + ' už u tohoto klienta existuje.');
      const data = {
        clientId: e.clientId, slug, name: String(e.name).trim(), audience: String(e.audience || '').trim(), city: String(e.city || '').trim(),
        venue: e.venue || null, date: e.date, time: e.time || null, invited: e.invited ? +e.invited : null,
        status: e.status || 'published', registration: e.registration, automations: e.automations,
      };
      if (ex) Object.assign(ex, data);
      else { ex = Object.assign({ id: e.clientId.replace(/^c-/, '') + '-' + slug + '-' + Math.random().toString(36).slice(2, 5), createdAt: now(s).toISOString(), demo: true }, data); s.events.push(ex); s.campaigns[ex.id] = {}; log(s, ex.id, 'Akce založena'); }
      return { event: clone(ex) };
    },
    setClock(s, d) {
      s.clockOffset = d.date ? +new Date(d.date) - Date.now() : 0;
      tick(s);
      return { now: now(s).toISOString() };
    },
  };
  function slugify(x) { return norm(x).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'akce'; }

  const DemoAdapter = {
    async call(action, data) {
      await sleep(120 + Math.random() * 220);
      if (!A[action]) throw fail('Neznámá akce: ' + action);
      const s = load();
      tick(s);
      const d = data || {};
      if (d.qr) importFromRaw(s, d.qr);
      const r = A[action](s, d);
      save(s);
      return Object.assign({ ok: true }, r);
    },
  };

  const adapter = DEMO ? DemoAdapter : RemoteAdapter;

  /** Doplní texty z PLATFORM.OVERRIDES (config.js) do odpovědi serveru. */
  function applyOverrides(res) {
    const o = (window.PLATFORM || {}).OVERRIDES;
    if (!o || !res || typeof res !== 'object') return res;
    const ev = (e) => {
      const x = e && (o.events || {})[e.id];
      if (!x) return;
      Object.keys(x).forEach((k) => { if (k !== 'registration') e[k] = x[k]; });
      if (x.registration && e.registration) Object.assign(e.registration, x.registration);
    };
    const cl = (c) => { const x = c && (o.clients || {})[c.id]; if (x) Object.assign(c, x); };
    cl(res.client); ev(res.event); (res.events || []).forEach(ev);
    if (res.privacy && o.privacy) Object.assign(res.privacy, o.privacy);
    return res;
  }

  window.API = {
    demo: DEMO,
    YES, NO, PENDING,
    call: (action, data) => adapter.call(action, data).then(applyOverrides),
    parseToken, parseQr, qrText, fmt, dayDate, automationAt, urls,
    demoLastToken() { return DEMO ? load().last : ''; },
    resetDemo() { memory = null; try { localStorage.removeItem(KEY); } catch (e) {} },
  };
})();
