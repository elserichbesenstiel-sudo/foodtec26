(() => {
  // ============================
  // Firebase init (foodtec26)
  // ============================
  const firebaseConfig = {
    apiKey: "AIzaSyBpEwbSZgs3agOf48j5FU91Yx-r1__HF6A",
    authDomain: "foodtec26.firebaseapp.com",
    projectId: "foodtec26",
    storageBucket: "foodtec26.firebasestorage.app",
    messagingSenderId: "227220894528",
    appId: "1:227220894528:web:2588691a45dee930ee00a5"
  };
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

  const db = firebase.firestore();
  const storage = firebase.storage();

  // ============================
  // Helpers
  // ============================
  const $ = (id) => document.getElementById(id);

  const fmtDT = (d) => {
    if (!d) return "—";
    const dd = (d.toDate ? d.toDate() : (d instanceof Date ? d : new Date(d)));
    return dd.toLocaleString("de-DE");
  };

  const nowISO = () => new Date().toISOString().replace(/[:.]/g, "-");

  function shorten(s, n){
    s = (s||"").toString();
    return s.length > n ? s.slice(0, n-1) + "…" : s;
  }
  function escapeHtml(s){
    return (s ?? "").toString()
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  }

  // ✅ Mobile/CORS-robust: Bild direkt als <img> laden (kein fetch->blob)
  const loadImage = (url) => new Promise((resolve, reject) => {
    const img = new Image();
    // WICHTIG: nicht "anonymous" erzwingen — token-URLs zicken auf Mobile sonst gerne
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = url;
  });

  // ============================
  // BV / Fallback (v1)
  // ============================
  const BV = { id: "sandritter", name: "Sandritter" };
  $("bvName").textContent = BV.name;
  $("uploaderFallback").textContent = "für " + BV.name;
  $("uploaderName").value = "für " + BV.name;

  // ============================
  // Connection indicator
  // ============================
  const dot = $("dot");
  const connTxt = $("connTxt");
  (async () => {
    try{
      await db.collection("_ping").doc("x").get();
      dot.classList.add("ok");
      connTxt.textContent = "Verbunden ✅";
    }catch(e){
      dot.classList.remove("ok");
      connTxt.textContent = "Fehler ❌";
      console.error(e);
    }
  })();

  // ============================
  // State
  // ============================
  const COL = "sketch_notes";
  const SUB = "versions";

  let notesUnsub = null;
  let versionsUnsub = null;

  let notes = [];
  let activeNoteId = null;
  let activeVersions = [];
  let creating = false;

  // ============================
  // UI refs
  // ============================
  const listEl = $("list");
  const emptyHint = $("emptyHint");
  const qEl = $("q");

  const noteIdTag = $("noteIdTag");
  const uploaderEl = $("uploaderName");
  const titleEl = $("title");
  const noteEl = $("note");
  const btnSave = $("btnSave");
  const btnDelete = $("btnDelete");

  const timeInfo = $("timeInfo");

  const fileEl = $("file");
  const btnUpload = $("btnUpload");
  const btnFreeSketch = $("btnFreeSketch");
  const btnMeasure = $("btnMeasure");
  const uploadStatus = $("uploadStatus");
  const preview = $("preview");
  const storePathHint = $("storePathHint");
  const versionsEl = $("versions");

  // ============================
  // Queries
  // ============================
  const notesQuery = () => db.collection(COL)
    .where("bvId","==",BV.id)
    .orderBy("updatedAt","desc");

  // ============================
  // Render list
  // ============================
  const renderList = () => {
    const q = (qEl.value || "").trim().toLowerCase();
    const filtered = !q ? notes : notes.filter(n => {
      const t = (n.title||"").toLowerCase();
      const b = (n.note||"").toLowerCase();
      return t.includes(q) || b.includes(q);
    });

    listEl.innerHTML = "";
    emptyHint.style.display = filtered.length ? "none" : "block";

    filtered.forEach(n => {
      const div = document.createElement("div");
      div.className = "item" + (n.id === activeNoteId ? " active" : "");
      div.innerHTML = `
        <div class="t">${escapeHtml(n.title || ("Neue Skizze – " + BV.name))}</div>
        <div class="s">
          <span>🧱 ${escapeHtml(n.bvName || BV.name)}</span>
          <span>🕒 ${escapeHtml(fmtDT(n.createdAt))}</span>
        </div>
        ${(n.note||"").trim() ? `<div class="muted" style="margin-top:8px">${escapeHtml(shorten(n.note, 72))}</div>` : ""}
      `;
      div.onclick = () => selectNote(n.id);
      listEl.appendChild(div);
    });
  };

  // ============================
  // Live notes
  // ============================
  const subscribeNotes = () => {
    if (notesUnsub) notesUnsub();
    notesUnsub = notesQuery().onSnapshot((snap) => {
      notes = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      renderList();

      if (activeNoteId){
        const found = notes.find(n => n.id === activeNoteId);
        if (found) setActive(found, { keepFields:true });
      }
    }, (err) => console.error(err));
  };

  const selectNote = (id) => {
    const n = notes.find(x => x.id === id);
    if (!n) return;
    setActive(n);
  };

  const setActive = (n, opts={}) => {
    activeNoteId = n.id;

    noteIdTag.textContent = n.id || "—";
    uploaderEl.value = (opts.keepFields ? uploaderEl.value : (n.uploaderName || ("für " + BV.name)));
    titleEl.value = (opts.keepFields ? titleEl.value : (n.title || ("Neue Skizze – " + BV.name)));
    noteEl.value = (opts.keepFields ? noteEl.value : (n.note || ""));

    const c = n.createdAt ? fmtDT(n.createdAt) : "—";
    const u = n.updatedAt ? fmtDT(n.updatedAt) : "—";
    timeInfo.textContent = `Erstellt: ${c} • Update: ${u}`;

    // enable actions
    btnDelete.disabled = false;
    btnSave.disabled = false;
    fileEl.disabled = false;
    btnUpload.disabled = !fileEl.files?.length;
    btnFreeSketch.disabled = false;

    // measure depends on versions
    btnMeasure.disabled = activeVersions.length === 0;

    storePathHint.textContent = `sketches/${BV.id}/${n.id}/vX-…`;

    subscribeVersions(n.id);
    renderList();
  };

  // ============================
  // Versions subscribe
  // ============================
  const subscribeVersions = (noteId) => {
    if (versionsUnsub) versionsUnsub();
    versionsEl.innerHTML = "";
    preview.innerHTML = `<span class="muted">Keine Vorschau</span>`;
    activeVersions = [];
    btnMeasure.disabled = true;

    versionsUnsub = db.collection(COL).doc(noteId).collection(SUB)
      .orderBy("createdAt","desc")
      .onSnapshot((snap) => {
        activeVersions = snap.docs.map(d => ({ id:d.id, ...d.data() }));
        renderVersions();
        btnMeasure.disabled = activeVersions.length === 0;
      }, (err) => console.error(err));
  };

  const renderVersions = () => {
    versionsEl.innerHTML = "";
    if (!activeVersions.length){
      versionsEl.innerHTML = `<div class="muted">Noch keine Versionen.</div>`;
      return;
    }

    const latest = activeVersions[0];
    if (latest?.downloadURL){
      preview.innerHTML = `<img alt="Vorschau" src="${latest.downloadURL}" />`;
    }

    activeVersions.forEach((v, idx) => {
      const div = document.createElement("div");
      div.className = "ver";
      const label = v.label || `v${activeVersions.length - idx}`;
      const created = fmtDT(v.createdAt);
      const type = v.source || "file";
      div.innerHTML = `
        <div class="top">
          <b>${escapeHtml(label)} • ${escapeHtml(created)}</b>
          <span class="meta">
            <span class="tag">👤 ${escapeHtml(v.uploadedByName || "—")}</span>
            <span class="tag">🔎 ${escapeHtml(v.method || "manual")}</span>
            <span class="tag">🧩 ${escapeHtml(type)}</span>
          </span>
        </div>
        <div style="margin-top:10px" class="row">
          ${v.downloadURL ? `<a class="link" target="_blank" rel="noopener" href="${v.downloadURL}">🔗 Öffnen</a>` : ""}
        </div>
        <div class="mono" style="margin-top:10px;word-break:break-all">${escapeHtml(v.storagePath || "")}</div>
      `;
      versionsEl.appendChild(div);
    });
  };

  // ============================
  // Create new note
  // ============================
  $("btnNew").onclick = async () => {
    if (creating) return;
    creating = true;
    $("btnNew").disabled = true;

    try{
      const doc = await db.collection(COL).add({
        bvId: BV.id,
        bvName: BV.name,
        uploaderName: "für " + BV.name,
        title: "Neue Skizze – " + BV.name,
        note: "",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      const snap = await db.collection(COL).doc(doc.id).get();
      if (snap.exists) setActive({id:snap.id, ...snap.data()});
    }catch(e){
      console.error(e);
      alert("Fehler beim Anlegen der Notiz: " + (e.message || e));
    }finally{
      creating = false;
      $("btnNew").disabled = false;
    }
  };

  // ============================
  // Save note
  // ============================
  btnSave.onclick = async () => {
    if (!activeNoteId) return alert("Bitte zuerst eine Notiz auswählen.");
    btnSave.disabled = true;
    try{
      await db.collection(COL).doc(activeNoteId).set({
        uploaderName: uploaderEl.value.trim() || ("für " + BV.name),
        title: titleEl.value.trim() || ("Neue Skizze – " + BV.name),
        note: noteEl.value || "",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge:true });

      uploadStatus.textContent = "Notiz gespeichert ✅";
    }catch(e){
      console.error(e);
      alert("Speichern fehlgeschlagen: " + (e.message || e));
    }finally{
      btnSave.disabled = false;
    }
  };

  // ============================
  // Delete note
  // ============================
  btnDelete.onclick = async () => {
    if (!activeNoteId) return;
    const ok = confirm("Notiz wirklich löschen?\n(Versionen-Einträge werden mit gelöscht, Storage-Dateien bleiben vorerst.)");
    if (!ok) return;

    btnDelete.disabled = true;
    try{
      const subSnap = await db.collection(COL).doc(activeNoteId).collection(SUB).get();
      const batch = db.batch();
      subSnap.forEach(d => batch.delete(d.ref));
      batch.delete(db.collection(COL).doc(activeNoteId));
      await batch.commit();

      activeNoteId = null;
      noteIdTag.textContent = "kein Datensatz";
      titleEl.value = "";
      noteEl.value = "";
      btnUpload.disabled = true;
      btnFreeSketch.disabled = true;
      btnMeasure.disabled = true;
      uploadStatus.textContent = "—";
      preview.innerHTML = `<span class="muted">Keine Vorschau</span>`;
      versionsEl.innerHTML = "";
    }catch(e){
      console.error(e);
      alert("Löschen fehlgeschlagen: " + (e.message || e));
    }finally{
      btnDelete.disabled = false;
    }
  };

  // ============================
  // Upload file as new version
  // ============================
  fileEl.addEventListener("change", () => {
    btnUpload.disabled = !activeNoteId || !fileEl.files?.length;
  });

  btnUpload.onclick = async () => {
    if (!activeNoteId) return alert("Bitte zuerst eine Notiz auswählen.");
    const f = fileEl.files?.[0];
    if (!f) return;

    btnUpload.disabled = true;
    uploadStatus.textContent = "Upload läuft…";

    try{
      const topLabel = activeVersions[0]?.label || "v0";
      const current = parseInt((topLabel+"").replace("v",""), 10) || 0;
      const verNo = current + 1;

      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const name = `v${verNo}-${nowISO()}-${(f.name || "upload").replace(/\s+/g,"_")}`;
      const storagePath = `sketches/${BV.id}/${activeNoteId}/${name}.${ext}`;

      const ref = storage.ref().child(storagePath);
      const meta = { contentType: f.type || "image/jpeg" };
      const up = await ref.put(f, meta);
      const downloadURL = await up.ref.getDownloadURL();

      await db.collection(COL).doc(activeNoteId).collection(SUB).add({
        label: `v${verNo}`,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        storagePath,
        downloadURL,
        uploadedByName: uploaderEl.value.trim() || ("für " + BV.name),
        method: "manual",
        source: "file"
      });

      uploadStatus.textContent = "Upload fertig ✅";
      fileEl.value = "";
      btnUpload.disabled = true;

    }catch(e){
      console.error(e);
      uploadStatus.textContent = "Upload fehlgeschlagen ❌";
      alert("Upload fehlgeschlagen: " + (e.message || e));
    }finally{
      btnUpload.disabled = !activeNoteId || !fileEl.files?.length;
    }
  };

  // ============================
  // Free sketch modal (blank canvas)
  // ============================
  const freeModal = $("freeModal");
  const freeCanvas = $("freeCanvas");
  const fctx = freeCanvas.getContext("2d");

  let freeTool = "pen";
  let freeColor = $("freeColor").value;
  let freeSize = parseInt($("freeSize").value,10);
  let freeDown = false;
  let freeLast = null;

  const freeUndoStack = [];
  const freeRedoStack = [];

  const freeSnapshot = () => {
    freeUndoStack.push(fctx.getImageData(0,0,freeCanvas.width,freeCanvas.height));
    if (freeUndoStack.length > 30) freeUndoStack.shift();
    freeRedoStack.length = 0;
    $("freeHint").textContent = "Stroke gespeichert (Undo möglich)";
  };

  const freeSetTool = (t) => {
    freeTool = t;
    $("freePen").classList.toggle("active", t==="pen");
    $("freeEraser").classList.toggle("active", t==="eraser");
  };

  const freeOpen = () => {
    if (!activeNoteId) return alert("Bitte zuerst eine Notiz auswählen.");
    freeModal.classList.add("open");
    fctx.clearRect(0,0,freeCanvas.width,freeCanvas.height);
    freeUndoStack.length = 0;
    freeRedoStack.length = 0;
    $("freeHint").textContent = "";
    freeSetTool("pen");
  };

  $("btnFreeSketch").onclick = freeOpen;
  $("freeClose").onclick = () => freeModal.classList.remove("open");
  $("freePen").onclick = () => freeSetTool("pen");
  $("freeEraser").onclick = () => freeSetTool("eraser");
  $("freeColor").oninput = (e) => freeColor = e.target.value;
  $("freeSize").oninput = (e) => freeSize = parseInt(e.target.value,10);

  $("freeUndo").onclick = () => {
    if (!freeUndoStack.length) return;
    const cur = fctx.getImageData(0,0,freeCanvas.width,freeCanvas.height);
    freeRedoStack.push(cur);
    const prev = freeUndoStack.pop();
    fctx.putImageData(prev,0,0);
  };

  $("freeRedo").onclick = () => {
    if (!freeRedoStack.length) return;
    const cur = fctx.getImageData(0,0,freeCanvas.width,freeCanvas.height);
    freeUndoStack.push(cur);
    const next = freeRedoStack.pop();
    fctx.putImageData(next,0,0);
  };

  $("freeClear").onclick = () => {
    freeSnapshot();
    fctx.clearRect(0,0,freeCanvas.width,freeCanvas.height);
  };

  const freePos = (ev) => {
    const r = freeCanvas.getBoundingClientRect();
    const x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
    const y = (ev.touches ? ev.touches[0].clientY : ev.clientY) - r.top;
    const sx = freeCanvas.width / r.width;
    const sy = freeCanvas.height / r.height;
    return { x: x*sx, y: y*sy };
  };

  const freeDraw = (a,b) => {
    fctx.lineCap = "round";
    fctx.lineJoin = "round";
    fctx.lineWidth = freeSize;
    if (freeTool === "eraser"){
      fctx.globalCompositeOperation = "destination-out";
      fctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      fctx.globalCompositeOperation = "source-over";
      fctx.strokeStyle = freeColor;
    }
    fctx.beginPath();
    fctx.moveTo(a.x,a.y);
    fctx.lineTo(b.x,b.y);
    fctx.stroke();
  };

  const freeDownFn = (ev) => {
    ev.preventDefault();
    freeSnapshot();
    freeDown = true;
    freeLast = freePos(ev);
  };
  const freeMoveFn = (ev) => {
    if (!freeDown) return;
    ev.preventDefault();
    const p = freePos(ev);
    freeDraw(freeLast, p);
    freeLast = p;
  };
  const freeUpFn = () => {
    freeDown = false;
    freeLast = null;
  };

  freeCanvas.addEventListener("mousedown", freeDownFn);
  freeCanvas.addEventListener("mousemove", freeMoveFn);
  window.addEventListener("mouseup", freeUpFn);
  freeCanvas.addEventListener("touchstart", freeDownFn, {passive:false});
  freeCanvas.addEventListener("touchmove", freeMoveFn, {passive:false});
  window.addEventListener("touchend", freeUpFn);

  $("freeSave").onclick = async () => {
    if (!activeNoteId) return;
    $("freeSave").disabled = true;
    $("freeHint").textContent = "Speichere PNG & lade hoch…";

    try{
      const blob = await new Promise(res => freeCanvas.toBlob(res, "image/png", 0.92));
      if (!blob) throw new Error("PNG konnte nicht erzeugt werden.");

      const topLabel = activeVersions[0]?.label || "v0";
      const current = parseInt((topLabel+"").replace("v",""), 10) || 0;
      const verNo = current + 1;

      const storagePath = `sketches/${BV.id}/${activeNoteId}/v${verNo}-${nowISO()}-skizze-${BV.id}.png`;

      const ref = storage.ref().child(storagePath);
      const up = await ref.put(blob, { contentType:"image/png" });
      const downloadURL = await up.ref.getDownloadURL();

      await db.collection(COL).doc(activeNoteId).collection(SUB).add({
        label: `v${verNo}`,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        storagePath,
        downloadURL,
        uploadedByName: uploaderEl.value.trim() || ("für " + BV.name),
        method: "manual",
        source: "canvas"
      });

      $("freeHint").textContent = "Gespeichert ✅ (neue Version erstellt)";
      freeModal.classList.remove("open");
    }catch(e){
      console.error(e);
      alert("Speichern fehlgeschlagen: " + (e.message || e));
    }finally{
      $("freeSave").disabled = false;
    }
  };

  // ============================
  // Measure overlay (Mobile Fix)
  // ============================
  const measureModal = $("measureModal");
  const mCanvas = $("measureCanvas");
  const mctx = mCanvas.getContext("2d");

  let mTool = "select";
  let mColor = $("mColor").value;
  let mWidth = parseInt($("mWidth").value,10);
  let mTextVal = $("mTextInput").value;

  let mObjects = [];
  let mUndo = [];
  let mRedo = [];
  let mBaseImg = null;
  let mBaseLoaded = false;

  let mDown = false;
  let mStart = null;
  let mTemp = null;
  let mSel = null;
  let mDragMode = null;
  let mLastPos = null;

  const mSnap = () => {
    mUndo.push(JSON.stringify(mObjects));
    if (mUndo.length > 40) mUndo.shift();
    mRedo.length = 0;
  };

  const mSetTool = (t) => {
    mTool = t;
    $("mSelect").classList.toggle("active", t==="select");
    $("mDim").classList.toggle("active", t==="dim");
    $("mText").classList.toggle("active", t==="text");
    $("mHint").textContent =
      t==="dim" ? "Ziehe eine Maßlinie. Danach wird der Text aus dem Eingabefeld übernommen." :
      t==="text" ? "Tippe ins Bild, um Text zu setzen." :
      "Auswahl: Objekt antippen und ziehen. Bei Maßlinie: Endpunkt ziehen.";
  };

  $("mSelect").onclick = () => mSetTool("select");
  $("mDim").onclick = () => mSetTool("dim");
  $("mText").onclick = () => mSetTool("text");
  $("mColor").oninput = (e) => { mColor = e.target.value; renderMeasure(); };
  $("mWidth").oninput = (e) => { mWidth = parseInt(e.target.value,10); renderMeasure(); };
  $("mTextInput").oninput = (e) => mTextVal = e.target.value;

  $("mUndo").onclick = () => {
    if (!mUndo.length) return;
    mRedo.push(JSON.stringify(mObjects));
    mObjects = JSON.parse(mUndo.pop());
    mSel = null;
    renderMeasure();
  };
  $("mRedo").onclick = () => {
    if (!mRedo.length) return;
    mUndo.push(JSON.stringify(mObjects));
    mObjects = JSON.parse(mRedo.pop());
    mSel = null;
    renderMeasure();
  };
  $("mClear").onclick = () => {
    mSnap();
    mObjects = [];
    mSel = null;
    renderMeasure();
  };

  const mFitCanvas = () => {
    // mobile: Canvas auf Fensterbreite fitten (bleibt 900 intern, aber Anzeige stabil)
    // wir lassen width/height intern 900, UI skaliert über CSS/Container
    // reicht hier.
  };

  const mOpen = async () => {
    if (!activeNoteId) return alert("Bitte zuerst eine Notiz auswählen.");
    if (!activeVersions.length) return alert("Bitte erst eine Version (Foto) hochladen – dann Maß-Overlay.");

    const baseUrl = activeVersions[0].downloadURL;

    mBaseLoaded = false;
    mObjects = [];
    mUndo = [];
    mRedo = [];
    mSel = null;
    mTemp = null;
    mSetTool("select");

    measureModal.classList.add("open");
    $("mHint").textContent = "Lade Bild…";
    mFitCanvas();

    try{
      // ✅ Mobile Fix: Direktes Image-Load
      mBaseImg = await loadImage(baseUrl);
      mBaseLoaded = true;
      renderMeasure();
      $("mHint").textContent = "Bereit ✅ Zieh eine Maßlinie (📏 Maßlinie) und setze Maße.";
    }catch(e){
      console.error(e);
      $("mHint").textContent = "Fehler ❌ Bild konnte nicht geladen werden.";
      alert("Overlay konnte das Bild nicht laden (Mobile/CORS). Ich öffne das Bild im Tab – dann nochmal Overlay.");
      window.open(baseUrl, "_blank");
    }
  };

  $("btnMeasure").onclick = mOpen;
  $("measureClose").onclick = () => measureModal.classList.remove("open");

  const mPos = (ev) => {
    const r = mCanvas.getBoundingClientRect();
    const x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
    const y = (ev.touches ? ev.touches[0].clientY : ev.clientY) - r.top;
    const sx = mCanvas.width / r.width;
    const sy = mCanvas.height / r.height;
    return { x: x*sx, y: y*sy };
  };

  const dist = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);

  const hitDim = (obj, p) => {
    const p1 = {x:obj.x1,y:obj.y1}, p2={x:obj.x2,y:obj.y2};
    if (dist(p,p1) < 16) return { hit:true, mode:"p1" };
    if (dist(p,p2) < 16) return { hit:true, mode:"p2" };

    const A = p1, B = p2;
    const ABx = B.x-A.x, ABy=B.y-A.y;
    const APx = p.x-A.x, APy=p.y-A.y;
    const ab2 = ABx*ABx + ABy*ABy;
    const t = ab2 ? Math.max(0, Math.min(1, (APx*ABx + APy*ABy)/ab2)) : 0;
    const proj = { x: A.x + t*ABx, y: A.y + t*ABy };
    const d = dist(p, proj);
    return d < 14 ? { hit:true, mode:"move" } : { hit:false };
  };

  const hitText = (obj, p) => {
    const size = obj.size || 32;
    const w = Math.max(60, (obj.text||"").length * (size*0.55));
    const h = size*1.2;
    return (p.x >= obj.x - w/2 && p.x <= obj.x + w/2 && p.y >= obj.y - h/2 && p.y <= obj.y + h/2);
  };

  const pickObject = (p) => {
    for (let i=mObjects.length-1; i>=0; i--){
      const o = mObjects[i];
      if (o.type === "dim"){
        const h = hitDim(o,p);
        if (h.hit) return { index:i, mode:h.mode };
      } else if (o.type === "text"){
        if (hitText(o,p)) return { index:i, mode:"move" };
      }
    }
    return null;
  };

  const roundRect = (ctx, x, y, w, h, r) => {
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr, y);
    ctx.arcTo(x+w, y, x+w, y+h, rr);
    ctx.arcTo(x+w, y+h, x, y+h, rr);
    ctx.arcTo(x, y+h, x, y, rr);
    ctx.arcTo(x, y, x+w, y, rr);
    ctx.closePath();
  };

  const drawArrow = (ctx, x, y, angle, size, color) => {
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.lineTo(-size, size*0.55);
    ctx.lineTo(-size, -size*0.55);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  const drawDim = (ctx, o) => {
    const color = o.color || "#fff";
    const w = o.w || 4;
    const size = Math.max(10, (o.arrowSize || 14) + (w*0.3));

    const x1=o.x1, y1=o.y1, x2=o.x2, y2=o.y2;
    const ang = Math.atan2(y2-y1, x2-x1);

    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1,y1);
    ctx.lineTo(x2,y2);
    ctx.stroke();

    drawArrow(ctx, x1, y1, ang, size, color);
    drawArrow(ctx, x2, y2, ang + Math.PI, size, color);

    const txt = (o.text || "").trim();
    if (txt){
      const mx = (x1+x2)/2;
      const my = (y1+y2)/2;

      ctx.save();
      ctx.translate(mx,my);

      let rot = ang;
      if (rot > Math.PI/2 || rot < -Math.PI/2) rot += Math.PI;
      ctx.rotate(rot);

      const fontFam = getComputedStyle(document.body).fontFamily || "system-ui";
      const fs = Math.max(22, 18 + w*2);
      ctx.font = `800 ${fs}px ${fontFam}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";

      const padX = 10, padY = 6;
      const metrics = ctx.measureText(txt);
      const bw = metrics.width + padX*2;
      const bh = fs + padY*2;

      ctx.fillStyle = "rgba(0,0,0,.45)";
      roundRect(ctx, -bw/2, -bh, bw, bh, 10);
      ctx.fill();

      ctx.fillStyle = color;
      ctx.fillText(txt, 0, -padY);
      ctx.restore();
    }
  };

  const drawText = (ctx, o) => {
    const color = o.color || "#fff";
    const size = o.size || 36;
    const txt = (o.text||"").trim();
    if (!txt) return;

    const fontFam = getComputedStyle(document.body).fontFamily || "system-ui";
    ctx.save();
    ctx.font = `900 ${size}px ${fontFam}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const m = ctx.measureText(txt);
    const w = m.width + 28;
    const h = size*1.15;

    ctx.fillStyle = "rgba(0,0,0,.45)";
    roundRect(ctx, o.x - w/2, o.y - h/2, w, h, 14);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.fillText(txt, o.x, o.y+1);
    ctx.restore();
  };

  const drawSelection = (ctx, o) => {
    ctx.save();
    ctx.strokeStyle = "rgba(69,200,106,.8)";
    ctx.lineWidth = 3;
    if (o.type==="dim"){
      ctx.beginPath(); ctx.arc(o.x1,o.y1,10,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(o.x2,o.y2,10,0,Math.PI*2); ctx.stroke();
    } else if (o.type==="text"){
      ctx.beginPath(); ctx.arc(o.x,o.y,10,0,Math.PI*2); ctx.stroke();
    }
    ctx.restore();
  };

  const drawBaseImageContained = (ctx, img) => {
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    ctx.clearRect(0,0,cw,ch);
    ctx.fillStyle = "rgba(0,0,0,.18)";
    ctx.fillRect(0,0,cw,ch);

    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const scale = Math.min(cw/iw, ch/ih);
    const w = iw*scale, h = ih*scale;
    const x = (cw - w)/2;
    const y = (ch - h)/2;

    ctx.drawImage(img, x, y, w, h);
    return { x, y, w, h, scale };
  };

  const renderMeasure = () => {
    if (!mBaseLoaded || !mBaseImg) return;

    drawBaseImageContained(mctx, mBaseImg);

    mObjects.forEach((o, idx) => {
      if (o.type==="dim") drawDim(mctx, o);
      if (o.type==="text") drawText(mctx, o);
      if (idx === mSel) drawSelection(mctx, o);
    });

    if (mTemp && mTemp.type==="dim") drawDim(mctx, mTemp);
  };

  const mDownFn = (ev) => {
    if (!mBaseLoaded) return;
    ev.preventDefault();

    const p = mPos(ev);
    mDown = true;
    mStart = p;
    mLastPos = p;

    if (mTool==="dim"){
      mTemp = {
        type:"dim",
        x1:p.x, y1:p.y, x2:p.x, y2:p.y,
        text:(mTextVal||"").trim(),
        color:mColor, w:mWidth, arrowSize:14
      };
    } else if (mTool==="text"){
      const txt = (mTextVal||"").trim();
      if (!txt){ mDown=false; return; }
      mSnap();
      mObjects.push({ type:"text", x:p.x, y:p.y, text:txt, color:mColor, size:36 });
      mSel = mObjects.length-1;
      mDown = false;
      renderMeasure();
    } else {
      const hit = pickObject(p);
      if (hit){
        mSel = hit.index;
        mDragMode = hit.mode;
      } else {
        mSel = null;
        mDragMode = null;
      }
      renderMeasure();
    }
  };

  const mMoveFn = (ev) => {
    if (!mDown || !mBaseLoaded) return;
    ev.preventDefault();

    const p = mPos(ev);

    if (mTool==="dim" && mTemp){
      mTemp.x2 = p.x; mTemp.y2 = p.y;
      renderMeasure();
      return;
    }

    if (mTool==="select" && mSel != null){
      const o = mObjects[mSel];
      const dx = p.x - mLastPos.x;
      const dy = p.y - mLastPos.y;

      if (mLastPos === mStart) mSnap();

      if (o.type==="dim"){
        if (mDragMode==="move"){
          o.x1 += dx; o.y1 += dy;
          o.x2 += dx; o.y2 += dy;
        } else if (mDragMode==="p1"){
          o.x1 = p.x; o.y1 = p.y;
        } else if (mDragMode==="p2"){
          o.x2 = p.x; o.y2 = p.y;
        }
      } else if (o.type==="text"){
        o.x += dx; o.y += dy;
      }

      mLastPos = p;
      renderMeasure();
    }
  };

  const mUpFn = () => {
    if (!mDown) return;
    mDown = false;

    if (mTool==="dim" && mTemp){
      const len = Math.hypot(mTemp.x2-mTemp.x1, mTemp.y2-mTemp.y1);
      if (len > 8){
        mSnap();
        mTemp.text = (mTextVal||mTemp.text||"").trim();
        mObjects.push(mTemp);
        mSel = mObjects.length-1;
      }
      mTemp = null;
      renderMeasure();
    }

    mDragMode = null;
  };

  mCanvas.addEventListener("mousedown", mDownFn);
  mCanvas.addEventListener("mousemove", mMoveFn);
  window.addEventListener("mouseup", mUpFn);
  mCanvas.addEventListener("touchstart", mDownFn, {passive:false});
  mCanvas.addEventListener("touchmove", mMoveFn, {passive:false});
  window.addEventListener("touchend", mUpFn);

  $("mExport").onclick = async () => {
    if (!activeNoteId || !mBaseLoaded) return;
    $("mExport").disabled = true;
    $("mHint").textContent = "Exportiere PNG & lade als neue Version hoch…";

    try{
      const blob = await new Promise(res => mCanvas.toBlob(res, "image/png", 0.92));
      if (!blob) throw new Error("PNG konnte nicht erzeugt werden.");

      const topLabel = activeVersions[0]?.label || "v0";
      const current = parseInt((topLabel+"").replace("v",""), 10) || 0;
      const verNo = current + 1;

      const storagePath = `sketches/${BV.id}/${activeNoteId}/v${verNo}-${nowISO()}-mass-${BV.id}.png`;

      const ref = storage.ref().child(storagePath);
      const up = await ref.put(blob, { contentType:"image/png" });
      const downloadURL = await up.ref.getDownloadURL();

      await db.collection(COL).doc(activeNoteId).collection(SUB).add({
        label: `v${verNo}`,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        storagePath,
        downloadURL,
        uploadedByName: uploaderEl.value.trim() || ("für " + BV.name),
        method: "manual",
        source: "measure-overlay",
        objects: mObjects
      });

      $("mHint").textContent = "Gespeichert ✅ (Overlay als neue Version)";
      measureModal.classList.remove("open");
    }catch(e){
      console.error(e);
      alert("Export fehlgeschlagen: " + (e.message || e));
    }finally{
      $("mExport").disabled = false;
    }
  };

  // ============================
  // Misc
  // ============================
  $("btnRefresh").onclick = () => {
    renderList();
    renderVersions();
    uploadStatus.textContent = "Aktualisiert ✅";
  };

  qEl.addEventListener("input", renderList);

  // initial
  subscribeNotes();

  // Default: disable editor until note selected
  btnSave.disabled = true;
  btnDelete.disabled = true;
  fileEl.disabled = true;
  btnUpload.disabled = true;
  btnFreeSketch.disabled = true;
  btnMeasure.disabled = true;

})();
