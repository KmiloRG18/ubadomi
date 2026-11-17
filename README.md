# UbaDomi · Domicilios en Ubaté

Sistema web de domicilios para la Villa de San Diego de Ubaté (Cundinamarca).
El cliente pide desde el menú de un comercio aliado o por chat a cualquier
restaurante; el equipo UbaDomi gestiona el pedido con el restaurante y el
cliente lo sigue en vivo en el mapa. Pago en efectivo contra entrega.

## Cómo encenderlo

Requisito: [Node.js](https://nodejs.org) 18 o superior. No usa librerías externas (no hace falta `npm install`).

```
npm start
```

- Página del cliente: http://localhost:8080
- Panel del operador: http://localhost:8080/operador.html
- La **clave del operador** aparece en la consola y queda en `datos/clave-operador.txt`.
  Para usar una propia: `set UBADOMI_CLAVE=miClave` (Windows) antes de `npm start`.

## Qué hay en cada parte

| Parte | Qué hace |
|---|---|
| **Comercios** | Aliados con menú y carrito + todos los restaurantes del municipio (OpenStreetMap o Google Maps). |
| **Mapa** | Restaurantes en el mapa, filtros, "Cerca de mí". |
| **Seguir pedido** | Los 7 estados del pedido, ruta por calles reales, cancelar, calificar y "Mis pedidos". |
| **Chat** | El cliente escribe a UbaDomi; puede borrar sus datos (Ley 1581). |
| **Panel → Chats** | Responder, crear pedidos, escribir/llamar al restaurante, cambiar estados, notas internas. |
| **Panel → Comercios** | Crear y editar aliados y sus menús (precios, agotados, ocultar). «Publicar cambios» los muestra en la página. |
| **Panel → Resumen** | Pedidos, ventas, ticket promedio, calificaciones y ranking por restaurante. |

## Archivos

| Archivo | Para qué |
|---|---|
| `config.js` | API key de Google (opcional), horario de atención, **datos del responsable de datos personales** (completar antes de publicar). |
| `restaurantes.js` | Aliados iniciales y barrios. Después de publicar desde el panel, manda `datos/comercios.json`. |
| `restaurantes-osm.json` | Copia de respaldo de OpenStreetMap. Actualizar con `npm run actualizar-osm`. |
| `datos/` | Conversaciones, pedidos, aliados y clave. **Contiene datos personales: no lo compartas.** |
| `fotos/` | Fotos de aliados y productos subidas desde el panel (públicas, en WebP). |
| `privacidad.html`, `terminos.html` | Política de datos (Ley 1581/2012) y términos del servicio. |

## Fotos de los negocios

- **Aliados:** en el panel → Comercios → «Subir foto» (negocio) y la cámara de cada producto. Se reducen en el navegador (1200 px el negocio, 600 px los productos) y luego «Publicar cambios». Usa fotos propias o autorizadas por el dueño.
- **Restaurantes de Google Maps:** con `GOOGLE_MAPS_API_KEY` en `config.js` cada restaurante muestra su primera foto de Google con el crédito del autor (Google lo exige). Requiere «Places API (New)»; pedir fotos tiene costo en la facturación de Google.
- **Mientras tanto (imágenes de referencia):** los negocios sin foto propia muestran una foto de su tipo de comida (bandeja paisa, almojábanas, pollo a la brasa…) tomada de Wikimedia Commons con licencia libre, en `fotos/referencia/`. Siempre van rotuladas «Imagen de referencia» y sus autores y licencias están en `creditos.html` (enlace en el pie de página). En cuanto un aliado sube su foto, o hay foto de Google, se reemplaza sola.
- No se copian fotos de la página de Google Maps: sus términos y los derechos de autor de quien las tomó no lo permiten.

## Comandos

```
npm start              # enciende el servidor
npm run actualizar-osm # actualiza la copia de restaurantes de OpenStreetMap
npm run check          # revisa la sintaxis de los archivos
```

## Publicarlo en internet

1. Sube la carpeta a un hosting con Node.js (por ejemplo Render, Railway o un VPS).
2. Comando de inicio: `npm start`. El puerto se toma de la variable `PORT`.
3. Define la variable `UBADOMI_CLAVE` con una clave segura.
4. Usa **HTTPS** (la ubicación del navegador y la instalación como app lo exigen).
5. La carpeta `datos/` debe estar en un disco persistente; si no, se borra en cada despliegue.
6. Completa `RESPONSABLE` en `config.js` (nombre, NIT/C.C., correo) y, si usas Google Maps, restringe la API key a tu dominio.

## Pendientes conocidos

- El mensaje al restaurante se envía a mano por WhatsApp (automatizarlo requiere WhatsApp Business API).
- Un solo usuario operador (clave compartida); no hay roles.
- El seguimiento de la moto es simulado según el estado; no hay GPS real del domiciliario.
