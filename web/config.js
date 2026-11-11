// ============================================================
//  NASTAVENÍ
//  Web je napojený na Apps Script → registrace se ukládají do Google Sheetu.
// ============================================================
window.PLATFORM = {
  // URL nasazené Apps Script Web App (končí /exec)
  API_URL: 'https://script.google.com/macros/s/AKfycbzV9tGl4s75_QFkEQPKIzSV87D3C_9oeUK75i9-4AVBUmgGhtPINpzUiVFk8wzY6fT-LQ/exec',

  NAME: 'EventDesk',            // pracovní název platformy
  AGENCY: 'YASHICA EVENTS a.s.', // pořadatel akce (zobrazuje se na webu)
  CLIENT_LOGOS: { cez: 'img/cez-energoservis.png' }, // logo klienta v úvodu stránky akce

  // Texty, které web ukáže vždy – i když Apps Script ještě běží se starším kódem.
  // Při změně je upravte i v CONFIG v Code.gs (Code.gs určuje, co se uloží a co přijde e-mailem).
  // Dřív se tu přepisovaly údaje akce kvůli starší verzi Apps Scriptu. Teď je zdrojem pravdy Code.gs.
  OVERRIDES: {},

  // Čisté adresy /klient/akce (např. /cez/dukovany). Vyžadují přesměrování na hostingu
  // (404.html pro GitHub Pages). false = landing.html?c=…&e=…
  PRETTY_URLS: true,
};
