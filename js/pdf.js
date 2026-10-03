/* =========================================================
   GENERACIÓN DEL PDF Y VISTA PREVIA
   ---------------------------------------------------------
   El documento se arma en hojas A4 (794 x 1123 px) y se pagina
   a mano para que:
     - el encabezado y el pie aparezcan en TODAS las hojas,
     - los datos del cliente salgan solo en la primera,
     - ninguna fila de producto quede partida entre dos hojas.
   ========================================================= */
const PDF = (() => {
  const { esc, money, dateLong } = U;
  const PAGE_W = 794;
  const PAGE_H = 1123;

  /* ---------------- Piezas de la hoja ---------------- */
  function headerHtml(q, cfg) {
    const logo = cfg.logo ? `<div class="pdf-logo"><img src="${cfg.logo}" alt=""></div>` : '';
    return `
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
      </div>`;
  }

  function footerHtml(cfg, page, pages) {
    const items = [
      cfg.direccion && `<div>Dirección: ${esc(cfg.direccion)}</div>`,
      cfg.correo && `<div>Correo: ${esc(cfg.correo)}</div>`,
      cfg.telefono && `<div>Teléfono: ${esc(cfg.telefono)}</div>`,
      cfg.web && `<div>Web: ${esc(cfg.web)}</div>`
    ].filter(Boolean).join('');
    const name = cfg.razon || [cfg.nombre, cfg.subNombre].filter(Boolean).join(' ').toUpperCase();
    return `
      <div class="pdf-foot">
        <div class="pdf-foot-top">
          <div class="pdf-foot-name">${esc(name)}</div>
          ${pages > 1 ? `<div class="pdf-foot-page">Página ${page} de ${pages}</div>` : ''}
        </div>
        <div class="pdf-foot-grid">${items}</div>
      </div>`;
  }

  function clientHtml(q) {
    const c = q.cliente || {};
    const rows = [
      ['Razón social', c.nombre],
      [c.tipoDoc || 'NIT', c.doc],
      ['Ciudad', c.ciudad],
      ['Dirección', c.direccion],
      ['Correo', c.correo],
      ['Teléfono', c.telefono]
    ].filter(r => r[1])
      .map(([l, v]) => `<div class="row"><span class="lbl">${esc(l)}</span><span class="val">${esc(v)}</span></div>`)
      .join('');
    if (!rows) return '';
    return `<div class="pdf-sec"><div class="pdf-h">Datos del cliente</div><div class="pdf-client">${rows}</div></div>`;
  }

  const THEAD = `
    <thead>
      <tr>
        <th>Cant.</th><th class="p-code">Código</th><th>Producto</th><th>Descripción</th>
        <th class="p-unit">Valor<br>unitario</th><th class="p-total">Valor<br>total</th>
      </tr>
    </thead>`;

  function rowHtml(it) {
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
  }

  function tableHtml(rows, cont) {
    return `
      <div class="pdf-sec pdf-sec-table">
        <div class="pdf-h">Detalle de la cotización${cont ? ' <span class="pdf-cont">(continuación)</span>' : ''}</div>
        <table class="pdf-table">${THEAD}<tbody>${rows.join('')}</tbody></table>
      </div>`;
  }

  function bottomHtml(q) {
    const t = U.compute(q);
    const ivaPct = Number(q.iva && q.iva.pct) || 0;
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

    return `
      <div class="pdf-sec">
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
      </div>`;
  }

  function pageHtml(q, cfg, bodyHtml, page, pages) {
    return `
      <div class="pdf-page">
        ${headerHtml(q, cfg)}
        <div class="pdf-body">${bodyHtml}</div>
        ${footerHtml(cfg, page, pages)}
      </div>`;
  }

  /* ---------------- Paginación ---------------- */
  function waitImages(root) {
    return Promise.all(Array.from(root.querySelectorAll('img')).map(img =>
      img.complete && img.naturalWidth ? null : new Promise(r => { img.onload = img.onerror = r; })));
  }

  function makeHost() {
    const host = document.createElement('div');
    host.className = 'pdf-host';
    document.body.appendChild(host);
    return host;
  }

  /**
   * Mide cada bloque en una hoja de prueba y reparte las filas
   * en tantas hojas como hagan falta. Devuelve un arreglo con el
   * HTML del cuerpo de cada hoja.
   */
  async function paginate(q, cfg) {
    const items = q.items || [];
    const rows = items.map(rowHtml);
    const client = clientHtml(q);
    const bottom = bottomHtml(q);

    const host = makeHost();
    host.innerHTML = pageHtml(q, cfg, `
      <div data-m="client">${client}</div>
      <div data-m="table">${tableHtml(rows, false)}</div>
      <div data-m="tablecont">${tableHtml([], true)}</div>
      <div data-m="bottom">${bottom}</div>`, 1, 2);
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      await waitImages(host);

      const page = host.querySelector('.pdf-page');
      const body = host.querySelector('.pdf-body');
      const cs = getComputedStyle(body);
      const avail = PAGE_H
        - host.querySelector('.pdf-head').offsetHeight
        - host.querySelector('.pdf-foot').offsetHeight
        - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
        - 6; // margen de seguridad
      const h = sel => page.querySelector(`[data-m="${sel}"]`).offsetHeight;

      const clientH = h('client');
      const tableEmptyH = h('tablecont');           // título + encabezado de tabla + margen
      const bottomH = h('bottom');
      const rowH = Array.from(page.querySelectorAll('[data-m="table"] tbody tr')).map(tr => tr.offsetHeight);

      const pages = [];
      let cur = { client: true, rows: [], cont: false };
      let used = clientH + tableEmptyH;

      rowH.forEach((rh, i) => {
        if (used + rh > avail && cur.rows.length) {
          pages.push(cur);
          cur = { client: false, rows: [], cont: true };
          used = tableEmptyH;
        }
        cur.rows.push(rows[i]);
        used += rh;
      });

      let bottomAlone = false;
      if (used + bottomH > avail) { pages.push(cur); bottomAlone = true; }
      else cur.bottom = true;
      if (!bottomAlone) pages.push(cur);
      else pages.push({ client: false, rows: [], bottom: true });

      return pages.map(p => [
        p.client ? client : '',
        p.rows.length || (!p.bottom) ? tableHtml(p.rows, p.cont) : '',
        p.bottom ? bottom : ''
      ].join(''));
    } finally {
      host.remove();
    }
  }

  /** HTML de todas las hojas, listas para mostrar o capturar */
  async function buildPages(q, cfg) {
    const bodies = await paginate(q, cfg);
    return bodies.map((b, i) => pageHtml(q, cfg, b, i + 1, bodies.length));
  }

  /* ---------------- Descarga ---------------- */
  function fileName(q) {
    const cliente = String((q.cliente && q.cliente.nombre) || 'Cliente')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 40);
    return `Cotizacion_${q.numero || 'borrador'}_${cliente}.pdf`;
  }

  async function download(q, cfg) {
    if (typeof html2canvas === 'undefined' || !window.jspdf) {
      throw new Error('No se pudo cargar la librería de PDF. Revisa tu conexión a internet.');
    }
    const pages = await buildPages(q, cfg);
    const host = makeHost();
    host.innerHTML = pages.join('');
    // La barra de desplazamiento de Windows puede correr la captura unos píxeles
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    try {
      await waitImages(host);
      const pdf = new window.jspdf.jsPDF({ unit: 'px', format: [PAGE_W, PAGE_H], orientation: 'portrait', hotfixes: ['px_scaling'] });
      const els = Array.from(host.querySelectorAll('.pdf-page'));
      for (let i = 0; i < els.length; i++) {
        const canvas = await html2canvas(els[i], {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          width: PAGE_W,
          height: PAGE_H,
          scrollX: 0,
          scrollY: 0,
          logging: false,
          onclone: doc => { const h = doc.querySelector('.pdf-host'); if (h) h.style.visibility = 'visible'; }
        });
        if (i > 0) pdf.addPage([PAGE_W, PAGE_H], 'portrait');
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, PAGE_W, PAGE_H);
      }
      pdf.save(fileName(q));
    } finally {
      root.style.overflow = prevOverflow;
      host.remove();
    }
  }

  /* ---------------- Vista previa ---------------- */
  async function preview(q, cfg, onDownload) {
    const pages = await buildPages(q, cfg);
    const wrap = document.createElement('div');
    wrap.className = 'preview-wrap';
    const boxes = pages.map(html => {
      const box = document.createElement('div');
      box.className = 'preview-box';
      const scaler = document.createElement('div');
      scaler.className = 'preview-scale';
      scaler.innerHTML = html;
      box.appendChild(scaler);
      wrap.appendChild(box);
      return { box, scaler };
    });

    U.openModal({
      title: `Vista previa de la cotización${pages.length > 1 ? ` · ${pages.length} páginas` : ''}`,
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

    // Escalar cada hoja al ancho disponible
    requestAnimationFrame(() => {
      const s = Math.min(1, (wrap.clientWidth - 40) / PAGE_W);
      boxes.forEach(({ box, scaler }) => {
        scaler.style.transform = `scale(${s})`;
        box.style.width = (PAGE_W * s) + 'px';
        box.style.height = (PAGE_H * s) + 'px';
      });
    });
  }

  return { download, preview, fileName, buildPages };
})();