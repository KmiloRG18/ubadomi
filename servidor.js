// =========================================================
// UbaDomi — servidor (sin dependencias)
//   - Sirve la página (index.html) y el panel del operador (operador.html)
//   - API de chat cliente <-> equipo UbaDomi con eventos en tiempo real (SSE)
//   - Guarda conversaciones y pedidos en datos/conversaciones.json
// Uso:  npm start   ->  http://localhost:8080   (panel: /operador.html)
// =========================================================
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PUERTO = Number(process.env.PORT) || 8080;
const RAIZ = __dirname;
const DIR_DATOS = path.join(RAIZ, "datos");
const ARCH_CONV = path.join(DIR_DATOS, "conversaciones.json");
const ARCH_CLAVE = path.join(DIR_DATOS, "clave-operador.txt");
const DIR_FOTOS = path.join(RAIZ, "fotos"); // fotos de aliados y productos (públicas)
fs.mkdirSync(DIR_FOTOS, { recursive: true });

// una foto válida: subida al servidor (fotos/xxx.webp) o una URL https
const limpiarFoto = (v) => {
  const s = String(v || "").trim();
  if (/^fotos\/[\w-]{6,40}\.(webp|jpg|png)$/.test(s)) return s;
  if (/^https:\/\/[^\s"'<>]{8,500}$/.test(s)) return s;
  return "";
};
// tipo real del archivo por sus primeros bytes (no se confía en lo que dice el navegador)
function tipoImagen(buf) {
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 8 && buf.toString("hex", 0, 8) === "89504e470d0a1a0a") return "png";
  return null;
}
// lee el cuerpo binario; si se pasa del máximo deja de guardarlo pero lo termina de leer,
// para poder responder un error claro en vez de cortar la conexión
function leerBinario(req, max) {
  return new Promise((resolve, reject) => {
    const partes = []; let total = 0;
    req.on("data", (c) => { total += c.length; if (total <= max) partes.push(c); });
    req.on("end", () => (total > max ? reject(Object.assign(new Error(`La imagen pesa más de ${Math.round(max / 1048576)} MB.`), { status: 413 })) : resolve(Buffer.concat(partes))));
    req.on("error", reject);
  });
}
const ESTADOS = ["Creado", "Aceptado", "En preparación", "Listo", "Asignado", "En camino", "Entregado"];

const TIPOS = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json; charset=utf-8", ".txt": "text/plain; charset=utf-8"
};
// archivos que nunca se sirven por la web
const PRIVADOS = new Set(["servidor.js", "actualizar-osm.js", "package.json", "package-lock.json"]);

/* ---------------- Datos ---------------- */
fs.mkdirSync(DIR_DATOS, { recursive: true });

let CLAVE = process.env.UBADOMI_CLAVE;
if (!CLAVE) {
  if (fs.existsSync(ARCH_CLAVE)) CLAVE = fs.readFileSync(ARCH_CLAVE, "utf8").trim();
  if (!CLAVE) { CLAVE = crypto.randomBytes(6).toString("base64url"); fs.writeFileSync(ARCH_CLAVE, CLAVE); }
}

let convs = {};
try { convs = JSON.parse(fs.readFileSync(ARCH_CONV, "utf8")); } catch (e) { convs = {}; }

let timerGuardar = null;
function guardar() {
  clearTimeout(timerGuardar);
  timerGuardar = setTimeout(() => {
    const tmp = ARCH_CONV + ".tmp";
    fs.writeFile(tmp, JSON.stringify(convs, null, 1), (err) => {
      if (err) return console.error("No se pudo guardar:", err.message);
      fs.rename(tmp, ARCH_CONV, (e) => e && console.error("No se pudo guardar:", e.message));
    });
  }, 300);
}

/* ---------------- Utilidades ---------------- */
const id = (n = 9) => crypto.randomBytes(n).toString("base64url");
const txt = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
const num = (v, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null; };
const coord = (lat, lng) => {
  const a = num(lat, -90, 90), b = num(lng, -180, 180);
  return a != null && b != null ? [a, b] : null;
};
function iguales(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function json(res, code, datos) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(datos));
}
function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let datos = "";
    req.on("data", (c) => { datos += c; if (datos.length > 64 * 1024) { reject(new Error("Cuerpo muy grande")); req.destroy(); } });
    req.on("end", () => { try { resolve(datos ? JSON.parse(datos) : {}); } catch (e) { reject(new Error("JSON inválido")); } });
    req.on("error", reject);
  });
}

function limpiarComercio(c) {
  if (!c || typeof c !== "object") return null;
  const nombre = txt(c.nombre, 120);
  if (!nombre) return null;
  return { id: txt(c.id, 80), nombre, telefono: txt(c.telefono, 40), direccion: txt(c.direccion, 160), pos: coord(c.lat, c.lng) };
}
function limpiarDireccion(d) {
  if (!d || typeof d !== "object") return null;
  const detalle = txt(d.detalle, 200);
  if (!detalle) return null;
  return { barrio: txt(d.barrio, 60), detalle, pos: coord(d.lat, d.lng) };
}
function limpiarItems(items) {
  return (Array.isArray(items) ? items : []).slice(0, 40).map((i) => ({
    nombre: txt(i && i.nombre, 120),
    qty: num(i && i.qty, 1, 99),
    precio: num(i && i.precio, 0, 10_000_000)
  })).filter((i) => i.nombre);
}

/* ---------------- Vistas de una conversación ---------------- */
const pedidoActivo = (p) => !!(p && p.estadoIdx < 6 && !p.cancelado);
const nombreEstado = (p) => (p.cancelado ? "Cancelado" : ESTADOS[p.estadoIdx]);

function vistaCliente(c) {
  return {
    id: c.id, cliente: c.cliente, direccion: c.direccion, pedido: c.pedido,
    historial: (c.historial || []).slice(-20),
    mensajes: c.mensajes, noLeidos: c.noLeidosCliente
  };
}
function resumen(c) {
  const ult = c.mensajes[c.mensajes.length - 1];
  return {
    id: c.id, cliente: c.cliente, actualizado: c.actualizado, noLeidos: c.noLeidosOperador,
    ultimo: ult ? { de: ult.de, texto: ult.texto.slice(0, 90), t: ult.t } : null,
    comercio: c.pedido ? c.pedido.comercio.nombre : c.comercioInteres ? c.comercioInteres.nombre : null,
    estado: c.pedido ? nombreEstado(c.pedido) : null,
    activo: pedidoActivo(c.pedido)
  };
}
// guarda el pedido actual en el historial antes de reemplazarlo
function archivarPedido(c) {
  if (!c.pedido) return;
  c.historial = c.historial || [];
  c.historial.push(c.pedido);
  if (c.historial.length > 50) c.historial.splice(0, c.historial.length - 50);
  c.pedido = null;
}

/* ---------------- Comercios aliados (editables desde el panel) ---------------- */
const ARCH_COM = path.join(DIR_DATOS, "comercios.json");
let comercios = null; // null = la página usa restaurantes.js
try { comercios = JSON.parse(fs.readFileSync(ARCH_COM, "utf8")); } catch (e) { comercios = null; }
const CATEGORIAS = ["restaurante", "rapida", "pizza", "pollo", "cafe", "panaderia", "helados", "tienda"];

function limpiarAliado(r) {
  if (!r || typeof r !== "object") return null;
  const nombre = txt(r.nombre, 120);
  const pos = coord(r.lat, r.lng);
  if (!nombre || !pos) return null;
  const color = txt(r.color, 160);
  return {
    id: /^[\w-]{1,40}$/.test(String(r.id || "")) ? String(r.id) : "a-" + id(5),
    nombre,
    categoria: CATEGORIAS.includes(r.categoria) ? r.categoria : "restaurante",
    barrio: txt(r.barrio, 60), cocina: txt(r.cocina, 120), descripcion: txt(r.descripcion, 300),
    direccion: txt(r.direccion, 160), telefono: txt(r.telefono, 40), horario: txt(r.horario, 120),
    tiempo: txt(r.tiempo, 30), costoEnvio: num(r.costoEnvio, 0, 50000) || 0,
    lat: pos[0], lng: pos[1],
    color: /^[#(),.%\w\s-]+$/.test(color) ? color : "",
    icono: txt(r.icono, 8), demo: r.demo === true, activo: r.activo !== false, foto: limpiarFoto(r.foto),
    productos: (Array.isArray(r.productos) ? r.productos : []).slice(0, 80).map((p) => ({
      nombre: txt(p && p.nombre, 120), desc: txt(p && p.desc, 300),
      precio: num(p && p.precio, 0, 10_000_000) || 0, emoji: txt(p && p.emoji, 8), foto: limpiarFoto(p && p.foto),
      disponible: !(p && p.disponible === false)
    })).filter((p) => p.nombre)
  };
}

/* ---------------- Resumen para el operador ---------------- */
function calcularResumen() {
  const pedidos = [];
  Object.values(convs).forEach((c) => {
    if (c.pedido) pedidos.push(c.pedido);
    (c.historial || []).forEach((p) => pedidos.push(p));
  });
  const ahora = new Date();
  const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime();
  const entregado = (p) => p.estadoIdx === 6 && !p.cancelado;
  const bloque = (l) => {
    const ent = l.filter(entregado);
    const ventas = ent.reduce((a, p) => a + (p.total || 0), 0);
    return {
      pedidos: l.length, entregados: ent.length, cancelados: l.filter((p) => p.cancelado).length,
      activos: l.filter(pedidoActivo).length, ventas, ticket: ent.length ? Math.round(ventas / ent.length) : 0,
      domicilios: ent.reduce((a, p) => a + (p.envio || 0), 0)
    };
  };
  const porCom = {};
  pedidos.forEach((p) => {
    const k = p.comercio.nombre;
    porCom[k] = porCom[k] || { nombre: k, pedidos: 0, entregados: 0, ventas: 0 };
    porCom[k].pedidos++;
    if (entregado(p)) { porCom[k].entregados++; porCom[k].ventas += p.total || 0; }
  });
  const dias = [];
  for (let i = 6; i >= 0; i--) {
    const d0 = inicioHoy - i * 864e5, d1 = d0 + 864e5;
    const l = pedidos.filter((p) => p.creado >= d0 && p.creado < d1);
    dias.push({ dia: new Date(d0).toLocaleDateString("es-CO", { weekday: "short", day: "numeric" }), pedidos: l.length, ventas: l.filter(entregado).reduce((a, p) => a + (p.total || 0), 0) });
  }
  const cal = pedidos.filter((p) => p.calificacion);
  return {
    hoy: bloque(pedidos.filter((p) => p.creado >= inicioHoy)),
    total: bloque(pedidos),
    calificacion: { n: cal.length, promedio: cal.length ? +(cal.reduce((a, p) => a + p.calificacion.estrellas, 0) / cal.length).toFixed(1) : null,
      ultimas: cal.sort((a, b) => b.calificacion.t - a.calificacion.t).slice(0, 5).map((p) => ({ comercio: p.comercio.nombre, ...p.calificacion })) },
    porComercio: Object.values(porCom).sort((a, b) => b.pedidos - a.pedidos),
    dias,
    clientes: Object.keys(convs).length
  };
}

function agregarMensaje(c, de, texto, extra) {
  const m = Object.assign({ id: id(6), de, texto, t: Date.now() }, extra || {});
  c.mensajes.push(m);
  if (c.mensajes.length > 600) c.mensajes.splice(0, c.mensajes.length - 600);
  c.actualizado = m.t;
  if (de === "cliente") c.noLeidosOperador++;
  else c.noLeidosCliente++;
  return m;
}

function textoPedido(p) {
  const lineas = p.items.map((i) => `• ${i.qty ? i.qty + "x " : ""}${i.nombre}${i.precio != null && i.qty ? " — $" + (i.precio * i.qty).toLocaleString("es-CO") : ""}`);
  return `Pedido #${p.id} en ${p.comercio.nombre}\n${lineas.join("\n")}\nDomicilio: $${p.envio.toLocaleString("es-CO")}\nTotal: $${p.total.toLocaleString("es-CO")} (efectivo)`;
}

/* ---------------- Tiempo real (SSE) ---------------- */
const sseClientes = new Map(); // convId -> Set(res)
const sseOperadores = new Set();

function abrirSSE(req, res) {
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.write("retry: 3000\n\n");
  const latido = setInterval(() => res.write(": latido\n\n"), 25000);
  req.on("close", () => clearInterval(latido));
}
function enviarSSE(res, datos) { res.write(`data: ${JSON.stringify(datos)}\n\n`); }
function avisar(c) {
  const set = sseClientes.get(c.id);
  if (set) set.forEach((r) => enviarSSE(r, { tipo: "actualizar", noLeidos: c.noLeidosCliente }));
  sseOperadores.forEach((r) => enviarSSE(r, { tipo: "actualizar", conv: resumen(c) }));
  guardar();
}

/* ---------------- Sesiones del operador ---------------- */
const sesiones = new Map(); // token -> vence
function sesionValida(token) {
  const v = token && sesiones.get(token);
  if (!v) return false;
  if (v < Date.now()) { sesiones.delete(token); return false; }
  sesiones.set(token, Date.now() + 12 * 3600e3);
  return true;
}
function tokenOperador(req, url) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : url.searchParams.get("token");
}

/* ---------------- Límite simple de abuso ---------------- */
const contador = new Map(); // ip -> {n, desde}
function demasiadas(req, max) {
  const ip = req.socket.remoteAddress || "?";
  const ahora = Date.now();
  const r = contador.get(ip) || { n: 0, desde: ahora };
  if (ahora - r.desde > 60000) { r.n = 0; r.desde = ahora; }
  r.n++;
  contador.set(ip, r);
  return r.n > max;
}

/* ---------------- API del cliente ---------------- */
async function apiCliente(req, res, url, partes) {
  // POST /api/chat  -> crea conversación
  if (partes.length === 2 && req.method === "POST") {
    if (demasiadas(req, 10)) return json(res, 429, { error: "Demasiadas solicitudes, intenta en un minuto." });
    const b = await leerCuerpo(req);
    const nombre = txt(b.nombre, 80), telefono = txt(b.telefono, 20).replace(/\D/g, "");
    if (!nombre || !/^3\d{9}$/.test(telefono)) return json(res, 400, { error: "Nombre y celular (10 dígitos) son obligatorios." });
    if (b.consentimiento !== true) return json(res, 400, { error: "Debes autorizar el tratamiento de datos (Ley 1581 de 2012)." });
    if (Object.keys(convs).length > 5000) return json(res, 503, { error: "Capacidad llena." });
    const c = {
      id: id(), token: id(18), creado: Date.now(), actualizado: Date.now(),
      cliente: { nombre, telefono }, consentimiento: { aceptado: true, t: Date.now() },
      direccion: limpiarDireccion(b.direccion), comercioInteres: null,
      mensajes: [], notas: [], pedido: null, historial: [],
      noLeidosCliente: 0, noLeidosOperador: 0
    };
    agregarMensaje(c, "sistema", `¡Hola ${nombre.split(" ")[0]}! Bienvenido a UbaDomi. Cuéntanos qué quieres pedir y de qué restaurante; nosotros hablamos con el restaurante y te mantenemos al tanto aquí.`);
    c.noLeidosCliente = 0;
    convs[c.id] = c;
    avisar(c);
    return json(res, 201, { id: c.id, token: c.token, conv: vistaCliente(c) });
  }

  const c = convs[partes[2]];
  const token = req.headers["x-token"] || url.searchParams.get("token");
  if (!c || !token || !iguales(token, c.token)) return json(res, 404, { error: "Conversación no encontrada." });
  const accion = partes[3] || "";

  if (req.method === "GET" && accion === "") return json(res, 200, vistaCliente(c));

  if (req.method === "GET" && accion === "eventos") {
    abrirSSE(req, res);
    if (!sseClientes.has(c.id)) sseClientes.set(c.id, new Set());
    sseClientes.get(c.id).add(res);
    req.on("close", () => sseClientes.get(c.id) && sseClientes.get(c.id).delete(res));
    return;
  }

  // Derecho de supresión (Ley 1581): el cliente borra su conversación y sus datos
  if (req.method === "DELETE" && accion === "") {
    if (pedidoActivo(c.pedido) && c.pedido.estadoIdx > 0) return json(res, 409, { error: "Tienes un pedido en curso. Podrás borrar tus datos cuando termine." });
    delete convs[c.id];
    (sseClientes.get(c.id) || new Set()).forEach((r) => r.end());
    sseClientes.delete(c.id);
    sseOperadores.forEach((r) => enviarSSE(r, { tipo: "eliminada", id: c.id }));
    guardar();
    return json(res, 200, { ok: true });
  }

  if (req.method !== "POST") return json(res, 405, { error: "Método no permitido" });
  if (demasiadas(req, 40)) return json(res, 429, { error: "Vas muy rápido, espera un momento." });
  const b = await leerCuerpo(req);

  if (accion === "mensajes") {
    const texto = txt(b.texto, 1000);
    if (!texto) return json(res, 400, { error: "Mensaje vacío." });
    const com = limpiarComercio(b.comercio);
    if (com) c.comercioInteres = com;
    const m = agregarMensaje(c, "cliente", texto, com ? { comercio: com.nombre } : null);
    avisar(c);
    return json(res, 201, m);
  }
  if (accion === "perfil") {
    const d = limpiarDireccion(b.direccion);
    if (d) c.direccion = d;
    avisar(c);
    return json(res, 200, { ok: true });
  }
  if (accion === "leido") {
    c.noLeidosCliente = 0;
    guardar();
    return json(res, 200, { ok: true });
  }
  if (accion === "pedido") {
    const p = b.pedido || {};
    const comercio = limpiarComercio(p.comercio);
    const items = limpiarItems(p.items);
    const direccion = limpiarDireccion(p.direccion) || c.direccion;
    if (!comercio || !items.length || !direccion) return json(res, 400, { error: "El pedido necesita comercio, productos y dirección." });
    if (pedidoActivo(c.pedido)) return json(res, 409, { error: `Ya tienes el pedido #${c.pedido.id} en curso. Escríbenos por el chat si quieres agregar algo.` });
    archivarPedido(c);
    const subtotal = items.reduce((a, i) => a + (i.precio || 0) * (i.qty || 1), 0);
    const envio = num(p.envio, 0, 50000) || 0;
    c.direccion = direccion;
    c.pedido = {
      id: "UB-" + (1000 + Math.floor(Math.random() * 9000)),
      comercio, items, subtotal, envio, total: subtotal + envio,
      notas: txt(p.notas, 300), direccion,
      estadoIdx: 0, domiciliario: null, creado: Date.now(), cambios: [{ estadoIdx: 0, t: Date.now() }]
    };
    agregarMensaje(c, "cliente", textoPedido(c.pedido) + (c.pedido.notas ? `\nNotas: ${c.pedido.notas}` : ""), { pedidoId: c.pedido.id });
    agregarMensaje(c, "sistema", "Recibimos tu pedido. Ya lo estamos confirmando con el restaurante; te avisamos aquí apenas lo acepten.");
    avisar(c);
    return json(res, 201, vistaCliente(c));
  }
  if (accion === "cancelar") {
    const p = c.pedido;
    if (!pedidoActivo(p)) return json(res, 400, { error: "No tienes un pedido activo." });
    if (p.estadoIdx > 0) return json(res, 409, { error: "El restaurante ya aceptó tu pedido; escríbenos por el chat para ver si aún se puede cancelar." });
    p.cancelado = { t: Date.now(), por: "cliente", motivo: txt(b.motivo, 200) };
    agregarMensaje(c, "cliente", `Cancelé el pedido #${p.id}.${p.cancelado.motivo ? " Motivo: " + p.cancelado.motivo : ""}`);
    agregarMensaje(c, "sistema", `Pedido #${p.id} cancelado. Si quieres, puedes hacer otro cuando gustes.`);
    avisar(c);
    return json(res, 200, vistaCliente(c));
  }
  if (accion === "calificar") {
    const p = c.pedido;
    const estrellas = num(b.estrellas, 1, 5);
    if (!p || p.estadoIdx !== 6 || p.cancelado) return json(res, 400, { error: "Solo puedes calificar un pedido entregado." });
    if (p.calificacion) return json(res, 409, { error: "Ya calificaste este pedido." });
    if (!estrellas) return json(res, 400, { error: "Elige de 1 a 5 estrellas." });
    p.calificacion = { estrellas: Math.round(estrellas), comentario: txt(b.comentario, 400), t: Date.now() };
    agregarMensaje(c, "cliente", `Califiqué el pedido #${p.id}: ${"★".repeat(p.calificacion.estrellas)}${"☆".repeat(5 - p.calificacion.estrellas)}${p.calificacion.comentario ? "\n«" + p.calificacion.comentario + "»" : ""}`);
    agregarMensaje(c, "sistema", "¡Gracias por tu calificación! Nos ayuda a mejorar 💚");
    avisar(c);
    return json(res, 200, vistaCliente(c));
  }
  return json(res, 404, { error: "Ruta no encontrada" });
}

/* ---------------- API del operador ---------------- */
async function apiOperador(req, res, url, partes) {
  if (partes[2] === "login" && req.method === "POST") {
    const b = await leerCuerpo(req);
    if (!iguales(txt(b.clave, 100), CLAVE)) {
      await new Promise((r) => setTimeout(r, 800));
      return json(res, 401, { error: "Clave incorrecta." });
    }
    const t = id(24);
    sesiones.set(t, Date.now() + 12 * 3600e3);
    return json(res, 200, { token: t });
  }
  if (!sesionValida(tokenOperador(req, url))) return json(res, 401, { error: "Sesión vencida. Vuelve a ingresar." });

  if (partes[2] === "eventos") {
    abrirSSE(req, res);
    sseOperadores.add(res);
    req.on("close", () => sseOperadores.delete(res));
    return;
  }
  if (partes[2] === "conversaciones" && partes.length === 3 && req.method === "GET") {
    return json(res, 200, Object.values(convs).sort((a, b) => b.actualizado - a.actualizado).map(resumen));
  }
  if (partes[2] === "resumen" && req.method === "GET") return json(res, 200, calcularResumen());
  // Subir una foto (el panel ya la reduce y la convierte a WebP antes de enviarla)
  if (partes[2] === "fotos" && req.method === "POST") {
    const MAX = 3 * 1024 * 1024;
    if (Number(req.headers["content-length"]) > MAX) { req.resume(); return json(res, 413, { error: "La imagen pesa más de 3 MB." }); }
    let buf;
    try { buf = await leerBinario(req, MAX); } catch (e) { return json(res, e.status || 400, { error: e.message }); }
    const tipo = tipoImagen(buf);
    if (!tipo) return json(res, 400, { error: "El archivo no es una imagen WebP, JPG o PNG." });
    const nombre = id(9) + "." + tipo;
    await fs.promises.writeFile(path.join(DIR_FOTOS, nombre), buf);
    return json(res, 201, { url: "fotos/" + nombre, bytes: buf.length });
  }
  if (partes[2] === "comercios") {
    if (req.method === "GET") return json(res, 200, { comercios });
    if (req.method === "PUT") {
      const b = await leerCuerpo(req);
      if (!Array.isArray(b.comercios)) return json(res, 400, { error: "Lista de comercios inválida." });
      const lista = b.comercios.slice(0, 200).map(limpiarAliado);
      const malos = lista.map((x, i) => (x ? null : i + 1)).filter(Boolean);
      if (malos.length) return json(res, 400, { error: `Revisa el comercio #${malos.join(", #")}: necesita nombre y coordenadas válidas.` });
      comercios = lista;
      fs.writeFile(ARCH_COM, JSON.stringify(comercios, null, 1), (e) => e && console.error("No se pudo guardar comercios:", e.message));
      return json(res, 200, { ok: true, total: comercios.length });
    }
  }

  const c = partes[2] === "conversaciones" && convs[partes[3]];
  if (!c) return json(res, 404, { error: "Conversación no encontrada." });
  const accion = partes[4] || "";

  if (req.method === "GET" && accion === "") {
    const { token, ...sinToken } = c;
    return json(res, 200, sinToken);
  }
  if (req.method !== "POST") return json(res, 405, { error: "Método no permitido" });
  const b = await leerCuerpo(req);

  if (accion === "mensajes") {
    const texto = txt(b.texto, 1500);
    if (!texto) return json(res, 400, { error: "Mensaje vacío." });
    agregarMensaje(c, "operador", texto, { autor: txt(b.autor, 40) || "UbaDomi" });
    avisar(c);
    return json(res, 201, { ok: true });
  }
  if (accion === "leido") {
    c.noLeidosOperador = 0;
    avisar(c);
    return json(res, 200, { ok: true });
  }
  if (accion === "nota") {
    const texto = txt(b.texto, 1000);
    if (!texto) return json(res, 400, { error: "Nota vacía." });
    c.notas.push({ texto, t: Date.now() });
    guardar();
    return json(res, 201, { ok: true });
  }
  if (accion === "pedido") {
    // el operador crea o corrige el pedido (pedidos hechos por chat)
    const comercio = limpiarComercio(b.comercio);
    let items = limpiarItems(b.items);
    if (!items.length && b.itemsTexto) items = txt(b.itemsTexto, 2000).split("\n").map((l) => ({ nombre: txt(l, 120), qty: null, precio: null })).filter((i) => i.nombre);
    const direccion = limpiarDireccion(b.direccion) || c.direccion;
    if (!comercio || !items.length || !direccion) return json(res, 400, { error: "Falta comercio, productos o dirección del cliente." });
    const subtotal = num(b.subtotal, 0, 10_000_000);
    const envio = num(b.envio, 0, 50000) || 0;
    const sub = subtotal != null ? subtotal : items.reduce((a, i) => a + (i.precio || 0) * (i.qty || 1), 0);
    const editar = pedidoActivo(c.pedido) && b.editar === true;
    if (!editar) archivarPedido(c);
    const base = editar ? c.pedido : { id: "UB-" + (1000 + Math.floor(Math.random() * 9000)), estadoIdx: 0, domiciliario: null, creado: Date.now(), cambios: [{ estadoIdx: 0, t: Date.now() }] };
    c.pedido = Object.assign(base, { comercio, items, subtotal: sub, envio, total: sub + envio, notas: txt(b.notas, 300), direccion });
    c.direccion = direccion;
    agregarMensaje(c, "sistema", (editar ? "Actualizamos tu pedido:\n" : "Creamos tu pedido:\n") + textoPedido(c.pedido) + "\nPuedes seguirlo en «Seguir pedido».", { pedidoId: c.pedido.id });
    avisar(c);
    return json(res, 200, { ok: true });
  }
  if (accion === "cancelar") {
    if (!pedidoActivo(c.pedido)) return json(res, 400, { error: "No hay un pedido activo para cancelar." });
    const motivo = txt(b.motivo, 200);
    c.pedido.cancelado = { t: Date.now(), por: "operador", motivo };
    agregarMensaje(c, "sistema", `Pedido #${c.pedido.id} cancelado${motivo ? ": " + motivo : "."} Si quieres, te ayudamos con otro pedido.`);
    avisar(c);
    return json(res, 200, { ok: true });
  }
  if (accion === "estado") {
    if (!c.pedido) return json(res, 400, { error: "Esta conversación no tiene pedido." });
    if (c.pedido.cancelado) return json(res, 400, { error: "El pedido está cancelado." });
    const e = num(b.estadoIdx, 0, 6);
    if (e == null) return json(res, 400, { error: "Estado inválido." });
    if (b.domiciliario && txt(b.domiciliario.nombre, 60)) {
      c.pedido.domiciliario = { nombre: txt(b.domiciliario.nombre, 60), vehiculo: txt(b.domiciliario.vehiculo, 80), telefono: txt(b.domiciliario.telefono, 20) };
    }
    if (e !== c.pedido.estadoIdx) {
      c.pedido.estadoIdx = e;
      c.pedido.cambios.push({ estadoIdx: e, t: Date.now() });
      const frases = [
        "Tu pedido quedó registrado.",
        "¡El restaurante aceptó tu pedido! 🎉",
        "El restaurante está preparando tu pedido 👩‍🍳",
        "Tu pedido está listo y empacado.",
        `Asignamos a ${c.pedido.domiciliario ? c.pedido.domiciliario.nombre : "un domiciliario"} para llevar tu pedido.`,
        "¡Tu pedido va en camino! 🛵 Ten listo el efectivo.",
        "¡Pedido entregado! Gracias por pedir con UbaDomi 💚"
      ];
      agregarMensaje(c, "sistema", `Estado: ${ESTADOS[e]} — ${frases[e]}`);
    }
    avisar(c);
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: "Ruta no encontrada" });
}

/* ---------------- Archivos estáticos ---------------- */
function estatico(req, res, url) {
  let ruta = decodeURIComponent(url.pathname);
  if (ruta === "/") ruta = "/index.html";
  const archivo = path.normalize(path.join(RAIZ, ruta));
  const rel = path.relative(RAIZ, archivo);
  const primera = rel.split(path.sep)[0];
  if (rel.startsWith("..") || path.isAbsolute(rel) || rel.split(path.sep).some((p) => p.startsWith(".")) ||
      primera === "datos" || primera === "node_modules" || PRIVADOS.has(rel)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" }).end("Prohibido");
    return;
  }
  fs.readFile(archivo, (err, datos) => {
    if (err) {
      fs.readFile(path.join(RAIZ, "404.html"), (e2, pag) => {
        res.writeHead(404, { "Content-Type": e2 ? "text/plain; charset=utf-8" : "text/html; charset=utf-8" });
        res.end(e2 ? "No encontrado" : pag);
      });
      return;
    }
    // las fotos subidas tienen nombre único: se pueden guardar en caché mucho tiempo
    const cache = primera === "fotos" && /\.(webp|jpg|png)$/i.test(archivo) ? "public, max-age=31536000, immutable" : "no-cache";
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(archivo).toLowerCase()] || "application/octet-stream", "Cache-Control": cache, "X-Content-Type-Options": "nosniff" });
    res.end(datos);
  });
}

/* ---------------- Servidor ---------------- */
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const partes = url.pathname.split("/").filter(Boolean);
  try {
    if (partes[0] === "api" && partes[1] === "chat") return await apiCliente(req, res, url, partes);
    if (partes[0] === "api" && partes[1] === "op") return await apiOperador(req, res, url, partes);
    if (partes[0] === "api" && partes[1] === "comercios" && req.method === "GET") {
      return json(res, 200, { comercios: comercios ? comercios.filter((x) => x.activo !== false) : null });
    }
    if (partes[0] === "api") return json(res, 404, { error: "Ruta no encontrada" });
    if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { error: "Método no permitido" });
    estatico(req, res, url);
  } catch (e) {
    if (!res.headersSent) json(res, 400, { error: e.message || "Error" });
  }
}).listen(PUERTO, () => {
  console.log(`\n  UbaDomi listo en      http://localhost:${PUERTO}`);
  console.log(`  Panel del operador:   http://localhost:${PUERTO}/operador.html`);
  console.log(`  Clave del operador:   ${process.env.UBADOMI_CLAVE ? "(variable UBADOMI_CLAVE)" : CLAVE + "   (guardada en datos/clave-operador.txt)"}`);
  console.log("  Ctrl+C para detener\n");
});
