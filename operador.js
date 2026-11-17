/* =========================================================
   UbaDomi — panel del operador
   El cliente escribe por el chat; el operador responde, arma el
   pedido, lo hace con el restaurante (WhatsApp / llamada) y
   actualiza los estados que el cliente ve en «Seguir pedido».
   ========================================================= */
(function () {
  "use strict";

  const ESTADOS = ["Creado", "Aceptado", "En preparación", "Listo", "Asignado", "En camino", "Entregado"];
  const BARRIOS = window.BARRIOS_UBATE || {};
  const PLANTILLAS = [
    "¡Hola! Soy de UbaDomi 👋 ¿Qué te gustaría pedir y de qué restaurante?",
    "Ya le escribimos al restaurante, en un momento te confirmamos disponibilidad y valor.",
    "El total de tu pedido es {total} con domicilio, pago en efectivo. ¿Lo confirmamos?",
    "¡Listo! El restaurante confirmó tu pedido. Puedes seguirlo en «Seguir pedido».",
    "El restaurante no tiene disponible ese producto 😕 ¿Quieres cambiarlo por otro?",
    "¿Nos confirmas tu dirección exacta y un punto de referencia?",
    "Tu pedido va en camino 🛵 Ten listo el efectivo, por favor."
  ];

  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const mem = {
    get(k, d, sesion) { try { const v = (sesion ? sessionStorage : localStorage).getItem(k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v, sesion) { try { const s = sesion ? sessionStorage : localStorage; v == null ? s.removeItem(k) : s.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }
  };

  const op = {
    token: mem.get("ubadomi-op-token", null, true),
    nombre: mem.get("ubadomi-op-nombre", ""),
    sonido: mem.get("ubadomi-op-sonido", "1") === "1",
    convs: [], sel: null, conv: null,
    filtro: "todos", q: "", es: null,
    editando: false, comercios: []
  };

  /* ---------------- Utilidades ---------------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const formatCOP = (v) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(v || 0);
  const soloDigitos = (t) => String(t || "").replace(/\D/g, "");
  function numeroWhatsApp(tel) {
    let d = soloDigitos(String(tel || "").split(/[;,/]/)[0]);
    if (d.length === 12 && d.startsWith("57")) d = d.slice(2);
    return d.length === 10 && d.startsWith("3") ? "57" + d : null;
  }
  function linkTel(tel) {
    const d = soloDigitos(String(tel || "").split(/[;,/]/)[0]);
    return d ? "tel:+" + (d.startsWith("57") && d.length > 10 ? d : "57" + d) : null;
  }
  function horaCorta(t) {
    const f = new Date(t), hoy = new Date();
    return f.toDateString() === hoy.toDateString()
      ? f.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" })
      : f.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
  }
  function linkMapa(pos, texto) {
    return pos ? `https://www.google.com/maps?q=${pos[0]},${pos[1]}` : "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(texto + " Ubaté Cundinamarca");
  }
  let toast = null;
  function aviso(msg) {
    $("#toastOpTxt").textContent = msg;
    toast = toast || new bootstrap.Toast($("#toastOp"), { delay: 2500 });
    toast.show();
  }
  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); aviso("Mensaje copiado"); }
    catch (e) {
      const ta = document.createElement("textarea");
      ta.value = texto; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); aviso("Mensaje copiado"); } catch (x) { aviso("No se pudo copiar"); }
      ta.remove();
    }
  }
  let audio = null;
  function sonar() {
    if (!op.sonido) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.18].forEach((d) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
        g.gain.setValueAtTime(0.15, audio.currentTime + d);
        g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + d + 0.15);
        o.start(audio.currentTime + d); o.stop(audio.currentTime + d + 0.16);
      });
    } catch (e) { /* sin audio */ }
  }

  /* ---------------- API ---------------- */
  async function api(metodo, ruta, cuerpo) {
    const res = await fetch("/api/op" + ruta, {
      method: metodo,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + (op.token || "") },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined
    });
    const j = await res.json().catch(() => ({}));
    if (res.status === 401 && ruta !== "/login") { salir(); throw new Error(j.error || "Sesión vencida"); }
    if (!res.ok) throw new Error(j.error || "Error " + res.status);
    return j;
  }

  /* ---------------- Sesión ---------------- */
  async function ingresar(e) {
    e.preventDefault();
    $("#errorLogin").textContent = "";
    try {
      const r = await api("POST", "/login", { clave: $("#clave").value });
      op.token = r.token;
      op.nombre = $("#nombreOperador").value.trim() || "UbaDomi";
      mem.set("ubadomi-op-token", op.token, true);
      mem.set("ubadomi-op-nombre", op.nombre);
      $("#clave").value = "";
      iniciarPanel();
    } catch (err) {
      $("#errorLogin").textContent = err.message === "Failed to fetch" ? "No hay conexión con el servidor (¿está corriendo npm start?)." : err.message;
    }
  }
  function salir() {
    op.token = null;
    mem.set("ubadomi-op-token", null, true);
    if (op.es) { op.es.close(); op.es = null; }
    $("#pantallaPanel").classList.add("d-none");
    $("#pantallaLogin").classList.remove("d-none");
    $("#nombreOperador").value = op.nombre;
    setTimeout(() => $("#clave").focus(), 50);
  }

  async function iniciarPanel() {
    $("#pantallaLogin").classList.add("d-none");
    $("#pantallaPanel").classList.remove("d-none");
    $("#quienSoy").textContent = "Atiendes como: " + (op.nombre || "UbaDomi");
    pintarSonido();
    try { await cargarLista(); } catch (e) { return; }
    conectar();
    cargarComercios();
  }

  function conectar() {
    if (op.es) op.es.close();
    op.es = new EventSource("/api/op/eventos?token=" + encodeURIComponent(op.token));
    op.es.onopen = () => { estadoConexion(true); cargarLista().catch(() => {}); };
    op.es.onerror = () => {
      estadoConexion(false);
      // si la sesión venció, el servidor responde 401 y EventSource reintenta para siempre
      api("GET", "/conversaciones").catch(() => {});
    };
    op.es.onmessage = (m) => {
      let d; try { d = JSON.parse(m.data); } catch (e) { return; }
      if (op.tab === "resumen") refrescarResumenPronto();
      if (d.tipo === "eliminada") {
        op.convs = op.convs.filter((c) => c.id !== d.id);
        if (op.sel === d.id) { op.sel = null; op.conv = null; $("#chatOp").classList.add("d-none"); $("#sinSeleccion").classList.remove("d-none"); $("#detalle").classList.add("d-none"); $("#detalleVacio").classList.remove("d-none"); }
        pintarLista();
        return;
      }
      if (d.tipo !== "actualizar" || !d.conv) return;
      const i = op.convs.findIndex((c) => c.id === d.conv.id);
      const antes = i >= 0 ? op.convs[i] : null;
      if (i >= 0) op.convs[i] = d.conv; else op.convs.unshift(d.conv);
      op.convs.sort((a, b) => b.actualizado - a.actualizado);
      pintarLista();
      const nuevoDelCliente = d.conv.ultimo && d.conv.ultimo.de === "cliente" && d.conv.noLeidos > (antes ? antes.noLeidos : 0);
      if (nuevoDelCliente) {
        if (op.sel !== d.conv.id || document.hidden) sonar();
        if (op.sel !== d.conv.id) aviso(`💬 ${d.conv.cliente.nombre}: ${d.conv.ultimo.texto}`);
      }
      if (op.sel === d.conv.id) cargarConv(op.sel);
    };
  }
  function estadoConexion(on) {
    $("#conexion").classList.toggle("on", on);
    $("#conexion").classList.toggle("off", !on);
    $(".txt", $("#conexion")).textContent = on ? "En línea" : "Reconectando…";
  }
  function pintarSonido() {
    $("#btnSonido").innerHTML = op.sonido ? '<i class="bi bi-volume-up-fill"></i>' : '<i class="bi bi-volume-mute-fill"></i>';
  }

  /* ---------------- Lista de conversaciones ---------------- */
  async function cargarLista() {
    op.convs = await api("GET", "/conversaciones");
    pintarLista();
  }

  function pintarLista() {
    const q = sinTildes(op.q);
    const l = op.convs.filter((c) => {
      if (op.filtro === "noleidos" && !c.noLeidos) return false;
      if (op.filtro === "activos" && !c.activo) return false;
      if (q && !sinTildes([c.cliente.nombre, c.cliente.telefono, c.comercio, c.ultimo && c.ultimo.texto].join(" ")).includes(q)) return false;
      return true;
    });
    $("#listaConv").innerHTML = l.length ? l.map((c) => `
      <li class="item-conv${c.id === op.sel ? " sel" : ""}" data-conv="${esc(c.id)}" tabindex="0">
        <div class="avatar">${esc((c.cliente.nombre || "?").trim().charAt(0).toUpperCase())}</div>
        <div class="flex-grow-1" style="min-width:0">
          <div class="d-flex justify-content-between gap-2">
            <span class="nombre text-truncate">${esc(c.cliente.nombre)}</span>
            <span class="hora">${c.ultimo ? horaCorta(c.ultimo.t) : ""}</span>
          </div>
          <div class="d-flex justify-content-between gap-2 align-items-center">
            <span class="ultimo">${c.ultimo ? (c.ultimo.de === "operador" ? "Tú: " : "") + esc(c.ultimo.texto) : ""}</span>
            ${c.noLeidos ? `<span class="noleidos">${c.noLeidos}</span>` : ""}
          </div>
          <div class="d-flex gap-1 mt-1 flex-wrap">
            ${c.estado ? `<span class="chip-estado${c.activo ? " activo" : ""}">${esc(c.estado)}</span>` : ""}
            ${c.comercio ? `<span class="chip-estado"><i class="bi bi-shop"></i> ${esc(c.comercio)}</span>` : ""}
          </div>
        </div>
      </li>`).join("")
      : `<li class="vacio-lista">${op.convs.length ? "No hay conversaciones con ese filtro." : "Aún no hay conversaciones. Cuando un cliente escriba desde la página, aparecerá aquí."}</li>`;
    const total = op.convs.reduce((a, c) => a + (c.noLeidos || 0), 0);
    document.title = (total ? `(${total}) ` : "") + "UbaDomi · Panel del operador";
  }

  /* ---------------- Conversación ---------------- */
  async function seleccionar(id) {
    op.sel = id;
    op.editando = false;
    $("#sinSeleccion").classList.add("d-none");
    $("#chatOp").classList.remove("d-none");
    $("#detalleVacio").classList.add("d-none");
    $("#detalle").classList.remove("d-none");
    $("#pantallaPanel").classList.add("con-chat");
    $("#mensajesOp").innerHTML = "";
    pintarLista();
    await cargarConv(id, true);
    $("#textoOp").focus();
  }

  async function cargarConv(id, alFondo) {
    try {
      const c = await api("GET", "/conversaciones/" + encodeURIComponent(id));
      if (op.sel !== id) return;
      op.conv = c;
      pintarChat(alFondo);
      pintarDetalle();
      if (c.noLeidosOperador) api("POST", `/conversaciones/${encodeURIComponent(id)}/leido`).catch(() => {});
    } catch (e) { aviso(e.message); }
  }

  function pintarChat(alFondo) {
    const c = op.conv;
    $("#chatNombreCliente").textContent = c.cliente.nombre;
    $("#chatSubCliente").textContent = `${c.cliente.telefono} · cliente desde ${new Date(c.creado).toLocaleDateString("es-CO")}`;
    const cont = $("#mensajesOp");
    const abajo = alFondo || cont.scrollHeight - cont.scrollTop - cont.clientHeight < 80;
    let dia = "";
    // solo los mensajes nuevos de ESTA conversación entran con animación
    const ya = op.vistos && op.vistos.id === c.id ? op.vistos.n : 0;
    op.vistos = { id: c.id, n: c.mensajes.length };
    cont.innerHTML = c.mensajes.map((m, i) => {
      const f = new Date(m.t);
      const d = f.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
      const sep = d !== dia ? `<div class="dia">${esc(d)}</div>` : "";
      dia = d;
      const autor = m.de === "operador" ? `<span class="autor">${esc(m.autor || "UbaDomi")}</span>` : "";
      const etiqueta = m.comercio ? `<span class="etiqueta"><i class="bi bi-shop"></i> ${esc(m.comercio)}</span>\n` : "";
      return sep + `<div class="bur ${esc(m.de)}${m.pedidoId && m.de === "cliente" ? " pedido" : ""}${ya && i >= ya ? " nueva" : ""}">${autor}${etiqueta}${esc(m.texto)}<span class="hora">${f.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" })}</span></div>`;
    }).join("");
    if (abajo) cont.scrollTop = cont.scrollHeight;
  }

  async function enviar(e) {
    if (e) e.preventDefault();
    const ta = $("#textoOp");
    const texto = ta.value.trim();
    if (!texto || !op.sel) return;
    ta.value = "";
    try { await api("POST", `/conversaciones/${encodeURIComponent(op.sel)}/mensajes`, { texto, autor: op.nombre }); }
    catch (err) { ta.value = texto; aviso("No se envió: " + err.message); }
  }

  function usarPlantilla(i) {
    let t = PLANTILLAS[i];
    const p = op.conv && op.conv.pedido;
    t = t.replace("{total}", p ? formatCOP(p.total) : "$___");
    const ta = $("#textoOp");
    ta.value = t;
    ta.focus();
    ta.setSelectionRange(t.length, t.length);
  }

  /* ---------------- Detalle ---------------- */
  function comercioActual() {
    const c = op.conv;
    return (c.pedido && c.pedido.comercio) || c.comercioInteres || null;
  }

  function mensajeRestaurante() {
    const c = op.conv, p = c.pedido, com = comercioActual();
    if (!com) return "";
    const dir = (p && p.direccion) || c.direccion;
    const dirTxt = dir ? `${dir.barrio ? "Barrio " + dir.barrio + " · " : ""}${dir.detalle}` : "(pendiente)";
    if (p) {
      return [
        `Hola ${com.nombre}, les escribe UbaDomi (domicilios en Ubaté).`,
        `Queremos hacer este pedido para domicilio (#${p.id}):`,
        ...p.items.map((i) => `• ${i.qty ? i.qty + "x " : ""}${i.nombre}`),
        p.notas ? `Notas: ${p.notas}` : "",
        `Entregar en: ${dirTxt}`,
        dir && dir.pos ? `Ubicación: https://www.google.com/maps?q=${dir.pos[0]},${dir.pos[1]}` : "",
        `Pago: efectivo contra entrega.`,
        `¿Nos confirman disponibilidad, valor total y tiempo de entrega? ¡Gracias!`
      ].filter(Boolean).join("\n");
    }
    const ultimo = [...c.mensajes].reverse().find((m) => m.de === "cliente");
    return [
      `Hola ${com.nombre}, les escribe UbaDomi (domicilios en Ubaté).`,
      `Un cliente quiere hacer un pedido a domicilio${ultimo ? ": «" + ultimo.texto + "»" : "."}`,
      `Entregar en: ${dirTxt}`,
      `¿Nos confirman disponibilidad y precios? ¡Gracias!`
    ].join("\n");
  }

  function pintarDetalle() {
    const c = op.conv;
    const p = c.pedido;
    const dir = c.direccion;

    // Cliente
    const wa = numeroWhatsApp(c.cliente.telefono), tel = linkTel(c.cliente.telefono);
    $("#detCliente").innerHTML = `
      <div class="dato"><strong>${esc(c.cliente.nombre)}</strong></div>
      <div class="dato"><span class="k">Celular:</span> ${esc(c.cliente.telefono)}</div>
      <div class="dato"><span class="k">Dirección:</span> ${dir ? esc((dir.barrio ? "Barrio " + dir.barrio + " · " : "") + dir.detalle) : '<em class="text-warning-emphasis">no la ha marcado</em>'}</div>
      <div class="dato small text-muted">Autorizó datos (Ley 1581): ${c.consentimiento ? new Date(c.consentimiento.t).toLocaleString("es-CO") : "—"}</div>
      <div class="acciones-op">
        ${wa ? `<a class="btn btn-wa" href="https://wa.me/${wa}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i> WhatsApp</a>` : ""}
        ${tel ? `<a class="btn btn-outline-secondary" href="${tel}"><i class="bi bi-telephone-fill"></i> Llamar</a>` : ""}
        ${dir ? `<a class="btn btn-outline-secondary" href="${linkMapa(dir.pos, dir.detalle)}" target="_blank" rel="noopener"><i class="bi bi-geo-alt"></i> Ver dirección</a>` : ""}
      </div>`;

    // Restaurante
    const com = comercioActual();
    if (com) {
      const waR = numeroWhatsApp(com.telefono), telR = linkTel(com.telefono);
      const msj = mensajeRestaurante();
      $("#detComercio").innerHTML = `
        <div class="dato"><strong>${esc(com.nombre)}</strong>${!p ? ' <span class="chip-estado">interés del cliente</span>' : ""}</div>
        <div class="dato"><span class="k">Teléfono:</span> ${com.telefono ? esc(com.telefono) : '<em class="text-muted">sin teléfono registrado — búscalo en Google Maps</em>'}</div>
        ${com.direccion ? `<div class="dato"><span class="k">Dirección:</span> ${esc(com.direccion)}</div>` : ""}
        <div class="acciones-op">
          ${waR ? `<a class="btn btn-wa" href="https://wa.me/${waR}?text=${encodeURIComponent(msj)}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i> Pedir por WhatsApp</a>` : ""}
          ${telR ? `<a class="btn btn-outline-secondary" href="${telR}"><i class="bi bi-telephone-fill"></i> Llamar</a>` : ""}
          <button type="button" class="btn btn-outline-secondary" data-copiar-restaurante><i class="bi bi-clipboard"></i> Copiar mensaje</button>
          <a class="btn btn-outline-secondary" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(com.nombre + " Ubaté Cundinamarca")}" target="_blank" rel="noopener"><i class="bi bi-google"></i> Maps</a>
        </div>
        <div class="msj-restaurante">${esc(msj)}</div>`;
    } else {
      $("#detComercio").innerHTML = '<p class="small text-muted mb-0">El cliente aún no ha elegido restaurante. Pregúntale o crea el pedido abajo.</p>';
    }

    // Pedido
    const activo = p && p.estadoIdx < 6 && !p.cancelado;
    $("#btnEditarPedido").innerHTML = activo ? '<i class="bi bi-pencil"></i> Editar' : '<i class="bi bi-plus-lg"></i> Crear pedido';
    $("#btnEditarPedido").classList.toggle("d-none", op.editando);
    $("#btnCancelarPedidoOp").classList.toggle("d-none", !activo || op.editando);
    if (p) {
      const cal = p.calificacion;
      $("#detPedido").innerHTML = `
        <div class="dato"><strong>#${esc(p.id)}</strong> · ${esc(p.comercio.nombre)} <span class="chip-estado${activo ? " activo" : ""}">${p.cancelado ? "Cancelado" : esc(ESTADOS[p.estadoIdx])}</span></div>
        ${p.cancelado ? `<div class="dato text-danger small">Cancelado por ${p.cancelado.por === "cliente" ? "el cliente" : "UbaDomi"}${p.cancelado.motivo ? ": " + esc(p.cancelado.motivo) : ""}</div>` : ""}
        ${cal ? `<div class="dato"><span class="text-warning">${"★".repeat(cal.estrellas)}${"☆".repeat(5 - cal.estrellas)}</span>${cal.comentario ? ` <em class="small">«${esc(cal.comentario)}»</em>` : ""}</div>` : ""}
        <ul class="list-unstyled mb-1">${p.items.map((i) => `<li class="item-pedido">${i.qty ? i.qty + "x " : ""}${esc(i.nombre)}${i.qty && i.precio != null ? " · " + formatCOP(i.precio * i.qty) : ""}</li>`).join("")}</ul>
        <div class="dato"><span class="k">Subtotal:</span> ${formatCOP(p.subtotal)} · <span class="k">Domicilio:</span> ${formatCOP(p.envio)}</div>
        <div class="dato"><strong>Total a cobrar: ${formatCOP(p.total)}</strong> (efectivo)</div>
        ${p.notas ? `<div class="dato"><span class="k">Notas:</span> ${esc(p.notas)}</div>` : ""}
        <div class="dato small text-muted">Creado: ${new Date(p.creado).toLocaleString("es-CO")}</div>`;
    } else {
      $("#detPedido").innerHTML = '<p class="small text-muted mb-0">Sin pedido todavía. Cuando acuerdes con el cliente qué va a pedir, créalo aquí para que pueda seguirlo.</p>';
    }
    $("#formPedido").classList.toggle("d-none", !op.editando);

    // Estado
    const est = p ? p.estadoIdx : -1;
    const bloqueado = !p || !!p.cancelado;
    $("#estadosOp").innerHTML = ESTADOS.map((e, i) =>
      `<button type="button" data-estado="${i}" class="${i < est ? "hecho" : i === est ? "actual" : ""}" ${bloqueado ? "disabled" : ""}><span class="n">${i < est ? "✓" : i + 1}</span>${e}</button>`).join("");
    const dom = (p && p.domiciliario) || {};
    if (document.activeElement && !document.activeElement.closest("#camposDomiciliario")) {
      $("#dNombre").value = dom.nombre || "";
      $("#dVehiculo").value = dom.vehiculo || "";
      $("#dTelefono").value = dom.telefono || "";
    }
    $("#camposDomiciliario").classList.toggle("d-none", !p);

    // Notas
    $("#listaNotas").innerHTML = (c.notas || []).map((n) => `<li class="mb-1"><span class="text-muted">${horaCorta(n.t)}:</span> ${esc(n.texto)}</li>`).join("") || '<li class="text-muted">Sin notas.</li>';
  }

  /* ---------------- Formulario de pedido ---------------- */
  function parsearItems(texto) {
    return texto.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const m = l.match(/^(?:(\d+)\s*[xX×]\s*)?(.+?)(?:\s*[=:\-–]\s*\$?\s*([\d.,]+))?$/);
      if (!m) return { nombre: l, qty: null, precio: null };
      const precio = m[3] ? Number(m[3].replace(/[.,](?=\d{3}\b)/g, "").replace(",", ".")) : null;
      return { nombre: m[2].trim(), qty: m[1] ? Number(m[1]) : (precio != null ? 1 : null), precio: Number.isFinite(precio) ? precio : null };
    });
  }

  function abrirFormPedido() {
    const c = op.conv, p = c.pedido && c.pedido.estadoIdx < 6 ? c.pedido : null;
    op.editando = true;
    op.modoEditar = !!p;
    const com = comercioActual();
    $("#pComercio").value = com ? com.nombre : "";
    $("#pComercioTel").value = com ? com.telefono || "" : "";
    $("#pItems").value = p ? p.items.map((i) => `${i.qty ? i.qty + " x " : ""}${i.nombre}${i.precio != null ? " = " + i.precio : ""}`).join("\n") : "";
    $("#pSubtotal").value = p ? p.subtotal : "";
    $("#pEnvio").value = p ? p.envio : (window.CONFIG && CONFIG.COSTO_ENVIO_DEFECTO) || 2000;
    $("#pNotas").value = p ? p.notas || "" : "";
    $("#errorPedido").textContent = "";
    // dirección: solo si el cliente no la ha marcado
    const sinDir = !c.direccion;
    $("#pDirWrap").classList.toggle("d-none", !sinDir);
    $("#pBarrio").innerHTML = Object.keys(BARRIOS).map((b) => `<option>${esc(b)}</option>`).join("");
    actualizarTotal();
    pintarDetalle();
    $("#pComercio").focus();
  }

  function actualizarTotal() {
    const items = parsearItems($("#pItems").value);
    const conPrecio = items.filter((i) => i.precio != null);
    if (conPrecio.length && conPrecio.length === items.length && document.activeElement === $("#pItems")) {
      $("#pSubtotal").value = items.reduce((a, i) => a + i.precio * (i.qty || 1), 0);
    }
    $("#pTotal").textContent = formatCOP((Number($("#pSubtotal").value) || 0) + (Number($("#pEnvio").value) || 0));
  }

  async function guardarPedido(e) {
    e.preventDefault();
    const f = $("#formPedido");
    f.classList.add("was-validated");
    if (!f.checkValidity()) return;
    const nombre = $("#pComercio").value.trim();
    const conocido = op.comercios.find((x) => sinTildes(x.nombre) === sinTildes(nombre));
    const previo = comercioActual();
    const base = conocido || (previo && sinTildes(previo.nombre) === sinTildes(nombre) ? { id: previo.id, nombre, lat: previo.pos && previo.pos[0], lng: previo.pos && previo.pos[1], direccion: previo.direccion } : { nombre });
    const comercio = Object.assign({}, base, { nombre, telefono: $("#pComercioTel").value.trim() || (base && base.telefono) || "" });
    const cuerpo = {
      comercio,
      items: parsearItems($("#pItems").value),
      subtotal: Number($("#pSubtotal").value),
      envio: Number($("#pEnvio").value),
      notas: $("#pNotas").value.trim(),
      editar: op.modoEditar
    };
    if (!op.conv.direccion) {
      const det = $("#pDireccion").value.trim();
      const barrio = $("#pBarrio").value;
      if (!det) { $("#errorPedido").textContent = "Escribe la dirección de entrega (o pídesela al cliente)."; return; }
      const pos = BARRIOS[barrio];
      cuerpo.direccion = { barrio, detalle: det, lat: pos && pos[0], lng: pos && pos[1] };
    }
    $("#btnGuardarPedido").disabled = true;
    try {
      await api("POST", `/conversaciones/${encodeURIComponent(op.sel)}/pedido`, cuerpo);
      op.editando = false;
      f.classList.remove("was-validated");
      aviso("Pedido guardado; el cliente ya lo ve.");
      await cargarConv(op.sel);
    } catch (err) {
      $("#errorPedido").textContent = err.message;
    } finally {
      $("#btnGuardarPedido").disabled = false;
    }
  }

  async function cambiarEstado(i, conDomiciliario) {
    const cuerpo = { estadoIdx: i };
    const nombre = $("#dNombre").value.trim();
    if (nombre && (conDomiciliario || i >= 4)) cuerpo.domiciliario = { nombre, vehiculo: $("#dVehiculo").value.trim(), telefono: $("#dTelefono").value.trim() };
    try {
      await api("POST", `/conversaciones/${encodeURIComponent(op.sel)}/estado`, cuerpo);
      if (!conDomiciliario) aviso("Estado: " + ESTADOS[i] + " (el cliente recibió el aviso)");
      else aviso("Domiciliario guardado");
    } catch (e) { aviso(e.message); }
  }

  async function agregarNota(e) {
    e.preventDefault();
    const texto = $("#textoNota").value.trim();
    if (!texto) return;
    try {
      await api("POST", `/conversaciones/${encodeURIComponent(op.sel)}/nota`, { texto });
      $("#textoNota").value = "";
      await cargarConv(op.sel);
    } catch (err) { aviso(err.message); }
  }

  async function cancelarPedidoOp() {
    const p = op.conv && op.conv.pedido;
    if (!p) return;
    const motivo = window.prompt(`Motivo de la cancelación del pedido #${p.id} (lo verá el cliente):`, "El restaurante no tiene disponibilidad");
    if (motivo === null) return;
    try {
      await api("POST", `/conversaciones/${encodeURIComponent(op.sel)}/cancelar`, { motivo });
      aviso("Pedido cancelado; el cliente fue avisado.");
    } catch (e) { aviso(e.message); }
  }

  /* ---------------- Pestañas ---------------- */
  function cambiarTab(t) {
    op.tab = t;
    $$(".tabs-op [data-tab]").forEach((b) => b.classList.toggle("activo", b.dataset.tab === t));
    ["chats", "comercios", "resumen"].forEach((x) => $("#tab-" + x).classList.toggle("d-none", x !== t));
    if (t === "comercios" && !op.aliados) cargarAliadosOp();
    if (t === "resumen") cargarResumen();
  }

  /* ---------------- Comercios aliados ---------------- */
  const PLANTILLA_ALIADO = () => ({
    id: "a-" + Math.random().toString(36).slice(2, 9), nombre: "Nuevo aliado", categoria: "restaurante", barrio: "Centro",
    cocina: "", descripcion: "", direccion: "", telefono: "", horario: "", tiempo: "20-30 min",
    costoEnvio: (window.CONFIG && CONFIG.COSTO_ENVIO_DEFECTO) || 2000,
    lat: (window.CONFIG && CONFIG.CENTRO.lat) || 5.30806, lng: (window.CONFIG && CONFIG.CENTRO.lng) || -73.81487,
    color: "linear-gradient(135deg, #15803d 0%, #0b4020 100%)", icono: "🍽️", demo: false, activo: true, productos: []
  });

  async function cargarAliadosOp() {
    try {
      const r = await api("GET", "/comercios");
      op.publicados = !!r.comercios;
      const base = r.comercios || (window.RESTAURANTES_MANUALES || []).map((x, i) => Object.assign({ id: "a-" + i, activo: true }, JSON.parse(JSON.stringify(x))));
      op.aliados = base;
      op.aliadosGuardados = JSON.stringify(base);
      op.aliadoSel = null;
      pintarAliados();
      $("#comVacio").classList.remove("d-none");
      $("#formAliado").classList.add("d-none");
    } catch (e) { aviso(e.message); }
  }

  function hayCambios() { return op.aliados && JSON.stringify(op.aliados) !== op.aliadosGuardados; }

  function pintarAliados() {
    $("#listaAliados").innerHTML = op.aliados.map((a, i) => `
      <li class="item-conv${i === op.aliadoSel ? " sel" : ""}" data-aliado="${i}" tabindex="0">
        ${a.foto
          ? `<img class="avatar" src="${esc(a.foto)}" alt="" style="object-fit:cover">`
          : `<div class="avatar" style="background:${/^#|^linear|^rgb/.test(a.color || "") ? esc(a.color) : "#e5e7eb"}">${esc(a.icono || "🍽️")}</div>`}
        <div class="flex-grow-1" style="min-width:0">
          <div class="nombre text-truncate">${esc(a.nombre)}</div>
          <div class="ultimo">${esc(a.barrio || "")} · ${(a.productos || []).length} productos</div>
          <div class="d-flex gap-1 mt-1">${a.activo === false ? '<span class="chip-estado">Oculto</span>' : '<span class="chip-estado activo">Visible</span>'}${a.demo ? '<span class="chip-estado">Demo</span>' : ""}</div>
        </div>
      </li>`).join("") || '<li class="vacio-lista">No hay aliados. Crea el primero.</li>';
    const cambios = hayCambios();
    $("#btnGuardarComercios").disabled = !cambios;
    $("#btnDescartarComercios").disabled = !cambios;
    $("#estadoGuardado").innerHTML = cambios
      ? '<span class="cambio-pendiente"><i class="bi bi-exclamation-circle"></i> Hay cambios sin publicar</span>'
      : op.publicados ? '<i class="bi bi-check-circle text-success"></i> Todo publicado' : '<i class="bi bi-info-circle"></i> Usando restaurantes.js (aún no publicado desde el panel)';
  }

  const hexDe = (color) => ((String(color || "").match(/#[0-9a-f]{6}/i) || ["#15803d"])[0]);
  function oscurecer(hex, f = 0.55) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * f).toString(16).padStart(2, "0"));
    return "#" + c.join("");
  }

  function abrirAliado(i) {
    op.aliadoSel = i;
    const a = op.aliados[i];
    $("#comVacio").classList.add("d-none");
    $("#formAliado").classList.remove("d-none", "was-validated");
    $("#tituloAliado").textContent = a.nombre;
    $("#aBarrio").innerHTML = Object.keys(BARRIOS).map((b) => `<option>${esc(b)}</option>`).join("");
    const val = { aNombre: a.nombre, aCategoria: a.categoria || "restaurante", aBarrio: a.barrio || "Centro", aCocina: a.cocina, aTelefono: a.telefono,
      aDescripcion: a.descripcion, aDireccion: a.direccion, aHorario: a.horario, aTiempo: a.tiempo, aEnvio: a.costoEnvio, aIcono: a.icono,
      aColor: hexDe(a.color), aCoords: `${a.lat}, ${a.lng}` };
    Object.entries(val).forEach(([k, v]) => ($("#" + k).value = v == null ? "" : v));
    $("#aActivo").checked = a.activo !== false;
    $("#aDemo").checked = !!a.demo;
    $("#aVerMapa").href = `https://www.google.com/maps?q=${a.lat},${a.lng}`;
    $("#errorAliado").textContent = "";
    pintarFotoAliado();
    pintarProductos();
    pintarAliados();
  }

  function pintarProductos() {
    const a = op.aliados[op.aliadoSel];
    $("#cuentaProductos").textContent = `(${a.productos.length})`;
    $("#tablaProductos").innerHTML = a.productos.map((p, i) => `
      <tr>
        <td>
          <label class="foto-mini" title="${p.foto ? "Cambiar foto (clic derecho en la foto para quitarla)" : "Subir foto del producto"}" data-foto-producto="${i}">
            ${p.foto ? `<img src="${esc(p.foto)}" alt="">` : '<i class="bi bi-camera"></i>'}
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden data-subir-producto="${i}">
          </label>
          ${p.foto ? `<button type="button" class="btn btn-link btn-sm p-0 small text-danger d-block mx-auto" data-quitar-foto="${i}">quitar</button>` : ""}
        </td>
        <td><input class="form-control form-control-sm text-center" data-p="${i}" data-k="emoji" value="${esc(p.emoji || "")}" maxlength="8" aria-label="Ícono"></td>
        <td><input class="form-control form-control-sm" data-p="${i}" data-k="nombre" value="${esc(p.nombre)}" maxlength="120" aria-label="Producto"></td>
        <td><input class="form-control form-control-sm" data-p="${i}" data-k="desc" value="${esc(p.desc || "")}" maxlength="300" aria-label="Descripción"></td>
        <td><input class="form-control form-control-sm" type="number" min="0" step="100" data-p="${i}" data-k="precio" value="${esc(p.precio)}" aria-label="Precio"></td>
        <td class="text-center"><input class="form-check-input" type="checkbox" data-p="${i}" data-k="disponible" ${p.disponible === false ? "" : "checked"} aria-label="Disponible"></td>
        <td><button type="button" class="btn btn-sm btn-link text-danger p-0" data-quitar-producto="${i}" aria-label="Quitar"><i class="bi bi-x-lg"></i></button></td>
      </tr>`).join("") || '<tr><td colspan="7" class="text-muted small">Sin productos. Agrega el primero (los aliados sin menú se piden por chat).</td></tr>';
  }

  function leerAliado(e) {
    const a = op.aliados[op.aliadoSel];
    if (!a) return;
    const t = e && e.target;
    if (t && t.dataset.p != null) {
      const p = a.productos[+t.dataset.p];
      const k = t.dataset.k;
      p[k] = k === "disponible" ? t.checked : k === "precio" ? Number(t.value) || 0 : t.value;
      pintarAliados();
      return;
    }
    a.nombre = $("#aNombre").value.trim();
    a.categoria = $("#aCategoria").value;
    a.barrio = $("#aBarrio").value;
    a.cocina = $("#aCocina").value.trim();
    a.telefono = $("#aTelefono").value.trim();
    a.descripcion = $("#aDescripcion").value.trim();
    a.direccion = $("#aDireccion").value.trim();
    a.horario = $("#aHorario").value.trim();
    a.tiempo = $("#aTiempo").value.trim();
    a.costoEnvio = Number($("#aEnvio").value) || 0;
    a.icono = $("#aIcono").value.trim();
    a.activo = $("#aActivo").checked;
    a.demo = $("#aDemo").checked;
    if (t && t.id === "aColor") a.color = `linear-gradient(135deg, ${t.value} 0%, ${oscurecer(t.value)} 100%)`;
    const m = $("#aCoords").value.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (m) { a.lat = Number(m[1]); a.lng = Number(m[2]); $("#aVerMapa").href = `https://www.google.com/maps?q=${a.lat},${a.lng}`; }
    $("#tituloAliado").textContent = a.nombre || "(sin nombre)";
    pintarAliados();
  }

  /* ---- Fotos: se reducen en el navegador (WebP) y se suben al servidor ---- */
  async function reducirImagen(archivo, max) {
    if (!/^image\/(jpeg|png|webp)$/.test(archivo.type)) throw new Error("Usa una imagen JPG, PNG o WebP.");
    if (archivo.size > 15 * 1024 * 1024) throw new Error("La imagen pesa más de 15 MB.");
    const bmp = await createImageBitmap(archivo);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close && bmp.close();
    const blob = await new Promise((r) => c.toBlob(r, "image/webp", 0.82));
    // navegadores sin WebP devuelven PNG: en ese caso se usa JPG, más liviano
    return blob && blob.type === "image/webp" ? blob : new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
  }

  async function subirFoto(archivo, max) {
    const blob = await reducirImagen(archivo, max);
    const res = await fetch("/api/op/fotos", { method: "POST", headers: { "Content-Type": blob.type, Authorization: "Bearer " + op.token }, body: blob });
    const j = await res.json().catch(() => ({}));
    if (res.status === 401) { salir(); throw new Error("Sesión vencida"); }
    if (!res.ok) throw new Error(j.error || "No se pudo subir la foto");
    return j.url;
  }

  function pintarFotoAliado() {
    const a = op.aliados[op.aliadoSel];
    const prev = $("#aFotoPrev");
    prev.classList.toggle("con-foto", !!a.foto);
    prev.innerHTML = a.foto
      ? `<img src="${esc(a.foto)}" alt="Foto de ${esc(a.nombre)}">`
      : '<i class="bi bi-image"></i><span>Sin foto: se muestra el color y el ícono</span>';
    $("#aFotoQuitar").disabled = !a.foto;
  }

  async function publicarAliados() {
    const malo = op.aliados.findIndex((a) => !a.nombre || !Number.isFinite(a.lat) || !Number.isFinite(a.lng));
    if (malo >= 0) { abrirAliado(malo); $("#errorAliado").textContent = "Este comercio necesita nombre y coordenadas válidas."; return; }
    $("#btnGuardarComercios").disabled = true;
    try {
      const r = await api("PUT", "/comercios", { comercios: op.aliados });
      op.publicados = true;
      const recarga = await api("GET", "/comercios");
      op.aliados = recarga.comercios;
      op.aliadosGuardados = JSON.stringify(op.aliados);
      pintarAliados();
      if (op.aliadoSel != null && op.aliados[op.aliadoSel]) abrirAliado(op.aliadoSel);
      cargarComercios();
      aviso(`Publicado: ${r.total} aliados. Ya se ven en la página.`);
    } catch (e) { aviso(e.message); pintarAliados(); }
  }

  /* ---------------- Resumen ---------------- */
  let timerResumen = null;
  function refrescarResumenPronto() { clearTimeout(timerResumen); timerResumen = setTimeout(cargarResumen, 1200); }

  async function cargarResumen() {
    try { pintarResumen(await api("GET", "/resumen")); } catch (e) { aviso(e.message); }
  }

  function pintarResumen(r) {
    const kpi = (v, l, s) => `<div class="col-6 col-lg-3"><div class="kpi"><div class="l">${l}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ""}</div></div>`;
    const max = Math.max(1, ...r.dias.map((d) => d.pedidos));
    $("#resumenCont").innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h5 class="fw-bold mb-0">Resumen de hoy</h5>
        <button type="button" class="btn btn-sm btn-outline-success" data-recargar-resumen><i class="bi bi-arrow-clockwise"></i> Actualizar</button>
      </div>
      <div class="row g-3 mb-3">
        ${kpi(r.hoy.pedidos, "Pedidos hoy", `${r.hoy.activos} en curso · ${r.hoy.cancelados} cancelados`)}
        ${kpi(r.hoy.entregados, "Entregados hoy", r.hoy.pedidos ? Math.round((r.hoy.entregados / r.hoy.pedidos) * 100) + "% de efectividad" : "")}
        ${kpi(formatCOP(r.hoy.ventas), "Ventas hoy", `Ticket promedio ${formatCOP(r.hoy.ticket)}`)}
        ${kpi(r.calificacion.promedio != null ? "★ " + r.calificacion.promedio : "—", "Calificación", `${r.calificacion.n} calificaciones`)}
      </div>
      <div class="row g-3">
        <div class="col-lg-7">
          <div class="caja">
            <h6>Pedidos de los últimos 7 días</h6>
            <div class="barras">
              ${r.dias.map((d) => `<div class="barra" title="${esc(d.dia)}: ${d.pedidos} pedidos · ${formatCOP(d.ventas)}"><span class="n">${d.pedidos}</span><div class="b" style="height:${(d.pedidos / max) * 100}%"></div><span class="d">${esc(d.dia)}</span></div>`).join("")}
            </div>
          </div>
        </div>
        <div class="col-lg-5">
          <div class="caja">
            <h6>Totales históricos</h6>
            <div class="dato"><span class="k">Clientes registrados:</span> <strong>${r.clientes}</strong></div>
            <div class="dato"><span class="k">Pedidos:</span> <strong>${r.total.pedidos}</strong> · entregados ${r.total.entregados} · cancelados ${r.total.cancelados}</div>
            <div class="dato"><span class="k">Ventas entregadas:</span> <strong>${formatCOP(r.total.ventas)}</strong></div>
            <div class="dato"><span class="k">Cobrado en domicilios:</span> <strong>${formatCOP(r.total.domicilios)}</strong></div>
            <div class="dato"><span class="k">Ticket promedio:</span> <strong>${formatCOP(r.total.ticket)}</strong></div>
          </div>
        </div>
        <div class="col-lg-7">
          <div class="caja">
            <h6>Por restaurante</h6>
            ${r.porComercio.length ? `<div class="table-responsive"><table class="table table-sm mb-0">
              <thead><tr><th>Restaurante</th><th class="text-end">Pedidos</th><th class="text-end">Entregados</th><th class="text-end">Ventas</th></tr></thead>
              <tbody>${r.porComercio.map((c) => `<tr><td>${esc(c.nombre)}</td><td class="text-end">${c.pedidos}</td><td class="text-end">${c.entregados}</td><td class="text-end">${formatCOP(c.ventas)}</td></tr>`).join("")}</tbody>
            </table></div>` : '<p class="small text-muted mb-0">Aún no hay pedidos.</p>'}
          </div>
        </div>
        <div class="col-lg-5">
          <div class="caja">
            <h6>Últimas calificaciones</h6>
            ${r.calificacion.ultimas.length ? r.calificacion.ultimas.map((c) => `<div class="dato"><span class="text-warning">${"★".repeat(c.estrellas)}${"☆".repeat(5 - c.estrellas)}</span> · ${esc(c.comercio)}${c.comentario ? `<div class="small text-muted">«${esc(c.comentario)}»</div>` : ""}</div>`).join("") : '<p class="small text-muted mb-0">Sin calificaciones todavía.</p>'}
          </div>
        </div>
      </div>`;
  }

  /* ---------------- Restaurantes conocidos (para autocompletar) ---------------- */
  async function cargarComercios() {
    let aliados = window.RESTAURANTES_MANUALES || [];
    try { const r = await api("GET", "/comercios"); if (Array.isArray(r.comercios)) aliados = r.comercios; } catch (e) { /* usa restaurantes.js */ }
    const lista = aliados.map((r, i) => ({ id: r.id || "a-" + i, nombre: r.nombre, telefono: r.telefono || "", direccion: r.direccion || "", lat: r.lat, lng: r.lng }));
    try {
      const j = await (await fetch("restaurantes-osm.json", { cache: "no-cache" })).json();
      (j.elements || []).forEach((e) => {
        const t = e.tags || {};
        if (!t.name || t.name.trim().length < 3) return;
        lista.push({
          id: "osm-" + e.type + "-" + e.id, nombre: t.name.trim(),
          telefono: t.phone || t["contact:phone"] || t["contact:whatsapp"] || t.mobile || "",
          direccion: [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" # "),
          lat: e.lat != null ? e.lat : e.center && e.center.lat, lng: e.lon != null ? e.lon : e.center && e.center.lon
        });
      });
    } catch (e) { /* sin copia de OSM */ }
    op.comercios = lista;
    $("#listaComercios").innerHTML = lista.map((c) => `<option value="${esc(c.nombre)}"></option>`).join("");
  }

  /* ---------------- Eventos ---------------- */
  function eventos() {
    $("#formLogin").addEventListener("submit", ingresar);
    $("#btnSalir").addEventListener("click", salir);
    $("#btnSonido").addEventListener("click", () => { op.sonido = !op.sonido; mem.set("ubadomi-op-sonido", op.sonido ? "1" : "0"); pintarSonido(); if (op.sonido) sonar(); });
    $("#buscarConv").addEventListener("input", (e) => { op.q = e.target.value; pintarLista(); });
    $$('input[name="filtro"]').forEach((r) => r.addEventListener("change", (e) => { op.filtro = e.target.value; pintarLista(); }));
    $("#listaConv").addEventListener("click", (e) => { const li = e.target.closest("[data-conv]"); if (li) seleccionar(li.dataset.conv); });
    $("#listaConv").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.dataset.conv) seleccionar(e.target.dataset.conv); });
    $("#formMensajeOp").addEventListener("submit", enviar);
    $("#textoOp").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } });
    $("#plantillas").innerHTML = PLANTILLAS.map((t, i) => {
      const v = t.replace("{total}", "$…");
      return `<button type="button" data-plantilla="${i}" title="${esc(v)}">${esc(v.length > 38 ? v.slice(0, 36) + "…" : v)}</button>`;
    }).join("");
    $("#plantillas").addEventListener("click", (e) => { const b = e.target.closest("[data-plantilla]"); if (b) usarPlantilla(+b.dataset.plantilla); });

    $("#btnEditarPedido").addEventListener("click", abrirFormPedido);
    $("#btnCancelarPedido").addEventListener("click", () => { op.editando = false; pintarDetalle(); });
    $("#formPedido").addEventListener("submit", guardarPedido);
    ["#pItems", "#pSubtotal", "#pEnvio"].forEach((s) => $(s).addEventListener("input", actualizarTotal));
    $("#pComercio").addEventListener("change", () => {
      const x = op.comercios.find((c) => sinTildes(c.nombre) === sinTildes($("#pComercio").value));
      if (x && x.telefono && !$("#pComercioTel").value) $("#pComercioTel").value = x.telefono;
    });
    $("#estadosOp").addEventListener("click", (e) => { const b = e.target.closest("[data-estado]"); if (b) cambiarEstado(+b.dataset.estado, false); });
    $("#btnGuardarDom").addEventListener("click", () => {
      if (!$("#dNombre").value.trim()) { aviso("Escribe el nombre del domiciliario"); return; }
      cambiarEstado(op.conv.pedido.estadoIdx, true);
    });
    $("#formNota").addEventListener("submit", agregarNota);
    $("#detalle").addEventListener("click", (e) => { if (e.target.closest("[data-copiar-restaurante]")) copiar(mensajeRestaurante()); });

    $("#btnCancelarPedidoOp").addEventListener("click", cancelarPedidoOp);

    // pestañas
    $$(".tabs-op [data-tab]").forEach((b) => b.addEventListener("click", () => cambiarTab(b.dataset.tab)));
    $("#resumenCont").addEventListener("click", (e) => { if (e.target.closest("[data-recargar-resumen]")) cargarResumen(); });

    // comercios
    $("#listaAliados").addEventListener("click", (e) => { const li = e.target.closest("[data-aliado]"); if (li) abrirAliado(+li.dataset.aliado); });
    $("#listaAliados").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.dataset.aliado) abrirAliado(+e.target.dataset.aliado); });
    $("#btnNuevoComercio").addEventListener("click", () => { op.aliados.push(PLANTILLA_ALIADO()); abrirAliado(op.aliados.length - 1); $("#aNombre").select(); });
    $("#formAliado").addEventListener("input", leerAliado);
    $("#formAliado").addEventListener("change", leerAliado);
    $("#formAliado").addEventListener("submit", (e) => e.preventDefault());
    $("#btnAgregarProducto").addEventListener("click", () => {
      op.aliados[op.aliadoSel].productos.push({ nombre: "", desc: "", precio: 0, emoji: "🍽️", disponible: true });
      pintarProductos(); pintarAliados();
      const filas = $$("#tablaProductos tr");
      const inp = filas[filas.length - 1] && filas[filas.length - 1].querySelector('[data-k="nombre"]');
      if (inp) inp.focus();
    });
    $("#tablaProductos").addEventListener("click", (e) => {
      const b = e.target.closest("[data-quitar-producto]");
      if (!b) return;
      op.aliados[op.aliadoSel].productos.splice(+b.dataset.quitarProducto, 1);
      pintarProductos(); pintarAliados();
    });
    $("#btnEliminarAliado").addEventListener("click", () => {
      const a = op.aliados[op.aliadoSel];
      if (!window.confirm(`¿Eliminar a «${a.nombre}»? (Para ocultarlo sin borrarlo, desactiva «Visible».)`)) return;
      op.aliados.splice(op.aliadoSel, 1);
      op.aliadoSel = null;
      $("#formAliado").classList.add("d-none");
      $("#comVacio").classList.remove("d-none");
      pintarAliados();
    });
    // fotos
    $("#aFotoArchivo").addEventListener("change", async (e) => {
      const f = e.target.files[0]; e.target.value = "";
      if (!f) return;
      const a = op.aliados[op.aliadoSel];
      $("#aFotoPrev").innerHTML = '<span class="spinner-border spinner-border-sm text-success"></span><span>Subiendo…</span>';
      try { a.foto = await subirFoto(f, 1200); aviso("Foto lista. Publica los cambios para que se vea en la página."); }
      catch (err) { aviso(err.message); }
      pintarFotoAliado(); pintarAliados();
    });
    $("#aFotoQuitar").addEventListener("click", () => { op.aliados[op.aliadoSel].foto = ""; pintarFotoAliado(); pintarAliados(); });
    $("#tablaProductos").addEventListener("change", async (e) => {
      const inp = e.target.closest("[data-subir-producto]");
      if (!inp || !inp.files[0]) return;
      const i = +inp.dataset.subirProducto, f = inp.files[0];
      const celda = inp.closest(".foto-mini");
      celda.innerHTML = '<span class="spinner-border spinner-border-sm text-success"></span>';
      try { op.aliados[op.aliadoSel].productos[i].foto = await subirFoto(f, 600); }
      catch (err) { aviso(err.message); }
      pintarProductos(); pintarAliados();
    });
    $("#tablaProductos").addEventListener("click", (e) => {
      const b = e.target.closest("[data-quitar-foto]");
      if (!b) return;
      op.aliados[op.aliadoSel].productos[+b.dataset.quitarFoto].foto = "";
      pintarProductos(); pintarAliados();
    });
    $("#btnGuardarComercios").addEventListener("click", publicarAliados);
    $("#btnDescartarComercios").addEventListener("click", () => {
      if (!window.confirm("¿Descartar los cambios sin publicar?")) return;
      op.aliados = JSON.parse(op.aliadosGuardados);
      op.aliadoSel = null;
      $("#formAliado").classList.add("d-none");
      $("#comVacio").classList.remove("d-none");
      pintarAliados();
    });
    window.addEventListener("beforeunload", (e) => { if (hayCambios()) { e.preventDefault(); e.returnValue = ""; } });

    // pantallas medianas/pequeñas
    $("#btnVerDetalle").addEventListener("click", () => $("#colDetalle").classList.add("abierto"));
    $("#btnCerrarDetalle").addEventListener("click", () => $("#colDetalle").classList.remove("abierto"));
    $("#btnVolverLista").addEventListener("click", () => { $("#pantallaPanel").classList.remove("con-chat"); });
  }

  /* ---------------- Inicio ---------------- */
  eventos();
  $("#nombreOperador").value = op.nombre;
  if (op.token) iniciarPanel();
  else salir();
})();
