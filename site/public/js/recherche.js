// Recherche de l'accueil : index et communes chargés au premier focus (/recherche.json, /recherche-communes.json),
// insensibles aux accents et à la casse, sur le nom, la commune, l'UAI et le département. Régions, départements, communes (au plus 20), puis établissements (au plus 20).
(function () {
  var q = document.getElementById("q"), res = document.getElementById("res");
  if (!q || !res) return;
  var deps = JSON.parse((document.getElementById("departements") || {}).textContent || "[]");
  var regions = JSON.parse((document.getElementById("regions") || {}).textContent || "[]");
  var communes = [];
  var nomDep = {}; deps.forEach(function (d) { nomDep[d.d] = d.l; });
  var familles = { college: "Collège", legt: "Lycée GT", lpo: "Lycée polyvalent", lp: "Lycée pro", erea: "EREA", maternelle: "École maternelle", elementaire: "École élémentaire", primaire: "École primaire" };
  var index = null, chargement = null;
  // Établissements par commune (nom et département) : départage les communes homonymes, la plus grande d'abord.
  var taille = {};
  var norm = function (s) { return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); };
  // Toute donnée insérée dans le HTML est échappée ; les chemins sont encodés.
  var echap = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var chemin = function (s) { return encodeURIComponent(String(s)); };

  function charger() {
    var json = function (url) { return fetch(url).then(function (r) { return r.json(); }); };
    // Communes qui ont une page (second degré ou écoles), hors de l'accueil pour ne pas l'alourdir.
    chargement = chargement || Promise.all([json("/recherche.json"), json("/recherche-communes.json")]).then(function (x) {
      communes = x[1];
      // Des établissements fermés n'ont ni nom ni commune publiés (null) : l'UAI tient lieu de nom.
      index = x[0].map(function (e) { e.n = e.n || e.u; e.c = e.c || ""; taille[norm(e.c) + "|" + e.d] = (taille[norm(e.c) + "|" + e.d] || 0) + 1; e.k = norm(e.n + " " + e.c + " " + e.u + " " + e.d + " " + (nomDep[e.d] || "")); return e; });
      lancer();
    });
    return chargement;
  }

  // Plages repérées sur le texte brut (norm conserve la longueur d'un texte NFC), puis chaque morceau est échappé.
  function surligner(texte, termes) {
    var brut = String(texte).normalize("NFC"), n = norm(brut), plages = [];
    termes.forEach(function (m) { var i = n.indexOf(m); if (m && i >= 0) plages.push([i, i + m.length]); });
    plages.sort(function (a, b) { return a[0] - b[0]; });
    var h = "", pos = 0;
    plages.forEach(function (p) {
      if (p[0] < pos) return; // plages qui se chevauchent : la première suffit
      h += echap(brut.slice(pos, p[0])) + "<mark>" + echap(brut.slice(p[0], p[1])) + "</mark>";
      pos = p[1];
    });
    return h + echap(brut.slice(pos));
  }

  function lancer() {
    var termes = norm(q.value).split(/\s+/).filter(Boolean);
    if (!termes.length) { res.classList.remove("open"); res.innerHTML = ""; return; }
    if (!index) { res.innerHTML = '<div class="grp">Chargement de l’index…</div>'; res.classList.add("open"); charger(); return; }
    var ok = function (k) { return termes.every(function (m) { return k.indexOf(m) >= 0; }); };
    // Pertinence de la recherche (pas un ordre de valeur des établissements) : d'abord les termes trouvés
    // en début de mot, puis l'ordre alphabétique.
    var debuts = termes.map(function (m) { return new RegExp("(^|[\\s\\-'’])" + m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")); });
    var score = function (k) { return debuts.filter(function (r) { return r.test(k); }).length; };
    var etabs = index.filter(function (e) { return ok(e.k); })
      .map(function (e) { return { e: e, p: score(e.k) }; })
      // Pages conservées d'établissements fermés après les établissements ouverts.
      .sort(function (a, b) { return (a.e.x ? 1 : 0) - (b.e.x ? 1 : 0) || b.p - a.p || a.e.n.localeCompare(b.e.n, "fr"); })
      .map(function (x) { return x.e; });
    var villes = communes.filter(function (c) { return ok(norm(c.l + " " + c.i + " " + (nomDep[c.d] || ""))); })
      // Les communes dont le nom est exactement la saisie d'abord (Saint-Nazaire avant Ablain-Saint-Nazaire), la plus
      // grande en tête entre homonymes ; puis l'ordre alphabétique.
      .sort(function (a, b) {
        var saisie = termes.join(" "), ea = norm(a.l) === saisie, eb = norm(b.l) === saisie;
        var t = function (c) { return taille[norm(c.l) + "|" + c.d] || 0; };
        return (eb - ea) || (ea && eb ? t(b) - t(a) : 0) || a.l.localeCompare(b.l, "fr");
      });
    var trouves = deps.filter(function (d) { return ok(norm(d.l + " " + d.d + " " + d.a)); });
    var regionsTrouvees = regions.filter(function (r) { return ok(norm(r.l + " " + r.r)); });
    var h = "";
    // Territoires d'abord, du plus large au plus proche, puis les établissements.
    if (regionsTrouvees.length) {
      h += '<div class="grp">Régions</div>' + regionsTrouvees.map(function (r) {
        return '<a href="/region/' + chemin(r.r) + '/"><span>' + surligner(r.l, termes) + '</span><span></span><span class="s">Région</span></a>';
      }).join("");
    }
    if (trouves.length) {
      h += '<div class="grp">Départements</div>' + trouves.map(function (d) {
        return '<a href="/departement/' + chemin(d.d) + '/"><span>' + surligner(d.l, termes) + '</span><span></span><span class="s">' + echap(d.d) + " · " + echap(d.a) + "</span></a>";
      }).join("");
    }
    if (villes.length) {
      h += '<div class="grp">Communes' + (villes.length > 20 ? " (20 premières sur " + villes.length + ", précisez la recherche)" : "") + "</div>";
      h += villes.slice(0, 20).map(function (c) {
        return '<a href="/commune/' + chemin(c.i) + '/"><span>' + surligner(c.l, termes) + '</span><span></span><span class="s">' + echap(c.d) + (nomDep[c.d] ? " · " + echap(nomDep[c.d]) : "") + "</span></a>";
      }).join("");
    }
    if (etabs.length) {
      h += '<div class="grp">Établissements' + (etabs.length > 20 ? " (20 premiers sur " + etabs.length + ", précisez la recherche)" : "") + "</div>";
      h += etabs.slice(0, 20).map(function (e) {
        return '<a href="/etablissement/' + chemin(e.u) + '/"><span>' + surligner(e.n, termes) + '</span><span class="u">' + echap(e.u) +
          '</span><span class="s"><span class="sect ' + (e.s === "public" ? "pub" : "pri") + '">' + (e.s === "public" ? "Public" : "Privé s. c.") +
          "</span> · " + echap(familles[e.f] || "") + (e.c ? " · " + surligner(e.c, termes) : "") + (e.x ? " · page conservée" : "") + "</span></a>";
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
