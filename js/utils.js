/* =========================================================
   UTILIDADES COMPARTIDAS
   ========================================================= */
const U = (() => {
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /** 1234567 -> "1.234.567" */
  function thousands(n) {
    const neg = n < 0;
    const s = String(Math.round(Math.abs(n || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '-' : '') + s;
  }
  /** 1234567 -> "$1.234.567" */
  function money(n) { return '$' + thousands(n); }

  /** "1.234.567" o "$ 1.234.567" -> 1234567 */
  function parseMoney(str) {
    const d = String(str == null ? '' : str).replace(/[^\d]/g, '');
    return d ? parseInt(d, 10) : 0;
  }

  /** Porcentaje admite decimales con coma o punto: "5,5" -> 5.5 */
  function parsePct(str) {
    const s = String(str == null ? '' : str).replace(',', '.').replace(/[^\d.]/g, '');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  /** Activa el formato de miles mientras se escribe en un input */
  function bindMoney(input, onChange) {
    input.setAttribute('inputmode', 'numeric');
    input.addEventListener('input', () => {
      const v = parseMoney(input.value);
      const fromEnd = input.value.length - (input.selectionStart || 0);
      input.value = input.value.trim() === '' ? '' : '$' + thousands(v);
      const pos = Math.max(1, input.value.length - fromEnd);
      try { input.setSelectionRange(pos, pos); } catch (_) { /* noop */ }
      if (onChange) onChange(v);
    });
  }
  function setMoney(input, v) { input.value = v ? '$' + thousands(v) : ''; }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  /** "2026-09-14" -> "14 de septiembre de 2026" */
  function dateLong(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return `${d} de ${MESES[m - 1]} de ${y}`;
  }
  /** "2026-09-14" -> "14 sep 2026" */
  function dateShort(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return `${String(d).padStart(2, '0')} ${MESES[m - 1].slice(0, 3)} ${y}`;
  }

  /**
   * Cálculo de la cotización. Cada paso se redondea a pesos enteros
   * para que los valores impresos sumen exactamente.
   */
  function compute(q) {
    const items = q.items || [];
    const bruto = items.reduce((s, it) => s + Math.round((Number(it.cantidad) || 0) * (Number(it.valorUnitario) || 0)), 0);

    let descuento = 0;
    const dv = Number(q.descuento && q.descuento.valor) || 0;
    if (dv > 0) {
      descuento = q.descuento.tipo === 'pct'
        ? Math.round(bruto * Math.min(dv, 100) / 100)
        : Math.min(Math.round(dv), bruto);
    }
    const subtotal = bruto - descuento;
    const envio = q.envio && q.envio.gratis ? 0 : Math.round(Number(q.envio && q.envio.valor) || 0);
    const ivaPct = Number(q.iva && q.iva.pct) || 0;
    const iva = q.iva && q.iva.aplica ? Math.round(subtotal * ivaPct / 100) : 0;
    const total = subtotal + envio + iva;
    return { bruto, descuento, subtotal, envio, iva, total };
  }

  /** Reduce y comprime una imagen. Devuelve un dataURL. */
  function compressImage(file, maxSide = 700, mime = 'image/jpeg', quality = 0.82) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type || !file.type.startsWith('image/')) {
        reject(new Error('El archivo no es una imagen'));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Formato de imagen no soportado'));
        img.onload = () => {
          const ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
          const w = Math.round(img.width * ratio);
          const h = Math.round(img.height * ratio);
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          if (mime === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL(mime, quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ---------- Toast ---------- */
  const ICONS = {
    ok: '<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/></svg>',
    err: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>'
  };
  function toast(msg, type = 'ok', ms = 3200) {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = (ICONS[type] || ICONS.info) + `<span>${esc(msg)}</span>`;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
  }

  /* ---------- Modal ---------- */
  let modalResolve = null;
  function openModal({ title, body, buttons = [], wide = false }) {
    $('#modalTitle').textContent = title;
    const b = $('#modalBody');
    if (typeof body === 'string') b.innerHTML = body; else { b.innerHTML = ''; b.appendChild(body); }
    const foot = $('#modalFoot');
    foot.innerHTML = '';
    $('#modalBox').classList.toggle('wide', wide);
    return new Promise(resolve => {
      modalResolve = resolve;
      buttons.forEach(btn => {
        const el = document.createElement('button');
        el.className = 'btn ' + (btn.cls || 'btn-secondary');
        el.innerHTML = btn.label;
        el.onclick = () => {
          if (btn.onClick) { btn.onClick(el); return; }
          closeModal(btn.value);
        };
        foot.appendChild(el);
      });
      $('#modal').hidden = false;
    });
  }
  function closeModal(value) {
    $('#modal').hidden = true;
    $('#modalBody').innerHTML = '';
    if (modalResolve) { const r = modalResolve; modalResolve = null; r(value); }
  }
  function confirm(title, message, okLabel = 'Confirmar', danger = false) {
    return openModal({
      title,
      body: `<p>${message}</p>`,
      buttons: [
        { label: 'Cancelar', value: false, cls: 'btn-ghost' },
        { label: okLabel, value: true, cls: danger ? 'btn-danger' : 'btn-primary' }
      ]
    });
  }

  /** Pone un botón en estado "cargando" y devuelve una función para restaurarlo */
  function busy(btn, label = 'Procesando…') {
    const prev = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spin"></span>${label}`;
    return () => { btn.disabled = false; btn.innerHTML = prev; };
  }

  return {
    $, $$, thousands, money, parseMoney, parsePct, bindMoney, setMoney, uid, esc,
    todayISO, dateLong, dateShort, compute, compressImage,
    toast, openModal, closeModal, confirm, busy
  };
})();
