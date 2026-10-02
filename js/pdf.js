/* =========================================================
   GENERACIÓN DEL PDF Y VISTA PREVIA
   ========================================================= */
const PDF = (() => {
  const { esc, money, dateLong } = U;

  function build(q, cfg) {
    const t = U.compute(q);
    const c = q.cliente || {};
    const ivaPct = Number(q.iva && q.iva.pct) || 0;

    const logo = cfg.logo
      ? `<div class="pdf-logo"><img src="${cfg.logo}" alt=""></div>`
      : '';

    const clientRows = [
      ['Razón social', c.nombre, true],
      [c.tipoDoc || 'NIT', c.doc],
      ['Ciudad', c.ciudad],
      ['Dirección', c.direccion, true],
      ['Correo', c.correo],
      ['Teléfono', c.telefono]
    ].filter(r => r[1])
      .map(([l, v, full]) => `<div class="row${full ? ' full' : ''}"><span class="lbl">${esc(l)}</span><span class="val">${esc(v)}</span></div>`)
      .join('');

    const rows = (q.items || []).map(it => {
      const total = Math.round((Number(it.cantidad) || 0) * (Number(it.valorUnitario) || 0));
      return `
        <tr>
          <td class="p-qty">${esc(it.cantidad)}</td>
          <td class="p-code">${esc(it.codigo || '—')}</td>
          <td class="p-img">${it.img ? `<img src="${it.img}" alt="">` : '<div class="noimg">Sin imagen</div>'}</td>
          <td class="p-desc">${it.nombre ? `<b>${esc(it.nombre)}</b>` : ''}<span>${esc(it.descripcion || '')}</span></td>
          <td class="p-unit">${money(it.valorUnitario)}</td>
          <td class="p-total">${money(total)}</td>
        </tr>`;
    }).join('');

    const notes = [];
    if (Number(q.validez) > 0) {
      notes.push(`<div class="pdf-note-box"><div class="t">Validez de la oferta</div><div class="d">${esc(q.validez)} días a partir de la fecha de emisión.</div></div>`);
    }
    if (q.notas && q.notas.trim()) {
      notes.push(`<div class="pdf-note-box"><div class="t">Observaciones</div><div class="d">${esc(q.notas.trim())}</div></div>`);
    }

    const descRows = t.descuento > 0 ? `
      <div class="r"><span>Descuento aplicado${q.descuento.tipo === 'pct' ? ` (${esc(q.descuento.valor)}%)` : ''}</span><b class="neg">-${money(t.descuento)}</b></div>
      <div class="r"><span>Valor con descuento aplicado</span><b>${money(t.subtotal)}</b></div>` : '';

    const footItems = [
      cfg.direccion && `<div>Dirección: ${esc(cfg.direccion)}</div>`,
      cfg.correo && `<div>Correo: ${esc(cfg.correo)}</div>`,
      cfg.telefono && `<div>Teléfono: ${esc(cfg.telefono)}</div>`,
      cfg.web && `<div>Web: ${esc(cfg.web)}</div>`
    ].filter(Boolean).join('');

    const footName = cfg.razon || [cfg.nombre, cfg.subNombre].filter(Boolean).join(' ').toUpperCase();

    return `
      <div class="pdf-page">
        <div class="pdf-head">
          <div class="pdf-brand">
            ${logo}
            <div>
              <div class="pdf-brand-name">${esc(cfg.nombre)}</div>
              ${cfg.subNombre ? `<div class="pdf-brand-sub">${esc(cfg.subNombre)}</div>` : ''}
              ${cfg.nit ? `<div class="pdf-brand-nit">NIT: ${esc(cfg.nit)}</div>` : ''}
            </div>
          </div>
          <div class="pdf-doc">
            <div class="pdf-doc-title">COTIZACIÓN</div>
            ${q.numero ? `<div class="pdf-doc-num">N.º ${esc(q.numero)}</div>` : ''}
            <div class="pdf-doc-date">${dateLong(q.fecha)}</div>
          </div>
        </div>

        <div class="pdf-body">
          <div class="pdf-h">Datos del cliente</div>
          <div class="pdf-client">${clientRows}</div>

          <div class="pdf-h">Detalle de la cotización</div>
          <table class="pdf-table">
            <thead>
              <tr>
                <th>Cant.</th><th>Código</th><th>Producto</th><th>Descripción</th><th>Valor unitario</th><th>Total</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <div class="pdf-bottom">
            <div class="pdf-notes">${notes.join('')}</div>
            <div class="pdf-totals">
              <div class="r"><span>IVA (${esc(ivaPct)}%)</span><b>${q.iva && q.iva.aplica ? 'Sí' : 'No'}</b></div>
              <div class="r"><span>Valor productos antes de IVA</span><b>${money(t.bruto)}</b></div>
              ${descRows}
              <div class="r"><span>Envío</span>${q.envio && q.envio.gratis ? '<b class="free">GRATIS</b>' : `<b>${money(t.envio)}</b>`}</div>
              <div class="r"><span>Total IVA</span><b>${money(t.iva)}</b></div>
              <div class="grand"><span>Valor total</span><b>${money(t.total)}</b></div>
            </div>
          </div>
        </div>

        <div class="pdf-foot">
          <div class="pdf-foot-name">${esc(footName)}</div>
          <div class="pdf-foot-grid">${footItems}</div>
        </div>
      </div>`;
  }

  function fileName(q) {
    const cliente = String((q.cliente && q.cliente.nombre) || 'Cliente')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 40);
    return `Cotizacion_${q.numero || 'borrador'}_${cliente}.pdf`;
  }

  async function download(q, cfg) {
    if (typeof html2pdf === 'undefined') {
      throw new Error('No se pudo cargar la librería de PDF. Revisa tu conexión a internet.');
    }
    const html = build(q, cfg);
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    // Se entrega como texto: html2pdf crea su propio contenedor alineado en 0,0
    await html2pdf().set({
        margin: 0,
        filename: fileName(q),
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 },
        jsPDF: { unit: 'px', format: [794, 1123], orientation: 'portrait', hotfixes: ['px_scaling'] },
        pagebreak: { mode: ['css'], avoid: ['tr', '.pdf-bottom', '.pdf-foot', '.pdf-client'] }
      }).from(html, 'string').save();
  }

  /** Muestra la vista previa en un modal */
  function preview(q, cfg, onDownload) {
    const wrap = document.createElement('div');
    wrap.className = 'preview-wrap';
    const box = document.createElement('div');
    box.style.margin = '0 auto';
    box.style.overflow = 'hidden';
    const scaler = document.createElement('div');
    scaler.className = 'preview-scale';
    scaler.style.width = '794px';
    scaler.innerHTML = build(q, cfg);
    box.appendChild(scaler);
    wrap.appendChild(box);

    U.openModal({
      title: 'Vista previa de la cotización',
      body: wrap,
      wide: true,
      buttons: [
        { label: 'Cerrar', value: false, cls: 'btn-ghost' },
        {
          label: '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Descargar PDF',
          cls: 'btn-primary',
          onClick: async (btn) => {
            const done = U.busy(btn, 'Generando…');
            try { await onDownload(); U.closeModal(true); }
            catch (e) { U.toast(e.message, 'err'); }
            finally { done(); }
          }
        }
      ]
    });

    // Escalar la hoja al ancho disponible
    requestAnimationFrame(() => {
      const avail = wrap.clientWidth - 40;
      const s = Math.min(1, avail / 794);
      scaler.style.transform = `scale(${s})`;
      box.style.width = (794 * s) + 'px';
      box.style.height = (scaler.offsetHeight * s) + 'px';
    });
  }

  return { build, download, preview, fileName };
})();
