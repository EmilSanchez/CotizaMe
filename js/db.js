/* =========================================================
   CAPA DE DATOS
   ---------------------------------------------------------
   Firestore (si hay configuración) o modo local (localStorage).
   Estructura en Firestore:
     ajustes/empresa                       -> datos de la empresa y valores por defecto
     cotizaciones/{id}                     -> cotización (sin imágenes)
     cotizaciones/{id}/imagenes/{itemId}   -> foto de cada producto (comprimida)
   Las fotos van en una subcolección para que la cotización
   no supere el límite de 1 MB por documento de Firestore.
   ========================================================= */
const DB = (() => {
  const DEFAULT_CONFIG = {
    nombre: 'Mi empresa',
    subNombre: '',
    nit: '',
    logo: '',
    razon: '',
    direccion: '',
    telefono: '',
    correo: '',
    web: '',
    iva: 19,
    validez: 15,
    prefijo: 'COT',
    siguiente: 1,
    notas: ''
  };

  let mode = 'local';          // 'firebase' | 'local'
  let fs = null;
  let lastError = null;

  /* ---------------- Inicialización ---------------- */
  async function init() {
    const cfg = window.FIREBASE_CONFIG || {};
    if (!cfg.apiKey || !cfg.projectId) { mode = 'local'; return mode; }
    if (typeof firebase === 'undefined') {
      mode = 'local';
      lastError = 'No se pudo cargar la librería de Firebase (revisa tu conexión a internet).';
      return mode;
    }
    try {
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      fs = firebase.firestore();
      // Prueba de lectura para validar reglas y conexión
      await fs.collection('ajustes').doc('empresa').get();
      mode = 'firebase';
    } catch (e) {
      console.error(e);
      lastError = traducirError(e);
      mode = 'error';
    }
    return mode;
  }

  function traducirError(e) {
    const code = (e && e.code) || '';
    if (code.includes('permission-denied')) return 'Firestore rechazó el acceso. Revisa las reglas de seguridad de la base de datos.';
    if (code.includes('unavailable')) return 'No hay conexión con Firestore. Revisa tu internet.';
    if (code.includes('not-found')) return 'No se encontró la base de datos Firestore del proyecto. Créala en la consola de Firebase.';
    return (e && e.message) || 'Error desconocido con la base de datos.';
  }

  function ensureReady() {
    if (mode === 'error') throw new Error(lastError || 'La base de datos no está disponible.');
  }

  /* ---------------- Local (localStorage) ---------------- */
  const LS = {
    get(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (_) { return def; } },
    set(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); }
      catch (e) { throw new Error('El almacenamiento local está lleno. Conecta Firestore para guardar más cotizaciones.'); }
    },
    del(k) { localStorage.removeItem(k); }
  };

  /* ---------------- Configuración ---------------- */
  async function getConfig() {
    ensureReady();
    if (mode === 'local') return { ...DEFAULT_CONFIG, ...LS.get('cz_config', {}) };
    const snap = await fs.collection('ajustes').doc('empresa').get();
    return { ...DEFAULT_CONFIG, ...(snap.exists ? snap.data() : {}) };
  }

  async function saveConfig(data) {
    ensureReady();
    const clean = { ...data, updatedAt: new Date().toISOString() };
    if (mode === 'local') { LS.set('cz_config', { ...LS.get('cz_config', {}), ...clean }); return; }
    await fs.collection('ajustes').doc('empresa').set(clean, { merge: true });
  }

  /** Reserva el siguiente consecutivo de forma segura (transacción) */
  async function nextNumber() {
    ensureReady();
    if (mode === 'local') {
      const c = { ...DEFAULT_CONFIG, ...LS.get('cz_config', {}) };
      const n = Number(c.siguiente) || 1;
      LS.set('cz_config', { ...LS.get('cz_config', {}), siguiente: n + 1 });
      return formatNumero(c.prefijo, n);
    }
    const ref = fs.collection('ajustes').doc('empresa');
    return fs.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const c = { ...DEFAULT_CONFIG, ...(snap.exists ? snap.data() : {}) };
      const n = Number(c.siguiente) || 1;
      tx.set(ref, { siguiente: n + 1 }, { merge: true });
      return formatNumero(c.prefijo, n);
    });
  }
  function formatNumero(prefijo, n) {
    const p = String(prefijo || '').trim();
    return (p ? p + '-' : '') + String(n).padStart(4, '0');
  }

  /* ---------------- Cotizaciones ---------------- */
  function splitImages(quote) {
    const images = {};
    const items = (quote.items || []).map(it => {
      const { img, ...rest } = it;
      if (img) images[it.id] = img;
      return { ...rest, tieneImg: !!img };
    });
    return { items, images };
  }

  function searchText(q) {
    const c = q.cliente || {};
    return [q.numero, c.nombre, c.doc, c.ciudad, c.correo].filter(Boolean).join(' ').toLowerCase();
  }

  /**
   * Guarda (crea o actualiza). Devuelve { id, numero }.
   */
  async function saveQuote(quote) {
    ensureReady();
    const now = new Date().toISOString();
    const { items, images } = splitImages(quote);
    const isNew = !quote.id;
    const numero = quote.numero || await nextNumber();
    const doc = {
      numero,
      fecha: quote.fecha,
      cliente: quote.cliente,
      items,
      iva: quote.iva,
      descuento: quote.descuento,
      envio: quote.envio,
      notas: quote.notas || '',
      validez: quote.validez,
      estado: quote.estado || 'Pendiente',
      totales: U.compute(quote),
      busqueda: '',
      updatedAt: now
    };
    doc.busqueda = searchText(doc);
    if (isNew) doc.createdAt = now;

    if (mode === 'local') {
      const list = LS.get('cz_quotes', []);
      const id = quote.id || U.uid();
      const idx = list.findIndex(x => x.id === id);
      const record = { ...(idx >= 0 ? list[idx] : {}), ...doc, id };
      if (idx >= 0) list[idx] = record; else list.unshift(record);
      LS.set('cz_img_' + id, images);
      LS.set('cz_quotes', list);
      return { id, numero };
    }

    const col = fs.collection('cotizaciones');
    const ref = isNew ? col.doc() : col.doc(quote.id);
    const batch = fs.batch();
    batch.set(ref, doc, { merge: !isNew });

    // Imágenes: escribir las actuales y borrar las que ya no existen
    const imgCol = ref.collection('imagenes');
    if (!isNew) {
      const existing = await imgCol.get();
      existing.forEach(d => { if (!images[d.id]) batch.delete(d.ref); });
    }
    Object.entries(images).forEach(([itemId, data]) => batch.set(imgCol.doc(itemId), { data }));
    await batch.commit();
    return { id: ref.id, numero };
  }

  async function listQuotes() {
    ensureReady();
    if (mode === 'local') {
      return LS.get('cz_quotes', []).slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    }
    const snap = await fs.collection('cotizaciones').orderBy('createdAt', 'desc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  /** Trae la cotización completa con sus imágenes */
  async function getQuote(id) {
    ensureReady();
    let q, images = {};
    if (mode === 'local') {
      q = LS.get('cz_quotes', []).find(x => x.id === id);
      images = LS.get('cz_img_' + id, {});
    } else {
      const ref = fs.collection('cotizaciones').doc(id);
      const [snap, imgs] = await Promise.all([ref.get(), ref.collection('imagenes').get()]);
      if (snap.exists) q = { id: snap.id, ...snap.data() };
      imgs.forEach(d => { images[d.id] = d.data().data; });
    }
    if (!q) throw new Error('La cotización no existe o fue eliminada.');
    q.items = (q.items || []).map(it => ({ ...it, img: images[it.id] || '' }));
    return q;
  }

  async function updateStatus(id, estado) {
    ensureReady();
    const now = new Date().toISOString();
    if (mode === 'local') {
      const list = LS.get('cz_quotes', []);
      const it = list.find(x => x.id === id);
      if (it) { it.estado = estado; it.updatedAt = now; LS.set('cz_quotes', list); }
      return;
    }
    await fs.collection('cotizaciones').doc(id).update({ estado, updatedAt: now });
  }

  async function deleteQuote(id) {
    ensureReady();
    if (mode === 'local') {
      LS.set('cz_quotes', LS.get('cz_quotes', []).filter(x => x.id !== id));
      LS.del('cz_img_' + id);
      return;
    }
    const ref = fs.collection('cotizaciones').doc(id);
    const imgs = await ref.collection('imagenes').get();
    const batch = fs.batch();
    imgs.forEach(d => batch.delete(d.ref));
    batch.delete(ref);
    await batch.commit();
  }

  return {
    init, getConfig, saveConfig, saveQuote, listQuotes, getQuote, updateStatus, deleteQuote,
    get mode() { return mode; },
    get error() { return lastError; },
    DEFAULT_CONFIG
  };
})();
