// Recherche de l'accueil : index chargé au premier focus (/recherche.json), insensible aux accents et à la casse,
// sur le nom, la commune, l'UAI et le département. Établissements (au plus 20) et départements.
(function () {
  var q = document.getElementById("q"), res = document.getElementById("res");
  if (!q || !res) return;
  var deps = JSON.parse((document.getElementById("departements") || {}).textContent || "[]");
  var nomDep = {}; deps.forEach(function (d) { nomDep[d.d] = d.l; });
  var familles = { college: "Collège", legt: "Lycée GT", lpo: "Lycée polyvalent", lp: "Lycée pro", erea: "EREA" };
  var index = null, chargement = null;
  var norm = function (s) { return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); };
  var echap = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  function charger() {
    chargement = chargement || fetch("/recherche.json").then(function (r) { return r.json(); }).then(function (x) {
      index = x.map(function (e) { e.k = norm(e.n + " " + e.c + " " + e.u + " " + e.d + " " + (nomDep[e.d] || "")); return e; });
      lancer();
    });
    return chargement;
  }

  function surligner(texte, termes) {
    var t = echap(texte), n = norm(t);
    termes.forEach(function (m) { var i = n.indexOf(m); if (i >= 0 && m) { t = t.slice(0, i) + "<mark>" + t.slice(i, i + m.length) + "</mark>" + t.slice(i + m.length); n = norm(t); } });
    return t;
  }

  function lancer() {
    var termes = norm(q.value).split(/\s+/).filter(Boolean);
    if (!termes.length) { res.classList.remove("open"); res.innerHTML = ""; return; }
    if (!index) { res.innerHTML = '<div class="grp">Chargement de l’index…</div>'; res.classList.add("open"); charger(); return; }
    var ok = function (k) { return termes.every(function (m) { return k.indexOf(m) >= 0; }); };
    // Pertinence de la recherche (pas un classement des établissements) : d'abord les termes trouvés
    // en début de mot, puis l'ordre alphabétique.
    var debuts = termes.map(function (m) { return new RegExp("(^|[\\s\\-'’])" + m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")); });
    var score = function (k) { return debuts.filter(function (r) { return r.test(k); }).length; };
    var etabs = index.filter(function (e) { return ok(e.k); })
      .map(function (e) { return { e: e, p: score(e.k) }; })
      .sort(function (a, b) { return b.p - a.p || a.e.n.localeCompare(b.e.n, "fr"); })
      .map(function (x) { return x.e; });
    var trouves = deps.filter(function (d) { return ok(norm(d.l + " " + d.d + " " + d.a)); });
    var h = "";
    if (etabs.length) {
      h += '<div class="grp">Établissements' + (etabs.length > 20 ? " (20 premiers sur " + etabs.length + ", précisez la recherche)" : "") + "</div>";
      h += etabs.slice(0, 20).map(function (e) {
        return '<a href="/etablissement/' + e.u + '/"><span>' + surligner(e.n, termes) + '</span><span class="u">' + e.u +
          '</span><span class="s"><span class="sect ' + (e.s === "public" ? "pub" : "pri") + '">' + (e.s === "public" ? "Public" : "Privé s. c.") +
          "</span> · " + familles[e.f] + " · " + surligner(e.c, termes) + (e.x ? " · page conservée" : "") + "</span></a>";
      }).join("");
    }
    if (trouves.length) {
      h += '<div class="grp">Départements</div>' + trouves.map(function (d) {
        return '<a href="/departement/' + d.d + '/"><span>' + surligner(d.l, termes) + '</span><span></span><span class="s">' + d.d + " · " + echap(d.a) + "</span></a>";
      }).join("");
    }
    res.innerHTML = h || '<div class="grp">Aucun résultat</div><div class="vide">Vérifiez l’orthographe, ou cherchez par commune ou par UAI. Les établissements privés hors contrat ne figurent pas : ils ne sont pas couverts par les statistiques publiques.</div>';
    res.classList.add("open");
  }

  q.addEventListener("focus", charger, { once: true });
  q.addEventListener("input", lancer);
  q.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { var a = res.querySelector("a"); if (a) { e.preventDefault(); location.href = a.href; } }
    if (e.key === "Escape") res.classList.remove("open");
  });
  document.querySelectorAll(".hint button").forEach(function (b) { b.addEventListener("click", function () { q.value = b.textContent; q.focus(); lancer(); }); });
  var initial = new URLSearchParams(location.search).get("q");
  if (initial) { q.value = initial; charger(); }
})();
