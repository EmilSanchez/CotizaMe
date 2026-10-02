/* =========================================================
   MÓDULO COTIZAR
   ========================================================= */
const Cotizar = (() => {
  const { $, $$, money, esc } = U;
  let state = null;
  let dirty = false;

  const ICON = {
    img: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>'
  };

  function newItem() {
    return { id: U.uid(), cantidad: 1, codigo: '', nombre: '', descripcion: '', valorUnitario: 0, img: '' };
  }

  function blank() {
    const cfg = Config.current;
    return {
      id: null,
      numero: null,
      fecha: U.todayISO(),
      estado: 'Pendiente',
      cliente: { nombre: '', tipoDoc: 'NIT', doc: '', ciudad: '', direccion: '', correo: '', telefono: '' },
      items: [newItem()],
      iva: { aplica: true, pct: Number(cfg.iva) || 19 },
      descuento: { tipo: 'pct', valor: 0 },
      envio: { gratis: false, valor: 0 },
      notas: cfg.notas || '',
      validez: cfg.validez ?? 15
    };
  }

  /* ---------------- Carga en el formulario ---------------- */
  const CLIENT = { cNombre: 'nombre', cTipoDoc: 'tipoDoc', cDoc: 'doc', cCiudad: 'ciudad', cDireccion: 'direccion', cCorreo: 'correo', cTelefono: 'telefono' };

  function load(q) {
    state = JSON.parse(JSON.stringify(q));
    if (!state.items || !state.items.length) state.items = [newItem()];
    Object.entries(CLIENT).forEach(([id, k]) => { $('#' + id).value = state.cliente[k] || (k === 'tipoDoc' ? 'NIT' : ''); });
    $('#cFecha').value = state.fecha || U.todayISO();
    $('#cValidez').value = state.validez ?? '';
    $('#cNotas').value = state.notas || '';

    $('#ivaPct').value = state.iva.pct;
    setSwitch(state.iva.aplica);

    $$('#discSeg button').forEach(b => b.classList.toggle('active', b.dataset.t === state.descuento.tipo));
    paintDiscInput();

    U.setMoney($('#envioValor'), state.envio.valor);
    $('#envioGratis').checked = !!state.envio.gratis;
    paintEnvio();

    $$('.input.invalid').forEach(el => el.classList.remove('invalid'));
    renderItems();
    paintHeader();
    recalc();
    dirty = false;
  }

  function paintHeader() {
    const badge = $('#cotNumero');
    if (state.id) {
      badge.textContent = state.numero;
      badge.classList.add('saved');
      $('#cotEyebrow').textContent = 'Editando cotización';
      $('#btnGuardar span').textContent = 'Actualizar';
    } else {
      badge.textContent = 'Sin guardar';
      badge.classList.remove('saved');
      $('#cotEyebrow').textContent = 'Nueva cotización';
      $('#btnGuardar span').textContent = 'Guardar';
    }
  }

  /* ---------------- Tabla de productos ---------------- */
  function rowHtml(it, i) {
    return `
      <tr data-id="${it.id}">
        <td class="c-n">${i + 1}</td>
        <td class="c-qty"><input class="input in-qty" type="number" min="1" step="1" value="${esc(it.cantidad)}"></td>
        <td class="c-code"><input class="input in-code" placeholder="Código" value="${esc(it.codigo)}"></td>
        <td class="c-img">
          <div class="drop ${it.img ? 'has-img' : ''}" title="Arrastra una imagen o haz clic">
            ${it.img
              ? `<img src="${it.img}" alt=""><button class="rm-img" title="Quitar imagen">${ICON.x}</button>`
              : `<div class="ph">${ICON.img}<span>Arrastra o<br>haz clic</span></div>`}
            <input type="file" accept="image/*" hidden>
          </div>
        </td>
        <td class="c-desc">
          <input class="input in-name" placeholder="Nombre del producto" value="${esc(it.nombre)}">
          <textarea class="input in-desc" placeholder="Características, referencia, color, garantía…">${esc(it.descripcion)}</textarea>
        </td>
        <td class="c-unit"><input class="input in-unit" placeholder="$0" value="${it.valorUnitario ? '$' + U.thousands(it.valorUnitario) : ''}"></td>
        <td class="c-total">${money(lineTotal(it))}</td>
        <td class="c-act"><button class="icon-btn danger btn-rm" title="Eliminar producto">${ICON.trash}</button></td>
      </tr>`;
  }

  function lineTotal(it) { return Math.round((Number(it.cantidad) || 0) * (Number(it.valorUnitario) || 0)); }

  function renderItems() {
    const body = $('#itemsBody');
    body.innerHTML = state.items.map(rowHtml).join('');
    $$('tr', body).forEach(bindRow);
    const n = state.items.length;
    $('#itemsCount').textContent = `${n} producto${n === 1 ? '' : 's'}`;
  }

  function findItem(tr) { return state.items.find(x => x.id === tr.dataset.id); }

  function bindRow(tr) {
    const it = findItem(tr);
    const totalCell = $('.c-total', tr);
    const updTotal = () => { totalCell.textContent = money(lineTotal(it)); recalc(); dirty = true; };

    $('.in-qty', tr).addEventListener('input', e => { it.cantidad = Math.max(0, parseInt(e.target.value, 10) || 0); updTotal(); });
    $('.in-code', tr).addEventListener('input', e => { it.codigo = e.target.value; dirty = true; });
    $('.in-name', tr).addEventListener('input', e => { it.nombre = e.target.value; e.target.classList.remove('invalid'); dirty = true; });
    $('.in-desc', tr).addEventListener('input', e => { it.descripcion = e.target.value; dirty = true; });
    U.bindMoney($('.in-unit', tr), v => { it.valorUnitario = v; $('.in-unit', tr).classList.remove('invalid'); updTotal(); });

    $('.btn-rm', tr).addEventListener('click', async () => {
      const hasData = it.nombre || it.valorUnitario || it.img;
      if (hasData && !(await U.confirm('Eliminar producto', `¿Quitar <b>${esc(it.nombre || 'este producto')}</b> de la cotización?`, 'Eliminar', true))) return;
      state.items = state.items.filter(x => x !== it);
      if (!state.items.length) state.items.push(newItem());
      renderItems(); recalc(); dirty = true;
    });

    // Imagen: clic, arrastrar y soltar
    const drop = $('.drop', tr);
    const file = $('input[type=file]', drop);
    drop.addEventListener('click', e => {
      if (e.target.closest('.rm-img')) return;
      file.click();
    });
    file.addEventListener('change', () => { setImage(it, file.files[0], drop); file.value = ''; });
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => setImage(it, e.dataTransfer.files[0], drop));
    const rm = $('.rm-img', drop);
    if (rm) rm.addEventListener('click', e => { e.stopPropagation(); it.img = ''; repaintDrop(drop, it); dirty = true; });
  }

  async function setImage(it, file, drop) {
    if (!file) return;
    drop.classList.add('loading');
    try {
      it.img = await U.compressImage(file, 600, 'image/jpeg', 0.8);
      repaintDrop(drop, it);
      dirty = true;
    } catch (e) { U.toast(e.message, 'err'); }
    finally { drop.classList.remove('loading'); }
  }

  function repaintDrop(drop, it) {
    const tr = drop.closest('tr');
    const fresh = document.createElement('tbody');
    fresh.innerHTML = rowHtml(it, state.items.indexOf(it));
    const newTr = fresh.firstElementChild;
    tr.replaceWith(newTr);
    bindRow(newTr);
  }

  /* ---------------- Resumen ---------------- */
  function setSwitch(on) {
    const sw = $('#swIva');
    sw.classList.toggle('on', on);
    sw.setAttribute('aria-checked', on);
  }

  function paintDiscInput() {
    const inp = $('#discValor');
    const v = state.descuento.valor;
    if (state.descuento.tipo === 'pct') {
      inp.placeholder = '0 %';
      inp.value = v ? String(v).replace('.', ',') : '';
      inp.setAttribute('inputmode', 'decimal');
    } else {
      inp.placeholder = '$0';
      inp.value = v ? '$' + U.thousands(v) : '';
      inp.setAttribute('inputmode', 'numeric');
    }
  }

  function paintEnvio() {
    const gratis = state.envio.gratis;
    $('#envioValor').disabled = gratis;
    $('#envioHint').textContent = gratis ? 'Se mostrará como GRATIS' : 'Valor del envío';
  }

  function recalc() {
    const t = U.compute(state);
    $('#tIvaPct').textContent = String(state.iva.pct).replace('.', ',');
    const tag = $('#tIvaAplica');
    tag.textContent = state.iva.aplica ? 'Sí' : 'No';
    tag.className = 'tag ' + (state.iva.aplica ? 'tag-green' : 'tag-gray');
    $('#tBruto').textContent = money(t.bruto);
    $('#tDesc').textContent = t.descuento ? '-' + money(t.descuento) : money(0);
    $('#tSub').textContent = money(t.subtotal);
    const env = $('#tEnvio');
    if (state.envio.gratis) { env.textContent = 'GRATIS'; env.className = 'free'; }
    else { env.textContent = money(t.envio); env.className = ''; }
    $('#tIva').textContent = money(t.iva);
    $('#tTotal').textContent = money(t.total);
  }

  /* ---------------- Recolectar y validar ---------------- */
  function collect() {
    Object.entries(CLIENT).forEach(([id, k]) => { state.cliente[k] = $('#' + id).value.trim(); });
    state.fecha = $('#cFecha').value || U.todayISO();
    state.validez = parseInt($('#cValidez').value, 10) || 0;
    state.notas = $('#cNotas').value.trim();
    return state;
  }

  function validate() {
    let first = null;
    const mark = el => { el.classList.add('invalid'); if (!first) first = el; };

    if (!state.cliente.nombre) mark($('#cNombre'));

    // Se ignoran filas totalmente vacías
    const filled = state.items.filter(it => it.nombre || it.valorUnitario || it.codigo || it.img || it.descripcion);
    if (!filled.length) {
      const tr = $('#itemsBody tr');
      if (tr) mark($('.in-name', tr));
    }
    filled.forEach(it => {
      const tr = $(`#itemsBody tr[data-id="${it.id}"]`);
      if (!it.nombre) mark($('.in-name', tr));
      if (!it.valorUnitario) mark($('.in-unit', tr));
      if (!it.cantidad) mark($('.in-qty', tr));
    });

    if (first) {
      first.focus();
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      U.toast('Completa los campos marcados en rojo', 'err');
      return false;
    }
    if (filled.length !== state.items.length) { state.items = filled; renderItems(); }
    return true;
  }

  /* ---------------- Acciones ---------------- */
  async function save(withPdf, btn) {
    collect();
    if (!validate()) return;
    const done = U.busy(btn, withPdf ? 'Generando…' : 'Guardando…');
    try {
      const { id, numero } = await DB.saveQuote(state);
      const wasNew = !state.id;
      state.id = id; state.numero = numero;
      paintHeader();
      dirty = false;
      U.toast(wasNew ? `Cotización ${numero} guardada` : `Cotización ${numero} actualizada`);
      Config.refreshCounter();
      Historial.invalidate();
      if (withPdf) await PDF.download(state, Config.current);
    } catch (e) {
      console.error(e);
      U.toast(e.message || 'No se pudo guardar', 'err', 5000);
    } finally { done(); }
  }

  async function startNew() {
    if (dirty && !(await U.confirm('Nueva cotización', 'Hay cambios sin guardar en la cotización actual. ¿Deseas descartarlos?', 'Descartar', true))) return;
    load(blank());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function previewNow() {
    collect();
    const q = { ...state, items: state.items.filter(it => it.nombre || it.valorUnitario) };
    PDF.preview(q, Config.current, () => PDF.download(q, Config.current));
  }

  /** Abrir una cotización desde el historial (editar o duplicar) */
  async function open(q, asCopy = false) {
    if (dirty && !(await U.confirm('Abrir cotización', 'Hay cambios sin guardar en la cotización actual. ¿Deseas descartarlos?', 'Descartar', true))) return false;
    const copy = JSON.parse(JSON.stringify(q));
    if (asCopy) {
      copy.id = null; copy.numero = null; copy.fecha = U.todayISO(); copy.estado = 'Pendiente';
      copy.items = copy.items.map(it => ({ ...it, id: U.uid() }));
    }
    load(copy);
    return true;
  }

  function bind() {
    $('#btnAddItem').addEventListener('click', () => {
      state.items.push(newItem());
      renderItems();
      const last = $('#itemsBody tr:last-child .in-qty');
      if (last) last.focus();
      dirty = true;
    });

    $('#swIva').addEventListener('click', () => { state.iva.aplica = !state.iva.aplica; setSwitch(state.iva.aplica); recalc(); dirty = true; });
    $('#ivaPct').addEventListener('input', e => { state.iva.pct = Math.min(100, U.parsePct(e.target.value)); recalc(); dirty = true; });

    $$('#discSeg button').forEach(b => b.addEventListener('click', () => {
      if (state.descuento.tipo === b.dataset.t) return;
      state.descuento = { tipo: b.dataset.t, valor: 0 };
      $$('#discSeg button').forEach(x => x.classList.toggle('active', x === b));
      paintDiscInput(); recalc(); dirty = true;
      $('#discValor').focus();
    }));
    $('#discValor').addEventListener('input', e => {
      const inp = e.target;
      if (state.descuento.tipo === 'pct') {
        inp.value = inp.value.replace(/[^\d.,]/g, '');
        state.descuento.valor = Math.min(100, U.parsePct(inp.value));
      } else {
        const v = U.parseMoney(inp.value);
        inp.value = inp.value.trim() === '' ? '' : '$' + U.thousands(v);
        state.descuento.valor = v;
      }
      recalc(); dirty = true;
    });

    U.bindMoney($('#envioValor'), v => { state.envio.valor = v; recalc(); dirty = true; });
    $('#envioGratis').addEventListener('change', e => { state.envio.gratis = e.target.checked; paintEnvio(); recalc(); dirty = true; });

    Object.keys(CLIENT).forEach(id => $('#' + id).addEventListener('input', e => { e.target.classList.remove('invalid'); dirty = true; }));
    ['cFecha', 'cValidez', 'cNotas'].forEach(id => $('#' + id).addEventListener('input', () => { dirty = true; }));

    $('#btnNueva').addEventListener('click', startNew);
    $('#btnPreview').addEventListener('click', previewNow);
    $('#btnGuardar').addEventListener('click', e => save(false, e.currentTarget));
    $('#btnGuardarPdf').addEventListener('click', e => save(true, e.currentTarget));

    window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  }

  return {
    bind, open,
    reset() { load(blank()); },
    get state() { return state; }
  };
})();
