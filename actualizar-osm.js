// Descarga los restaurantes de Ubaté desde OpenStreetMap y los guarda en
// restaurantes-osm.json. La página usa esa copia cuando los servidores
// de OpenStreetMap no responden.
// Uso:  npm run actualizar-osm
const fs = require("fs");
const path = require("path");

const CENTRO = { lat: 5.30806, lng: -73.81487 };
const RADIO = 4000;
const SERVIDORES = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];
const q = `[out:json][timeout:25];
(
  nwr["amenity"~"^(restaurant|fast_food|cafe|ice_cream|food_court)$"](around:${RADIO},${CENTRO.lat},${CENTRO.lng});
  nwr["shop"~"^(bakery|pastry)$"](around:${RADIO},${CENTRO.lat},${CENTRO.lng});
);
out center tags;`;

(async () => {
  for (const url of SERVIDORES) {
    try {
      const res = await fetch(url, {
        method: "POST",
        body: "data=" + encodeURIComponent(q),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
          "User-Agent": "UbaDomi/1.1 (prototipo academico de domicilios en Ubate)"
        },
        signal: AbortSignal.timeout(40000)
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const datos = await res.json();
      const con_nombre = datos.elements.filter((e) => e.tags && e.tags.name);
      const salida = {
        actualizado: new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" }),
        fuente: "© colaboradores de OpenStreetMap (ODbL)",
        elements: con_nombre
      };
      fs.writeFileSync(path.join(__dirname, "restaurantes-osm.json"), JSON.stringify(salida, null, 1));
      console.log(`✔ ${con_nombre.length} lugares guardados en restaurantes-osm.json (desde ${url})`);
      con_nombre.forEach((e) => console.log("   - " + e.tags.name));
      return;
    } catch (e) {
      console.log(`✖ ${url}: ${e.message}`);
    }
  }
  console.log("\nNingún servidor respondió. Espera unos minutos y vuelve a intentar.");
  process.exitCode = 1;
})();
