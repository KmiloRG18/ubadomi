// Rellena los datos del responsable (config.js) en las páginas legales
(function () {
  var r = (window.CONFIG && window.CONFIG.RESPONSABLE) || {};
  document.querySelectorAll("[data-resp]").forEach(function (el) {
    var v = r[el.getAttribute("data-resp")];
    if (v) el.textContent = v;
    else { el.textContent = "[por completar en config.js]"; el.className = "text-danger"; }
  });
})();
