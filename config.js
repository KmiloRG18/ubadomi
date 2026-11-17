/* =========================================================
   CONFIGURACIÓN — UbaDomi (Domicilios Ubaté)
   =========================================================
   Fuente de los restaurantes que NO son aliados:

   1) SIN llave de Google (por defecto)
      Mapa de OpenStreetMap; los restaurantes se cargan en vivo
      desde OpenStreetMap. Cada uno tiene botón "Google Maps".

   2) CON llave de Google Maps (para ver exactamente los
      restaurantes que aparecen en Google Maps)
      - Entra a https://console.cloud.google.com/
      - Activa "Maps JavaScript API" y "Places API (New)"
      - Crea una API key y restríngela a tu dominio (HTTP referrers)
      - Pégala abajo en GOOGLE_MAPS_API_KEY
      Ojo: Google cobra por uso cuando superas la cuota gratuita mensual.
   ========================================================= */

window.CONFIG = {
  GOOGLE_MAPS_API_KEY: "",          // <- pega aquí tu API key de Google Maps
  GOOGLE_MAP_ID: "DEMO_MAP_ID",     // Map ID de Google (DEMO_MAP_ID sirve para pruebas)

  MUNICIPIO: "Ubaté, Cundinamarca",
  CENTRO: { lat: 5.30806, lng: -73.81487 }, // Barrio Centro de Ubaté
  ZOOM: 15,
  RADIO_BUSQUEDA_M: 4000,           // radio de búsqueda alrededor del centro

  COSTO_ENVIO_DEFECTO: 2000,        // si el aliado no define costoEnvio

  // Mensaje que se envía por WhatsApp a restaurantes no aliados
  MENSAJE_WHATSAPP: "Hola, vi su restaurante en UbaDomi y quiero hacer un pedido a domicilio.",

  // Horas que se guardan los resultados en el navegador antes de volver a consultarlos
  HORAS_CACHE: 12,

  // Horario en que el equipo UbaDomi atiende el chat (24 h). Días: 0 = domingo … 6 = sábado
  HORARIO_ATENCION: {
    dias: [0, 1, 2, 3, 4, 5, 6],
    abre: "10:00",
    cierra: "22:00"
  },

  // Datos del responsable del tratamiento de datos (Ley 1581 de 2012).
  // ⚠️ Completa estos datos antes de publicar la página.
  RESPONSABLE: {
    nombre: "UbaDomi (proyecto académico)",
    identificacion: "",              // NIT o C.C. del responsable
    direccion: "Villa de San Diego de Ubaté, Cundinamarca",
    correo: "",                      // correo para consultas y reclamos de datos
    whatsapp: ""                     // WhatsApp de atención de UbaDomi, ej: "3001234567"
  }
};
