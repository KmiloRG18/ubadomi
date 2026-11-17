/* =========================================================
   UbaDomi — COMERCIOS ALIADOS (con menú y pedido en línea)
   =========================================================
   Los comercios de esta lista:
     - aparecen primero, con su menú, carrito y seguimiento del pedido;
     - salen en el mapa con pin verde y la etiqueta "Aliado".
   Los demás restaurantes de Ubaté se cargan solos desde
   Google Maps (si hay API key) u OpenStreetMap.

   ⚠️ Los 6 comercios que vienen de ejemplo son FICTICIOS (demo: true)
   para la sustentación del prototipo. Cuando tengas aliados reales,
   reemplázalos y quita "demo: true".

   Cómo sacar las coordenadas desde Google Maps:
     1. Busca el negocio en Google Maps.
     2. Clic derecho sobre el pin -> se copian las coordenadas (ej: 5.30812, -73.81534)
     3. Pon el primer número en "lat" y el segundo en "lng".

   Categorías válidas: "restaurante", "rapida", "pizza", "pollo",
                       "cafe", "panaderia", "helados", "tienda"
   ========================================================= */

window.RESTAURANTES_MANUALES = [
  {
    nombre: "Asadero y Restaurante El Parque",
    categoria: "restaurante",
    barrio: "Centro",
    cocina: "Corrientazos, pollo asado y platos típicos",
    descripcion: "Corrientazos caseros, pollo asado y platos típicos de la región.",
    direccion: "",
    telefono: "",              // celular con WhatsApp, ej: "3001234567"
    horario: "Lun a Dom 11:00 a.m. – 8:00 p.m.",
    tiempo: "20-30 min",
    costoEnvio: 2000,
    lat: 5.30832, lng: -73.81462,
    color: "linear-gradient(135deg, #FF7E5F 0%, #FEB47B 100%)",
    icono: "🍗",
    demo: true,
    productos: [
      { nombre: "Almuerzo Corrientazo Especial", desc: "Sopa del día, bandeja con carne asada, arroz, ensalada y jugo.", precio: 14000, emoji: "🍲" },
      { nombre: "Medio Pollo Asado + Papa Salada", desc: "Acompañado de arepa boyacense, plátano maduro y ají casero.", precio: 22000, emoji: "🍗" },
      { nombre: "Churrasco a la Plancha (300g)", desc: "Con papa francesa, ensalada fresca y chimichurri.", precio: 26000, emoji: "🥩" },
      { nombre: "Jugo Natural en Leche", desc: "Mora, lulo o guanábana (16 oz).", precio: 4500, emoji: "🥤" }
    ]
  },
  {
    nombre: "Burgers & Perros La Legua",
    categoria: "rapida",
    barrio: "La Legua",
    cocina: "Hamburguesas, perros y salchipapas",
    descripcion: "Hamburguesas artesanales, perros calientes y salchipapas al instante.",
    telefono: "",
    horario: "Mar a Dom 4:00 p.m. – 11:00 p.m.",
    tiempo: "25-35 min",
    costoEnvio: 2500,
    lat: 5.31185, lng: -73.80995,
    color: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
    icono: "🍔",
    demo: true,
    productos: [
      { nombre: "Hamburguesa Ubatense Doble", desc: "Doble carne artesanal, queso campesino fundido, tocineta y papas.", precio: 19500, emoji: "🍔" },
      { nombre: "Perro Caliente Especial", desc: "Salchicha americana, queso mozzarella, ripio de papa y salsas.", precio: 13000, emoji: "🌭" },
      { nombre: "Salchipapa Gratinada Familiar", desc: "Papa criolla y francesa, salchicha ranchera, pollo desmechado y queso.", precio: 24000, emoji: "🍟" },
      { nombre: "Gaseosa 1.5 Litros", desc: "Sabor tradicional fría.", precio: 6500, emoji: "🥤" }
    ]
  },
  {
    nombre: "Panadería y Cafetería San Diego",
    categoria: "panaderia",
    barrio: "Centro",
    cocina: "Panadería, onces y desayunos",
    descripcion: "Pan recién horneado, almojábanas, garullas y desayunos ubatenses.",
    telefono: "",
    horario: "Lun a Dom 6:00 a.m. – 8:00 p.m.",
    tiempo: "15-25 min",
    costoEnvio: 1500,
    lat: 5.30765, lng: -73.81525,
    color: "linear-gradient(135deg, #D97706 0%, #92400E 100%)",
    icono: "🥐",
    demo: true,
    productos: [
      { nombre: "Combo Onces Ubatenses", desc: "Chocolate santafereño, queso campesino, almojábana y pan de bono.", precio: 11500, emoji: "☕" },
      { nombre: "Bolsa x6 Almojábanas Calientes", desc: "Elaboradas con cuajada fresca de la provincia de Ubaté.", precio: 9000, emoji: "🥯" },
      { nombre: "Caldo de Costilla + Arepa", desc: "Desayuno tradicional con cilantro y cebolla fresca.", precio: 10500, emoji: "🥣" }
    ]
  },
  {
    nombre: "Minimercado Juan José Neira",
    categoria: "tienda",
    barrio: "Juan José Neira",
    cocina: "Abarrotes, lácteos, frutas y verduras",
    descripcion: "Abarrotes, lácteos de la región, frutas, verduras y productos de aseo.",
    telefono: "",
    horario: "Lun a Sáb 7:00 a.m. – 9:00 p.m.",
    tiempo: "20-30 min",
    costoEnvio: 2000,
    lat: 5.30935, lng: -73.81262,
    color: "linear-gradient(135deg, #10B981 0%, #059669 100%)",
    icono: "🛒",
    demo: true,
    productos: [
      { nombre: "Canasta Básica Express", desc: "Arroz 1kg, aceite 500ml, huevos x12, panela y leche entera.", precio: 28500, emoji: "🧺" },
      { nombre: "Queso Campesino Ubaté (Libra)", desc: "Producto lácteo fresco local.", precio: 8500, emoji: "🧀" },
      { nombre: "Combo Frutas y Verduras", desc: "Tomate, cebolla, papa pastusa (2kg), banano y manzana.", precio: 15000, emoji: "🍎" }
    ]
  },
  {
    nombre: "Pizzería y Lasañas San Francisco",
    categoria: "pizza",
    barrio: "San Francisco",
    cocina: "Pizzas y lasañas",
    descripcion: "Pizzas artesanales en horno de piedra y lasañas gratinadas.",
    telefono: "",
    horario: "Mié a Lun 5:00 p.m. – 10:30 p.m.",
    tiempo: "30-40 min",
    costoEnvio: 2500,
    lat: 5.30862, lng: -73.81942,
    color: "linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)",
    icono: "🍕",
    demo: true,
    productos: [
      { nombre: "Pizza Mediana Hawaiana o Carnes", desc: "8 porciones con abundante queso mozzarella.", precio: 27000, emoji: "🍕" },
      { nombre: "Lasaña Mixta Pollo y Carne", desc: "Acompañada de pan con ajo artesanal.", precio: 18500, emoji: "🍝" },
      { nombre: "Porción Pizza + Gaseosa Personal", desc: "Combo rápido para una persona.", precio: 9500, emoji: "🥤" }
    ]
  },
  {
    nombre: "El Fogón de la Villa · Corrientazos",
    categoria: "restaurante",
    barrio: "San Francisco",
    cocina: "Almuerzos ejecutivos y comida típica",
    descripcion: "Almuerzos ejecutivos, sancocho de gallina y trucha al ajillo.",
    telefono: "",
    horario: "Lun a Sáb 11:30 a.m. – 3:30 p.m.",
    tiempo: "20-30 min",
    costoEnvio: 2000,
    lat: 5.30918, lng: -73.82018,
    color: "linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)",
    icono: "🍛",
    demo: true,
    productos: [
      { nombre: "Corrientazo del Día", desc: "Sopa, principio, proteína a elección, arroz, tajada y sobremesa.", precio: 13500, emoji: "🍛" },
      { nombre: "Trucha Arcoíris al Ajillo", desc: "Con patacón pisao, arroz con coco y ensalada.", precio: 25000, emoji: "🐟" }
    ]
  }
];

/* Barrios de Ubaté (coordenadas de OpenStreetMap) para la dirección de entrega */
window.BARRIOS_UBATE = {
  "Centro":              [5.30806, -73.81487],
  "Juan José Neira":     [5.30914, -73.81244],
  "La Legua":            [5.31208, -73.80968],
  "San Francisco":       [5.30885, -73.81987],
  "Simón Bolívar":       [5.31143, -73.81589],
  "El Norte":            [5.31340, -73.81243],
  "El Estadio":          [5.31093, -73.80485],
  "El Portal":           [5.30985, -73.80636],
  "San José":            [5.30495, -73.82365],
  "Villa Rosita":        [5.30372, -73.82113],
  "Santa Bárbara":       [5.30178, -73.81956],
  "Santa Catalina":      [5.30312, -73.81336],
  "Portal del Cerrito":  [5.30195, -73.81348],
  "Parques del Cerrito": [5.30235, -73.81457],
  "Coovimpru":           [5.30265, -73.81191],
  "San Ignacio":         [5.29845, -73.81650]
};
