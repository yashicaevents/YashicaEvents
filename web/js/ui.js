// ============================================================
//  Sdílené UI pomůcky: branding klienta, QR, toast, demo lišta
// ============================================================
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- barvy ----------
  function hexToRgb(h) { h = String(h || '').replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); const n = parseInt(h, 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function rgbToHex(r) { return '#' + r.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join(''); }
  const mix = (a, b, t) => rgbToHex(hexToRgb(a).map((x, i) => x + (hexToRgb(b)[i] - x) * t));
  function contrastText(bg) { const [r, g, b] = hexToRgb(bg); return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#151827' : '#FFFFFF'; }

  /** Přebarví stránku podle klienta (CSS proměnné + písmo). */
  function applyBrand(client, root) {
    const c = (client && client.colors) || {};
    const el = root || document.documentElement;
    const primary = c.primary || '#2F5BEA', dark = c.dark || '#151827', light = c.light || '#F4F5F8';
    el.style.setProperty('--brand', primary);
    el.style.setProperty('--brand-d', mix(primary, '#000000', 0.14));
    el.style.setProperty('--brand-soft', mix(primary, '#FFFFFF', 0.9));
    el.style.setProperty('--brand-ink', contrastText(primary));
    el.style.setProperty('--dark', dark);
    el.style.setProperty('--dark-2', mix(dark, '#FFFFFF', 0.08));
    el.style.setProperty('--dark-3', mix(dark, '#FFFFFF', 0.16));
    el.style.setProperty('--gray', light);
    const font = client && client.font;
    // Písma jsou jen lokální (web/fonts, styles.css) – nic se nenačítá z Google Fonts (GDPR).
    // Jiné písmo klienta je potřeba přidat do web/fonts a @font-face, jinak se použije systémové.
    if (font && /^[\w \-]{1,60}$/.test(font)) {
      el.style.setProperty('--sans', `'${font}', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif`);
    }
    const m = $('meta[name="theme-color"]'); if (m) m.content = dark;
  }

  // ---------- QR ----------
  function qr(box, text, opts) {
    opts = opts || {};
    box.innerHTML = '';
    if (!window.QRCode) { box.textContent = 'QR se nenačetl'; return null; }
    new QRCode(box, {
      text, width: opts.size || 512, height: opts.size || 512,
      colorDark: opts.dark || '#151827', colorLight: opts.light || '#FFFFFF',
      correctLevel: text.length > 120 ? QRCode.CorrectLevel.L : QRCode.CorrectLevel.M,
    });
    box.title = '';
    return $('canvas', box);
  }
  function qrDataUrl(text, opts) {
    const tmp = document.createElement('div');
    const c = qr(tmp, text, Object.assign({ size: 360 }, opts));
    return c ? c.toDataURL('image/png') : '';
  }

  // ---------- toast ----------
  function toast(msg, kind) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); document.body.appendChild(t); }
    t.textContent = msg; t.dataset.kind = kind || '';
    t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200);
  }

  // ---------- demo lišta (jen v demo režimu) ----------
  function demoBar(text) {
    if (!window.API || !API.demo) return;
    const b = document.createElement('div');
    b.className = 'demo-strip';
    b.innerHTML = `<span class="demo-pill">Demo</span><span>${esc(text || 'Fiktivní data · e-maily se neodesílají')}</span>`;
    document.body.prepend(b);
  }

  window.UI = { $, $$, esc, applyBrand, mix, contrastText, qr, qrDataUrl, toast, demoBar };
})();
