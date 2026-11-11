// ============================================================
//  DEMO DATA – jasně oddělená od ostrých dat.
//  Klient a akce podle zadání. Všichni účastníci jsou FIKTIVNÍ
//  (náhodně složená jména, e-maily na rezervované doméně example.com).
//  Nepotvrzené údaje (čas, přesné místo, název) jsou záměrně null → „upřesníme“.
// ============================================================
(function () {
  const DIETS = ['Klasická', 'Vegetariánská', 'Veganská', 'Bez lepku', 'Bez laktózy'];

  const clients = [
    {
      id: 'cez-energoservis',
      slug: 'cez',               // adresa: /cez
      name: 'ČEZ ENERGOSERVIS spol. s r.o.',
      web: 'https://www.cezenergoservis.cz',
      logo: 'img/clients/cez/logo.svg',
      logoNegative: 'img/clients/cez/logo-negative.svg',
      // barvy převzaté z CSS veřejného webu cezenergoservis.cz
      colors: { primary: '#F15A22', dark: '#1E1F2E', light: '#F3F4F6' },
      // web klienta používá licencované písmo RoobertCEZ → v demu nejbližší volná náhrada
      font: 'Instrument Sans',
      brandNote: 'Logo a barvy převzaty z veřejného webu cezenergoservis.cz. Pro ostrou verzi vyžádat oficiální podklady (logo, písmo RoobertCEZ).',
      contact: '',
    },
  ];

  const baseRegistration = {
    maxGuests: 0,              // bez doprovodu (+1)
    diets: DIETS,
    transport: ['Vlastní doprava', 'Svozový autobus'],
    busOption: 'Svozový autobus',
    busRoutes: ['směr Třebíč', 'směr Náměšť nad Oslavou', 'směr Moravský Krumlov', 'směr Jaroměřice nad Rokytnou'],
    emailDomains: [],          // [] = jakýkoliv e-mail; naostro typicky firemní domény
    deadline: null,            // termín uzávěrky zatím nestanoven
  };

  const events = [
    {
      id: 'cez-dukovany',
      slug: 'dukovany',          // adresa: /cez/dukovany
      clientId: 'cez-energoservis',
      name: 'ČEZ ENERGOSERVIS spol. s r.o., Dukovany',
      audience: 'Pracovníci na JE Dukovany',
      city: 'Rouchovany',
      venue: 'Penzion Lihovar Rouchovany 197',
      date: '2026-12-04',
      time: '14:00 – 00:00 hod.',
      invited: 600,              // přibližný počet pozvaných
      status: 'published',
      createdAt: '2026-10-19T10:00:00',
      registration: Object.assign({}, baseRegistration),
      automations: {
        confirm: { enabled: true, confirmsAttendance: true }, // registrace = potvrzená účast
        rsvp: { enabled: true, daysBefore: 14 },     // 20. 11.: opětovné potvrzení + QR znovu
        remind: { enabled: true, daysBefore: 7 },    // 27. 11.: připomínka
      },
      demoPeople: { count: 437, yes: 0.968, no: 0.032 },
    },
    {
      id: 'cez-temelin',
      slug: 'temelin',           // adresa: /cez/temelin
      clientId: 'cez-energoservis',
      name: 'ČEZ ENERGOSERVIS spol. s r.o., Temelín',
      audience: 'Pracovníci na JE Temelín',
      city: 'České Budějovice',
      venue: null,
      date: '2027-01-15',
      time: null,
      invited: null,             // počet pozvaných zatím nezadán
      status: 'published',
      createdAt: '2026-10-26T10:00:00',
      registration: Object.assign({}, baseRegistration),
      automations: {
        confirm: { enabled: true, confirmsAttendance: false },
        rsvp: { enabled: true, daysBefore: 14 },    // opětovné potvrzení + QR znovu
        remind: { enabled: true, daysBefore: 7 },   // připomínka potvrzeným
      },
      demoPeople: { count: 186, yes: 0.11, no: 0.02 },
    },
  ];

  // ---------- fiktivní účastníci ----------
  const M = ['Jan', 'Petr', 'Tomáš', 'Martin', 'Jakub', 'Lukáš', 'Pavel', 'Jiří', 'Michal', 'David', 'Ondřej', 'Filip', 'Vojtěch', 'Radek', 'Marek', 'Karel', 'Josef', 'Zdeněk', 'Milan', 'Roman', 'Aleš', 'Libor', 'Stanislav', 'Daniel'];
  const F = ['Jana', 'Petra', 'Lucie', 'Eva', 'Kateřina', 'Lenka', 'Veronika', 'Markéta', 'Tereza', 'Hana', 'Michaela', 'Zuzana', 'Martina', 'Alena', 'Barbora', 'Monika', 'Simona', 'Ivana', 'Klára', 'Romana'];
  const S = [
    ['Novák', 'Nováková'], ['Svoboda', 'Svobodová'], ['Dvořák', 'Dvořáková'], ['Černý', 'Černá'], ['Procházka', 'Procházková'],
    ['Kučera', 'Kučerová'], ['Veselý', 'Veselá'], ['Horák', 'Horáková'], ['Němec', 'Němcová'], ['Pokorný', 'Pokorná'],
    ['Marek', 'Marková'], ['Pospíšil', 'Pospíšilová'], ['Hájek', 'Hájková'], ['Král', 'Králová'], ['Jelínek', 'Jelínková'],
    ['Růžička', 'Růžičková'], ['Beneš', 'Benešová'], ['Fiala', 'Fialová'], ['Sedláček', 'Sedláčková'], ['Doležal', 'Doležalová'],
    ['Zeman', 'Zemanová'], ['Kolář', 'Kolářová'], ['Navrátil', 'Navrátilová'], ['Čermák', 'Čermáková'], ['Urban', 'Urbanová'],
    ['Vaněk', 'Vaňková'], ['Blažek', 'Blažková'], ['Kříž', 'Křížová'], ['Kovář', 'Kovářová'], ['Bartoš', 'Bartošová'],
  ];
  const DEPTS = ['Provoz', 'Údržba strojní', 'Údržba elektro', 'Kontrola kvality', 'Chemie', 'Technická podpora', 'Projekce', 'Logistika', 'Administrativa'];
  const ALLERGIES = ['Ořechy', 'Lepek', 'Laktóza', 'Celer', 'Mořské plody', 'Vejce'];

  function rng(seed) {
    let a = 0;
    for (let i = 0; i < seed.length; i++) a = (a * 31 + seed.charCodeAt(i)) | 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const ascii = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  function generatePeople(ev, until) {
    const r = rng(ev.id);
    const pick = (a) => a[Math.floor(r() * a.length)];
    const weighted = (pairs) => { let x = r(), acc = 0; for (const [v, w] of pairs) { acc += w; if (x < acc) return v; } return pairs[pairs.length - 1][0]; };
    const from = +new Date(ev.createdAt), to = Math.max(from + 864e5, Math.min(+until, +new Date(ev.date)));
    const used = new Set(), out = [];
    for (let i = 0; i < ev.demoPeople.count; i++) {
      const fem = r() < 0.36;
      const s = pick(S);
      let name = (fem ? pick(F) : pick(M)) + ' ' + (fem ? s[1] : s[0]);
      let base = ascii(name).replace(' ', '.'), email = base + '@example.com', k = 2;
      while (used.has(email)) email = base + (k++) + '@example.com';
      used.add(email);
      // registrace: víc lidí v prvních dnech po rozeslání pozvánky
      const reg = new Date(from + Math.pow(r(), 1.9) * (to - from));
      reg.setHours(7 + Math.floor(r() * 13), Math.floor(r() * 60), 0, 0);
      const guests = ev.registration.maxGuests && r() < 0.31 ? 1 : 0;
      const diet = weighted([['Klasická', 0.74], ['Vegetariánská', 0.12], ['Veganská', 0.04], ['Bez lepku', 0.05], ['Bez laktózy', 0.05]]);
      const x = r();
      const attendance = ev.automations.confirm.confirmsAttendance
        ? (x < ev.demoPeople.no ? 'NE' : 'ANO')
        : (x < ev.demoPeople.no ? 'NE' : x < ev.demoPeople.no + ev.demoPeople.yes ? 'ANO' : 'čeká');
      const token = 'demo-' + ev.id.split('-').pop().slice(0, 3) + '-' + String(i + 1).padStart(4, '0');
      out.push({
        token, event: ev.id, name, email,
        dept: pick(DEPTS),
        diet,
        allergies: r() < 0.06 ? pick(ALLERGIES) : '',
        guests,
        guestNames: guests ? ['Doprovod 1'] : [],
        guestDiets: guests ? [weighted([['Klasická', 0.8], ['Vegetariánská', 0.12], ['Bez lepku', 0.08]])] : [],
        transport: r() < 0.42 ? 'Svozový autobus' : 'Vlastní doprava',
        registered: reg.toISOString(),
        attendance,
        attendanceAt: attendance === 'čeká' ? '' : new Date(+reg + (attendance === 'NE' ? r() * 6 * 864e5 : 0)).toISOString(),
        arrivedAt: '', guestsArrived: null,
        mails: [{ kind: 'confirm', at: new Date(+reg + 90e3).toISOString() }],
        source: 'demo',
      });
    }
    return out;
  }

  // stejná struktura jako CONFIG.PRIVACY v Code.gs (v demu nevyplněno)
  const privacy = { controller: '', processor: 'YASHICA EVENTS a.s.', contact: '', retentionDays: 10 };

  window.DEMO_SEED = { version: 6, clients, events, privacy, generatePeople };
})();
