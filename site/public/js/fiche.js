// Actions de la fiche : imprimer, copier le lien, afficher la carte (MapLibre et tuiles OpenFreeMap, chargés au clic).
(function () {
  var imprimer = document.getElementById("imprimer");
  if (imprimer) imprimer.addEventListener("click", function () { window.print(); });

  var copier = document.getElementById("copier");
  if (copier) copier.addEventListener("click", function () {
    var url = copier.dataset.url || location.href;
    var fait = function () { var t = copier.textContent; copier.textContent = "✓ Lien copié"; setTimeout(function () { copier.textContent = t; }, 1800); };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(fait, function () { prompt("Lien de la page", url); });
    else prompt("Lien de la page", url);
  });

  var bouton = document.getElementById("afficher-carte");
  var zone = document.getElementById("carte");
  if (!bouton || !zone) return;
  bouton.addEventListener("click", function () {
    if (!zone.hidden) { zone.hidden = true; return; }
    zone.hidden = false;
    if (zone.dataset.chargee) return;
    zone.dataset.chargee = "1";
    var css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "/js/maplibre/maplibre-gl.css";
    document.head.appendChild(css);
    var lat = Number(bouton.dataset.lat), lon = Number(bouton.dataset.lon);
    import("/js/maplibre/maplibre-gl.mjs").then(function (m) {
      var maplibregl = m.default || m;
      var carte = new maplibregl.Map({
        container: zone, style: "https://tiles.openfreemap.org/styles/positron", center: [lon, lat], zoom: 14,
        attributionControl: { compact: true },
      });
      carte.addControl(new maplibregl.NavigationControl({ showCompass: false }));
      new maplibregl.Marker({ color: "#14161c" }).setLngLat([lon, lat]).addTo(carte);
    }).catch(function () { zone.textContent = "La carte n'a pas pu être chargée."; });
  });
})();
