/* =========================================================
   UbaDomi — lógica principal
   Catálogo de aliados + mapa real de restaurantes de Ubaté +
   carrito + dirección en mapa + seguimiento del pedido.
   ========================================================= */
(function () {
  "use strict";

  const CFG = window.CONFIG || {};
  const CENTRO = CFG.CENTRO || { lat: 5.30806, lng: -73.81487 };
  const RADIO = CFG.RADIO_BUSQUEDA_M || 4000;
  const USAR_GOOGLE = !!(CFG.GOOGLE_MAPS_API_KEY && CFG.GOOGLE_MAPS_API_KEY.trim());
  const BARRIOS = window.BARRIOS_UBATE || { Centro: [CENTRO.lat, CENTRO.lng] };

  const CATEGORIAS = {
    todos:       { nombre: "Todos",                 icono: "🍽️" },
    restaurante: { nombre: "Restaurantes / Corrientazos", icono: "🍲" },
    rapida:      { nombre: "Comidas rápidas",       icono: "🍔" },
    pizza:       { nombre: "Pizza",                 icono: "🍕" },
    pollo:       { nombre: "Pollo y asados",        icono: "🍗" },
    cafe:        { nombre: "Cafés",                 icono: "☕" },
    panaderia:   { nombre: "Panadería",             icono: "🥐" },
    helados:     { nombre: "Heladerías",            icono: "🍦" },
    tienda:      { nombre: "Tienda / Minimercado",  icono: "🛒" }
  };

  // Los 7 estados del pedido (Figura 2 de la propuesta)
  const ESTADOS = [
    { code: "Creado",         titular: "Pedido recibido en UbaDomi",      desc: () => "Tu solicitud fue registrada y enviada al establecimiento.", eta: "25-30 min" },
    { code: "Aceptado",       titular: "¡El comercio aceptó tu pedido!",  desc: () => "El encargado confirmó disponibilidad y valor total en efectivo.", eta: "22-25 min" },
    { code: "En preparación", titular: "Preparando tus productos",        desc: () => "La cocina o tienda está alistando tu orden con cuidado.", eta: "15-20 min" },
    { code: "Listo",          titular: "Pedido empacado y listo",         desc: () => "Tu paquete está listo esperando al domiciliario.", eta: "12-15 min" },
    { code: "Asignado",       titular: "Domiciliario asignado",           desc: (p) => `${nombreDom(p)} recibió la orden para recoger tu pedido.`, eta: "10-12 min" },
    { code: "En camino",      titular: "¡Tu domiciliario va en camino!",  desc: (p) => `${nombreDom(p)} recogió tu pedido y se dirige hacia tu dirección en Ubaté.`, eta: null },
    { code: "Entregado",      titular: "¡Pedido entregado con éxito!",    desc: () => "Domicilio completado y cobro en efectivo registrado.", eta: "¡Entregado!" }
  ];
  const DOMICILIARIO_DEMO = { nombre: "Carlos Andrés Gómez", vehiculo: "Moto Boxer CT100 · Placa KLM-42F" };
  const nombreDom = (p) => (p.domiciliario && p.domiciliario.nombre) || "El domiciliario";

  const estado = {
    aliados: [],
    externos: [],
    todos: [],
    categoria: "todos",
    texto: "",
    orden: "nombre",
    soloDomicilio: false,
    yo: null,
    seleccionado: null,
    vista: "catalogo",
    carrito: { storeId: null, items: [] },
    direccion: null,     // { barrio, detalle, lat, lng }
    pedido: null
  };

  // El chat necesita el servidor de UbaDomi (npm start); abierto como archivo no funciona
  const CHAT_OK = location.protocol === "http:" || location.protocol === "https:";

  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

  /* =================== Utilidades =================== */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const formatCOP = (v) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(v);
  function distanciaKm(a, b) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
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
  function linkGoogle(r) {
    if (r.googleUrl) return r.googleUrl;
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(r.nombre + " " + (CFG.MUNICIPIO || "Ubaté, Cundinamarca"));
  }
  const linkComoLlegar = (r) => "https://www.google.com/maps/dir/?api=1&destination=" + r.lat + "," + r.lng;

  const cacheSesion = {
    get(k) { try { const v = JSON.parse(sessionStorage.getItem(k) || "null"); return v && Date.now() - v.t < 3600e3 ? v.d : null; } catch (e) { return null; } },
    set(k, d) { try { sessionStorage.setItem(k, JSON.stringify({ t: Date.now(), d })); } catch (e) { /* sin almacenamiento */ } }
  };

  // Imagen segura para pintar: foto subida al servidor o URL https
  const fotoValida = (u) => /^fotos\/[\w-]+\.(webp|jpg|png)$/.test(u || "") || /^https:\/\//.test(u || "");

  // Fotos de referencia por tipo de comida (Wikimedia Commons, licencia libre) mientras el negocio no tenga la suya
  let REFERENCIAS = {};
  async function cargarReferencias() {
    try {
      const j = await (await fetch("fotos/referencia/creditos.json")).json();
      REFERENCIAS = {};
      (j.fotos || []).forEach((f) => (REFERENCIAS[f.categoria] = REFERENCIAS[f.categoria] || []).push(f));
      pintar(false);
    } catch (e) { /* sin fotos de referencia: se ven el color y el ícono */ }
  }
  const hashTexto = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

  // Reparto en orden dentro de cada categoría: se agotan las fotos distintas antes de repetir,
  // y cada negocio conserva siempre la misma (orden estable por id)
  let ordenRef = { n: -1, mapa: new Map() };
  function indiceRef(r) {
    if (ordenRef.n !== estado.todos.length) {
      const mapa = new Map(), cuenta = {};
      [...estado.todos].sort((a, b) => String(a.id).localeCompare(String(b.id))).forEach((x) => {
        mapa.set(x.id, (cuenta[x.categoria] = (cuenta[x.categoria] || 0) + 1) - 1);
      });
      ordenRef = { n: estado.todos.length, mapa };
    }
    return ordenRef.mapa.has(r.id) ? ordenRef.mapa.get(r.id) : hashTexto(r.id || r.nombre);
  }

  // Foto a mostrar: la propia del negocio (o de Google) o una de referencia de su categoría
  function fotoDe(r) {
    if (fotoValida(r.foto)) return { src: r.foto, ref: false };
    const lista = REFERENCIAS[r.categoria] || REFERENCIAS.restaurante;
    if (!lista || !lista.length) return null;
    const f = lista[indiceRef(r) % lista.length];
    return { src: "fotos/referencia/" + f.archivo, ref: true };
  }
  const etiquetaReferencia = '<span class="credito-foto ref" title="No es una foto de este negocio. Fotos de Wikimedia Commons con licencia libre: ver créditos.">Imagen de referencia</span>';

  // Crédito obligatorio de las fotos de Google
  function creditoFoto(r) {
    if (r.fotoFuente !== "google") return "";
    const autor = r.fotoAutor ? (r.fotoAutorUrl ? `<a href="${esc(r.fotoAutorUrl)}" target="_blank" rel="noopener">${esc(r.fotoAutor)}</a>` : esc(r.fotoAutor)) : "";
    return `<span class="credito-foto">Foto${autor ? ": " + autor : ""} · Google Maps</span>`;
  }

  // Reinicia una animación CSS de una sola vez (sirve aunque se dispare seguido)
  function animarUnaVez(el, clase) {
    if (!el) return;
    el.classList.remove(clase);
    void el.offsetWidth; // fuerza reflujo para reiniciar la animación
    el.classList.add(clase);
    el.addEventListener("animationend", () => el.classList.remove(clase), { once: true });
  }

  const guardado = {
    get(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }
  };
  const cache = {
    get(k) { const v = guardado.get(k, null); return v && Date.now() - v.t < (CFG.HORAS_CACHE || 12) * 3600e3 ? v.d : null; },
    set(k, d) { guardado.set(k, { t: Date.now(), d }); }
  };

  let toastObj = null;
  function aviso(msg, icono) {
    $("#toastMessage").innerHTML = `<i class="bi ${icono || "bi-check-circle-fill text-success"}"></i> ${esc(msg)}`;
    toastObj = toastObj || new bootstrap.Toast($("#liveToast"), { delay: 2800 });
    toastObj.show();
  }

  function capaBase(mapa) {
    return L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(mapa);
  }

  /* =================== Fuentes de datos =================== */

  // lista: la del servidor (editada en el panel) o, si no hay, la de restaurantes.js
  function cargarAliados(lista) {
    return (lista || window.RESTAURANTES_MANUALES || [])
      .filter((r) => r && r.nombre && isFinite(r.lat) && isFinite(r.lng) && r.activo !== false)
      .map((r, i) => ({
        id: r.id || "a-" + i,
        nombre: r.nombre,
        categoria: CATEGORIAS[r.categoria] && r.categoria !== "todos" ? r.categoria : "restaurante",
        barrio: r.barrio || "",
        cocina: r.cocina || "",
        descripcion: r.descripcion || "",
        direccion: r.direccion || "",
        telefono: r.telefono || "",
        horario: r.horario || "",
        tiempo: r.tiempo || "",
        costoEnvio: Number.isFinite(r.costoEnvio) ? r.costoEnvio : (CFG.COSTO_ENVIO_DEFECTO || 2000),
        domicilio: r.domicilio !== false,
        color: r.color || "linear-gradient(135deg, #15803d 0%, #16a34a 100%)",
        icono: r.icono || (CATEGORIAS[r.categoria] || CATEGORIAS.restaurante).icono,
        demo: !!r.demo,
        foto: r.foto || "",
        productos: Array.isArray(r.productos) ? r.productos : [],
        lat: +r.lat, lng: +r.lng,
        fuente: "aliado"
      }));
  }

  // ---- OpenStreetMap (Overpass) ----
  const OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
  ];
  function categoriaOSM(t) {
    const c = sinTildes(t.cuisine || "");
    if (t.amenity === "ice_cream" || /ice_cream|helad/.test(c)) return "helados";
    if (t.shop === "bakery" || t.shop === "pastry" || /bakery|panader/.test(c)) return "panaderia";
    if (/pizza/.test(c)) return "pizza";
    if (/chicken|pollo|barbecue|grill|asado|steak/.test(c)) return "pollo";
    if (t.amenity === "cafe" || /coffee|cafe/.test(c)) return "cafe";
    if (t.amenity === "fast_food" || /burger|hot_dog|sandwich|empanada|arepa/.test(c)) return "rapida";
    return "restaurante";
  }
  const COCINAS = {
    regional: "Comida típica", colombian: "Comida colombiana", pizza: "Pizza", burger: "Hamburguesas",
    chicken: "Pollo", barbecue: "Asados", coffee_shop: "Café", sandwich: "Sándwiches", chinese: "China",
    italian: "Italiana", mexican: "Mexicana", ice_cream: "Helados", hot_dog: "Perros calientes",
    seafood: "Pescados y mariscos", steak_house: "Carnes", bakery: "Panadería", local: "Comida local",
    international: "Internacional", sushi: "Sushi", arepa: "Arepas", empanada: "Empanadas"
  };
  const cocinaOSM = (c) => String(c || "").split(";").map((x) => x.trim()).filter(Boolean).map((x) => COCINAS[x] || x.replace(/_/g, " ")).join(", ");

  // Consulta los servidores Overpass en paralelo y usa el primero que responda bien
  function consultarOverpass(q) {
    const ctrls = OVERPASS.map(() => new AbortController());
    const to = setTimeout(() => ctrls.forEach((c) => c.abort()), 20000);
    return Promise.any(OVERPASS.map((url, i) =>
      fetch(url, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: ctrls[i].signal })
        .then((res) => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
        .then((d) => { if (!d || !Array.isArray(d.elements)) throw new Error("Respuesta inválida"); return d; })
    )).then((d) => { ctrls.forEach((c) => c.abort()); return d; })
      .finally(() => clearTimeout(to));
  }

  // Devuelve { lista, copia } — copia = fecha si se usó restaurantes-osm.json
  async function cargarOSM() {
    const hit = cache.get("osm-ubate-v2");
    if (hit) return { lista: hit, copia: null };
    const q = `[out:json][timeout:25];
      (
        nwr["amenity"~"^(restaurant|fast_food|cafe|ice_cream|food_court)$"](around:${RADIO},${CENTRO.lat},${CENTRO.lng});
        nwr["shop"~"^(bakery|pastry)$"](around:${RADIO},${CENTRO.lat},${CENTRO.lng});
      );
      out center tags;`;
    try {
      const datos = await consultarOverpass(q);
      const lista = normalizarOSM(datos.elements);
      cache.set("osm-ubate-v2", lista);
      return { lista, copia: null };
    } catch (e) {
      // Respaldo: copia guardada en el proyecto (npm run actualizar-osm)
      const res = await fetch("restaurantes-osm.json", { cache: "no-cache" }).catch(() => null);
      if (!res || !res.ok) throw new Error("OpenStreetMap no respondió y no hay copia guardada");
      const copia = await res.json();
      return { lista: normalizarOSM(copia.elements || []), copia: copia.actualizado || "fecha desconocida" };
    }
  }

  function normalizarOSM(elements) {
    return elements.map((el) => {
      const t = el.tags || {};
      const lat = el.lat != null ? el.lat : el.center && el.center.lat;
      const lng = el.lon != null ? el.lon : el.center && el.center.lon;
      if (!t.name || t.name.trim().length < 3 || lat == null) return null;
      return {
        id: "osm-" + el.type + "-" + el.id,
        nombre: t.name.trim(),
        categoria: categoriaOSM(t),
        cocina: cocinaOSM(t.cuisine),
        direccion: [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" # ") || t["addr:full"] || "",
        telefono: t.phone || t["contact:phone"] || t["contact:whatsapp"] || t.mobile || "",
        horario: t.opening_hours || "",
        domicilio: t.delivery === "yes" ? true : t.delivery === "no" ? false : null,
        lat, lng,
        fuente: "osm"
      };
    }).filter(Boolean);
  }

  // ---- Google Places (requiere API key) ----
  function categoriaGoogle(types) {
    const t = (types || []).join(" ");
    if (/ice_cream/.test(t)) return "helados";
    if (/bakery|pastry|confectionery/.test(t)) return "panaderia";
    if (/pizza/.test(t)) return "pizza";
    if (/chicken|barbecue|steak_house/.test(t)) return "pollo";
    if (/hamburger|fast_food|sandwich|meal_takeaway/.test(t)) return "rapida";
    if (/cafe|coffee/.test(t)) return "cafe";
    if (/grocery|convenience|supermarket/.test(t)) return "tienda";
    return "restaurante";
  }
  function cargarScriptGoogle() {
    return new Promise((resolve, reject) => {
      window.__gmListo = resolve;
      window.gm_authFailure = () => reject(new Error("La API key de Google no es válida o no tiene permisos para este sitio."));
      const s = document.createElement("script");
      s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(CFG.GOOGLE_MAPS_API_KEY.trim()) + "&v=weekly&loading=async&language=es&region=CO&callback=__gmListo";
      s.async = true;
      s.onerror = () => reject(new Error("No se pudo cargar Google Maps."));
      document.head.appendChild(s);
    });
  }
  async function cargarGoogle() {
    // Datos de Google: solo durante la sesión (sus enlaces de fotos caducan y sus términos limitan guardarlos)
    const hit = cacheSesion.get("google-ubate-v2");
    if (hit) return hit;
    const { Place } = await google.maps.importLibrary("places");
    const campos = ["id", "displayName", "location", "formattedAddress", "types", "primaryTypeDisplayName",
      "rating", "userRatingCount", "nationalPhoneNumber", "googleMapsURI", "regularOpeningHours", "delivery", "businessStatus", "photos"];
    const lugar = CFG.MUNICIPIO || "Ubaté, Cundinamarca";
    const busquedas = ["restaurantes", "comida rápida", "pizzería", "asadero de pollo", "hamburguesas", "almuerzos",
      "panadería", "cafetería", "piqueteadero", "comida china", "heladería", "restaurante campestre"];
    const peticiones = busquedas.map((b) => Place.searchByText({
      textQuery: b + " en " + lugar, fields: campos,
      locationBias: { center: CENTRO, radius: RADIO }, maxResultCount: 20, language: "es", region: "co"
    }));
    ["restaurant", "fast_food_restaurant", "cafe", "bakery"].forEach((tipo) => peticiones.push(Place.searchNearby({
      fields: campos, locationRestriction: { center: CENTRO, radius: Math.min(RADIO, 5000) },
      includedTypes: [tipo], maxResultCount: 20, language: "es", region: "co"
    })));

    const resultados = await Promise.allSettled(peticiones);
    const vistos = new Map();
    let errores = 0;
    const hoy = (new Date().getDay() + 6) % 7;
    resultados.forEach((r) => {
      if (r.status !== "fulfilled") { errores++; return; }
      (r.value.places || []).forEach((p) => {
        if (!p.location || vistos.has(p.id)) return;
        if (p.businessStatus && p.businessStatus !== "OPERATIONAL") return;
        const lat = p.location.lat(), lng = p.location.lng();
        if (distanciaKm(CENTRO, { lat, lng }) * 1000 > RADIO * 1.5) return;
        const h = p.regularOpeningHours && p.regularOpeningHours.weekdayDescriptions;
        vistos.set(p.id, {
          id: "g-" + p.id,
          nombre: p.displayName,
          categoria: categoriaGoogle(p.types),
          cocina: p.primaryTypeDisplayName || "",
          direccion: (p.formattedAddress || "").replace(/, Colombia$/, ""),
          telefono: p.nationalPhoneNumber || "",
          horario: h ? h[hoy] || "" : "",
          domicilio: p.delivery === true ? true : p.delivery === false ? false : null,
          rating: p.rating || null,
          resenas: p.userRatingCount || 0,
          googleUrl: p.googleMapsURI || "",
          ...fotoGoogle(p),
          lat, lng,
          fuente: "google"
        });
      });
    });
    if (!vistos.size && errores) throw new Error("Google Places no respondió (revisa la API key y que 'Places API (New)' esté activa).");
    const lista = [...vistos.values()];
    cacheSesion.set("google-ubate-v2", lista);
    return lista;
  }

  // Primera foto del lugar en Google Maps + su autor (Google exige mostrar la atribución)
  function fotoGoogle(p) {
    const f = p.photos && p.photos[0];
    if (!f) return {};
    try {
      const a = (f.authorAttributions || [])[0] || {};
      return {
        foto: f.getURI({ maxWidth: 640, maxHeight: 400 }),
        fotoAutor: a.displayName || "",
        fotoAutorUrl: /^https:\/\//.test(a.uri || "") ? a.uri : "",
        fotoFuente: "google"
      };
    } catch (e) { return {}; }
  }

  // Une listas evitando duplicados (mismo nombre a menos de 60 m); el aliado gana
  function unir(aliados, externos) {
    const norm = (s) => sinTildes(s).replace(/[^a-z0-9]/g, "");
    const fuera = externos.filter((e) => !aliados.some((a) => norm(a.nombre) === norm(e.nombre) && distanciaKm(a, e) < 0.06));
    return aliados.concat(fuera);
  }
  const buscarComercio = (id) => estado.todos.find((r) => r.id === id) || estado.aliados.find((r) => r.id === id);

  /* =================== Filtros y render =================== */

  function pasaFiltros(r, conCategoria) {
    if (conCategoria && estado.categoria !== "todos" && r.categoria !== estado.categoria) return false;
    if (estado.soloDomicilio && r.domicilio !== true) return false;
    const q = sinTildes(estado.texto.trim());
    if (!q) return true;
    const texto = [r.nombre, r.cocina, r.descripcion, r.direccion, r.barrio, CATEGORIAS[r.categoria].nombre]
      .concat((r.productos || []).map((p) => p.nombre + " " + (p.desc || ""))).join(" ");
    return sinTildes(texto).includes(q);
  }

  function filtrados() {
    const l = estado.todos.filter((r) => pasaFiltros(r, true));
    const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, "es");
    if (estado.orden === "cercania" && estado.yo) l.sort((a, b) => distanciaKm(estado.yo, a) - distanciaKm(estado.yo, b));
    else if (estado.orden === "rating") l.sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.resenas || 0) - (a.resenas || 0) || porNombre(a, b));
    else l.sort(porNombre);
    if (estado.orden !== "cercania") l.sort((a, b) => (b.fuente === "aliado") - (a.fuente === "aliado"));
    return l;
  }

  function lineaMeta(r) {
    const partes = [r.cocina || CATEGORIAS[r.categoria].nombre];
    if (r.barrio) partes.push("Barrio " + r.barrio);
    if (estado.yo) {
      const d = distanciaKm(estado.yo, r);
      partes.push(d < 1 ? Math.round(d * 1000) + " m" : d.toFixed(1) + " km");
    }
    return partes.map(esc).join(" · ");
  }

  function insignias(r) {
    let h = "";
    if (r.fuente === "aliado") h += '<span class="mini-badge ok"><i class="bi bi-patch-check-fill"></i> Aliado</span> ';
    if (r.demo) h += '<span class="mini-badge">Demo</span> ';
    if (r.rating) h += `<span class="mini-badge star">★ ${r.rating.toFixed(1)}${r.resenas ? " (" + r.resenas + ")" : ""}</span> `;
    if (r.domicilio === true && r.fuente !== "aliado") h += '<span class="mini-badge ok">🛵 Domicilio</span> ';
    if (r.horario) h += `<span class="mini-badge" title="${esc(r.horario)}">🕒 ${esc(r.horario.length > 34 ? r.horario.slice(0, 32) + "…" : r.horario)}</span>`;
    return h ? `<div class="d-flex flex-wrap gap-1">${h}</div>` : "";
  }

  function acciones(r) {
    const wa = numeroWhatsApp(r.telefono);
    const tel = linkTel(r.telefono);
    let h = "";
    if (r.fuente === "aliado" && r.productos.length) {
      h += `<button type="button" class="btn btn-ubadomi btn-sm" data-menu="${esc(r.id)}"><i class="bi bi-bag-plus me-1"></i>Ver menú y pedir</button>`;
    } else if (CHAT_OK) {
      // pedimos nosotros: el cliente escribe por el chat de UbaDomi
      h += `<button type="button" class="btn btn-ubadomi btn-sm" data-chat-comercio="${esc(r.id)}"><i class="bi bi-chat-dots me-1"></i>Pedir con UbaDomi</button>`;
    } else if (wa) {
      const msg = encodeURIComponent((CFG.MENSAJE_WHATSAPP || "Hola, quiero hacer un pedido a domicilio.") + " (" + r.nombre + ")");
      h += `<a class="btn btn-wa btn-sm" href="https://wa.me/${wa}?text=${msg}" target="_blank" rel="noopener"><i class="bi bi-whatsapp me-1"></i>Pedir por WhatsApp</a>`;
    }
    if (tel) h += `<a class="btn btn-outline-secondary btn-sm" href="${tel}" title="Llamar"><i class="bi bi-telephone-fill"></i></a>`;
    if (r.fuente !== "aliado") h += `<a class="btn btn-outline-secondary btn-sm" href="${esc(linkGoogle(r))}" target="_blank" rel="noopener"><i class="bi bi-google me-1"></i>Google Maps</a>`;
    h += `<a class="btn btn-outline-secondary btn-sm" href="${linkComoLlegar(r)}" target="_blank" rel="noopener"><i class="bi bi-sign-turn-right me-1"></i>Cómo llegar</a>`;
    return h;
  }

  function tarjetaLista(r, enMapa) {
    const sel = enMapa && estado.seleccionado === r.id ? " sel" : "";
    const f = fotoDe(r);
    return `
      <div class="otro-card${sel}${f && !enMapa ? " con-foto" : ""}" data-id="${esc(r.id)}" ${enMapa ? 'tabindex="0"' : ""}>
        ${f && !enMapa ? `<figure class="otro-foto"><img src="${esc(f.src)}" alt="${f.ref ? "Imagen de referencia: " + esc(CATEGORIAS[r.categoria].nombre) : esc(r.nombre)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.closest('figure').remove()">${f.ref ? etiquetaReferencia : creditoFoto(r)}</figure>` : ""}
        <div class="d-flex gap-3 align-items-start">
          ${f && enMapa
            ? `<img class="otro-ico otro-mini" src="${esc(f.src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'otro-ico',textContent:'${CATEGORIAS[r.categoria].icono}'}))">`
            : `<div class="otro-ico" style="${r.fuente === "aliado" ? "background:var(--ubadomi-mint-soft)" : ""}">${CATEGORIAS[r.categoria].icono}</div>`}
          <div class="flex-grow-1" style="min-width:0">
            <h6 class="fw-bold mb-0">${esc(r.nombre)}</h6>
            <p class="meta">${lineaMeta(r)}</p>
            ${r.direccion ? `<p class="meta"><i class="bi bi-geo-alt"></i> ${esc(r.direccion)}</p>` : ""}
          </div>
        </div>
        ${insignias(r)}
        <div class="acciones">${acciones(r)}${!enMapa ? `<button type="button" class="btn btn-outline-success btn-sm" data-ver-mapa="${esc(r.id)}"><i class="bi bi-map"></i></button>` : ""}</div>
      </div>`;
  }

  function pintarCategorias() {
    const base = estado.todos.filter((r) => pasaFiltros(r, false));
    const cuenta = { todos: base.length };
    base.forEach((r) => (cuenta[r.categoria] = (cuenta[r.categoria] || 0) + 1));
    const html = Object.entries(CATEGORIAS)
      .filter(([k]) => k === "todos" || cuenta[k] || estado.categoria === k)
      .map(([k, c]) => `<button type="button" class="cat-chip${estado.categoria === k ? " active" : ""}" data-cat="${k}" aria-pressed="${estado.categoria === k}"><span>${c.icono}</span> ${c.nombre} <span class="n">${cuenta[k] || 0}</span></button>`)
      .join("");
    $$(".js-categorias").forEach((el) => (el.innerHTML = html));
  }

  function pintarCatalogo(lista) {
    const aliados = lista.filter((r) => r.fuente === "aliado");
    const otros = lista.filter((r) => r.fuente !== "aliado");

    $("#gridAliados").innerHTML = aliados.length ? aliados.map((s) => `
      <div class="col-sm-6 col-lg-4">
        <div class="store-card" data-menu="${esc(s.id)}" tabindex="0" role="button" aria-label="Ver menú de ${esc(s.nombre)}">
          <div class="store-banner${fotoDe(s) ? " con-foto" : ""}" style="background:${esc(s.color)}">
            ${(() => { const f = fotoDe(s); return f ? `<img class="store-foto" src="${esc(f.src)}" alt="${f.ref ? "Imagen de referencia" : esc(s.nombre)}" loading="lazy" decoding="async" onerror="this.parentElement.classList.remove('con-foto');this.remove()">${f.ref ? '<span class="store-badge-ref" title="No es una foto de este negocio">Imagen de referencia</span>' : ""}` : ""; })()}
            ${s.barrio ? `<span class="store-badge-barrio"><i class="bi bi-geo-alt-fill text-success me-1"></i>${esc(s.barrio)}</span>` : ""}
            ${s.demo ? '<span class="store-badge-demo" title="Comercio ficticio de demostración">Demo</span>' : ""}
            <span class="emoji">${esc(s.icono)}</span>
            ${s.tiempo ? `<span class="store-badge-time"><i class="bi bi-clock me-1 text-ubate-green"></i>${esc(s.tiempo)}</span>` : ""}
          </div>
          <div class="p-3 d-flex flex-column justify-content-between flex-grow-1">
            <div>
              <h5 class="fw-bold mb-1 fs-6">${esc(s.nombre)}</h5>
              <p class="text-muted small mb-2">${esc(s.descripcion || s.cocina)}</p>
            </div>
            <div class="border-top pt-2 mt-2 d-flex justify-content-between align-items-center small">
              <span class="text-secondary fw-medium">${CATEGORIAS[s.categoria].icono} ${esc(CATEGORIAS[s.categoria].nombre)}</span>
              <span class="text-success fw-bold"><i class="bi bi-bicycle me-1"></i>Envío ${formatCOP(s.costoEnvio)}</span>
            </div>
          </div>
        </div>
      </div>`).join("")
      : `<div class="col-12 vacio">No hay comercios aliados con esos filtros.</div>`;

    $("#gridOtros").innerHTML = otros.length
      ? otros.map((r) => `<div class="col-sm-6 col-lg-4">${tarjetaLista(r, false)}</div>`).join("")
      : `<div class="col-12 vacio">${estado.externos.length ? "No hay restaurantes con esos filtros." : "Cargando restaurantes del municipio…"}</div>`;
  }

  function pintarListaMapa(lista) {
    $("#listaMapa").innerHTML = lista.length
      ? lista.map((r) => `<li>${tarjetaLista(r, true)}</li>`).join("")
      : `<li class="vacio">No hay restaurantes con esos filtros.</li>`;
  }

  function pintar(ajustarMapa) {
    const l = filtrados();
    pintarCategorias();
    pintarCatalogo(l);
    pintarListaMapa(l);
    const n = l.length;
    $$(".js-contador").forEach((el) => (el.textContent = `Mostrando ${n} establecimiento${n === 1 ? "" : "s"}`));
    if (mapaPrincipal) {
      mapaPrincipal.poner(l);
      if (ajustarMapa) mapaPrincipal.ajustar(l);
    }
  }

  /* =================== Mapa principal =================== */
  let mapaPrincipal = null;
  let iniciandoMapa = null;

  function iconoHTML(r, sel) {
    const ico = (CATEGORIAS[r.categoria] || CATEGORIAS.restaurante).icono;
    return `<div class="pin${r.fuente === "aliado" ? " aliado" : ""}${sel ? " sel" : ""}"><span>${ico}</span></div>`;
  }

  function popupHTML(r) {
    return `<div class="popup">
      ${(() => { const f = fotoDe(r); return f ? `<figure class="popup-foto"><img src="${esc(f.src)}" alt="${f.ref ? "Imagen de referencia" : esc(r.nombre)}" referrerpolicy="no-referrer" onerror="this.closest('figure').remove()">${f.ref ? etiquetaReferencia : creditoFoto(r)}</figure>` : ""; })()}
      <h6>${esc(r.nombre)}</h6>
      <p class="meta">${lineaMeta(r)}</p>
      ${r.direccion ? `<p class="meta"><i class="bi bi-geo-alt"></i> ${esc(r.direccion)}</p>` : ""}
      ${r.telefono ? `<p class="meta"><i class="bi bi-telephone"></i> ${esc(r.telefono)}</p>` : ""}
      ${r.fuente === "aliado" ? `<p class="meta"><i class="bi bi-bicycle"></i> Envío ${formatCOP(r.costoEnvio)}${r.tiempo ? " · " + esc(r.tiempo) : ""}</p>` : ""}
      <div class="acciones">${acciones(r)}</div>
    </div>`;
  }

  function mapaLeaflet(el) {
    const mapa = L.map(el).setView([CENTRO.lat, CENTRO.lng], CFG.ZOOM || 15);
    capaBase(mapa);
    const capa = L.layerGroup().addTo(mapa);
    const marcadores = new Map();
    let yo = null, previo = null;
    const icono = (r, sel) => L.divIcon({ className: "pin-wrap", html: iconoHTML(r, sel), iconSize: sel ? [44, 44] : [36, 36], iconAnchor: sel ? [22, 44] : [18, 36], popupAnchor: [0, -36] });
    return {
      poner(lista) {
        capa.clearLayers(); marcadores.clear(); previo = null;
        lista.forEach((r) => {
          const m = L.marker([r.lat, r.lng], { icon: icono(r, false), title: r.nombre })
            .bindPopup(() => popupHTML(r), { maxWidth: 290 })
            .on("click", () => seleccionar(r.id, false));
          m.addTo(capa); marcadores.set(r.id, { m, r });
        });
      },
      seleccionar(id) {
        if (previo && marcadores.has(previo)) { const p = marcadores.get(previo); p.m.setIcon(icono(p.r, false)).setZIndexOffset(0); }
        const x = marcadores.get(id); if (!x) return;
        previo = id;
        x.m.setIcon(icono(x.r, true)).setZIndexOffset(1000);
        mapa.setView([x.r.lat, x.r.lng], Math.max(mapa.getZoom(), 17));
        x.m.openPopup();
      },
      ajustar(lista) {
        if (!lista.length) return;
        mapa.fitBounds(L.latLngBounds(lista.map((r) => [r.lat, r.lng])).pad(0.1), { maxZoom: 16 });
      },
      yo(p) {
        if (yo) yo.remove();
        yo = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: "pin-wrap", html: '<div class="yo"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), title: "Tú estás aquí", zIndexOffset: 2000 }).addTo(mapa);
        mapa.setView([p.lat, p.lng], 16);
      },
      refrescar() { mapa.invalidateSize(); }
    };
  }

  async function mapaGoogle(el) {
    const { Map, InfoWindow } = await google.maps.importLibrary("maps");
    const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");
    const mapa = new Map(el, {
      center: CENTRO, zoom: CFG.ZOOM || 15, mapId: CFG.GOOGLE_MAP_ID || "DEMO_MAP_ID",
      mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: false, gestureHandling: "greedy"
    });
    const info = new InfoWindow();
    const marcadores = new Map();
    let yo = null, previo = null;
    const contenido = (r, sel) => { const d = document.createElement("div"); d.innerHTML = iconoHTML(r, sel); return d.firstElementChild; };
    function abrir(r, m) {
      const div = document.createElement("div");
      div.innerHTML = popupHTML(r);
      div.addEventListener("click", manejarClic); // Google no siempre deja subir el clic
      info.setContent(div); info.open({ map: mapa, anchor: m });
    }
    return {
      poner(lista) {
        marcadores.forEach((x) => (x.m.map = null)); marcadores.clear(); previo = null;
        lista.forEach((r) => {
          const m = new AdvancedMarkerElement({ map: mapa, position: { lat: r.lat, lng: r.lng }, title: r.nombre, content: contenido(r, false) });
          m.addListener("click", () => seleccionar(r.id, false));
          marcadores.set(r.id, { m, r });
        });
      },
      seleccionar(id) {
        if (previo && marcadores.has(previo)) { const p = marcadores.get(previo); p.m.content = contenido(p.r, false); p.m.zIndex = 0; }
        const x = marcadores.get(id); if (!x) return;
        previo = id;
        x.m.content = contenido(x.r, true); x.m.zIndex = 1000;
        mapa.panTo({ lat: x.r.lat, lng: x.r.lng });
        if (mapa.getZoom() < 17) mapa.setZoom(17);
        abrir(x.r, x.m);
      },
      ajustar(lista) {
        if (!lista.length) return;
        const b = new google.maps.LatLngBounds();
        lista.forEach((r) => b.extend({ lat: r.lat, lng: r.lng }));
        mapa.fitBounds(b, 40);
        google.maps.event.addListenerOnce(mapa, "idle", () => { if (mapa.getZoom() > 16) mapa.setZoom(16); });
      },
      yo(p) {
        if (yo) yo.map = null;
        const d = document.createElement("div"); d.className = "yo";
        yo = new AdvancedMarkerElement({ map: mapa, position: p, title: "Tú estás aquí", content: d, zIndex: 2000 });
        mapa.panTo(p); mapa.setZoom(16);
      },
      refrescar() {}
    };
  }

  function asegurarMapaPrincipal() {
    if (mapaPrincipal) { mapaPrincipal.refrescar(); return Promise.resolve(); }
    if (!iniciandoMapa) {
      iniciandoMapa = (async () => {
        const el = $("#mapaRestaurantes");
        if (USAR_GOOGLE && window.google && google.maps && fuenteActual === "google") {
          try { mapaPrincipal = await mapaGoogle(el); } catch (e) { console.error(e); el.innerHTML = ""; }
        }
        if (!mapaPrincipal) mapaPrincipal = mapaLeaflet(el);
        const l = filtrados();
        mapaPrincipal.poner(l);
        mapaPrincipal.ajustar(l);
        if (estado.yo) mapaPrincipal.yo(estado.yo);
        if (estado.seleccionado) mapaPrincipal.seleccionar(estado.seleccionado);
      })();
    }
    return iniciandoMapa;
  }

  function seleccionar(id, desdeLista) {
    estado.seleccionado = id;
    $$("#listaMapa .otro-card.sel").forEach((c) => c.classList.remove("sel"));
    const card = $(`#listaMapa .otro-card[data-id="${CSS.escape(id)}"]`);
    if (card) {
      card.classList.add("sel");
      if (!desdeLista) card.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    if (mapaPrincipal) mapaPrincipal.seleccionar(id);
  }

  function ubicarme() {
    if (!navigator.geolocation) { aviso("Tu navegador no permite obtener la ubicación.", "bi-exclamation-triangle-fill text-warning"); return; }
    aviso("Obteniendo tu ubicación…", "bi-crosshair text-info");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        estado.yo = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        estado.orden = "cercania"; $("#ordenar").value = "cercania";
        if (mapaPrincipal) mapaPrincipal.yo(estado.yo);
        pintar(false);
        if (distanciaKm(estado.yo, CENTRO) > 15) aviso("Parece que no estás en Ubaté: las distancias pueden ser grandes.", "bi-info-circle-fill text-info");
      },
      () => aviso("No se pudo obtener tu ubicación. Revisa los permisos del navegador.", "bi-exclamation-triangle-fill text-warning"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  /* =================== Menú del comercio y carrito =================== */
  let modalMenu = null;

  function abrirMenu(id) {
    const s = buscarComercio(id);
    if (!s) return;
    if (s.fuente !== "aliado") { cambiarVista("mapa"); asegurarMapaPrincipal().then(() => seleccionar(id, false)); return; }
    $("#modalCategoria").textContent = CATEGORIAS[s.categoria].icono + " " + CATEGORIAS[s.categoria].nombre + (s.demo ? " · Demo" : "");
    $("#modalNombre").textContent = s.nombre;
    $("#modalMeta").textContent = [s.barrio && "Barrio " + s.barrio, s.tiempo && "Tiempo: " + s.tiempo, "Domicilio: " + formatCOP(s.costoEnvio), s.horario].filter(Boolean).join(" · ");
    $("#modalProductos").innerHTML = s.productos.length ? s.productos.map((p, i) => `
      <div class="col-md-6">
        <div class="product-item-card d-flex justify-content-between align-items-center gap-3 h-100">
          ${fotoValida(p.foto) ? `<img class="producto-foto" src="${esc(p.foto)}" alt="${esc(p.nombre)}" loading="lazy" decoding="async" onerror="this.remove()">` : ""}
          <div class="flex-grow-1">
            <div class="d-flex align-items-center gap-2 mb-1">${fotoValida(p.foto) ? "" : `<span class="fs-4">${esc(p.emoji || "🍽️")}</span>`}<h6 class="fw-bold mb-0 small">${esc(p.nombre)}</h6></div>
            <p class="text-muted mb-2" style="font-size:.78rem">${esc(p.desc || "")}</p>
            <span class="fw-bold text-dark">${formatCOP(p.precio)}</span>
          </div>
          ${p.disponible === false
            ? '<span class="badge bg-light text-muted border flex-shrink-0">Agotado</span>'
            : `<button type="button" class="btn btn-sm btn-ubadomi rounded-pill px-3 flex-shrink-0" data-add="${esc(s.id)}" data-prod="${i}">+ Agregar</button>`}
        </div>
      </div>`).join("")
      : `<div class="col-12"><p class="text-muted">Este comercio aún no tiene menú en línea.</p><div class="acciones">${acciones(s)}</div></div>`;
    modalMenu = modalMenu || new bootstrap.Modal($("#storeMenuModal"));
    modalMenu.show();
  }

  function agregarAlCarrito(storeId, idx) {
    const s = buscarComercio(storeId);
    const p = s && s.productos[idx];
    if (!p) return;
    const c = estado.carrito;
    if (c.items.length && c.storeId !== storeId) {
      c.items = [];
      aviso(`Se inició un nuevo pedido para ${s.nombre} (un comercio por pedido).`, "bi-info-circle-fill text-info");
    }
    c.storeId = storeId;
    const ex = c.items.find((i) => i.idx === idx);
    if (ex) ex.qty++;
    else c.items.push({ idx, nombre: p.nombre, precio: p.precio, qty: 1 });
    guardarCarrito();
    pintarCarrito();
    aviso("Agregado: " + p.nombre);
  }

  function cambiarCantidad(idx, delta) {
    const c = estado.carrito;
    const it = c.items.find((i) => i.idx === idx);
    if (!it) return;
    it.qty += delta;
    if (it.qty <= 0) c.items.splice(c.items.indexOf(it), 1);
    if (!c.items.length) c.storeId = null;
    guardarCarrito();
    pintarCarrito();
  }

  const guardarCarrito = () => guardado.set("ubadomi-carrito", estado.carrito);

  function totalesCarrito() {
    const s = buscarComercio(estado.carrito.storeId);
    const subtotal = estado.carrito.items.reduce((a, i) => a + i.precio * i.qty, 0);
    const envio = s ? s.costoEnvio : 0;
    return { s, subtotal, envio, total: subtotal + envio };
  }

  function pintarCarrito() {
    const c = estado.carrito;
    const n = c.items.reduce((a, i) => a + i.qty, 0);
    const cc = $("#cartCount");
    if (cc.dataset.listo && n > (+cc.textContent || 0)) animarUnaVez(cc.parentElement, "salto"); // confirma que el producto entró
    cc.dataset.listo = "1"; // no saltar al restaurar el carrito al cargar la página
    cc.textContent = n;
    $("#modalCartCount").textContent = n;
    const { s, subtotal, envio, total } = totalesCarrito();

    if (!c.items.length || !s) {
      $("#cartItems").innerHTML = `<div class="text-center py-5 text-muted"><i class="bi bi-cart-x fs-1 d-block mb-2"></i><p class="small">Aún no has agregado productos de los comercios de Ubaté.</p></div>`;
      $("#cartResumen").classList.add("d-none");
      return;
    }
    $("#cartResumen").classList.remove("d-none");
    $("#cartItems").innerHTML = `
      <div class="mb-2"><span class="badge bg-ubate-mint text-ubate-green rounded-pill fw-bold"><i class="bi bi-shop me-1"></i>${esc(s.nombre)}</span></div>
      ${c.items.map((i) => `
        <div class="d-flex justify-content-between align-items-center border-bottom py-2 gap-2">
          <div><div class="fw-bold small">${esc(i.nombre)}</div><div class="text-muted small">${formatCOP(i.precio)} c/u</div></div>
          <div class="d-flex align-items-center gap-2 bg-light rounded-pill px-2 py-1 border">
            <button type="button" class="btn btn-sm p-0 fw-bold text-secondary" style="width:22px" data-qty="${i.idx}" data-delta="-1" aria-label="Quitar uno">−</button>
            <span class="small fw-bold">${i.qty}</span>
            <button type="button" class="btn btn-sm p-0 fw-bold text-ubate-green" style="width:22px" data-qty="${i.idx}" data-delta="1" aria-label="Agregar uno">+</button>
          </div>
        </div>`).join("")}`;
    $("#cartSubtotal").textContent = formatCOP(subtotal);
    $("#cartEnvio").textContent = formatCOP(envio);
    $("#cartTotal").textContent = formatCOP(total);
  }

  async function confirmarPedido(ev) {
    ev.preventDefault();
    const form = $("#cartResumen");
    const { s, envio } = totalesCarrito();
    if (!s || !estado.carrito.items.length) return;

    const nombre = $("#clienteNombre").value.trim();
    const tel = soloDigitos($("#clienteTelefono").value);
    $("#clienteTelefono").setCustomValidity(/^3\d{9}$/.test(tel) ? "" : "Celular de 10 dígitos");
    form.classList.add("was-validated");
    if (!form.checkValidity()) {
      if (!$("#consentimiento").checked) aviso("Debes autorizar el tratamiento de datos (Ley 1581 de 2012).", "bi-exclamation-triangle-fill text-warning");
      return;
    }
    if (!estado.direccion) {
      aviso("Primero elige tu dirección de entrega.", "bi-geo-alt-fill text-warning");
      bootstrap.Modal.getOrCreateInstance($("#addressModal")).show();
      return;
    }

    guardado.set("ubadomi-cliente", { nombre, telefono: tel });
    const d = estado.direccion;
    const notas = $("#clienteNotas").value.trim();
    const btn = form.querySelector('[type="submit"]');

    // 1) Con servidor: el pedido llega al equipo UbaDomi, que lo gestiona con el restaurante
    if (CHAT_OK) {
      btn.disabled = true;
      try {
        await asegurarConversacion({ nombre, telefono: tel, consentimiento: true });
        const conv = await apiChat("POST", "/pedido", {
          pedido: {
            comercio: { id: s.id, nombre: s.nombre, telefono: s.telefono, direccion: s.direccion, lat: s.lat, lng: s.lng },
            items: estado.carrito.items.map((i) => ({ nombre: i.nombre, qty: i.qty, precio: i.precio })),
            envio, notas,
            direccion: { barrio: d.barrio, detalle: d.detalle, lat: d.lat, lng: d.lng }
          }
        });
        chat.conv = conv;
        sincronizarPedido(true);
        pintarChat();
        terminarCarrito(form);
        cambiarVista("seguimiento");
        aviso(`¡Pedido #${conv.pedido.id} enviado! Te confirmamos por el chat.`);
        return;
      } catch (e) {
        // el servidor respondió con un problema del pedido: se informa y NO se crea demo
        if (e.status) { aviso(e.message, "bi-exclamation-triangle-fill text-warning"); return; }
        console.error(e);
        aviso("No hay conexión con el equipo UbaDomi. Se guardó en modo demo.", "bi-exclamation-triangle-fill text-warning");
      } finally {
        btn.disabled = false;
      }
    }

    // 2) Sin servidor: pedido simulado (modo demo)
    estado.pedido = {
      id: "UB-" + Math.floor(1050 + Math.random() * 8900),
      storeId: s.id,
      comercio: s.nombre,
      comercioTel: s.telefono,
      origen: [s.lat, s.lng],
      destino: [d.lat, d.lng],
      destinoTexto: `Barrio ${d.barrio} · ${d.detalle}`,
      items: estado.carrito.items.map((i) => ({ nombre: i.nombre, qty: i.qty, precio: i.precio })),
      envio,
      cliente: { nombre, telefono: tel },
      notas,
      domiciliario: DOMICILIARIO_DEMO,
      estadoIdx: 0,
      progreso: 0,
      demo: false,
      creado: Date.now()
    };
    guardarPedido();
    terminarCarrito(form);
    cambiarVista("seguimiento");
    aviso(`¡Pedido #${estado.pedido.id} creado (modo demo)!`);
  }

  function terminarCarrito(form) {
    estado.carrito = { storeId: null, items: [] };
    guardarCarrito();
    pintarCarrito();
    form.classList.remove("was-validated");
    $("#clienteNotas").value = "";
    const oc = bootstrap.Offcanvas.getInstance($("#cartOffcanvas"));
    if (oc) oc.hide();
  }

  /* =================== Dirección de entrega =================== */
  let mapaEntrega = null, pinEntrega = null;

  function barrioMasCercano(lat, lng) {
    let mejor = null, dMin = Infinity;
    Object.entries(BARRIOS).forEach(([b, c]) => { const d = distanciaKm({ lat, lng }, { lat: c[0], lng: c[1] }); if (d < dMin) { dMin = d; mejor = b; } });
    return mejor;
  }

  function prepararModalDireccion() {
    const sel = $("#selectBarrio");
    sel.innerHTML = Object.keys(BARRIOS).map((b) => `<option value="${esc(b)}">Barrio ${esc(b)}</option>`).join("");
    const d = estado.direccion;
    if (d) { sel.value = d.barrio; $("#inputDireccion").value = d.detalle; }
  }

  function moverPin(lat, lng, centrar) {
    if (!pinEntrega) return;
    pinEntrega.setLatLng([lat, lng]);
    if (centrar) mapaEntrega.setView([lat, lng], 17);
  }

  function alAbrirModalDireccion() {
    const d = estado.direccion;
    const ini = d ? [d.lat, d.lng] : BARRIOS[$("#selectBarrio").value] || [CENTRO.lat, CENTRO.lng];
    if (!mapaEntrega) {
      mapaEntrega = L.map("mapaEntrega").setView(ini, 17);
      capaBase(mapaEntrega);
      pinEntrega = L.marker(ini, {
        draggable: true,
        icon: L.divIcon({ className: "pin-wrap", html: '<div class="mk-circulo" style="background:#064e3b"><i class="bi bi-house-door-fill"></i></div>', iconSize: [36, 36], iconAnchor: [18, 18] })
      }).addTo(mapaEntrega);
      mapaEntrega.on("click", (e) => moverPin(e.latlng.lat, e.latlng.lng, false));
    } else {
      mapaEntrega.invalidateSize();
      moverPin(ini[0], ini[1], true);
    }
  }

  function guardarDireccion() {
    const barrio = $("#selectBarrio").value;
    const detalle = $("#inputDireccion").value.trim();
    if (!detalle) { $("#inputDireccion").classList.add("is-invalid"); $("#inputDireccion").focus(); return; }
    $("#inputDireccion").classList.remove("is-invalid");
    const p = pinEntrega ? pinEntrega.getLatLng() : { lat: BARRIOS[barrio][0], lng: BARRIOS[barrio][1] };
    estado.direccion = { barrio, detalle, lat: p.lat, lng: p.lng };
    guardado.set("ubadomi-direccion", estado.direccion);
    pintarDireccion();
    if (chat.id) apiChat("POST", "/perfil", { direccion: estado.direccion }).catch(() => {});
    bootstrap.Modal.getOrCreateInstance($("#addressModal")).hide();
    aviso("Dirección actualizada: Barrio " + barrio);
  }

  function pintarDireccion() {
    const d = estado.direccion;
    $$(".js-direccion").forEach((el) => (el.textContent = d ? `${d.barrio} · ${d.detalle}` : "Elige tu dirección"));
    $$(".js-direccion-larga").forEach((el) => (el.textContent = d ? `Barrio ${d.barrio} · ${d.detalle}` : "Aún no has elegido tu dirección"));
  }

  /* =================== Seguimiento del pedido =================== */
  const trk = { mapa: null, capa: null, moto: null, ruta: null, acum: null, total: 0, rutaDe: null, timer: null };

  const guardarPedido = () => guardado.set("ubadomi-pedido", estado.pedido);

  function pedidoDemo() {
    const s = estado.aliados[0];
    const dest = BARRIOS["Juan José Neira"] || [CENTRO.lat + 0.002, CENTRO.lng + 0.002];
    return {
      id: "UB-1048", storeId: s ? s.id : null,
      comercio: s ? s.nombre : "Comercio de demostración",
      comercioTel: "",
      origen: s ? [s.lat, s.lng] : [CENTRO.lat, CENTRO.lng],
      destino: dest,
      destinoTexto: "Barrio Juan José Neira · Calle 10 # 5-18",
      items: s && s.productos.length >= 4
        ? [{ nombre: s.productos[0].nombre, qty: 1, precio: s.productos[0].precio }, { nombre: s.productos[3].nombre, qty: 1, precio: s.productos[3].precio }]
        : [{ nombre: "Almuerzo Corrientazo Especial", qty: 1, precio: 14000 }, { nombre: "Jugo Natural en Leche", qty: 1, precio: 4500 }],
      envio: s ? s.costoEnvio : 2000,
      cliente: null, notas: "",
      domiciliario: DOMICILIARIO_DEMO,
      estadoIdx: 5, progreso: 0.35, demo: true, creado: Date.now()
    };
  }

  function lineaItem(i) {
    const conPrecio = i.qty && i.precio != null;
    return `${i.qty ? i.qty + "x " : ""}${esc(i.nombre)}${conPrecio ? " · " + formatCOP(i.precio * i.qty) : ""}`;
  }
  function totalPedido(p) {
    if (Number.isFinite(p.total)) return p.total;
    return p.items.reduce((a, i) => a + (i.precio || 0) * (i.qty || 1), 0) + (p.envio || 0);
  }

  function mensajePedidoWhatsApp(p) {
    const lineas = [
      `Hola ${p.comercio}, quiero hacer este pedido por UbaDomi (#${p.id}):`,
      ...p.items.map((i) => `• ${i.qty ? i.qty + "x " : ""}${i.nombre}${i.qty && i.precio != null ? " (" + formatCOP(i.precio * i.qty) + ")" : ""}`),
      `Domicilio: ${formatCOP(p.envio)}`,
      `Total: ${formatCOP(totalPedido(p))} — pago en efectivo`,
      p.cliente ? `Nombre: ${p.cliente.nombre} · Cel: ${p.cliente.telefono}` : "",
      `Dirección: ${p.destinoTexto}`,
      `Ubicación: https://www.google.com/maps?q=${p.destino[0].toFixed(6)},${p.destino[1].toFixed(6)}`,
      p.notas ? `Notas: ${p.notas}` : ""
    ];
    return lineas.filter(Boolean).join("\n");
  }

  function pintarSeguimiento() {
    const p = estado.pedido;
    $("#sinPedido").classList.toggle("d-none", !!p);
    $("#conPedido").classList.toggle("d-none", !p);
    pintarBadgePedido();
    pintarMisPedidos();
    if (!p) return;

    const st = ESTADOS[p.estadoIdx];
    const cancelado = !!p.cancelado;
    $("#trkId").textContent = `Pedido #${p.id}${p.demo ? " · Demo" : ""}`;
    $("#trkComercio").textContent = p.comercio;
    $("#trkDestino").textContent = p.destinoTexto;
    $("#trkEstadoPill").textContent = cancelado ? "Cancelado" : st.code;
    $("#trkTitular").textContent = cancelado ? "Pedido cancelado" : st.titular;
    $("#trkDescripcion").textContent = cancelado
      ? (p.cancelado.motivo ? "Motivo: " + p.cancelado.motivo : "Este pedido fue cancelado. Puedes hacer otro cuando quieras.")
      : st.desc(p);
    $("#trkStepper").classList.toggle("cancelado", cancelado);
    pintarEta();

    // cancelar (solo antes de que el restaurante acepte) y calificar (al entregar)
    $("#btnCancelarPedido").classList.toggle("d-none", !(p.remoto && !cancelado && p.estadoIdx === 0));
    const puedeCalificar = p.remoto && !cancelado && p.estadoIdx === 6 && !p.calificacion;
    $("#trkCalificar").classList.toggle("d-none", !puedeCalificar);
    $("#trkCalificado").classList.toggle("d-none", !p.calificacion);
    if (p.calificacion) {
      const c = p.calificacion;
      $("#trkCalificado").textContent = `Tu calificación: ${"★".repeat(c.estrellas)}${"☆".repeat(5 - c.estrellas)}${c.comentario ? " — «" + c.comentario + "»" : ""}`;
    }

    $("#trkStepper").innerHTML = ESTADOS.map((e, i) => {
      const cls = i < p.estadoIdx ? "completed" : i === p.estadoIdx ? "active" : "";
      return `<div class="stepper-item ${cls}"><div class="step-counter">${i < p.estadoIdx ? '<i class="bi bi-check-lg"></i>' : i + 1}</div><div class="step-name">${e.code}</div></div>`;
    }).join("");
    // en pantallas pequeñas, deja visible el estado actual
    const stp = $("#trkStepper"), act = $(".stepper-item.active", stp);
    if (act) stp.scrollLeft = act.offsetLeft - stp.clientWidth / 2 + act.offsetWidth / 2;

    $("#trkItems").innerHTML = p.items.map((i) => `<li>${lineaItem(i)}</li>`).join("")
      + `<li class="text-secondary">Domicilio local · ${formatCOP(p.envio)}</li>`
      + (p.notas ? `<li class="text-secondary"><i class="bi bi-chat-left-text me-1"></i>${esc(p.notas)}</li>` : "");
    $("#trkTotal").textContent = formatCOP(totalPedido(p)) + " COP";

    // pedido real (gestionado por el equipo) vs. demo/local
    $("#controlPiloto").classList.toggle("d-none", !!p.remoto);
    $("#controlPiloto").classList.toggle("d-flex", !p.remoto);
    $("#notaRemota").classList.toggle("d-none", !p.remoto);

    const wa = numeroWhatsApp(p.comercioTel);
    const btnWa = $("#trkWhatsApp");
    btnWa.classList.toggle("d-none", !wa || p.demo || !!p.remoto);
    if (wa) btnWa.href = `https://wa.me/${wa}?text=${encodeURIComponent(mensajePedidoWhatsApp(p))}`;

    const asignado = p.estadoIdx >= 4;
    const dom = p.domiciliario;
    $("#trkDriver").textContent = asignado ? (dom && dom.nombre) || "Domiciliario del comercio" : "Buscando domiciliario…";
    $("#trkVehiculo").textContent = asignado ? (dom && dom.vehiculo) || "" : "Se asigna cuando el pedido esté listo";
    $("#trkRating").classList.toggle("d-none", !!p.remoto);
    $("#trkDriverNota").classList.toggle("d-none", !asignado);

    const btn = $("#btnAvanzar");
    if (p.estadoIdx >= ESTADOS.length - 1) {
      btn.disabled = true;
      btn.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i> Recorrido finalizado';
    } else {
      btn.disabled = false;
      btn.innerHTML = `<i class="bi bi-fast-forward-fill me-1"></i> Avanzar a "${ESTADOS[p.estadoIdx + 1].code}"`;
    }
  }

  function pintarEta() {
    const p = estado.pedido;
    if (!p) return;
    let txt = ESTADOS[p.estadoIdx].eta;
    if (p.cancelado) txt = "Cancelado";
    else if (p.estadoIdx === 5) {
      const km = trk.total ? (trk.total * (1 - p.progreso)) / 1000 : distanciaKm({ lat: p.origen[0], lng: p.origen[1] }, { lat: p.destino[0], lng: p.destino[1] }) * (1 - p.progreso);
      const min = Math.max(1, Math.round((km / 22) * 60)); // moto urbana ~22 km/h
      txt = p.progreso >= 0.97 ? "¡Llegando!" : `Llegada en ~${min} min`;
    }
    $("#trkEta").textContent = txt;
  }

  function pintarBadgePedido() {
    const p = estado.pedido;
    $("#badgePedido").classList.toggle("d-none", !p || p.demo || p.cancelado || p.estadoIdx >= ESTADOS.length - 1);
  }

  /* ---- Mis pedidos, repetir, cancelar, calificar ---- */
  function pedidosDelCliente() {
    const c = chat.conv;
    return c ? [c.pedido, ...(c.historial || []).slice().reverse()].filter(Boolean) : [];
  }

  function pintarMisPedidos() {
    const lista = pedidosDelCliente();
    $("#misPedidos").classList.toggle("d-none", !lista.length);
    $("#listaMisPedidos").innerHTML = lista.map((p) => {
      const est = p.cancelado ? ["cancelado", "Cancelado"] : p.estadoIdx === 6 ? ["ok", "Entregado"] : ["activo", ESTADOS[p.estadoIdx].code];
      const items = p.items.map((i) => (i.qty ? i.qty + "x " : "") + i.nombre).join(", ");
      return `<div class="col-md-6 col-lg-4"><div class="pedido-hist">
        <div class="d-flex justify-content-between align-items-center"><strong>#${esc(p.id)}</strong><span class="estado-hist ${est[0]}">${est[1]}</span></div>
        <div class="small"><i class="bi bi-shop text-ubate-green"></i> ${esc(p.comercio.nombre)}</div>
        <div class="small text-muted text-truncate" title="${esc(items)}">${esc(items)}</div>
        <div class="d-flex justify-content-between align-items-center mt-auto pt-1 gap-2">
          <span class="small text-muted">${new Date(p.creado).toLocaleDateString("es-CO", { day: "numeric", month: "short" })} · <strong class="text-dark">${formatCOP(p.total)}</strong>${p.calificacion ? ' · <span class="text-warning">' + "★".repeat(p.calificacion.estrellas) + "</span>" : ""}</span>
          <button type="button" class="btn btn-sm btn-outline-success rounded-pill text-nowrap" data-repetir="${esc(p.id)}"><i class="bi bi-arrow-repeat"></i> Repetir</button>
        </div>
      </div></div>`;
    }).join("");
  }

  function repetirPedido(pid) {
    const p = pedidosDelCliente().find((x) => x.id === pid);
    if (!p) return;
    const s = estado.aliados.find((a) => a.id === p.comercio.id || sinTildes(a.nombre) === sinTildes(p.comercio.nombre));
    if (s && s.productos.length) {
      const items = [];
      p.items.forEach((it) => {
        const idx = s.productos.findIndex((x) => sinTildes(x.nombre) === sinTildes(it.nombre) && x.disponible !== false);
        if (idx >= 0) items.push({ idx, nombre: s.productos[idx].nombre, precio: s.productos[idx].precio, qty: it.qty || 1 });
      });
      if (items.length) {
        estado.carrito = { storeId: s.id, items };
        guardarCarrito();
        pintarCarrito();
        bootstrap.Offcanvas.getOrCreateInstance($("#cartOffcanvas")).show();
        aviso(items.length < p.items.length ? "Algunos productos ya no están disponibles; revisa tu carrito." : "Tu pedido anterior está en el carrito (con precios actualizados).");
        return;
      }
    }
    // restaurante no aliado: se pide de nuevo por el chat
    const pos = p.comercio.pos || [];
    abrirChat({ comercio: { id: p.comercio.id, nombre: p.comercio.nombre, telefono: p.comercio.telefono, direccion: p.comercio.direccion, lat: pos[0], lng: pos[1] } });
    $("#chatTexto").value = `Quiero repetir mi pedido #${p.id} de ${p.comercio.nombre}: ${p.items.map((i) => (i.qty ? i.qty + "x " : "") + i.nombre).join(", ")}`;
  }

  async function cancelarPedido() {
    const p = estado.pedido;
    if (!p || !p.remoto) return;
    if (!window.confirm(`¿Seguro que quieres cancelar el pedido #${p.id}?`)) return;
    try {
      chat.conv = await apiChat("POST", "/cancelar", {});
      pintarChat();
      sincronizarPedido(false);
      pintarSeguimiento();
      aviso("Pedido cancelado.");
    } catch (e) { aviso(e.message, "bi-exclamation-triangle-fill text-warning"); }
  }

  let calEstrellas = 0;
  function marcarEstrellas(n) {
    calEstrellas = n;
    $$("#trkCalificar [data-estrella]").forEach((b) => {
      const on = +b.dataset.estrella <= n;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", +b.dataset.estrella === n ? "true" : "false");
    });
    $("#btnCalificar").disabled = !n;
  }
  async function enviarCalificacion() {
    if (!calEstrellas) return;
    $("#btnCalificar").disabled = true;
    try {
      chat.conv = await apiChat("POST", "/calificar", { estrellas: calEstrellas, comentario: $("#calComentario").value.trim() });
      pintarChat();
      sincronizarPedido(false);
      pintarSeguimiento();
      aviso("¡Gracias por calificar!");
      animarUnaVez($("#trkCalificado"), "celebrar");
    } catch (e) {
      aviso(e.message, "bi-exclamation-triangle-fill text-warning");
      $("#btnCalificar").disabled = false;
    }
  }

  // Derecho de supresión (Ley 1581): borra los datos en el servidor y en este navegador
  async function borrarMisDatos() {
    if (!window.confirm("Se borrarán tu conversación, tu dirección y tus pedidos de UbaDomi. Esta acción no se puede deshacer. ¿Continuar?")) return;
    if (chat.id) {
      try { await apiChat("DELETE", ""); }
      catch (e) { if (e.status !== 404) { aviso(e.message, "bi-exclamation-triangle-fill text-warning"); return; } }
    }
    olvidarChat();
    ["ubadomi-cliente", "ubadomi-direccion", "ubadomi-pedido", "ubadomi-carrito"].forEach((k) => guardado.set(k, null));
    estado.direccion = null;
    estado.pedido = null;
    estado.carrito = { storeId: null, items: [] };
    ["#clienteNombre", "#clienteTelefono", "#chatNombre", "#chatTelefono", "#inputDireccion"].forEach((s) => ($(s).value = ""));
    pintarDireccion();
    pintarCarrito();
    pintarSeguimiento();
    cerrarChat();
    aviso("Tus datos fueron borrados de UbaDomi.");
  }

  /* ---- Horario de atención ---- */
  function estadoHorario() {
    const h = CFG.HORARIO_ATENCION;
    if (!h || !h.abre || !h.cierra) return null;
    const aMin = (s) => { const [a, b] = String(s).split(":").map(Number); return a * 60 + (b || 0); };
    const fmt = (s) => { const m = aMin(s), d = new Date(); d.setHours(Math.floor(m / 60), m % 60, 0, 0); return d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" }); };
    const dias = h.dias || [0, 1, 2, 3, 4, 5, 6];
    const ahora = new Date();
    const min = ahora.getHours() * 60 + ahora.getMinutes();
    const hoyAbre = dias.includes(ahora.getDay());
    const abierto = hoyAbre && min >= aMin(h.abre) && min < aMin(h.cierra);
    let prox = "";
    if (!abierto) {
      if (hoyAbre && min < aMin(h.abre)) prox = `hoy a las ${fmt(h.abre)}`;
      else {
        const nombres = ["el domingo", "el lunes", "el martes", "el miércoles", "el jueves", "el viernes", "el sábado"];
        for (let i = 1; i <= 7; i++) {
          const d = (ahora.getDay() + i) % 7;
          if (dias.includes(d)) { prox = (i === 1 ? "mañana" : nombres[d]) + ` a las ${fmt(h.abre)}`; break; }
        }
      }
    }
    return {
      abierto,
      texto: abierto ? `Abierto ahora · hasta las ${fmt(h.cierra)}` : `Cerrado · abrimos ${prox}`,
      chat: abierto ? "En línea · te respondemos en minutos" : `Fuera de horario · respondemos ${prox}`,
      rango: `Atendemos de ${fmt(h.abre)} a ${fmt(h.cierra)}`
    };
  }
  function pintarHorario() {
    const h = estadoHorario();
    if (!h) { $("#horarioPill").classList.add("d-none"); return; }
    $("#horarioPill").innerHTML = `<span class="dot-h"></span>${esc(h.texto)}`;
    $("#horarioPill").classList.toggle("abierto", h.abierto);
    $$(".js-horario-texto").forEach((el) => (el.textContent = h.rango));
    if (chat.es && chat.es.readyState === 1) $("#chatConexion").textContent = h.chat;
  }

  // Permite instalar UbaDomi en el celular como app (PWA)
  function registrarServiceWorker() {
    if (!CHAT_OK || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("sw.js").catch(() => { /* sin PWA */ });
  }

  // Aliados editados desde el panel del operador (si existen)
  async function cargarAliadosServidor() {
    if (!CHAT_OK) return;
    try {
      const r = await fetch("/api/comercios", { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      if (!Array.isArray(j.comercios)) return;
      estado.aliados = cargarAliados(j.comercios);
      $("#heroAliados").textContent = estado.aliados.length;
      estado.todos = unir(estado.aliados, estado.externos);
      if (estado.carrito.storeId && !buscarComercio(estado.carrito.storeId)) { estado.carrito = { storeId: null, items: [] }; guardarCarrito(); }
      pintarCarrito();
      pintar(false);
    } catch (e) { /* se queda con restaurantes.js */ }
  }

  async function calcularRuta(p) {
    const clave = p.origen.join() + ";" + p.destino.join();
    if (trk.rutaDe === clave && trk.ruta) return;
    let puntos = null;
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 6000);
      const url = `https://router.project-osrm.org/route/v1/driving/${p.origen[1]},${p.origen[0]};${p.destino[1]},${p.destino[0]}?overview=full&geometries=geojson`;
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(to);
      const j = await res.json();
      if (j.routes && j.routes[0]) puntos = j.routes[0].geometry.coordinates.map((c) => [c[1], c[0]]);
    } catch (e) { /* sin ruta por calles: se usa línea simple */ }
    if (!puntos || puntos.length < 2) {
      const mid = [(p.origen[0] + p.destino[0]) / 2 + 0.0006, (p.origen[1] + p.destino[1]) / 2 - 0.0005];
      puntos = [p.origen, mid, p.destino];
    }
    const acum = [0];
    for (let i = 1; i < puntos.length; i++) {
      acum.push(acum[i - 1] + distanciaKm({ lat: puntos[i - 1][0], lng: puntos[i - 1][1] }, { lat: puntos[i][0], lng: puntos[i][1] }) * 1000);
    }
    trk.ruta = puntos; trk.acum = acum; trk.total = acum[acum.length - 1]; trk.rutaDe = clave;
  }

  function posicionEnRuta(t) {
    const r = trk.ruta;
    if (!r) return null;
    if (t <= 0) return r[0];
    if (t >= 1) return r[r.length - 1];
    const objetivo = t * trk.total;
    let i = 1;
    while (i < trk.acum.length - 1 && trk.acum[i] < objetivo) i++;
    const tramo = trk.acum[i] - trk.acum[i - 1] || 1;
    const f = (objetivo - trk.acum[i - 1]) / tramo;
    return [r[i - 1][0] + (r[i][0] - r[i - 1][0]) * f, r[i - 1][1] + (r[i][1] - r[i - 1][1]) * f];
  }

  function progresoVisual(p) {
    return p.estadoIdx < 5 ? 0 : p.estadoIdx === 6 ? 1 : p.progreso;
  }

  async function dibujarMapaSeguimiento() {
    const p = estado.pedido;
    if (!p) return;
    if (!trk.mapa) {
      trk.mapa = L.map("mapaSeguimiento", { zoomControl: false }).setView(p.origen, 15);
      L.control.zoom({ position: "bottomright" }).addTo(trk.mapa);
      capaBase(trk.mapa);
      trk.capa = L.layerGroup().addTo(trk.mapa);
    } else {
      trk.mapa.invalidateSize();
    }
    await calcularRuta(p);
    if (estado.pedido !== p) return;
    trk.capa.clearLayers();

    const circulo = (bg, ico, extra) => L.divIcon({ className: "pin-wrap", html: `<div class="mk-circulo ${extra || ""}" style="background:${bg}"><i class="bi ${ico}"></i></div>`, iconSize: extra ? [42, 42] : [36, 36], iconAnchor: extra ? [21, 21] : [18, 18] });
    L.marker(p.origen, { icon: circulo("#15803d", "bi-shop") }).bindPopup(`<strong>Origen:</strong> ${esc(p.comercio)}`).addTo(trk.capa);
    L.marker(p.destino, { icon: circulo("#064e3b", "bi-house-door-fill") }).bindPopup(`<strong>Destino:</strong> ${esc(p.destinoTexto)}`).addTo(trk.capa);
    const linea = L.polyline(trk.ruta, { color: "#15803d", weight: 5, opacity: 0.9, dashArray: p.estadoIdx < 5 ? "8, 8" : null }).addTo(trk.capa);
    trk.linea = linea;
    trk.moto = L.marker(posicionEnRuta(progresoVisual(p)), { icon: circulo("#16a34a", "bi-bicycle", "mk-moto"), zIndexOffset: 1000 })
      .bindPopup(`<strong>Domiciliario:</strong> ${esc(nombreDom(p))}<br>${esc((p.domiciliario && p.domiciliario.vehiculo) || "")}`)
      .addTo(trk.capa);
    trk.mapa.fitBounds(linea.getBounds(), { padding: [60, 60] });
    pintarEta();
    iniciarAnimacion();
  }

  function actualizarMoto() {
    const p = estado.pedido;
    if (!p || !trk.moto) return;
    trk.moto.setLatLng(posicionEnRuta(progresoVisual(p)));
    if (trk.linea) trk.linea.setStyle({ dashArray: p.estadoIdx < 5 ? "8, 8" : null });
  }

  function iniciarAnimacion() {
    clearInterval(trk.timer);
    trk.timer = setInterval(() => {
      const p = estado.pedido;
      if (!p || p.cancelado || p.estadoIdx !== 5 || estado.vista !== "seguimiento" || p.progreso >= 0.97) return;
      p.progreso = Math.min(0.97, p.progreso + 0.008);
      actualizarMoto();
      pintarEta();
      if (Math.round(p.progreso * 1000) % 40 === 0) guardarPedido();
    }, 300);
  }

  function avanzarEstado() {
    const p = estado.pedido;
    if (!p || p.estadoIdx >= ESTADOS.length - 1) return;
    p.estadoIdx++;
    if (p.estadoIdx === 5) p.progreso = 0;
    if (p.estadoIdx === 6) p.progreso = 1;
    guardarPedido();
    pintarSeguimiento();
    actualizarMoto();
    aviso("Estado actualizado a: " + ESTADOS[p.estadoIdx].code);
  }

  function reiniciarPedido() {
    const p = estado.pedido;
    if (!p) return;
    p.estadoIdx = 0; p.progreso = 0;
    guardarPedido();
    pintarSeguimiento();
    actualizarMoto();
    aviso("Recorrido reiniciado a estado: Creado");
  }

  /* =================== Chat con UbaDomi =================== */
  const chat = { id: null, token: null, conv: null, es: null, abierto: false, comercio: null, forzarAbajo: false };
  const RAPIDAS = ["Quiero hacer un pedido", "¿Cuánto cuesta el domicilio?", "¿Dónde va mi pedido?", "Quiero cambiar mi pedido"];

  async function apiChat(metodo, ruta, cuerpo) {
    const res = await fetch("/api/chat" + (chat.id ? "/" + encodeURIComponent(chat.id) : "") + ruta, {
      method: metodo,
      headers: { "Content-Type": "application/json", "X-Token": chat.token || "" },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(j.error || "Error " + res.status); err.status = res.status; throw err; }
    return j;
  }

  async function asegurarConversacion(datos) {
    if (chat.id) return;
    const r = await apiChat("POST", "", Object.assign({ direccion: estado.direccion }, datos));
    chat.id = r.id; chat.token = r.token; chat.conv = r.conv;
    guardado.set("ubadomi-chat", { id: r.id, token: r.token });
    conectarChat();
  }

  function conectarChat() {
    if (!chat.id || chat.es || !window.EventSource) return;
    chat.es = new EventSource(`/api/chat/${encodeURIComponent(chat.id)}/eventos?token=${encodeURIComponent(chat.token)}`);
    chat.es.onmessage = () => refrescarChat();
    chat.es.onopen = () => {
      const h = estadoHorario();
      $("#chatConexion").textContent = h ? h.chat : "En línea · te respondemos en minutos";
      refrescarChat();
    };
    chat.es.onerror = () => { $("#chatConexion").textContent = "Reconectando…"; };
  }

  async function refrescarChat() {
    if (!chat.id) return;
    try {
      chat.conv = await apiChat("GET", "");
      if (chat.abierto && chat.conv.noLeidos) { chat.conv.noLeidos = 0; apiChat("POST", "/leido").catch(() => {}); }
      pintarChat();
      sincronizarPedido(false);
      pintarMisPedidos();
    } catch (e) {
      if (e.status === 404) olvidarChat();
    }
  }

  function olvidarChat() {
    if (chat.es) chat.es.close();
    chat.es = null; chat.id = chat.token = chat.conv = null; chat.vistos = 0;
    guardado.set("ubadomi-chat", null);
    pintarChat();
  }

  function pintarChat() {
    const registrado = !!chat.id;
    $("#chatSinServidor").classList.toggle("d-none", CHAT_OK);
    $("#chatRegistro").classList.toggle("d-none", !CHAT_OK || registrado);
    $("#chatConversacion").classList.toggle("d-none", !CHAT_OK || !registrado);
    const n = chat.conv && !chat.abierto ? chat.conv.noLeidos : 0;
    $("#chatBadge").textContent = n;
    $("#chatBadge").classList.toggle("d-none", !n);
    if (!registrado || !chat.conv) return;

    const cont = $("#chatMensajes");
    const estabaAbajo = cont.scrollHeight - cont.scrollTop - cont.clientHeight < 80;
    let dia = "";
    // solo los mensajes que llegaron desde el último pintado entran con animación
    const ya = chat.vistos || 0;
    cont.innerHTML = chat.conv.mensajes.map((m, i) => {
      const f = new Date(m.t);
      const d = f.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
      const sep = d !== dia ? `<div class="chat-dia">${esc(d)}</div>` : "";
      dia = d;
      const hora = f.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
      const autor = m.de === "operador" ? `<span class="autor">${esc(m.autor || "UbaDomi")}</span>` : "";
      const etiqueta = m.comercio ? `<span class="etiqueta"><i class="bi bi-shop"></i> ${esc(m.comercio)}</span>\n` : "";
      const nueva = ya && i >= ya ? " nueva" : "";
      return sep + `<div class="burbuja ${esc(m.de)}${m.pedidoId ? " pedido" : ""}${nueva}">${autor}${etiqueta}${esc(m.texto)}<span class="hora">${hora}</span></div>`;
    }).join("");
    chat.vistos = chat.conv.mensajes.length;
    if (estabaAbajo || chat.forzarAbajo) { cont.scrollTop = cont.scrollHeight; chat.forzarAbajo = false; }
  }

  function pintarChipComercio() {
    const el = $("#chatComercioChip");
    el.classList.toggle("d-none", !chat.comercio);
    if (chat.comercio) el.innerHTML = `<span><i class="bi bi-shop me-1"></i>Pedido para: ${esc(chat.comercio.nombre)}</span><button type="button" id="chatQuitarComercio" aria-label="Quitar restaurante"><i class="bi bi-x-lg"></i></button>`;
  }

  function abrirChat(opts) {
    chat.abierto = true;
    document.body.classList.add("chat-abierto");
    $("#chatPanel").classList.remove("d-none");
    if (opts && opts.comercio) {
      chat.comercio = opts.comercio;
      const ta = $("#chatTexto");
      if (!ta.value.trim() || /^Hola, quiero pedir de .*: $/.test(ta.value)) ta.value = `Hola, quiero pedir de ${opts.comercio.nombre}: `;
    }
    pintarChipComercio();
    const cli = guardado.get("ubadomi-cliente", null);
    if (cli && !$("#chatNombre").value) { $("#chatNombre").value = cli.nombre || ""; $("#chatTelefono").value = cli.telefono || ""; }
    chat.forzarAbajo = true;
    pintarChat();
    if (chat.id) { refrescarChat(); setTimeout(() => { const ta = $("#chatTexto"); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 60); }
    else if (CHAT_OK) setTimeout(() => $("#chatNombre").focus(), 60);
  }

  function cerrarChat() {
    chat.abierto = false;
    document.body.classList.remove("chat-abierto");
    $("#chatPanel").classList.add("d-none");
    pintarChat();
  }

  async function registrarChat(e) {
    e.preventDefault();
    const f = $("#chatFormRegistro");
    const tel = soloDigitos($("#chatTelefono").value);
    $("#chatTelefono").setCustomValidity(/^3\d{9}$/.test(tel) ? "" : "Celular de 10 dígitos");
    f.classList.add("was-validated");
    if (!f.checkValidity()) return;
    const btn = f.querySelector('[type="submit"]');
    btn.disabled = true;
    $("#chatErrorRegistro").textContent = "";
    try {
      const nombre = $("#chatNombre").value.trim();
      await asegurarConversacion({ nombre, telefono: tel, consentimiento: true });
      guardado.set("ubadomi-cliente", { nombre, telefono: tel });
      if (!$("#clienteNombre").value) { $("#clienteNombre").value = nombre; $("#clienteTelefono").value = tel; }
      chat.forzarAbajo = true;
      pintarChat();
      setTimeout(() => $("#chatTexto").focus(), 60);
    } catch (err) {
      $("#chatErrorRegistro").textContent = err.message === "Failed to fetch" ? "No hay conexión con el servidor de UbaDomi." : err.message;
    } finally {
      btn.disabled = false;
    }
  }

  async function enviarMensajeChat(texto) {
    texto = String(texto || "").trim();
    if (!texto) return;
    if (!chat.id) { abrirChat(); return; }
    const ta = $("#chatTexto");
    const com = chat.comercio;
    ta.value = "";
    ta.style.height = "auto";
    try {
      await apiChat("POST", "/mensajes", {
        texto,
        comercio: com ? { id: com.id, nombre: com.nombre, telefono: com.telefono, direccion: com.direccion, lat: com.lat, lng: com.lng } : null
      });
      chat.comercio = null;
      pintarChipComercio();
      chat.forzarAbajo = true;
      await refrescarChat();
    } catch (e) {
      ta.value = texto;
      aviso("No se pudo enviar: " + e.message, "bi-exclamation-triangle-fill text-warning");
    }
  }

  // Convierte el pedido del servidor en el pedido que muestra «Seguir pedido»
  function sincronizarPedido(forzarMapa) {
    const sp = chat.conv && chat.conv.pedido;
    if (!sp) return;
    const prev = estado.pedido;
    const mismo = !!(prev && prev.remoto && prev.id === sp.id);
    const firma = JSON.stringify([sp.estadoIdx, sp.domiciliario, sp.total, sp.comercio, sp.items, sp.direccion, sp.cancelado, sp.calificacion]);
    if (mismo && prev.firma === firma && !forzarMapa) return;

    const dir = sp.direccion || {};
    let progreso = mismo ? prev.progreso || 0 : 0;
    if (sp.estadoIdx === 6) progreso = 1;
    else if (sp.estadoIdx < 5 || (mismo && prev.estadoIdx !== 5)) progreso = 0;

    estado.pedido = {
      id: sp.id, remoto: true, firma,
      storeId: sp.comercio.id || null,
      comercio: sp.comercio.nombre, comercioTel: sp.comercio.telefono,
      origen: sp.comercio.pos || [CENTRO.lat, CENTRO.lng],
      destino: dir.pos || BARRIOS[dir.barrio] || [CENTRO.lat, CENTRO.lng],
      destinoTexto: (dir.barrio ? "Barrio " + dir.barrio + " · " : "") + (dir.detalle || ""),
      items: sp.items, envio: sp.envio, total: sp.total,
      cliente: chat.conv.cliente, notas: sp.notas,
      domiciliario: sp.domiciliario, estadoIdx: sp.estadoIdx, progreso,
      demo: false, creado: sp.creado,
      cancelado: sp.cancelado || null, calificacion: sp.calificacion || null
    };
    if (mismo && prev.estadoIdx !== sp.estadoIdx) {
      aviso("Tu pedido: " + ESTADOS[sp.estadoIdx].code, "bi-bell-fill text-success");
      // momento raro y feliz: la entrega merece un pequeño festejo
      if (sp.estadoIdx === 6 && !sp.cancelado) setTimeout(() => animarUnaVez($("#trkTitular"), "celebrar"), 30);
    }
    guardarPedido();
    pintarBadgePedido();
    if (estado.vista === "seguimiento") {
      pintarSeguimiento();
      const rutaCambio = !mismo || prev.origen.join() !== estado.pedido.origen.join() || prev.destino.join() !== estado.pedido.destino.join();
      if (rutaCambio || forzarMapa) dibujarMapaSeguimiento(); else actualizarMoto();
    }
  }

  function iniciarChat() {
    $("#chatRapidas").innerHTML = RAPIDAS.map((r) => `<button type="button" data-rapida="${esc(r)}">${esc(r)}</button>`).join("");
    const g = guardado.get("ubadomi-chat", null);
    if (CHAT_OK && g && g.id && g.token) { chat.id = g.id; chat.token = g.token; conectarChat(); }
    pintarChat();
  }

  /* =================== Vistas =================== */
  function cambiarVista(v) {
    estado.vista = v;
    $$(".vista").forEach((el) => el.classList.toggle("d-none", el.id !== "vista-" + v));
    $$(".view-switcher .btn").forEach((b) => b.classList.toggle("active", b.dataset.vista === v));
    document.body.classList.toggle("en-mapa", v === "mapa");
    window.scrollTo({ top: 0 });
    if (v === "mapa") setTimeout(() => asegurarMapaPrincipal(), 30);
    if (v === "seguimiento") {
      pintarSeguimiento();
      if (estado.pedido) setTimeout(() => dibujarMapaSeguimiento(), 30);
    }
  }

  function ajustarAltoNav() {
    document.documentElement.style.setProperty("--alto-nav", $(".navbar-ubadomi").offsetHeight + "px");
    if (mapaPrincipal) mapaPrincipal.refrescar();
  }

  /* =================== Eventos =================== */
  function manejarClic(e) {
    if (e.__ubadomi) return;
    e.__ubadomi = true;
    const t = e.target;

    const vista = t.closest("[data-vista]");
    if (vista) { e.preventDefault(); cambiarVista(vista.dataset.vista); return; }

    if (t.closest("[data-abrir-chat]")) { e.preventDefault(); abrirChat(); return; }
    if (t.closest("[data-ir-faq]")) {
      e.preventDefault();
      cambiarVista("catalogo");
      setTimeout(() => $("#faq").scrollIntoView({ behavior: "smooth" }), 60);
      return;
    }
    if (t.closest("[data-quiero-ser-aliado]")) {
      abrirChat();
      const ta = $("#chatTexto");
      if (!ta.value.trim()) ta.value = "Hola, tengo un negocio en Ubaté y quiero ser aliado de UbaDomi. Mi negocio se llama: ";
      return;
    }
    const estrella = t.closest("[data-estrella]");
    if (estrella) { marcarEstrellas(+estrella.dataset.estrella); return; }
    const repetir = t.closest("[data-repetir]");
    if (repetir) { repetirPedido(repetir.dataset.repetir); return; }
    const chatCom = t.closest("[data-chat-comercio]");
    if (chatCom) { abrirChat({ comercio: buscarComercio(chatCom.dataset.chatComercio) }); return; }
    const rapida = t.closest("[data-rapida]");
    if (rapida) { enviarMensajeChat(rapida.dataset.rapida); return; }
    if (t.closest("#chatQuitarComercio")) { chat.comercio = null; pintarChipComercio(); return; }

    const cat = t.closest("[data-cat]");
    if (cat) { estado.categoria = cat.dataset.cat; pintar(true); return; }

    const add = t.closest("[data-add]");
    if (add) { agregarAlCarrito(add.dataset.add, +add.dataset.prod); return; }

    const qty = t.closest("[data-qty]");
    if (qty) { cambiarCantidad(+qty.dataset.qty, +qty.dataset.delta); return; }

    const menu = t.closest("[data-menu]");
    if (menu) { abrirMenu(menu.dataset.menu); return; }

    const verMapa = t.closest("[data-ver-mapa]");
    if (verMapa) {
      const id = verMapa.dataset.verMapa;
      cambiarVista("mapa");
      asegurarMapaPrincipal().then(() => seleccionar(id, false));
      return;
    }

    if (t.closest("a, button, input, select, label")) return;
    const card = t.closest("#listaMapa .otro-card");
    if (card) seleccionar(card.dataset.id, true);
  }

  function eventos() {
    document.addEventListener("click", manejarClic);
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const el = e.target;
      if (el.matches(".store-card[data-menu]")) abrirMenu(el.dataset.menu);
      else if (el.matches("#listaMapa .otro-card")) seleccionar(el.dataset.id, true);
    });

    let t;
    $("#buscar").addEventListener("input", (e) => {
      clearTimeout(t);
      t = setTimeout(() => {
        estado.texto = e.target.value;
        if (estado.vista === "seguimiento") cambiarVista("catalogo");
        pintar(true);
      }, 200);
    });
    $("#ordenar").addEventListener("change", (e) => {
      estado.orden = e.target.value;
      if (estado.orden === "cercania" && !estado.yo) ubicarme(); else pintar(false);
    });
    $("#soloDomicilio").addEventListener("change", (e) => { estado.soloDomicilio = e.target.checked; pintar(true); });
    $$(".js-ubicarme").forEach((b) => b.addEventListener("click", ubicarme));

    $("#cartResumen").addEventListener("submit", confirmarPedido);
    $("#addressModal").addEventListener("show.bs.modal", prepararModalDireccion);
    $("#addressModal").addEventListener("shown.bs.modal", alAbrirModalDireccion);
    $("#selectBarrio").addEventListener("change", (e) => { const c = BARRIOS[e.target.value]; if (c) moverPin(c[0], c[1], true); });
    $("#btnGuardarDireccion").addEventListener("click", guardarDireccion);
    $("#btnMiUbicacionEntrega").addEventListener("click", () => {
      if (!navigator.geolocation) return aviso("Tu navegador no permite obtener la ubicación.", "bi-exclamation-triangle-fill text-warning");
      navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        if (distanciaKm({ lat, lng }, CENTRO) > 8) { aviso("Tu ubicación está fuera de Ubaté. Marca el punto en el mapa.", "bi-info-circle-fill text-info"); return; }
        moverPin(lat, lng, true);
        $("#selectBarrio").value = barrioMasCercano(lat, lng);
      }, () => aviso("No se pudo obtener tu ubicación.", "bi-exclamation-triangle-fill text-warning"), { enableHighAccuracy: true, timeout: 10000 });
    });

    $("#btnAvanzar").addEventListener("click", avanzarEstado);
    $("#btnReiniciar").addEventListener("click", reiniciarPedido);
    $("#btnPedidoDemo").addEventListener("click", () => {
      estado.pedido = pedidoDemo();
      guardarPedido();
      pintarSeguimiento();
      dibujarMapaSeguimiento();
    });
    $("#btnLlamarDriver").addEventListener("click", () => {
      const p = estado.pedido;
      const tel = p && p.remoto && p.domiciliario && linkTel(p.domiciliario.telefono);
      if (tel) location.href = tel;
      else if (p && p.remoto) abrirChat();
      else aviso("Simulación: llamando al domiciliario asignado…", "bi-telephone-fill text-success");
    });

    // chat
    $("#chatFab").addEventListener("click", () => abrirChat());
    $("#btnBorrarDatos").addEventListener("click", borrarMisDatos);
    $("#btnCancelarPedido").addEventListener("click", cancelarPedido);
    $("#btnCalificar").addEventListener("click", enviarCalificacion);
    $("#chatCerrar").addEventListener("click", cerrarChat);
    $("#chatFormRegistro").addEventListener("submit", registrarChat);
    $("#chatFormMensaje").addEventListener("submit", (e) => { e.preventDefault(); enviarMensajeChat($("#chatTexto").value); });
    $("#chatTexto").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarMensajeChat($("#chatTexto").value); }
    });
    $("#chatTexto").addEventListener("input", (e) => { e.target.style.height = "auto"; e.target.style.height = Math.min(110, e.target.scrollHeight) + "px"; });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && chat.abierto) cerrarChat(); });

    window.addEventListener("resize", ajustarAltoNav);
  }

  /* =================== Inicio =================== */
  let fuenteActual = "osm";

  function restaurarSesion() {
    const c = guardado.get("ubadomi-carrito", null);
    if (c && Array.isArray(c.items) && buscarComercio(c.storeId)) estado.carrito = c;
    const d = guardado.get("ubadomi-direccion", null);
    if (d && d.barrio && isFinite(d.lat)) estado.direccion = d;
    estado.pedido = guardado.get("ubadomi-pedido", null);
    const cli = guardado.get("ubadomi-cliente", null);
    if (cli) { $("#clienteNombre").value = cli.nombre || ""; $("#clienteTelefono").value = cli.telefono || ""; }
  }

  async function cargarExternos() {
    let fuente = "", corta = "";
    if (USAR_GOOGLE) {
      try {
        await cargarScriptGoogle();
        estado.externos = await cargarGoogle();
        fuenteActual = "google";
        fuente = "Restaurantes del municipio: Google Maps.";
        corta = "Google Maps";
      } catch (e) {
        console.error(e);
        aviso("No se pudo usar Google Maps: " + e.message, "bi-exclamation-triangle-fill text-warning");
      }
    }
    if (fuenteActual !== "google") {
      try {
        const { lista, copia } = await cargarOSM();
        estado.externos = lista;
        fuente = 'Restaurantes del municipio: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© colaboradores de OpenStreetMap</a>'
          + (copia ? ` (copia guardada del ${esc(copia)}; el servidor en vivo no respondió)` : "")
          + ". Para ver los de Google Maps agrega tu API key en config.js.";
        corta = copia ? "OpenStreetMap (copia)" : "OpenStreetMap";
      } catch (e) {
        console.error(e);
        fuente = "No se pudieron cargar los restaurantes del municipio (" + esc(e.message) + "). Revisa tu conexión y recarga.";
        corta = "Sin conexión";
      }
    }
    estado.todos = unir(estado.aliados, estado.externos);
    $$(".js-fuente").forEach((el) => (el.innerHTML = fuente));
    $$(".js-fuente-corta").forEach((el) => (el.textContent = corta + " · " + estado.externos.length));
    $("#heroOtros").textContent = estado.todos.length - estado.aliados.length;
    pintar(true);
  }

  function iniciar() {
    estado.aliados = cargarAliados();
    estado.todos = estado.aliados.slice();
    $("#heroAliados").textContent = estado.aliados.length;
    restaurarSesion();
    eventos();
    ajustarAltoNav();
    pintarDireccion();
    pintarCarrito();
    pintarBadgePedido();
    iniciarChat();
    pintarHorario();
    setInterval(pintarHorario, 60000);
    pintar(false);
    cargarAliadosServidor();
    cargarReferencias();
    cargarExternos();
    registrarServiceWorker();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
