/* =========================================================
   MÓDULO HISTORIAL
   ========================================================= */
const Historial = (() => {
  const { $, $$, esc, money } = U;
  let list = [];
  let loaded = false;

  const ICON = {
    pdf: '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>'
  };

  async function load(force = false) {
    if (loaded && !force) { render(); return; }
    $('#histBody').innerHTML = '<tr class="loading-row"><td colspan="8">Cargando cotizaciones…</td></tr>';
    $('#histEmpty').hidden = true;
    try {
      list = await DB.listQuotes();
      loaded = true;
    } catch (e) {
      list = [];
      U.toast(e.message, 'err', 5000);
    }
    render();
  }

  function inPeriod(fecha, periodo) {
    if (!periodo) return true;
    const d = new Date(fecha + 'T00:00:00');
    const now = new Date();
    if (periodo === 'mes') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    if (periodo === 'anio') return d.getFullYear() === now.getFullYear();
    if (periodo === '30') return (now - d) / 86400000 <= 30;
    return true;
  }

  function filtered() {
    const term = $('#hSearch').value.trim().toLowerCase();
    const estado = $('#hEstado').value;
    const periodo = $('#hPeriodo').value;
    return list.filter(q =>
      (!term || (q.busqueda || '').includes(term)) &&
      (!estado || q.estado === estado) &&
      inPeriod(q.fecha, periodo));
  }

  function render() {
    const rows = filtered();
    paintKpis(rows);
    const body = $('#histBody');
    $('#histEmpty').hidden = rows.length > 0;
    body.innerHTML = rows.map(q => {
      const c = q.cliente || {};
      const n = (q.items || []).length;
      return `
        <tr data-id="${q.id}">
          <td class="h-num">${esc(q.numero)}</td>
          <td class="h-muted">${U.dateShort(q.fecha)}</td>
          <td class="h-client"><b title="${esc(c.nombre)}">${esc(c.nombre)}</b><small>${esc(c.ciudad || '')}</small></td>
          <td class="h-muted">${c.doc ? esc((c.tipoDoc || '') + ' ' + c.doc) : '—'}</td>
          <td class="t-center">${n}</td>
          <td class="t-right h-total">${money(q.totales ? q.totales.total : 0)}</td>
          <td>
            <select class="status-select s-${esc(q.estado)}">
              ${['Pendiente', 'Aprobada', 'Rechazada'].map(s => `<option ${s === q.estado ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </td>
          <td>
            <div class="row-actions">
              <button class="icon-btn" data-a="ver" title="Vista previa">${ICON.eye}</button>
              <button class="icon-btn" data-a="pdf" title="Descargar PDF">${ICON.pdf}</button>
              <button class="icon-btn" data-a="editar" title="Editar">${ICON.edit}</button>
              <button class="icon-btn" data-a="duplicar" title="Duplicar como nueva">${ICON.copy}</button>
              <button class="icon-btn danger" data-a="eliminar" title="Eliminar">${ICON.trash}</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  function paintKpis(rows) {
    $('#kTotal').textContent = rows.length;
    $('#kMonto').textContent = money(rows.reduce((s, q) => s + (q.totales ? q.totales.total : 0), 0));
    $('#kAprob').textContent = rows.filter(q => q.estado === 'Aprobada').length;
    $('#kPend').textContent = rows.filter(q => q.estado === 'Pendiente').length;
  }

  async function action(a, id, btn) {
    const meta = list.find(x => x.id === id);
    if (!meta) return;

    if (a === 'eliminar') {
      const ok = await U.confirm('Eliminar cotización',
        `Se eliminará la cotización <b>${esc(meta.numero)}</b> de <b>${esc(meta.cliente && meta.cliente.nombre)}</b>. Esta acción no se puede deshacer.`,
        'Eliminar', true);
      if (!ok) return;
      try {
        await DB.deleteQuote(id);
        list = list.filter(x => x.id !== id);
        render();
        if (Cotizar.state && Cotizar.state.id === id) Cotizar.reset();
        U.toast(`Cotización ${meta.numero} eliminada`);
      } catch (e) { U.toast(e.message, 'err'); }
      return;
    }

    const done = U.busy(btn, '');
    try {
      const q = await DB.getQuote(id);
      if (a === 'ver') {
        PDF.preview(q, Config.current, () => PDF.download(q, Config.current));
      } else if (a === 'pdf') {
        await PDF.download(q, Config.current);
      } else if (a === 'editar' || a === 'duplicar') {
        const opened = await Cotizar.open(q, a === 'duplicar');
        if (opened) {
          App.go('cotizar');
          U.toast(a === 'editar' ? `Editando ${q.numero}` : `Copia de ${q.numero} lista para guardar como nueva`, 'info');
        }
      }
    } catch (e) {
      U.toast(e.message, 'err');
    } finally { done(); }
  }

  function bind() {
    $('#hSearch').addEventListener('input', render);
    $('#hEstado').addEventListener('change', render);
    $('#hPeriodo').addEventListener('change', render);
    $('#btnRefresh').addEventListener('click', () => load(true));

    $('#histBody').addEventListener('click', e => {
      const btn = e.target.closest('button[data-a]');
      if (!btn) return;
      action(btn.dataset.a, btn.closest('tr').dataset.id, btn);
    });
    $('#histBody').addEventListener('change', async e => {
      const sel = e.target.closest('.status-select');
      if (!sel) return;
      const id = sel.closest('tr').dataset.id;
      const q = list.find(x => x.id === id);
      const prev = q.estado;
      sel.className = 'status-select s-' + sel.value;
      try {
        await DB.updateStatus(id, sel.value);
        q.estado = sel.value;
        paintKpis(filtered());
        U.toast(`${q.numero}: ${sel.value}`);
      } catch (err) {
        sel.value = prev; sel.className = 'status-select s-' + prev;
        U.toast(err.message, 'err');
      }
    });
  }

  return {
    bind, load,
    invalidate() { loaded = false; }
  };
})();
