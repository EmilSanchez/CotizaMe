/* =========================================================
   APP — arranque y navegación entre módulos
   ========================================================= */
const App = (() => {
  const { $, $$ } = U;

  function go(view) {
    $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
    if (view === 'historial') Historial.load();
    if (view === 'config') Config.renderDbBox();
    window.scrollTo({ top: 0 });
  }

  function paintStatus() {
    const el = $('#dbStatus');
    const txt = $('.txt', el);
    el.classList.remove('online', 'local', 'error');
    if (DB.mode === 'firebase') { el.classList.add('online'); txt.textContent = 'Firestore conectado'; }
    else if (DB.mode === 'error') { el.classList.add('error'); txt.textContent = 'Error de conexión'; }
    else { el.classList.add('local'); txt.textContent = 'Modo local'; }
    el.title = DB.error || '';
  }

  async function start() {
    $$('.nav-item').forEach(n => n.addEventListener('click', () => go(n.dataset.view)));
    $('#modalClose').addEventListener('click', () => U.closeModal(false));
    $('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') U.closeModal(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) U.closeModal(false); });

    Config.bind();
    Cotizar.bind();
    Historial.bind();

    await DB.init();
    paintStatus();
    if (DB.mode === 'error') U.toast(DB.error, 'err', 7000);

    await Config.load();
    Cotizar.reset();
  }

  document.addEventListener('DOMContentLoaded', start);
  return { go };
})();
