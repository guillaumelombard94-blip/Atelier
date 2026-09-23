
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const fmt = (b) => b < 1024 ? b + " o" : b < 1048576 ? (b/1024).toFixed(0) + " Ko" : (b/1048576).toFixed(b < 10485760 ? 2 : 1) + " Mo";
  const baseName = (n) => n.replace(/\.[^.]+$/, "");
  const esc = (s) => s.replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "lib/pdf.worker.min.js";
  }

  /* ---------- Téléchargement ---------- */
  let downloadsP = null;
  function getDownloads(){
    if (!downloadsP) {
      downloadsP = (window.claude && typeof window.claude.use === "function")
        ? window.claude.use("downloads").catch(() => null)
        : Promise.resolve(null);
    }
    return downloadsP;
  }
  getDownloads();
  async function saveFile(filename, blob, statusEl){
    const dl = await getDownloads();
    if (dl) {
      try {
        await dl.save({ filename, data: blob });
        setStatus(statusEl, "Enregistré : " + filename);
      } catch (e) {
        const code = e && e.code;
        if (code === "declined") setStatus(statusEl, "Téléchargement annulé.");
        else if (code === "rate_limited") setStatus(statusEl, "Une demande est déjà ouverte, réessaie dans un instant.", true);
        else if (code === "too_large") setStatus(statusEl, "Fichier trop volumineux pour être enregistré ici.", true);
        else setStatus(statusEl, "Le téléchargement n'est pas disponible ici.", true);
      }
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function setStatus(el, msg, err){ el.textContent = msg; el.classList.toggle("err", !!err); }

  /* ---------- Onglets ---------- */
  const tabs = [...document.querySelectorAll(".tab")];
  function selectTab(t){
    tabs.forEach(x => {
      const on = x === t;
      x.setAttribute("aria-selected", on); x.tabIndex = on ? 0 : -1;
      $(x.getAttribute("aria-controls")).hidden = !on;
    });
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => selectTab(t));
    t.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
        selectTab(n); n.focus();
      }
    });
  });

  /* ---------- Zones de dépôt ---------- */
  const handlers = {};
  document.querySelectorAll(".drop").forEach(z => {
    const input = $(z.dataset.input);
    z.addEventListener("click", () => input.click());
    z.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
    z.addEventListener("dragover", (e) => { e.preventDefault(); z.classList.add("over"); });
    z.addEventListener("dragleave", () => z.classList.remove("over"));
    z.addEventListener("drop", (e) => {
      e.preventDefault(); z.classList.remove("over");
      handlers[input.id]([...e.dataTransfer.files]);
    });
    input.addEventListener("change", () => { handlers[input.id]([...input.files]); input.value = ""; });
  });

  /* ---------- Résultat avant / après ---------- */
  function renderGain(container, before, after, extraHTML){
    const pct = before > 0 ? Math.round((1 - after / before) * 100) : 0;
    const max = Math.max(before, after);
    const gainTxt = pct > 0 ? `−${pct}\u202f%` : pct === 0 ? "0\u202f%" : `+${-pct}\u202f%`;
    const sub = pct > 0 ? "de poids en moins" : "pas de gain sur ce fichier";
    container.innerHTML = `
      <p class="gain ${pct > 0 ? "" : "neutral"}">${gainTxt}<small>${sub}</small></p>
      <div class="bars">
        <span class="lbl">Avant</span><div class="track"><div class="fill before"></div></div><span class="val">${fmt(before)}</span>
        <span class="lbl">Après</span><div class="track"><div class="fill after"></div></div><span class="val">${fmt(after)}</span>
      </div>${extraHTML || ""}`;
    container.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      container.querySelector(".fill.before").style.width = (before / max * 100) + "%";
      container.querySelector(".fill.after").style.width = Math.max(1, after / max * 100) + "%";
    }));
  }

  const isPdf = (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

  /* ================= FUSION ================= */
  let mergeFiles = [];
  handlers["in-merge"] = (files) => {
    const pdfs = files.filter(isPdf);
    if (pdfs.length < files.length) setStatus($("merge-status"), "Certains fichiers ignorés : ce ne sont pas des PDF.", true);
    else setStatus($("merge-status"), "");
    mergeFiles.push(...pdfs); $("merge-result").hidden = true; renderMerge();
  };
  let dragIdx = null;
  function renderMerge(){
    const ul = $("merge-list"); ul.innerHTML = "";
    mergeFiles.forEach((f, i) => {
      const li = document.createElement("li"); li.className = "item"; li.draggable = true;
      li.innerHTML = `<span class="pos">${i+1}</span><span class="name" title="${esc(f.name)}">${esc(f.name)}</span><span class="size">${fmt(f.size)}</span>
        <button class="icon-btn" aria-label="Monter ${esc(f.name)}" ${i===0?"disabled":""}>↑</button>
        <button class="icon-btn" aria-label="Descendre ${esc(f.name)}" ${i===mergeFiles.length-1?"disabled":""}>↓</button>
        <button class="icon-btn" aria-label="Retirer ${esc(f.name)}">✕</button>`;
      const [up, down, rm] = li.querySelectorAll("button");
      up.onclick = () => { [mergeFiles[i-1], mergeFiles[i]] = [mergeFiles[i], mergeFiles[i-1]]; renderMerge(); };
      down.onclick = () => { [mergeFiles[i+1], mergeFiles[i]] = [mergeFiles[i], mergeFiles[i+1]]; renderMerge(); };
      rm.onclick = () => { mergeFiles.splice(i, 1); renderMerge(); };
      li.addEventListener("dragstart", (e) => { dragIdx = i; li.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", ""); });
      li.addEventListener("dragend", () => li.classList.remove("dragging"));
      li.addEventListener("dragover", (e) => { if (dragIdx !== null) e.preventDefault(); });
      li.addEventListener("drop", (e) => {
        e.preventDefault(); e.stopPropagation();
        if (dragIdx === null || dragIdx === i) return;
        const [m] = mergeFiles.splice(dragIdx, 1); mergeFiles.splice(i, 0, m); dragIdx = null; renderMerge();
      });
      ul.appendChild(li);
    });
    $("merge-go").disabled = mergeFiles.length < 2;
    $("merge-clear").hidden = mergeFiles.length === 0;
    if (mergeFiles.length === 1) setStatus($("merge-status"), "Ajoute au moins un deuxième PDF.");
  }
  $("merge-clear").onclick = () => { mergeFiles = []; $("merge-result").hidden = true; setStatus($("merge-status"), ""); renderMerge(); };
  $("merge-go").onclick = async () => {
    const st = $("merge-status"), btn = $("merge-go");
    btn.disabled = true;
    try {
      const out = await PDFLib.PDFDocument.create();
      let pages = 0;
      for (let i = 0; i < mergeFiles.length; i++) {
        setStatus(st, `Lecture de ${mergeFiles[i].name}…`);
        let src;
        try { src = await PDFLib.PDFDocument.load(await mergeFiles[i].arrayBuffer(), { ignoreEncryption: true }); }
        catch { throw new Error(`« ${mergeFiles[i].name} » est illisible ou protégé par mot de passe.`); }
        const copied = await out.copyPages(src, src.getPageIndices());
        copied.forEach(p => out.addPage(p)); pages += copied.length;
      }
      setStatus(st, "Assemblage…");
      const bytes = await out.save();
      const blob = new Blob([bytes], { type: "application/pdf" });
      const name = "fusion.pdf";
      const box = $("merge-result");
      box.innerHTML = `<p class="gain neutral" style="color:var(--ink)">${pages} pages<small>${mergeFiles.length} fichiers réunis, ${fmt(blob.size)}</small></p>
        <div class="actions"><button class="btn" id="merge-dl">Télécharger fusion.pdf</button></div>`;
      box.hidden = false;
      $("merge-dl").onclick = () => saveFile(name, blob, st);
      setStatus(st, "Fusion terminée.");
    } catch (e) {
      setStatus(st, e.message || "La fusion a échoué.", true);
    } finally { btn.disabled = mergeFiles.length < 2; }
  };

  /* ================= COMPRESSION PDF ================= */
  let cpdfFile = null;
  handlers["in-cpdf"] = (files) => {
    const f = files.find(isPdf);
    if (!f) { setStatus($("cpdf-status"), "Choisis un fichier PDF.", true); return; }
    cpdfFile = f; setStatus($("cpdf-status"), ""); $("cpdf-result").hidden = true;
    $("cpdf-list").innerHTML = `<li class="item"><span class="name" title="${esc(f.name)}">${esc(f.name)}</span><span class="size">${fmt(f.size)}</span><button class="icon-btn" aria-label="Retirer">✕</button></li>`;
    $("cpdf-list").querySelector("button").onclick = () => { cpdfFile = null; $("cpdf-list").innerHTML = ""; $("cpdf-go").disabled = true; $("cpdf-result").hidden = true; };
    $("cpdf-go").disabled = false;
  };
  const LEVELS = { light: { scale: 2.0, q: 0.8 }, medium: { scale: 1.5, q: 0.62 }, strong: { scale: 1.1, q: 0.45 } };
  $("cpdf-go").onclick = async () => {
    const st = $("cpdf-status"), btn = $("cpdf-go");
    if (!cpdfFile) return;
    if (!window.pdfjsLib) { setStatus(st, "Le moteur PDF n'a pas pu se charger. Recharge la page.", true); return; }
    btn.disabled = true;
    const lvl = LEVELS[document.querySelector('input[name="lvl"]:checked').value];
    try {
      setStatus(st, "Ouverture du PDF…");
      const data = new Uint8Array(await cpdfFile.arrayBuffer());
      let doc;
      try { doc = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise; }
      catch (e) { throw new Error(e && e.name === "PasswordException" ? "Ce PDF est protégé par mot de passe." : "Ce PDF est illisible."); }
      const out = await PDFLib.PDFDocument.create();
      const canvas = document.createElement("canvas"); const ctx = canvas.getContext("2d");
      for (let n = 1; n <= doc.numPages; n++) {
        setStatus(st, `Page ${n} sur ${doc.numPages}…`);
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: lvl.scale });
        canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        const jpg = await new Promise(r => canvas.toBlob(r, "image/jpeg", lvl.q));
        const img = await out.embedJpg(await jpg.arrayBuffer());
        const p = out.addPage([base.width, base.height]);
        p.drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });
        page.cleanup();
      }
      setStatus(st, "Finalisation…");
      const bytes = await out.save();
      let blob = new Blob([bytes], { type: "application/pdf" });
      const worse = blob.size >= cpdfFile.size;
      const name = baseName(cpdfFile.name) + "-compresse.pdf";
      renderGain($("cpdf-result"), cpdfFile.size, blob.size,
        (worse ? `<p class="note">Ce PDF est déjà bien optimisé (souvent du texte pur). Essaie « Forte », ou garde l'original.</p>` : "") +
        `<div class="actions"><button class="btn" id="cpdf-dl">Télécharger ${esc(name)}</button></div>`);
      $("cpdf-dl").onclick = () => saveFile(name, blob, st);
      setStatus(st, "Compression terminée.");
      doc.destroy();
    } catch (e) {
      setStatus(st, e.message || "La compression a échoué.", true);
    } finally { btn.disabled = !cpdfFile; }
  };

  /* ================= MASQUER & RÉÉCRIRE ================= */
  const rd = { file: null, doc: null, n: 1, total: 0, dims: {}, boxes: {}, sel: null, task: null, uid: 0 };
  const rdStage = $("rd-stage"), rdCanvas = $("rd-canvas"), rdOv = $("rd-overlay");
  handlers["in-red"] = async (files) => {
    const f = files.find(isPdf), st = $("rd-status");
    if (!f) { setStatus(st, "Choisis un fichier PDF.", true); return; }
    if (!window.pdfjsLib) { setStatus(st, "Le moteur PDF n'a pas pu se charger. Recharge la page.", true); return; }
    try {
      if (rd.doc) rd.doc.destroy();
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false }).promise;
      Object.assign(rd, { file: f, doc, n: 1, total: doc.numPages, dims: {}, boxes: {}, sel: null });
      $("rd-work").hidden = false; $("rd-result").hidden = true;
      setStatus(st, `${f.name} : ${doc.numPages} page${doc.numPages > 1 ? "s" : ""}.`);
      await rdRender();
    } catch (e) {
      setStatus(st, e && e.name === "PasswordException" ? "Ce PDF est protégé par mot de passe." : "Ce PDF est illisible.", true);
    }
  };
  async function rdDims(n){
    if (!rd.dims[n]) { const p = await rd.doc.getPage(n); const v = p.getViewport({ scale: 1 }); rd.dims[n] = { w: v.width, h: v.height }; }
    return rd.dims[n];
  }
  async function rdRender(){
    if (!rd.doc) return;
    const page = await rd.doc.getPage(rd.n);
    const base = page.getViewport({ scale: 1 }); rd.dims[rd.n] = { w: base.width, h: base.height };
    const cssW = rdStage.clientWidth || 600, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vp = page.getViewport({ scale: cssW / base.width * dpr });
    if (rd.task) { try { rd.task.cancel(); } catch {} }
    rdCanvas.width = Math.ceil(vp.width); rdCanvas.height = Math.ceil(vp.height);
    const ctx = rdCanvas.getContext("2d");
    rd.task = page.render({ canvasContext: ctx, viewport: vp });
    try { await rd.task.promise; } catch { /* rendu annulé */ }
    $("rd-pg").textContent = `Page ${rd.n} / ${rd.total}`;
    $("rd-prev").disabled = rd.n <= 1; $("rd-next").disabled = rd.n >= rd.total;
    rdDrawBoxes();
  }
  const rdList = () => (rd.boxes[rd.n] ||= []);
  function rdK(){ const d = rd.dims[rd.n]; return d ? rdStage.clientWidth / d.w : 1; }
  function autoSize(b){ return Math.max(5, Math.min(40, Math.round(b.h * 0.62))); }
  function rdDrawBoxes(){
    const d = rd.dims[rd.n]; if (!d) return;
    const k = rdK(); rdStage.style.setProperty("--k", k);
    rdOv.innerHTML = "";
    rdList().forEach(b => {
      const el = document.createElement("div"); el.className = "rbox" + (rd.sel === b ? " sel" : "");
      el.style.left = (b.x / d.w * 100) + "%"; el.style.top = (b.y / d.h * 100) + "%";
      el.style.width = (b.w / d.w * 100) + "%"; el.style.height = (b.h / d.h * 100) + "%";
      el.style.background = b.fill === "none" ? "transparent" : b.fill;
      el.style.color = b.color; el.style.fontSize = (b.size * k) + "px";
      const sp = document.createElement("span"); sp.textContent = b.text; el.appendChild(sp);
      if (rd.sel === b) { const h = document.createElement("div"); h.className = "hdl"; el.appendChild(h); }
      el.dataset.id = b.id;
      rdOv.appendChild(el);
    });
    rdSyncEditor();
  }
  function rdSyncEditor(){
    const b = rd.sel, ed = $("rd-edit");
    ed.hidden = !b; if (!b) return;
    if (document.activeElement !== $("rd-text")) $("rd-text").value = b.text;
    $("rd-fill").value = b.fill; $("rd-color").value = b.color;
    if (document.activeElement !== $("rd-size")) $("rd-size").value = b.size;
  }
  function rdPt(e){
    const r = rdOv.getBoundingClientRect(), d = rd.dims[rd.n];
    return { x: Math.max(0, Math.min(d.w, (e.clientX - r.left) / r.width * d.w)), y: Math.max(0, Math.min(d.h, (e.clientY - r.top) / r.height * d.h)) };
  }
  function newBox(x, y, w, h, text){
    const b = { id: ++rd.uid, x, y, w, h, fill: "#ffffff", color: "#000000", text: text || "", size: 0 };
    b.size = autoSize(b); return b;
  }
  let rdDrag = null;
  rdOv.addEventListener("pointerdown", (e) => {
    if (!rd.doc || e.button > 0) return;
    e.preventDefault(); rdOv.setPointerCapture(e.pointerId);
    const p = rdPt(e);
    const hit = e.target.closest(".rbox");
    if (hit) {
      const b = rdList().find(x => x.id === +hit.dataset.id);
      rd.sel = b;
      rdDrag = { mode: e.target.classList.contains("hdl") ? "resize" : "move", b, p0: p, o: { x: b.x, y: b.y, w: b.w, h: b.h } };
      rdDrawBoxes();
    } else {
      rd.sel = null;
      const ghost = document.createElement("div"); ghost.className = "rbox drawing"; rdOv.appendChild(ghost);
      rdDrag = { mode: "draw", p0: p, ghost };
      rdSyncEditor();
    }
  });
  rdOv.addEventListener("pointermove", (e) => {
    if (!rdDrag) return;
    const p = rdPt(e), d = rd.dims[rd.n], g = rdDrag;
    if (g.mode === "draw") {
      const x = Math.min(p.x, g.p0.x), y = Math.min(p.y, g.p0.y), w = Math.abs(p.x - g.p0.x), h = Math.abs(p.y - g.p0.y);
      Object.assign(g.ghost.style, { left: x/d.w*100+"%", top: y/d.h*100+"%", width: w/d.w*100+"%", height: h/d.h*100+"%" });
      g.rect = { x, y, w, h };
    } else if (g.mode === "move") {
      g.b.x = Math.max(0, Math.min(d.w - g.o.w, g.o.x + p.x - g.p0.x));
      g.b.y = Math.max(0, Math.min(d.h - g.o.h, g.o.y + p.y - g.p0.y));
      rdDrawBoxes();
    } else {
      g.b.w = Math.max(6, g.o.w + p.x - g.p0.x); g.b.h = Math.max(6, g.o.h + p.y - g.p0.y);
      rdDrawBoxes();
    }
  });
  const rdEnd = () => {
    const g = rdDrag; rdDrag = null; if (!g) return;
    if (g.mode === "draw") {
      g.ghost.remove();
      if (g.rect && g.rect.w > 4 && g.rect.h > 4) {
        const b = newBox(g.rect.x, g.rect.y, g.rect.w, g.rect.h);
        rdList().push(b); rd.sel = b;
      }
      rdDrawBoxes();
      if (rd.sel) $("rd-text").focus({ preventScroll: true });
    }
  };
  rdOv.addEventListener("pointerup", rdEnd); rdOv.addEventListener("pointercancel", rdEnd);

  $("rd-text").addEventListener("input", (e) => { if (rd.sel) { rd.sel.text = e.target.value; rdDrawBoxes(); } });
  $("rd-fill").addEventListener("change", (e) => {
    if (!rd.sel) return; rd.sel.fill = e.target.value;
    if (e.target.value === "#000000" && rd.sel.color === "#000000") rd.sel.color = "#ffffff";
    if (e.target.value !== "#000000" && e.target.value !== "none" && rd.sel.color === "#ffffff") rd.sel.color = "#000000";
    rdDrawBoxes();
  });
  $("rd-color").addEventListener("change", (e) => { if (rd.sel) { rd.sel.color = e.target.value; rdDrawBoxes(); } });
  $("rd-size").addEventListener("input", (e) => { const v = +e.target.value; if (rd.sel && v >= 4 && v <= 96) { rd.sel.size = v; rdDrawBoxes(); } });
  $("rd-del").onclick = () => { if (!rd.sel) return; rd.boxes[rd.n] = rdList().filter(b => b !== rd.sel); rd.sel = null; rdDrawBoxes(); };
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Delete" || e.key === "Backspace") && rd.sel && !$("p-red").hidden && !/^(TEXTAREA|INPUT|SELECT)$/.test(document.activeElement.tagName)) {
      e.preventDefault(); $("rd-del").click();
    }
  });
  $("rd-prev").onclick = () => { if (rd.n > 1) { rd.n--; rd.sel = null; rdRender(); } };
  $("rd-next").onclick = () => { if (rd.n < rd.total) { rd.n++; rd.sel = null; rdRender(); } };
  $("rd-clearpage").onclick = () => { rd.boxes[rd.n] = []; rd.sel = null; rdDrawBoxes(); };
  let rdResizeT; window.addEventListener("resize", () => { clearTimeout(rdResizeT); rdResizeT = setTimeout(() => { if (rd.doc && !$("p-red").hidden) rdRender(); }, 150); });
  tabs.forEach(t => t.addEventListener("click", () => { if (t.id === "t-red" && rd.doc) setTimeout(rdRender, 0); }));

  // Recherche d'un mot sur toutes les pages
  $("rd-find").onclick = async () => {
    const st = $("rd-status"), term = $("rd-term").value.trim(), repl = $("rd-repl").value;
    if (!rd.doc) return;
    if (!term) { setStatus(st, "Écris le mot à chercher.", true); $("rd-term").focus(); return; }
    const needle = term.toLocaleLowerCase("fr");
    let found = 0;
    for (let n = 1; n <= rd.total; n++) {
      setStatus(st, `Recherche page ${n} sur ${rd.total}…`);
      const page = await rd.doc.getPage(n);
      const vp = page.getViewport({ scale: 1 }); rd.dims[n] = { w: vp.width, h: vp.height };
      const tc = await page.getTextContent();
      for (const it of tc.items) {
        if (!it.str) continue;
        const hay = it.str.toLocaleLowerCase("fr");
        let idx = hay.indexOf(needle);
        if (idx < 0) continue;
        const t = pdfjsLib.Util.transform(vp.transform, it.transform);
        const fh = Math.hypot(t[2], t[3]) || 10;
        const len = it.str.length;
        while (idx >= 0) {
          const pad = fh * 0.15;
          const x = t[4] + it.width * (idx / len) - pad;
          const w = it.width * (term.length / len) + pad * 2;
          const y = t[5] - fh * 0.95, h = fh * 1.25;
          const b = newBox(x, y, w, h, repl);
          b.size = Math.max(5, Math.round(fh * 0.9));
          (rd.boxes[n] ||= []).push(b); found++;
          idx = hay.indexOf(needle, idx + needle.length);
        }
      }
    }
    rd.sel = null; rdDrawBoxes();
    if (found) setStatus(st, `${found} occurrence${found > 1 ? "s" : ""} de « ${term} » masquée${found > 1 ? "s" : ""}. Vérifie chaque page, puis crée le PDF.`);
    else setStatus(st, `« ${term} » introuvable. Si c'est un scan, le texte n'est pas lisible par la recherche : trace les zones à la main.`, true);
  };

  function wrapLines(ctx, text, maxW){
    const out = [];
    text.split("\n").forEach(par => {
      const words = par.split(/(\s+)/); let line = "";
      words.forEach(w => {
        const test = line + w;
        if (ctx.measureText(test).width > maxW && line.trim()) { out.push(line.trimEnd()); line = w.trimStart(); }
        else line = test;
      });
      out.push(line);
    });
    return out;
  }
  $("rd-go").onclick = async () => {
    const st = $("rd-status"), btn = $("rd-go");
    if (!rd.doc) return;
    const count = Object.values(rd.boxes).reduce((a, l) => a + l.length, 0);
    if (!count) { setStatus(st, "Aucune zone : trace au moins une zone ou utilise la recherche.", true); return; }
    btn.disabled = true;
    try {
      const out = await PDFLib.PDFDocument.create();
      const S = 2.2;
      const c = document.createElement("canvas"), ctx = c.getContext("2d");
      for (let n = 1; n <= rd.total; n++) {
        setStatus(st, `Page ${n} sur ${rd.total}…`);
        const page = await rd.doc.getPage(n);
        const base = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: S });
        c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        for (const b of (rd.boxes[n] || [])) {
          if (b.fill !== "none") { ctx.fillStyle = b.fill; ctx.fillRect(b.x*S, b.y*S, b.w*S, b.h*S); }
          if (b.text.trim()) {
            ctx.save();
            ctx.beginPath(); ctx.rect(b.x*S, b.y*S, b.w*S, b.h*S); ctx.clip();
            const fs = b.size * S, lh = fs * 1.15, padX = 2 * S;
            ctx.font = `${fs}px Helvetica, Arial, sans-serif`; ctx.fillStyle = b.color; ctx.textBaseline = "middle";
            const lines = wrapLines(ctx, b.text, b.w*S - padX*2);
            let y = b.y*S + b.h*S/2 - (lines.length - 1) * lh / 2;
            lines.forEach(l => { ctx.fillText(l, b.x*S + padX, y); y += lh; });
            ctx.restore();
          }
        }
        const jpg = await new Promise(r => c.toBlob(r, "image/jpeg", 0.88));
        const img = await out.embedJpg(await jpg.arrayBuffer());
        const p = out.addPage([base.width, base.height]);
        p.drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });
        page.cleanup();
      }
      setStatus(st, "Finalisation…");
      const blob = new Blob([await out.save()], { type: "application/pdf" });
      const name = baseName(rd.file.name) + "-modifie.pdf";
      const box = $("rd-result");
      box.innerHTML = `<p class="gain neutral" style="color:var(--ink)">${count} zone${count > 1 ? "s" : ""}<small>appliquée${count > 1 ? "s" : ""} sur ${rd.total} page${rd.total > 1 ? "s" : ""}, ${fmt(blob.size)}</small></p>
        <div class="actions"><button class="btn" id="rd-dl">Télécharger ${esc(name)}</button></div>`;
      box.hidden = false;
      $("rd-dl").onclick = () => saveFile(name, blob, st);
      setStatus(st, "PDF modifié prêt.");
    } catch (e) {
      setStatus(st, "La création du PDF a échoué.", true);
    } finally { btn.disabled = false; }
  };

  /* ================= COMPRESSION IMAGES ================= */
  let imgFiles = [];
  const isImg = (f) => /^image\/(jpeg|png|webp)$/.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name);
  handlers["in-img"] = (files) => {
    const ok = files.filter(isImg);
    setStatus($("img-status"), ok.length < files.length ? "Certains fichiers ignorés (formats acceptés : JPEG, PNG, WebP)." : "", ok.length < files.length);
    imgFiles.push(...ok); $("img-result").hidden = true; renderImgList();
  };
  function renderImgList(){
    const ul = $("img-list"); ul.innerHTML = "";
    imgFiles.forEach((f, i) => {
      const li = document.createElement("li"); li.className = "item";
      li.innerHTML = `<span class="name" title="${esc(f.name)}">${esc(f.name)}</span><span class="size">${fmt(f.size)}</span><button class="icon-btn" aria-label="Retirer ${esc(f.name)}">✕</button>`;
      li.querySelector("button").onclick = () => { imgFiles.splice(i, 1); renderImgList(); };
      ul.appendChild(li);
    });
    $("img-go").disabled = imgFiles.length === 0;
    $("img-clear").hidden = imgFiles.length === 0;
  }
  $("img-clear").onclick = () => { imgFiles = []; $("img-result").hidden = true; setStatus($("img-status"), ""); renderImgList(); };
  $("img-q").addEventListener("input", (e) => $("q-out").textContent = e.target.value);

  function loadImage(file){
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file); const im = new Image();
      im.onload = () => { res({ im, url }); };
      im.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Image illisible : " + file.name)); };
      im.src = url;
    });
  }
  const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  let thumbUrls = [];
  $("img-go").onclick = async () => {
    const st = $("img-status"), btn = $("img-go");
    btn.disabled = true;
    thumbUrls.forEach(u => URL.revokeObjectURL(u)); thumbUrls = [];
    const q = +$("img-q").value / 100, maxW = +$("img-w").value, fSel = $("img-f").value;
    const results = []; let before = 0, after = 0;
    try {
      for (let i = 0; i < imgFiles.length; i++) {
        const f = imgFiles[i];
        setStatus(st, `Image ${i+1} sur ${imgFiles.length}…`);
        const { im, url } = await loadImage(f);
        let w = im.naturalWidth, h = im.naturalHeight;
        if (maxW && w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        const ctx = c.getContext("2d");
        let type = fSel === "keep" ? (EXT[f.type] ? f.type : "image/jpeg") : fSel;
        if (type === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); }
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(im, 0, 0, w, h);
        URL.revokeObjectURL(url);
        let blob = await new Promise(r => c.toBlob(r, type, q));
        if (!blob || (type === "image/webp" && blob.type !== "image/webp")) {
          type = "image/jpeg"; ctx.fillStyle = "#fff"; ctx.globalCompositeOperation = "destination-over"; ctx.fillRect(0,0,w,h);
          blob = await new Promise(r => c.toBlob(r, type, q));
        }
        let kept = false;
        if (blob.size >= f.size && fSel === "keep" && !(maxW && im.naturalWidth > maxW)) { blob = f; kept = true; }
        const name = kept ? f.name : `${baseName(f.name)}-min.${EXT[type]}`;
        before += f.size; after += blob.size;
        results.push({ name, blob, orig: f.size, kept, dims: `${w}×${h}` });
      }
      const cards = results.map((r, i) => {
        const u = URL.createObjectURL(r.blob); thumbUrls.push(u);
        const pct = Math.round((1 - r.blob.size / r.orig) * 100);
        return `<div class="thumb"><img src="${u}" alt=""><div class="meta"><span class="n" title="${esc(r.name)}">${esc(r.name)}</span>
          <span class="s">${fmt(r.orig)} → ${fmt(r.blob.size)} ${pct > 0 ? `<b>−${pct}\u202f%</b>` : ""}</span><span class="s">${r.dims}${r.kept ? " · original conservé" : ""}</span></div>
          <button class="btn ghost" data-i="${i}">Télécharger</button></div>`;
      }).join("");
      renderGain($("img-result"), before, after,
        (results.length > 1 ? `<div class="actions"><button class="btn" id="img-zip">Tout télécharger (.zip)</button></div>` : "") +
        `<div class="thumbs">${cards}</div>`);
      $("img-result").querySelectorAll(".thumb button").forEach(b => b.onclick = () => { const r = results[+b.dataset.i]; saveFile(r.name, r.blob, st); });
      const zb = $("img-zip");
      if (zb) zb.onclick = async () => {
        if (!window.JSZip) { setStatus(st, "Le module ZIP n'a pas pu se charger. Télécharge les images une par une.", true); return; }
        zb.disabled = true; setStatus(st, "Création du ZIP…");
        const zip = new JSZip(); const used = new Set();
        results.forEach(r => { let n = r.name, k = 2; while (used.has(n)) n = baseName(r.name) + "-" + (k++) + "." + r.name.split(".").pop(); used.add(n); zip.file(n, r.blob); });
        const z = await zip.generateAsync({ type: "blob", compression: "STORE" });
        zb.disabled = false;
        saveFile("images-compressees.zip", z, st);
      };
      setStatus(st, `${results.length} image${results.length > 1 ? "s" : ""} traitée${results.length > 1 ? "s" : ""}.`);
    } catch (e) {
      setStatus(st, e.message || "La compression a échoué.", true);
    } finally { btn.disabled = imgFiles.length === 0; }
  };

  /* ================= OUVERTURE DEPUIS L'EXTÉRIEUR ================= */
  function openFiles(files){
    const imgs = files.filter(isImg), pdfs = files.filter(isPdf);
    if (imgs.length && !pdfs.length) { selectTab($("t-img")); handlers["in-img"](imgs); return; }
    if (pdfs.length > 1) { selectTab($("t-merge")); handlers["in-merge"](pdfs); return; }
    if (pdfs.length === 1) {
      const dlg = $("pick"); $("pick-name").textContent = pdfs[0].name;
      dlg.querySelectorAll("button").forEach(b => b.onclick = () => {
        dlg.close(); const t = $(b.value); selectTab(t);
        const map = { "t-red": "in-red", "t-cpdf": "in-cpdf", "t-merge": "in-merge" };
        handlers[map[b.value]]([pdfs[0]]);
      });
      if (dlg.showModal) dlg.showModal(); else { selectTab($("t-red")); handlers["in-red"]([pdfs[0]]); }
    }
  }
  // Ouvert depuis le clic droit « Ouvrir avec » du Chromebook (appli installée)
  if ("launchQueue" in window) {
    window.launchQueue.setConsumer(async (params) => {
      if (!params.files || !params.files.length) return;
      const files = await Promise.all(params.files.map(h => h.getFile()));
      openFiles(files);
    });
  }
  // Ouvert depuis le clic droit de l'extension Chrome (?src=adresse du fichier)
  const srcUrl = new URLSearchParams(location.search).get("src");
  if (srcUrl) (async () => {
    try {
      const r = await fetch(srcUrl);
      if (!r.ok) throw new Error();
      const blob = await r.blob();
      let name = decodeURIComponent((new URL(srcUrl, location.href).pathname.split("/").pop() || "fichier")).slice(0, 120);
      let type = blob.type;
      if (!/\.(pdf|jpe?g|png|webp)$/i.test(name)) {
        const ext = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[type];
        if (ext) name = (name.replace(/\.[^.]*$/, "") || "fichier") + "." + ext;
      }
      if (!type || type === "application/octet-stream") type = /\.pdf$/i.test(name) ? "application/pdf" : "";
      const f = new File([blob], name, { type });
      if (!isPdf(f) && !isImg(f)) { alert("Ce fichier n'est ni un PDF ni une image JPEG, PNG ou WebP."); return; }
      openFiles([f]);
      history.replaceState(null, "", location.pathname);
    } catch {
      alert("Impossible de récupérer ce fichier. Télécharge-le puis dépose-le dans l'atelier.");
    }
  })();
  // Mode hors ligne pour la version site installable
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
