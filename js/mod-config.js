/* =========================================================
   MÓDULO CONFIGURACIÓN
   ========================================================= */
const Config = (() => {
  const { $ } = U;
  let current = { ...DB.DEFAULT_CONFIG };
  let logoData = '';

  const FIELDS = {
    eNombre: 'nombre', eSub: 'subNombre', eNit: 'nit',
    eRazon: 'razon', eDireccion: 'direccion', eTelefono: 'telefono', eCorreo: 'correo', eWeb: 'web',
    ePrefijo: 'prefijo', eNotas: 'notas'
  };

  async function load() {
    try {
      current = await DB.getConfig();
    } catch (e) {
      current = { ...DB.DEFAULT_CONFIG };
      U.toast(e.message, 'err', 5000);
    }
    fillForm();
    paintSidebar();
    return current;
  }

  function fillForm() {
    Object.entries(FIELDS).forEach(([id, key]) => { $('#' + id).value = current[key] ?? ''; });
    $('#eIva').value = current.iva ?? 19;
    $('#eValidez').value = current.validez ?? 15;
    $('#eSiguiente').value = current.siguiente ?? 1;
    setLogo(current.logo || '');
  }

  function setLogo(data) {
    logoData = data;
    const img = $('#logoPreview');
    img.hidden = !data;
    $('#logoEmpty').hidden = !!data;
    if (data) img.src = data; else img.removeAttribute('src');
    $('#btnLogoRemove').hidden = !data;
  }

  async function handleLogo(file) {
    if (!file) return;
    try {
      // PNG para conservar transparencia
      const data = await U.compressImage(file, 360, 'image/png');
      setLogo(data);
      U.toast('Logo cargado. Recuerda guardar los cambios.', 'info');
    } catch (e) { U.toast(e.message, 'err'); }
  }

  function paintSidebar() {
    $('#sbName').textContent = current.nombre || 'Mi empresa';
    $('#sbSub').textContent = current.subNombre || 'Cotizador';
    const box = $('#sbLogo');
    if (current.logo) box.innerHTML = `<img src="${current.logo}" alt="">`;
  }

  async function save() {
    const nombre = $('#eNombre').value.trim();
    if (!nombre) {
      $('#eNombre').classList.add('invalid');
      $('#eNombre').focus();
      U.toast('El nombre de la empresa es obligatorio', 'err');
      return;
    }
    const data = {};
    Object.entries(FIELDS).forEach(([id, key]) => { data[key] = $('#' + id).value.trim(); });
    data.iva = U.parsePct($('#eIva').value);
    data.validez = parseInt($('#eValidez').value, 10) || 0;
    data.siguiente = Math.max(1, parseInt($('#eSiguiente').value, 10) || 1);
    data.logo = logoData;

    const done = U.busy($('#btnSaveConfig'), 'Guardando…');
    try {
      await DB.saveConfig(data);
      current = { ...current, ...data };
      paintSidebar();
      if (!current.logo) $('#sbLogo').innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1M9 13h1M9 17h1M14 9h1M14 13h1M14 17h1"/></svg>';
      U.toast('Configuración guardada');
    } catch (e) {
      U.toast(e.message, 'err', 5000);
    } finally { done(); }
  }

  function renderDbBox() {
    const box = $('#dbBox');
    const m = DB.mode;
    if (m === 'firebase') {
      const pid = (window.FIREBASE_CONFIG || {}).projectId;
      box.innerHTML = `
        <div class="db-state online">
          <svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/></svg>
          <div><b>Conectado a Firestore</b><small>Proyecto: ${U.esc(pid)}</small></div>
        </div>
        <p>La configuración y el historial se guardan en la nube y se comparten entre los equipos que usen este sistema.</p>`;
    } else if (m === 'error') {
      box.innerHTML = `
        <div class="db-state error">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          <div><b>Error de conexión</b><small>${U.esc(DB.error)}</small></div>
        </div>
        <p>Revisa los datos en <code>js/firebase-config.js</code> y las reglas de Firestore (ver README).</p>`;
    } else {
      box.innerHTML = `
        <div class="db-state local">
          <svg viewBox="0 0 24 24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
          <div><b>Modo local</b><small>${DB.error ? U.esc(DB.error) : 'Los datos se guardan solo en este navegador'}</small></div>
        </div>
        <p>Para conectar Firestore:</p>
        <ol>
          <li>Crea un proyecto en la consola de Firebase y habilita <b>Firestore Database</b>.</li>
          <li>Registra una app web y copia su configuración.</li>
          <li>Pégala en <code>js/firebase-config.js</code> y recarga la página.</li>
        </ol>`;
    }
  }

  function bind() {
    const drop = $('#logoDrop');
    const file = $('#logoFile');
    drop.addEventListener('click', () => file.click());
    $('#btnLogoChange').addEventListener('click', () => file.click());
    file.addEventListener('change', () => { handleLogo(file.files[0]); file.value = ''; });
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => handleLogo(e.dataTransfer.files[0]));
    $('#btnLogoRemove').addEventListener('click', () => setLogo(''));
    $('#btnSaveConfig').addEventListener('click', save);
    $('#eNombre').addEventListener('input', e => e.target.classList.remove('invalid'));
  }

  return {
    bind, load, renderDbBox,
    get current() { return current; },
    async refreshCounter() {
      // Mantiene el campo "Próximo número" al día tras guardar cotizaciones
      try { const c = await DB.getConfig(); current.siguiente = c.siguiente; $('#eSiguiente').value = c.siguiente; } catch (_) { /* noop */ }
    }
  };
})();
