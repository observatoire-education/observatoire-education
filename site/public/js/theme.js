// Thème : automatique (prefers-color-scheme), plus un choix mémorisé par le bouton ◐.
(function () {
  var r = document.documentElement;
  r.classList.add("js"); // JavaScript présent : active l'anti-flash des onglets
  try { var t = localStorage.getItem("obs-theme"); if (t === "light" || t === "dark") r.dataset.theme = t; } catch (e) {}
  // Repli : si onglets.js ne se charge pas, les panneaux masqués par l'anti-flash redeviennent visibles.
  window.addEventListener("load", function () { r.classList.add("onglets-prets"); });
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".theme").forEach(function (b) {
      b.addEventListener("click", function () {
        var cur = r.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
        r.dataset.theme = cur === "dark" ? "light" : "dark";
        try { localStorage.setItem("obs-theme", r.dataset.theme); } catch (e) {}
      });
    });
  });
})();
