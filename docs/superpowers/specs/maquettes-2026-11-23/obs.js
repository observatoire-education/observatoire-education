// Maquette : simule ce que Plot dessinera en SVG au build.
(function () {
  const fr = (v, d = 1) => v == null ? "—" : v.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const NS = "http://www.w3.org/2000/svg";

  function dot(el) {
    const c = JSON.parse(el.dataset.dot);
    const [a, b] = c.domain, W = 640, L = 150, R = 20, H = c.rows.length * 34 + 26;
    const x = v => L + (v - a) / (b - a) * (W - L - R);
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${c.aria || ""}" style="display:block;overflow:visible">`;
    for (let t = a; t <= b; t += c.step || 10) {
      s += `<line x1="${x(t)}" x2="${x(t)}" y1="4" y2="${H - 20}" stroke="var(--line)"/>`;
      s += `<text x="${x(t)}" y="${H - 4}" text-anchor="middle" font-size="11" fill="var(--muted)" font-family="var(--mono)">${t}</text>`;
    }
    c.rows.forEach((r, i) => {
      const y = 20 + i * 34;
      const vs = [r.pub, r.pri, c.me].filter(v => v != null);
      s += `<text x="0" y="${y + 4}" font-size="13" fill="var(--ink)" font-family="var(--sans)">${r.l}</text>`;
      s += `<line x1="${x(Math.min(...vs))}" x2="${x(Math.max(...vs))}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-width="6" stroke-linecap="round"/>`;
      if (r.pub != null) s += `<circle cx="${x(r.pub)}" cy="${y}" r="6.5" fill="var(--pub)"><title>Moyenne public ${fr(r.pub)}</title></circle>`;
      if (r.pri != null) s += `<circle cx="${x(r.pri)}" cy="${y}" r="5.5" fill="var(--surface)" stroke="var(--pri)" stroke-width="3"><title>Moyenne privé ${fr(r.pri)}</title></circle>`;
      if (c.me != null) s += `<rect x="${x(c.me) - 6}" y="${y - 6}" width="12" height="12" fill="var(--me)" transform="rotate(45 ${x(c.me)} ${y})"><title>Établissement ${fr(c.me)}</title></rect>`;
    });
    el.innerHTML = s + "</svg>";
  }

  function bars(el) {
    const c = JSON.parse(el.dataset.bars);
    const max = Math.max(...c.map(d => d.v)) * 1.15, W = 300, H = 80, bw = W / c.length;
    let s = `<svg viewBox="0 0 ${W} ${H + 18}" width="100%" style="display:block;max-width:360px;overflow:visible">`;
    c.forEach((d, i) => {
      const h = d.v / max * H, last = i === c.length - 1;
      s += `<rect x="${i * bw + 4}" y="${H - h}" width="${bw - 8}" height="${h}" rx="3" fill="${last ? "var(--ink)" : "var(--line)"}"/>`;
      s += `<text x="${i * bw + bw / 2}" y="${H - h - 4}" text-anchor="middle" font-size="10" fill="var(--muted)" font-family="var(--mono)">${d.v}</text>`;
      s += `<text x="${i * bw + bw / 2}" y="${H + 13}" text-anchor="middle" font-size="10" fill="var(--muted)" font-family="var(--mono)">${d.y}</text>`;
    });
    el.innerHTML = s + "</svg>";
  }

  function line(el) {
    const c = JSON.parse(el.dataset.line);
    const vs = c.flatMap(d => [d.v, d.pub, d.pri]).filter(v => v != null);
    const lo = Math.min(...vs) - 4, hi = Math.max(...vs) + 4, W = 300, H = 70;
    const x = i => 18 + i * (W - 36) / (c.length - 1), y = v => H - (v - lo) / (hi - lo) * H;
    const path = k => c.map((d, i) => d[k] == null ? "" : `${i ? "L" : "M"}${x(i)},${y(d[k])}`).join("");
    let s = `<svg viewBox="0 0 ${W} ${H + 18}" width="100%" style="display:block;max-width:360px;overflow:visible">`;
    s += `<path d="${path("pub")}" fill="none" stroke="var(--pub)" stroke-width="2"/>`;
    s += `<path d="${path("pri")}" fill="none" stroke="var(--pri)" stroke-width="2" stroke-dasharray="4 3"/>`;
    s += `<path d="${path("v")}" fill="none" stroke="var(--me)" stroke-width="2.5"/>`;
    c.forEach((d, i) => { s += `<text x="${x(i)}" y="${H + 13}" text-anchor="middle" font-size="10" fill="var(--muted)" font-family="var(--mono)">${d.y}</text>`; });
    el.innerHTML = s + "</svg>";
  }

  function hist(el) {
    const c = JSON.parse(el.dataset.hist);
    const max = Math.max(...c.pub, ...c.pri), W = 640, H = 150, n = c.pub.length, bw = (W - 30) / n;
    let s = `<svg viewBox="0 0 ${W} ${H + 20}" width="100%" style="display:block">`;
    c.pub.forEach((v, i) => {
      const hp = v / max * H, hq = c.pri[i] / max * H, x0 = 30 + i * bw;
      s += `<rect x="${x0 + 2}" y="${H - hp}" width="${bw / 2 - 3}" height="${hp}" rx="2" fill="var(--pub)"/>`;
      s += `<rect x="${x0 + bw / 2 + 1.5}" y="${H - hq + 1.5}" width="${bw / 2 - 6}" height="${Math.max(hq - 1.5, 0)}" rx="2" fill="var(--pri-soft)" stroke="var(--pri)" stroke-width="2"/>`;
      s += `<text x="${x0}" y="${H + 15}" font-size="10" fill="var(--muted)" font-family="var(--mono)">${c.from + i * c.step}</text>`;
    });
    if (c.me != null) { const xm = 30 + (c.me - c.from) / c.step * bw; s += `<line x1="${xm}" x2="${xm}" y1="0" y2="${H}" stroke="var(--me)" stroke-dasharray="3 3"/>`; }
    el.innerHTML = s + "</svg>";
  }

  document.querySelectorAll("[data-dot]").forEach(dot);
  document.querySelectorAll("[data-bars]").forEach(bars);
  document.querySelectorAll("[data-line]").forEach(line);
  document.querySelectorAll("[data-hist]").forEach(hist);

  // barres empilées à 100 % : catégories en rampe neutre, la couleur reste réservée au secteur
  function stack(el) {
    const c = JSON.parse(el.dataset.stack);
    const op = c.cats.map((_, i) => (0.92 - i * (0.72 / Math.max(c.cats.length - 1, 1))).toFixed(2));
    const mark = k => k === "me" ? '<i class="mk me"></i>' : k === "pub" ? '<i class="mk pub"></i>' : k === "pri" ? '<i class="mk pri"></i>' : '<i class="mk"></i>';
    let h = '<div class="stk">';
    c.rows.forEach(r => {
      const tot = r.v ? r.v.reduce((a, b) => a + b, 0) : 0;
      h += `<div class="stk-row${r.k === "me" ? " me" : ""}"><div class="stk-l">${mark(r.k)}${r.l}</div><div class="stk-bar">`;
      if (!r.v) h += `<span class="stk-na">${r.na || "non disponible"}</span>`;
      else r.v.forEach((v, i) => { const p = v / tot * 100; h += `<span style="width:${p}%;background:color-mix(in srgb, var(--ink) ${op[i] * 100}%, var(--surface))" title="${c.cats[i]} : ${fr(p, 0)} %">${p >= 9 ? fr(p, 0) : ""}</span>`; });
      h += "</div></div>";
    });
    h += '</div><div class="stk-leg">' + c.cats.map((k, i) => `<span><i style="background:color-mix(in srgb, var(--ink) ${op[i] * 100}%, var(--surface))"></i>${k}</span>`).join("") + "</div>";
    el.innerHTML = h;
  }
  document.querySelectorAll("[data-stack]").forEach(stack);

  // bascule de thème pour la maquette (sur le site : automatique, + choix mémorisé)
  document.querySelectorAll(".theme").forEach(b => b.addEventListener("click", () => {
    const r = document.documentElement, cur = r.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    r.dataset.theme = cur === "dark" ? "light" : "dark";
  }));

  // tri de tableau (maquette)
  document.querySelectorAll("table[data-sortable]").forEach(t => {
    t.querySelectorAll("th.sort").forEach((th, idx) => th.addEventListener("click", () => {
      const col = [...th.parentNode.children].indexOf(th), body = t.tBodies[0];
      const asc = !(th.classList.contains("on") && th.dataset.dir === "asc");
      t.querySelectorAll("th.sort").forEach(o => o.classList.remove("on")); th.classList.add("on"); th.dataset.dir = asc ? "asc" : "desc";
      th.style.setProperty("--d", asc ? "'↑'" : "'↓'");
      const get = tr => { const v = tr.children[col].dataset.v ?? tr.children[col].textContent.trim(); const f = parseFloat(String(v).replace(/\s/g, "").replace(",", ".")); return isNaN(f) ? v : f; };
      [...body.rows].sort((a, b) => { const x = get(a), y = get(b); const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "fr"); return asc ? r : -r; }).forEach(r => body.appendChild(r));
    }));
  });
})();
