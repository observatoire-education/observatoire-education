// Onglets : n'affiche qu'un panneau à la fois, suit l'ancre de l'URL, le clavier et les liens internes.
// Sans panneau [data-onglet] (page sans onglets), ne fait rien. N'utilise que `w` pour être testable.
(function (w) {
  var d = w.document;
  d.addEventListener("DOMContentLoaded", function () {
    var panneaux = Array.prototype.slice.call(d.querySelectorAll("[data-onglet]"));
    if (!panneaux.length) return;
    var barre = d.querySelector(".onglets");
    var liste = barre ? barre.querySelector('[role="tablist"]') : null;
    var onglets = Array.prototype.slice.call(d.querySelectorAll('[role="tab"]'));
    var actif = null;
    // « until-found » laisse la recherche dans la page ouvrir un panneau masqué ; sinon, repli sur hidden.
    var masque = "onbeforematch" in w.HTMLElement.prototype ? "until-found" : "";

    // Panneau visé par un id : le panneau lui-même, ou celui qui contient l'élément.
    function panneauDe(id) {
      var el = id ? d.getElementById(id) : null;
      if (!el) return null;
      var p = el.hasAttribute("data-onglet") ? el : el.closest("[data-onglet]");
      return p ? { panneau: p, interne: p === el ? null : el } : null;
    }

    function activer(panneau) {
      actif = panneau;
      panneaux.forEach(function (p) {
        if (p === panneau) p.removeAttribute("hidden");
        else p.setAttribute("hidden", masque);
      });
      onglets.forEach(function (o) {
        var on = o.getAttribute("aria-controls") === panneau.id;
        o.setAttribute("aria-selected", on ? "true" : "false");
        o.setAttribute("tabindex", on ? "0" : "-1");
      });
    }

    function remonter() {
      if (!barre || !barre.getBoundingClientRect || !actif.getBoundingClientRect) return;
      var haut = actif.getBoundingClientRect().top - barre.offsetHeight - 56;
      if (haut < 0) w.scrollTo(0, (w.pageYOffset || 0) + haut);
    }

    function ouvrir(id) {
      var cible = panneauDe(id);
      activer(cible ? cible.panneau : panneaux[0]);
      if (cible && cible.interne) cible.interne.scrollIntoView();
      return cible;
    }

    function idDeLien(a) {
      var h = a.getAttribute("href");
      return h && h.length > 1 && h.charAt(0) === "#" ? decodeURIComponent(h.slice(1)) : null;
    }

    d.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
      var id = a ? idDeLien(a) : null;
      var cible = panneauDe(id);
      if (!cible) return;
      e.preventDefault();
      activer(cible.panneau);
      w.history.replaceState(null, "", "#" + id);
      if (cible.interne) cible.interne.scrollIntoView();
      else remonter();
    });

    w.addEventListener("hashchange", function () {
      ouvrir(w.location.hash.slice(1));
    });

    panneaux.forEach(function (p) {
      p.addEventListener("beforematch", function () { activer(p); });
    });

    if (liste) {
      liste.addEventListener("keydown", function (e) {
        var i = onglets.indexOf(d.querySelector('[role="tab"][aria-selected="true"]'));
        if (i < 0) i = 0;
        var n = onglets.length;
        if (e.key === "ArrowRight") i = (i + 1) % n;
        else if (e.key === "ArrowLeft") i = (i - 1 + n) % n;
        else if (e.key === "Home") i = 0;
        else if (e.key === "End") i = n - 1;
        else return;
        e.preventDefault();
        activer(d.getElementById(onglets[i].getAttribute("aria-controls")));
        onglets[i].focus();
        w.history.replaceState(null, "", "#" + onglets[i].getAttribute("aria-controls"));
      });
    }

    ouvrir(decodeURIComponent(w.location.hash.slice(1)));
    d.documentElement.classList.add("onglets-prets");
    var courant = d.querySelector('[role="tab"][aria-selected="true"]');
    if (courant) courant.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
})(window);
