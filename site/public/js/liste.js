// Listes d'établissements : filtres (secteur, éducation prioritaire, texte) et tri sur toutes les colonnes.
// Tri par nom par défaut ; aucun rang affiché, aucune mise en avant des extrêmes.
(function () {
  var norm = function (s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); };
  document.querySelectorAll("table[data-liste]").forEach(function (table) {
    var id = table.id, corps = table.tBodies[0];
    var zone = document.querySelector('[data-filtres="' + id + '"]');
    var compte = document.querySelector('[data-compte="' + id + '"]');
    var etat = { s: "", ep: "", q: "" };
    var libelleCompte = compte ? compte.textContent.replace(/^\d[\d\s ]*/, "").replace(/ · .*$/, "") : "";
    var tri = "nom";

    function appliquer() {
      var n = 0, q = norm(etat.q.trim());
      Array.prototype.forEach.call(corps.rows, function (tr) {
        var ok = (!etat.s || tr.dataset.s === etat.s) && (!etat.ep || tr.dataset.ep === etat.ep) && (!q || norm(tr.dataset.q).indexOf(q) >= 0);
        tr.hidden = !ok; if (ok) n++;
      });
      if (compte) compte.textContent = n + " " + libelleCompte + " affichés sur " + corps.rows.length + " · tri par " + tri;
    }

    if (zone) {
      zone.querySelectorAll("button[data-filtre]").forEach(function (b) {
        b.addEventListener("click", function () {
          zone.querySelectorAll('button[data-filtre="' + b.dataset.filtre + '"]').forEach(function (x) { x.classList.remove("on"); });
          b.classList.add("on"); etat[b.dataset.filtre] = b.dataset.valeur; appliquer();
        });
      });
      var champ = zone.querySelector('input[data-filtre="q"]');
      if (champ) champ.addEventListener("input", function () { etat.q = champ.value; appliquer(); });
    }

    table.querySelectorAll("th[data-tri]").forEach(function (th) {
      th.tabIndex = 0;
      var trier = function () {
        var col = Array.prototype.indexOf.call(th.parentNode.children, th);
        var asc = !(th.classList.contains("on") && th.getAttribute("aria-sort") === "ascending");
        table.querySelectorAll("th[data-tri]").forEach(function (o) { o.classList.remove("on"); o.removeAttribute("aria-sort"); });
        th.classList.add("on"); th.setAttribute("aria-sort", asc ? "ascending" : "descending");
        var nombre = th.dataset.tri === "nombre";
        var cle = function (tr) { var c = tr.children[col]; return nombre ? c.dataset.v : c.textContent.trim(); };
        Array.prototype.slice.call(corps.rows).sort(function (a, b) {
          var x = cle(a), y = cle(b);
          if (nombre) {
            if (x === "" && y === "") return 0; if (x === "") return 1; if (y === "") return -1; // absences toujours en fin
            return asc ? x - y : y - x;
          }
          var r = x.localeCompare(y, "fr"); return asc ? r : -r;
        }).forEach(function (r) { corps.appendChild(r); });
        tri = th.textContent.trim().toLowerCase(); appliquer();
      };
      th.addEventListener("click", trier);
      th.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); trier(); } });
    });
  });
})();
