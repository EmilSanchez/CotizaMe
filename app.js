/* =========================================================
   Cotizador de envíos – Centris Ventas
   ========================================================= */
(() => {
  const MAX_POR_CAJA = 4;
  const TASA_IMPUESTO = 0.29;
  const G_POR_LB = 453.592;
  const STORAGE_KEY = "centrisVentas.cotizacion.v1";

  const TARIFAS_DEFECTO = { t1: 26000, t2: 34000, t3: 44000, tExtra: 10000 };

  // ---------- Estado ----------
  let estado = {
    cliente: "",
    telefono: "",
    fecha: hoyISO(),
    numero: nuevoNumero(),
    productos: [], // {id, nombre, peso (lb), unidad ("lb"|"g"), cantidad, foto}
    unidad: "lb",
    impuestoOn: false,
    valorUsd: "",
    dolar: "",
    tarifas: { ...TARIFAS_DEFECTO },
  };

  let fotoActual = "";

  // ---------- Utilidades ----------
  const $ = (id) => document.getElementById(id);

  const fmtCOP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
  const fmtUSD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
  const fmtNum = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
  const fmtG = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

  /** Muestra un peso (guardado en lb) en la unidad indicada */
  function textoPeso(lb, unidad) {
    return unidad === "g" ? `${fmtG.format(lb * G_POR_LB)} g` : `${fmtNum.format(lb)} lb`;
  }
  function actualizarPlaceholderPeso() {
    $("peso").placeholder = estado.unidad === "g" ? "250" : "0.50";
    $("peso").step = "any";
  }

  function hoyISO() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  function nuevoNumero() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `CV-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  }
  function fechaLarga(iso) {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
  }
  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function num(v) {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  /** Valor del envío según el peso total (lb) de la línea */
  function valorEnvio(pesoTotal) {
    const t = estado.tarifas;
    if (pesoTotal <= 0) return 0;
    if (pesoTotal <= 1) return num(t.t1);
    if (pesoTotal <= 2) return num(t.t2);
    if (pesoTotal <= 3) return num(t.t3);
    return num(t.t3) + Math.ceil(pesoTotal - 3) * num(t.tExtra);
  }

  // ---------- Persistencia (opcional) ----------
  function guardar() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(estado)); } catch (e) { /* sin almacenamiento */ }
  }
  function cargar() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        estado = { ...estado, ...data, tarifas: { ...TARIFAS_DEFECTO, ...(data.tarifas || {}) } };
      }
    } catch (e) { /* ignorar */ }
  }

  // ---------- Foto: redimensionar para que el PDF quede liviano ----------
  function leerFoto(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 400;
          const esc = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement("canvas");
          c.width = Math.round(img.width * esc);
          c.height = Math.round(img.height * esc);
          const ctx = c.getContext("2d");
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/jpeg", 0.82));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function limpiarFormulario() {
    $("formProducto").reset();
    $("cantidad").value = 1;
    $("unidad").value = estado.unidad || "lb"; // conserva la unidad elegida
    fotoActual = "";
    $("fotoPreview").hidden = true;
    $("fotoPreview").removeAttribute("src");
    $("fotoTexto").hidden = false;
    $("msgForm").textContent = "";
  }

  // ---------- Render ----------
  function render() {
    // Encabezado
    $("vNumero").textContent = estado.numero || "—";
    $("vFecha").textContent = fechaLarga(estado.fecha);
    $("vCliente").textContent = estado.cliente || "—";
    $("vTelefono").textContent = estado.telefono || "—";
    $("vTelWrap").hidden = !estado.telefono;

    // Tabla
    const tbody = $("tbody");
    tbody.innerHTML = "";
    let pesoTotal = 0;
    let totalEnvio = 0;

    estado.productos.forEach((p) => {
      const unidad = p.unidad || "lb";
      const pesoLinea = num(p.peso) * p.cantidad;
      const envio = valorEnvio(pesoLinea);
      pesoTotal += pesoLinea;
      totalEnvio += envio;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="c-cant">
          <input type="number" class="qty no-print-input" min="1" max="${MAX_POR_CAJA}" step="1" value="${p.cantidad}" data-id="${p.id}" aria-label="Cantidad">
          <span class="qty-print">${p.cantidad}</span>
        </td>
        <td class="c-foto">
          ${p.foto
            ? `<img class="foto-cel" src="${p.foto}" alt="${escapeHTML(p.nombre)}">`
            : `<div class="foto-cel foto-vacia">Sin foto</div>`}
        </td>
        <td>
          <span class="nombre-prod">${escapeHTML(p.nombre)}</span>
          <span class="peso-det">${textoPeso(num(p.peso), unidad)} c/u</span>
        </td>
        <td class="num">${textoPeso(pesoLinea, unidad)}${unidad === "g" ? `<span class="peso-det">${textoPeso(pesoLinea, "lb")}</span>` : ""}</td>
        <td class="num"><strong>${fmtCOP.format(envio)}</strong></td>
        <td class="no-print c-del"><button class="del" data-del="${p.id}" title="Eliminar">×</button></td>
      `;
      tbody.appendChild(tr);
    });

    $("vacio").hidden = estado.productos.length > 0;
    $("vPesoTotal").textContent = `${textoPeso(pesoTotal, "lb")} (${textoPeso(pesoTotal, "g")})`;
    $("vTotalEnvio").textContent = fmtCOP.format(totalEnvio);

    // Impuesto
    $("impuestoCampos").classList.toggle("disabled", !estado.impuestoOn);
    $("vImpuesto").hidden = !estado.impuestoOn;
    if (estado.impuestoOn) {
      const usd = num(estado.valorUsd);
      const dolar = num(estado.dolar);
      const compraCop = usd * dolar;
      const impUsd = usd * TASA_IMPUESTO;
      const impCop = impUsd * dolar;
      $("vUsd").textContent = fmtUSD.format(usd);
      $("vDolar").textContent = fmtCOP.format(dolar);
      $("vCompraCop").textContent = fmtCOP.format(compraCop);
      $("vImpUsd").textContent = fmtUSD.format(impUsd);
      $("vImpCop").textContent = fmtCOP.format(impCop);
      $("vGranTotal").textContent = fmtCOP.format(totalEnvio + impCop);
    }

    // Pie con tarifas
    $("fT1").textContent = fmtCOP.format(num(estado.tarifas.t1));
    $("fT2").textContent = fmtCOP.format(num(estado.tarifas.t2));
    $("fT3").textContent = fmtCOP.format(num(estado.tarifas.t3));

    guardar();
  }

  function sincronizarCampos() {
    $("cliente").value = estado.cliente;
    $("telefono").value = estado.telefono;
    $("fecha").value = estado.fecha;
    $("numero").value = estado.numero;
    $("impuestoOn").checked = estado.impuestoOn;
    $("unidad").value = estado.unidad || "lb";
    actualizarPlaceholderPeso();
    $("valorUsd").value = estado.valorUsd;
    $("dolar").value = estado.dolar;
    ["t1", "t2", "t3", "tExtra"].forEach((k) => ($(k).value = estado.tarifas[k]));
  }

  // ---------- Eventos ----------
  function init() {
    cargar();
    sincronizarCampos();

    // Datos generales
    ["cliente", "telefono", "fecha", "numero", "valorUsd", "dolar"].forEach((id) => {
      $(id).addEventListener("input", (e) => { estado[id] = e.target.value; render(); });
    });
    $("impuestoOn").addEventListener("change", (e) => { estado.impuestoOn = e.target.checked; render(); });
    ["t1", "t2", "t3", "tExtra"].forEach((k) => {
      $(k).addEventListener("input", (e) => { estado.tarifas[k] = e.target.value; render(); });
    });

    // Unidad de peso (lb / g)
    $("unidad").addEventListener("change", (e) => {
      estado.unidad = e.target.value;
      actualizarPlaceholderPeso();
      guardar();
    });

    // Foto
    $("foto").addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        fotoActual = await leerFoto(file);
        $("fotoPreview").src = fotoActual;
        $("fotoPreview").hidden = false;
        $("fotoTexto").hidden = true;
      } catch {
        $("msgForm").textContent = "No se pudo leer la imagen.";
      }
    });

    // Cantidad del formulario: no permite más de 4
    $("cantidad").addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10);
      if (v > MAX_POR_CAJA) {
        e.target.value = MAX_POR_CAJA;
        $("msgForm").textContent = `Máximo ${MAX_POR_CAJA} unidades iguales por caja.`;
      } else {
        $("msgForm").textContent = "";
      }
    });

    // Agregar producto
    $("formProducto").addEventListener("submit", (e) => {
      e.preventDefault();
      const nombre = $("nombre").value.trim();
      const unidad = $("unidad").value;
      const pesoIngresado = num($("peso").value);
      const peso = unidad === "g" ? pesoIngresado / G_POR_LB : pesoIngresado; // siempre en lb
      const cantidad = parseInt($("cantidad").value, 10);
      const msg = $("msgForm");

      if (!nombre) return (msg.textContent = "Escribe el nombre del producto.");
      if (pesoIngresado <= 0) return (msg.textContent = `Ingresa un peso válido en ${unidad === "g" ? "gramos" : "libras"}.`);
      if (!cantidad || cantidad < 1) return (msg.textContent = "La cantidad mínima es 1.");
      if (cantidad > MAX_POR_CAJA) return (msg.textContent = `Máximo ${MAX_POR_CAJA} unidades iguales por caja.`);

      // Si el mismo producto ya existe, se suma sin pasar de 4
      const existente = estado.productos.find(
        (p) => p.nombre.toLowerCase() === nombre.toLowerCase() && Math.abs(num(p.peso) - peso) < 1e-6
      );
      if (existente) {
        const nueva = existente.cantidad + cantidad;
        if (nueva > MAX_POR_CAJA) {
          const disp = MAX_POR_CAJA - existente.cantidad;
          msg.textContent = disp > 0
            ? `Ya hay ${existente.cantidad} de este producto. Solo puedes agregar ${disp} más (máx. ${MAX_POR_CAJA} por caja).`
            : `Este producto ya tiene el máximo de ${MAX_POR_CAJA} unidades por caja.`;
          return;
        }
        existente.cantidad = nueva;
        if (fotoActual) existente.foto = fotoActual;
      } else {
        estado.productos.push({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          nombre, peso, unidad, cantidad, foto: fotoActual,
        });
      }
      limpiarFormulario();
      render();
      $("nombre").focus();
    });

    // Cambiar cantidad / eliminar desde la tabla
    $("tbody").addEventListener("change", (e) => {
      if (!e.target.classList.contains("qty")) return;
      const p = estado.productos.find((x) => x.id === e.target.dataset.id);
      if (!p) return;
      let v = parseInt(e.target.value, 10);
      if (!v || v < 1) v = 1;
      if (v > MAX_POR_CAJA) {
        v = MAX_POR_CAJA;
        alertaBreve(`Máximo ${MAX_POR_CAJA} unidades iguales por caja.`);
      }
      p.cantidad = v;
      render();
    });
    $("tbody").addEventListener("click", (e) => {
      const id = e.target.dataset && e.target.dataset.del;
      if (!id) return;
      estado.productos = estado.productos.filter((p) => p.id !== id);
      render();
    });

    // PDF
    $("btnPdf").addEventListener("click", () => {
      if (!estado.productos.length) {
        alertaBreve("Agrega al menos un producto antes de exportar.");
        return;
      }
      const tituloOriginal = document.title;
      const cliente = (estado.cliente || "cliente").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
      document.title = `Cotizacion_Centris_Ventas_${estado.numero}_${cliente}`;
      window.print();
      setTimeout(() => (document.title = tituloOriginal), 500);
    });

    // Nueva cotización (conserva tarifas y valor del dólar)
    $("btnNueva").addEventListener("click", () => {
      if (estado.productos.length && !confirm("¿Borrar la cotización actual y empezar una nueva?")) return;
      estado = {
        ...estado,
        cliente: "", telefono: "", fecha: hoyISO(), numero: nuevoNumero(),
        productos: [], valorUsd: "",
      };
      limpiarFormulario();
      sincronizarCampos();
      render();
    });

    render();
  }

  // Mensaje flotante sencillo
  function alertaBreve(texto) {
    let el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.className = "no-print";
      Object.assign(el.style, {
        position: "fixed", left: "50%", bottom: "24px", transform: "translateX(-50%)",
        background: "#c0392b", color: "#fff", padding: "10px 16px", borderRadius: "8px",
        fontWeight: "600", zIndex: 999, boxShadow: "0 6px 20px rgba(0,0,0,.2)", maxWidth: "90vw",
      });
      document.body.appendChild(el);
    }
    el.textContent = texto;
    el.style.display = "block";
    clearTimeout(el._t);
    el._t = setTimeout(() => (el.style.display = "none"), 2800);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
