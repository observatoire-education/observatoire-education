// Recherche : le champ de l'en-tête (toutes les pages, résultats en panneau pleine largeur sous l'en-tête) et le grand
// champ de l'accueil. Les index ne sont chargés qu'à la première saisie (/recherche.json, /recherche-communes.json,
// /recherche-territoires.json), un squelette s'affiche pendant le chargement. Insensible aux accents et à la casse, sur
// le nom, la commune, l'UAI et le département. Régions, départements, communes (au plus 20), puis établissements (au plus 20).
(function () {
  var familles = { college: "Collège", legt: "Lycée GT", lpo: "Lycée polyvalent", lp: "Lycée pro", erea: "EREA", maternelle: "École maternelle", elementaire: "École élémentaire", primaire: "École primaire" };
  var norm = function (s) { return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); };
  // Toute donnée insérée dans le HTML est échappée ; les chemins sont encodés.
  var echap = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var chemin = function (s) { return encodeURIComponent(String(s)); };

  // Données partagées par tous les champs de la page, chargées une seule fois.
  var donnees = null, chargement = null;
  function charger() {
    var json = function (url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(url); return r.json(); }); };
    chargement = chargement || Promise.all([json("/recherche.json"), json("/recherche-communes.json"), json("/recherche-territoires.json")]).then(function (x) {
      var t = x[2], nomDep = {}, taille = {};
      t.departements.forEach(function (d) { nomDep[d.d] = d.l; });
      // Garde-fou : le pipeline garantit nom et commune (refus à l'export) ; un index ancien pourrait en manquer.
      // Établissements par commune (nom et département) : départage les communes homonymes, la plus grande d'abord.
      var index = x[0].map(function (e) { e.n = e.n || e.u; e.c = e.c || ""; taille[norm(e.c) + "|" + e.d] = (taille[norm(e.c) + "|" + e.d] || 0) + 1; e.k = norm(e.n + " " + e.c + " " + e.u + " " + e.d + " " + (nomDep[e.d] || "")); return e; });
      donnees = { index: index, communes: x[1], regions: t.regions, deps: t.departements, nomDep: nomDep, taille: taille };
      return donnees;
    }).catch(function (err) { chargement = null; throw err; });
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

  // Lignes grisées le temps du chargement de l'index, à la place des résultats.
  function squelette(colonnes) {
    var lignes = function (n) { var h = ""; for (var i = 0; i < n; i++) h += '<div class="sq"><span></span><span></span></div>'; return h; };
    var bloc = function (n) { return '<div class="grp"><span class="sq-titre"></span></div>' + lignes(n); };
    var h = colonnes ? '<div class="col">' + bloc(2) + bloc(2) + '</div><div class="col">' + bloc(5) + "</div>" : bloc(2) + bloc(4);
    return '<div class="charge" aria-hidden="true">' + h + '</div><span class="visuel-masque">Chargement des résultats…</span>';
  }

  function resultats(termes, d, colonnes) {
    var ok = function (k) { return termes.every(function (m) { return k.indexOf(m) >= 0; }); };
    // Pertinence de la recherche (pas un ordre de valeur des établissements) : d'abord les termes trouvés
    // en début de mot, puis l'ordre alphabétique.
    var debuts = termes.map(function (m) { return new RegExp("(^|[\\s\\-'’])" + m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")); });
    var score = function (k) { return debuts.filter(function (r) { return r.test(k); }).length; };
    var etabs = d.index.filter(function (e) { return ok(e.k); })
      .map(function (e) { return { e: e, p: score(e.k) }; })
      // Pages conservées d'établissements fermés après les établissements ouverts.
      .sort(function (a, b) { return (a.e.x ? 1 : 0) - (b.e.x ? 1 : 0) || b.p - a.p || a.e.n.localeCompare(b.e.n, "fr"); })
      .map(function (x) { return x.e; });
    var villes = d.communes.filter(function (c) { return ok(norm(c.l + " " + c.i + " " + (d.nomDep[c.d] || ""))); })
      // Les communes dont le nom est exactement la saisie d'abord (Saint-Nazaire avant Ablain-Saint-Nazaire), la plus
      // grande en tête entre homonymes ; puis l'ordre alphabétique.
      .sort(function (a, b) {
        var saisie = termes.join(" "), ea = norm(a.l) === saisie, eb = norm(b.l) === saisie;
        var t = function (c) { return d.taille[norm(c.l) + "|" + c.d] || 0; };
        return (eb - ea) || (ea && eb ? t(b) - t(a) : 0) || a.l.localeCompare(b.l, "fr");
      });
    var trouves = d.deps.filter(function (x) { return ok(norm(x.l + " " + x.d + " " + x.a)); });
    var regionsTrouvees = d.regions.filter(function (r) { return ok(norm(r.l + " " + r.r)); });
    var lien = function (href, html) { return '<a role="option" href="' + href + '">' + html + "</a>"; };
    // Territoires d'abord, du plus large au plus proche, puis les établissements.
    var terr = "", etab = "";
    if (regionsTrouvees.length) {
      terr += '<div class="grp">Régions</div>' + regionsTrouvees.map(function (r) {
        return lien("/region/" + chemin(r.r) + "/", "<span>" + surligner(r.l, termes) + '</span><span></span><span class="s">Région</span>');
      }).join("");
    }
    if (trouves.length) {
      terr += '<div class="grp">Départements</div>' + trouves.map(function (x) {
        return lien("/departement/" + chemin(x.d) + "/", "<span>" + surligner(x.l, termes) + '</span><span></span><span class="s">' + echap(x.d) + " · " + echap(x.a) + "</span>");
      }).join("");
    }
    if (villes.length) {
      terr += '<div class="grp">Communes' + (villes.length > 20 ? " (20 premières sur " + villes.length + ", précisez la recherche)" : "") + "</div>";
      terr += villes.slice(0, 20).map(function (c) {
        return lien("/commune/" + chemin(c.i) + "/", "<span>" + surligner(c.l, termes) + '</span><span></span><span class="s">' + echap(c.d) + (d.nomDep[c.d] ? " · " + echap(d.nomDep[c.d]) : "") + "</span>");
      }).join("");
    }
    if (etabs.length) {
      etab += '<div class="grp">Établissements' + (etabs.length > 20 ? " (20 premiers sur " + etabs.length + ", précisez la recherche)" : "") + "</div>";
      etab += etabs.slice(0, 20).map(function (e) {
        return lien("/etablissement/" + chemin(e.u) + "/", "<span>" + surligner(e.n, termes) + '</span><span class="u">' + echap(e.u) +
          '</span><span class="s"><span class="sect ' + (e.s === "public" ? "pub" : "pri") + '">' + (e.s === "public" ? "Public" : "Privé s. c.") +
          "</span> · " + echap(familles[e.f] || "") + (e.c ? " · " + surligner(e.c, termes) : "") + (e.x ? " · page conservée" : "") + "</span>");
      }).join("");
    }
    if (!terr && !etab) return '<div class="grp">Aucun résultat</div><div class="vide">Vérifiez l’orthographe, ou cherchez par commune ou par UAI. Les établissements privés hors contrat ne figurent pas : ils ne sont pas couverts par les statistiques publiques.</div>';
    // Panneau de l'en-tête : territoires à gauche, établissements à droite (une seule colonne si l'une est vide).
    if (colonnes && terr && etab) return '<div class="col">' + terr + '</div><div class="col">' + etab + "</div>";
    return terr + etab;
  }

  // Champ en combobox : flèches pour parcourir, Entrée pour ouvrir (la ligne choisie ou la première), Échap pour fermer.
  function brancher(q, res, colonnes) {
    var actif = -1;
    q.setAttribute("role", "combobox");
    q.setAttribute("aria-autocomplete", "list");
    q.setAttribute("aria-expanded", "false");
    q.setAttribute("aria-controls", res.id);
    res.setAttribute("role", "listbox");
    var ouvrir = function (oui) { res.classList.toggle("open", oui); q.setAttribute("aria-expanded", oui ? "true" : "false"); if (!oui) choisir(-1); };
    var options = function () { return res.querySelectorAll("a[role=option]"); };
    function choisir(i) {
      var o = options();
      if (o[actif]) o[actif].classList.remove("actif");
      actif = i;
      if (o[i]) { o[i].classList.add("actif"); o[i].id = res.id + "-o" + i; q.setAttribute("aria-activedescendant", o[i].id); if (o[i].scrollIntoView) o[i].scrollIntoView({ block: "nearest" }); }
      else q.removeAttribute("aria-activedescendant");
    }

    function lancer() {
      var termes = norm(q.value).split(/\s+/).filter(Boolean);
      actif = -1; q.removeAttribute("aria-activedescendant");
      if (!termes.length) { ouvrir(false); res.innerHTML = ""; return; }
      if (!donnees) {
        res.innerHTML = squelette(colonnes); ouvrir(true);
        charger().then(function () { if (document.activeElement === q || res.classList.contains("open")) lancer(); }, function () {
          res.innerHTML = '<div class="grp">Recherche indisponible</div><div class="vide">L’index de recherche n’a pas pu être chargé. Vérifiez votre connexion et réessayez.</div>';
        });
        return;
      }
      res.innerHTML = resultats(termes, donnees, colonnes);
      ouvrir(true);
    }

    q.addEventListener("input", lancer);
    q.addEventListener("focus", function () { if (q.value.trim() && res.innerHTML) ouvrir(true); });
    q.addEventListener("keydown", function (e) {
      var o = options();
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!o.length) return;
        e.preventDefault();
        if (!res.classList.contains("open")) ouvrir(true);
        choisir(e.key === "ArrowDown" ? (actif + 1) % o.length : (actif <= 0 ? o.length : actif) - 1);
      } else if (e.key === "Enter") {
        var a = o[actif] || o[0];
        // Sans résultat (index pas encore chargé), le formulaire de l'en-tête part vers l'accueil.
        if (a) { e.preventDefault(); location.href = a.href; }
      } else if (e.key === "Escape") {
        if (res.classList.contains("open")) { e.preventDefault(); ouvrir(false); } else q.value = "";
      }
    });
    // Clic hors du champ et du panneau : on referme.
    document.addEventListener("pointerdown", function (e) { if (!q.contains(e.target) && !res.contains(e.target)) ouvrir(false); });
    return lancer;
  }

  // En-tête : sur toutes les pages.
  var qe = document.getElementById("q-entete"), re = document.getElementById("res-entete");
  if (qe && re) brancher(qe, re, true);

  // Accueil : grand champ, exemples cliquables, et la saisie transmise par le champ de l'en-tête sans JavaScript (?q=).
  var q = document.getElementById("q"), res = document.getElementById("res");
  if (q && res) {
    var lancer = brancher(q, res, false);
    document.querySelectorAll(".hint button").forEach(function (b) { b.addEventListener("click", function () { q.value = b.textContent; q.focus(); lancer(); }); });
    var initial = new URLSearchParams(location.search).get("q");
    if (initial) { q.value = initial; lancer(); }
  }
})();
