// Lien « Signaler une erreur ou compléter » : ajoute au clic l'onglet affiché (paramètre onglet) au lien vers /contact/.
// Sans onglet sélectionné, retire le paramètre. N'utilise que `w` pour être testable.
(function (w) {
  var d = w.document;
  d.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[data-signalement]") : null;
    if (!a) return;
    var onglet = d.querySelector('[role="tab"][aria-selected="true"]');
    var libelle = onglet ? onglet.textContent.trim() : "";
    var u = new URL(a.getAttribute("href"), "https://x.invalid");
    if (libelle) u.searchParams.set("onglet", libelle);
    else u.searchParams.delete("onglet");
    a.setAttribute("href", u.pathname + u.search);
  });
})(window);
