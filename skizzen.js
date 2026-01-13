/* FoodTec – Skizzen-Modul v2 (Firestore + Storage + Freie Skizze Canvas)
   - Notes: collection "sketch_notes"
   - Versions: subcollection "versions"
   - uploadedBy: Auth-ready (falls login vorhanden), sonst Fallback "für Sandritter"
*/

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
const auth = firebase.auth();

const BV_LABEL = "Sandritter";
const FALLBACK_DEFAULT = "für Sandritter";
const FALLBACK_KEY = "ft_sketch_uploader_fallback";

const elDot = document.getElementById("dot");
const elConn = document.getElementById("conn");
const elFallbackLabel = document.getElementById("fallbackLabel");

const elNotesList = document.getElementById("notesList");
const elNotesEmpty = document.getElementById("notesEmpty");
const elVersionsList = document.getElementById("versionsList");
const elVersionsEmpty = document.getElementById("versionsEmpty");

const elQ = document.getElementById("q");
const btnRefresh = document.getElementById("btnRefresh");
const btnNewNote = document.getElementById("btnNewNote");

const elNoteIdBadge = document.getElementById("noteIdBadge");
const elDetailTitle = document.getElementById("detailTitle");
const elUploaderName = document.getElementById("uploaderName");
const elTitle = document.getElementById("title");
const elText = document.getElementById("text");
const btnSaveNote = document.getElementById("btnSaveNote");
const btnDeleteNote = document.getElementById("btnDeleteNote");
const elNoteMeta = document.getElementById("noteMeta");

const elFile = document.getElementById("file");
const btnUpload = document.getElementById("btnUpload");
const btnSketch = document.getElementById("btnSketch");
const elUploadState = document.getElementById("uploadState");
const elBar = document.getElementById("bar");
const elImgPreview = document.getElementById("imgPreview");

/* Sketch modal elements */
const sketchModal = document.getElementById("sketchModal");
const canvasShell = document.getElementById("canvasShell");
const sketchCanvas = document.getElementById("sketchCanvas");
const sketchStatus = document.getElementById("sketchStatus");
const toolPen = document.getElementById("toolPen");
const toolEraser = document.getElementById("toolEraser");
const strokeColor = document.getElementById("strokeColor");
const strokeWidth = document.getElementById("strokeWidth");
const widthBadge = document.getElementById("widthBadge");
const btnUndo = document.getElementById("btnUndo");
const btnRedo = document.getElementById("btnRedo");
const btnClear = document.getElementById("btnClear");
const btnCloseSketch = document.getElementById("btnCloseSketch");
const btnSaveAsImage = document.getElementById("btnSaveAsImage");

let notesCache = [];
let selectedNoteId = null;
let selectedFile = null;

let isCreatingNote = false;
let isSavingNote = false;

function setConn(ok, text) {
  elDot.style.background = ok ? "var(--good)" : "var(--warn)";
  elConn.textContent = text;
}

function setProgress(pct) {
  elBar.style.width = `${pct}%`;
}

function fmtTs(ts) {
  if (!ts) return "";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString("de-DE");
  } catch { return ""; }
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, s => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[s]));
}

function safeName(name) {
  return (name || "file").replace(/[^\w.\-]+/g, "_");
}

function getFallbackName() {
  const v = (localStorage.getItem(FALLBACK_KEY) || "").trim();
  return v || FALLBACK_DEFAULT;
}

function setFallbackName(v) {
  const val = (v || "").trim() || FALLBACK_DEFAULT;
  localStorage.setItem(FALLBACK_KEY, val);
  elFallbackLabel.textContent = val;
}

function getAuthUser() {
  try { return auth.currentUser; } catch { return null; }
}

function buildUploadedBy() {
  const user = getAuthUser();
  const fallback = (elUploaderName.value || "").trim() || getFallbackName();

  if (user) {
    return { uid: user.uid, name: user.displayName || fallback, email: user.email || null, source: "auth" };
  }
  return { uid: null, name: fallback, email: null, source: "manual" };
}

function noteRef(noteId) {
  return db.collection("sketch_notes").doc(noteId);
}

function versionsRef(noteId) {
  return noteRef(noteId).collection("versions");
}

function updateUploadButton() {
  btnUpload.disabled = !selectedFile || !selectedNoteId;
}

function resetDetail() {
  elDetailTitle.textContent = "✍️ Skizzen-Modul v2";
  elNoteIdBadge.textContent = "kein Datensatz";
  elTitle.value = "";
  elText.value = "";
  elNoteMeta.textContent = "";
  elFile.value = "";
  selectedFile = null;
  elUploadState.textContent = "Status: bereit";
  setProgress(0);
  elImgPreview.style.display = "none";
  elImgPreview.src = "";
  elVersionsList.innerHTML = "";
  elVersionsEmpty.style.display = "none";
  btnDeleteNote.disabled = true;
  updateUploadButton();
}

function renderNotes() {
  const q = (elQ.value || "").trim().toLowerCase();
  const list = notesCache
    .filter(n => !q || (n.title || "").toLowerCase().includes(q) || (n.text || "").toLowerCase().includes(q))
    .sort((a,b) => {
      const at = a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
      const bt = b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
      return bt - at;
    });

  elNotesList.innerHTML = "";
  elNotesEmpty.style.display = list.length ? "none" : "block";

  for (const n of list) {
    const div = document.createElement("div");
    div.className = "item" + (n.id === selectedNoteId ? " active" : "");
    div.innerHTML = `
      <div class="t">${escapeHtml(n.title || "(ohne Titel)")}</div>
      <div class="s">
        <span>🧱 ${escapeHtml(n.bvLabel || BV_LABEL)}</span>
        <span>🕓 ${escapeHtml(fmtTs(n.updatedAt || n.createdAt) || "")}</span>
      </div>
      <div class="s">${escapeHtml((n.text || "").slice(0, 90))}${(n.text||"").length>90?"…":""}</div>
    `;
    div.addEventListener("click", () => selectNote(n.id));
    elNotesList.appendChild(div);
  }
}

async function loadNotes() {
  setConn(false, "Lade…");
  const snap = await db.collection("sketch_notes")
    .where("bvLabel", "==", BV_LABEL)
    .limit(200)
    .get();

  notesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  setConn(true, "Verbunden ✅");
  renderNotes();

  if (!selectedNoteId && notesCache.length) {
    await selectNote(notesCache[0].id);
  }
}

async function selectNote(noteId) {
  selectedNoteId = noteId;
  renderNotes();

  const doc = await noteRef(noteId).get();
  if (!doc.exists) {
    resetDetail();
    return;
  }
  const data = doc.data();

  elDetailTitle.textContent = "📝 Notiz";
  elNoteIdBadge.textContent = noteId;
  elTitle.value = data.title || "";
  elText.value = data.text || "";
  elNoteMeta.textContent = `Erstellt: ${fmtTs(data.createdAt)} • Update: ${fmtTs(data.updatedAt)}`;
  btnDeleteNote.disabled = false;

  await loadVersions(noteId);
  updateUploadButton();
}

async function loadVersions(noteId) {
  elVersionsList.innerHTML = "";
  elVersionsEmpty.style.display = "none";

  const snap = await versionsRef(noteId).orderBy("version", "desc").limit(50).get();
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (!items.length) {
    elVersionsEmpty.style.display = "block";
    elImgPreview.style.display = "none";
    elImgPreview.src = "";
    return;
  }

  const latest = items[0];
  if (latest.downloadUrl) {
    elImgPreview.src = latest.downloadUrl;
    elImgPreview.style.display = "block";
  }

  for (const v of items) {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="t">v${escapeHtml(String(v.version || "?"))} • ${escapeHtml(fmtTs(v.uploadedAt) || "")}</div>
      <div class="s">
        <span>👤 ${escapeHtml(v.uploadedBy?.name || "")}</span>
        <span>🔎 ${escapeHtml(v.uploadedBy?.source || "")}</span>
        <span>🧩 ${escapeHtml(v.sourceType || "file")}</span>
      </div>
      <div class="s">${v.downloadUrl ? `🔗 <a href="${escapeHtml(v.downloadUrl)}" target="_blank" rel="noopener">Öffnen</a>` : ""}</div>
      <div class="s muted"><code>${escapeHtml(v.path || "")}</code></div>
    `;
    div.addEventListener("click", () => {
      if (v.downloadUrl) {
        elImgPreview.src = v.downloadUrl;
        elImgPreview.style.display = "block";
      }
    });
    elVersionsList.appendChild(div);
  }
}

async function createNewNote() {
  if (isCreatingNote) return;
  isCreatingNote = true;
  btnNewNote.disabled = true;

  try {
    const uploadedBy = buildUploadedBy();
    const docRef = await db.collection("sketch_notes").add({
      bvLabel: BV_LABEL,
      title: `Neue Skizze – ${BV_LABEL}`,
      text: "",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: uploadedBy
    });

    await loadNotes();
    await selectNote(docRef.id);
  } finally {
    isCreatingNote = false;
    btnNewNote.disabled = false;
  }
}

async function saveNote() {
  if (isSavingNote) return;
  isSavingNote = true;
  btnSaveNote.disabled = true;

  try {
    if (!selectedNoteId) await createNewNote();

    const title = (elTitle.value || "").trim();
    const text = (elText.value || "").trim();
    const uploadedBy = buildUploadedBy();

    await noteRef(selectedNoteId).set({
      bvLabel: BV_LABEL,
      title: title || "(ohne Titel)",
      text,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastEditedBy: uploadedBy
    }, { merge: true });

    await loadNotes();
    await selectNote(selectedNoteId);
    updateUploadButton();
  } finally {
    isSavingNote = false;
    btnSaveNote.disabled = false;
  }
}

async function deleteNote() {
  if (!selectedNoteId) return;
  const ok = confirm("Wirklich löschen? (Notiz + Versionsliste in Firestore)\nHinweis: Dateien in Storage bleiben bestehen.");
  if (!ok) return;

  const vSnap = await versionsRef(selectedNoteId).limit(200).get();
  const batch = db.batch();
  vSnap.docs.forEach(d => batch.delete(d.ref));
  batch.delete(noteRef(selectedNoteId));
  await batch.commit();

  selectedNoteId = null;
  resetDetail();
  await loadNotes();
}

async function getNextVersionNumber(noteId) {
  const snap = await versionsRef(noteId).orderBy("version", "desc").limit(1).get();
  if (snap.empty) return 1;
  const v = snap.docs[0].data()?.version;
  return (typeof v === "number" ? v + 1 : 1);
}

/* ✅ Gemeinsamer Upload: File oder Canvas-Blob */
async function uploadBlobAsNewVersion(blob, filename, sourceType = "file") {
  if (!selectedNoteId) {
    alert("Bitte zuerst eine Notiz erstellen/speichern.");
    return;
  }
  if (!blob) return;

  btnUpload.disabled = true;
  btnSketch.disabled = true;
  elUploadState.textContent = "Status: Upload läuft …";
  setProgress(0);

  try {
    const versionNo = await getNextVersionNumber(selectedNoteId);

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${ts}-${safeName(filename || "skizze.png")}`;
    const path = `sketches/${BV_LABEL.toLowerCase()}/${selectedNoteId}/v${versionNo}-${fileName}`;

    const ref = storage.ref().child(path);

    const task = ref.put(blob, {
      contentType: blob.type || "image/png",
      cacheControl: "public,max-age=3600"
    });

    task.on("state_changed",
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        setProgress(pct);
        elUploadState.textContent = `Status: Upload ${pct}%`;
      },
      (err) => {
        console.error(err);
        elUploadState.innerHTML = `Status: <span class="bad">Fehler: ${err.message}</span>`;
        updateUploadButton();
        btnSketch.disabled = false;
      },
      async () => {
        const downloadUrl = await ref.getDownloadURL();
        const uploadedBy = buildUploadedBy();

        await versionsRef(selectedNoteId).add({
          version: versionNo,
          path,
          downloadUrl,
          uploadedAt: firebase.firestore.FieldValue.serverTimestamp(),
          uploadedBy,
          sourceType
        });

        await noteRef(selectedNoteId).set({
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          lastVersion: versionNo,
          lastVersionUrl: downloadUrl
        }, { merge: true });

        elImgPreview.src = downloadUrl;
        elImgPreview.style.display = "block";
        elUploadState.innerHTML = `Status: <span class="ok">Upload fertig ✅</span>`;
        setProgress(100);

        // Reset file input
        elFile.value = "";
        selectedFile = null;

        await loadVersions(selectedNoteId);
        await loadNotes();

        updateUploadButton();
        btnSketch.disabled = false;
      }
    );
  } catch (e) {
    console.error(e);
    elUploadState.innerHTML = `Status: <span class="bad">Fehler: ${e.message || e}</span>`;
    updateUploadButton();
    btnSketch.disabled = false;
  }
}

/* File Upload button */
async function uploadSelectedFile() {
  if (!selectedFile) return;
  await uploadBlobAsNewVersion(selectedFile, selectedFile.name, "file");
}

/* ======== Freie Skizze (Canvas) ======== */
const ctx = sketchCanvas.getContext("2d", { willReadFrequently: true });

let drawing = false;
let lastX = 0, lastY = 0;
let mode = "pen"; // pen | eraser

let undoStack = [];
let redoStack = [];

function setSketchStatus(t) { sketchStatus.textContent = t; }

function resizeCanvasToShell() {
  const rect = canvasShell.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  // preserve current drawing
  const prev = sketchCanvas.width ? sketchCanvas.toDataURL("image/png") : null;

  sketchCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
  sketchCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
  sketchCanvas.style.width = rect.width + "px";
  sketchCanvas.style.height = rect.height + "px";

  ctx.setTransform(1,0,0,1,0,0);
  ctx.scale(dpr, dpr);

  // background
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0,0,sketchCanvas.width,sketchCanvas.height);
  ctx.restore();

  if (prev) {
    const img = new Image();
    img.onload = () => {
      // draw previous image scaled
      const w = rect.width, h = rect.height;
      ctx.drawImage(img, 0, 0, w, h);
    };
    img.src = prev;
  } else {
    // initial blank snapshot for undo
    pushUndoSnapshot();
  }
}

function getCanvasPoint(ev) {
  const rect = sketchCanvas.getBoundingClientRect();
  const x = (ev.clientX - rect.left);
  const y = (ev.clientY - rect.top);
  return { x, y };
}

function applyToolStyle() {
  const w = parseInt(strokeWidth.value, 10) || 6;
  widthBadge.textContent = `${w} px`;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = w;

  if (mode === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = strokeColor.value || "#ffffff";
  }
}

function pushUndoSnapshot() {
  try {
    const dataUrl = sketchCanvas.toDataURL("image/png");
    undoStack.push(dataUrl);
    if (undoStack.length > 30) undoStack.shift(); // limit
    redoStack = [];
    btnUndo.disabled = undoStack.length <= 1;
    btnRedo.disabled = redoStack.length === 0;
  } catch {}
}

function restoreFromDataUrl(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const rect = sketchCanvas.getBoundingClientRect();
      ctx.save();
      ctx.setTransform(1,0,0,1,0,0);
      ctx.fillStyle = "#0b1220";
      ctx.fillRect(0,0,sketchCanvas.width,sketchCanvas.height);
      ctx.restore();
      ctx.drawImage(img, 0, 0, rect.width, rect.height);
      resolve();
    };
    img.src = dataUrl;
  });
}

async function sketchUndo() {
  if (undoStack.length <= 1) return;
  const current = undoStack.pop();
  redoStack.push(current);
  const prev = undoStack[undoStack.length - 1];
  await restoreFromDataUrl(prev);
  btnUndo.disabled = undoStack.length <= 1;
  btnRedo.disabled = redoStack.length === 0;
}

async function sketchRedo() {
  if (!redoStack.length) return;
  const next = redoStack.pop();
  undoStack.push(next);
  await restoreFromDataUrl(next);
  btnUndo.disabled = undoStack.length <= 1;
  btnRedo.disabled = redoStack.length === 0;
}

async function sketchClear() {
  const rect = sketchCanvas.getBoundingClientRect();
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0,0,sketchCanvas.width,sketchCanvas.height);
  ctx.restore();
  pushUndoSnapshot();
  setSketchStatus("Canvas geleert");
}

function openSketchModal() {
  sketchModal.classList.add("open");
  sketchModal.setAttribute("aria-hidden", "false");
  setSketchStatus("bereit");
  setTimeout(() => resizeCanvasToShell(), 50);
}

function closeSketchModal() {
  sketchModal.classList.remove("open");
  sketchModal.setAttribute("aria-hidden", "true");
}

async function saveCanvasAsVersion() {
  if (!selectedNoteId) {
    alert("Bitte zuerst eine Notiz erstellen/speichern.");
    return;
  }

  setSketchStatus("Exportiere…");
  btnSaveAsImage.disabled = true;

  const rect = sketchCanvas.getBoundingClientRect();

  // Export in Screen-Pixelgröße (sauber)
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = Math.max(1, Math.floor(rect.width));
  exportCanvas.height = Math.max(1, Math.floor(rect.height));
  const ectx = exportCanvas.getContext("2d");

  // draw current visible canvas scaled down
  const img = new Image();
  img.src = sketchCanvas.toDataURL("image/png");

  await new Promise((r) => { img.onload = r; });

  ectx.fillStyle = "#0b1220";
  ectx.fillRect(0,0,exportCanvas.width, exportCanvas.height);
  ectx.drawImage(img, 0, 0, exportCanvas.width, exportCanvas.height);

  exportCanvas.toBlob(async (blob) => {
    try {
      if (!blob) throw new Error("Kein Blob erzeugt");
      setSketchStatus("Upload läuft…");
      await uploadBlobAsNewVersion(blob, `skizze-${BV_LABEL}.png`, "canvas");
      setSketchStatus("Gespeichert ✅");
      closeSketchModal();
    } catch (e) {
      console.error(e);
      setSketchStatus("Fehler ❌");
      alert("Speichern fehlgeschlagen: " + (e.message || e));
    } finally {
      btnSaveAsImage.disabled = false;
    }
  }, "image/png", 0.92);
}

/* Pointer drawing */
function onPointerDown(ev) {
  ev.preventDefault();
  drawing = true;
  const p = getCanvasPoint(ev);
  lastX = p.x; lastY = p.y;
  applyToolStyle();
}

function onPointerMove(ev) {
  if (!drawing) return;
  ev.preventDefault();
  const p = getCanvasPoint(ev);
  applyToolStyle();
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  lastX = p.x; lastY = p.y;
}

function onPointerUp(ev) {
  if (!drawing) return;
  ev.preventDefault();
  drawing = false;
  pushUndoSnapshot();
  setSketchStatus("Stroke gespeichert (Undo möglich)");
}

/* Events */
btnRefresh.addEventListener("click", async () => {
  await loadNotes();
  if (selectedNoteId) await selectNote(selectedNoteId);
});

btnNewNote.addEventListener("click", async () => {
  await createNewNote();
});

btnSaveNote.addEventListener("click", async () => {
  await saveNote();
});

btnDeleteNote.addEventListener("click", async () => {
  await deleteNote();
});

elQ.addEventListener("input", () => renderNotes());

elFile.addEventListener("change", () => {
  selectedFile = elFile.files && elFile.files[0] ? elFile.files[0] : null;

  if (selectedFile) {
    elUploadState.textContent = `Status: Datei gewählt: ${selectedFile.name}`;
    setProgress(0);
  } else {
    elUploadState.textContent = "Status: bereit";
    setProgress(0);
  }

  updateUploadButton();
});

btnUpload.addEventListener("click", async () => {
  await uploadSelectedFile();
});

elUploaderName.addEventListener("change", () => {
  setFallbackName(elUploaderName.value);
});

/* Sketch UI events */
btnSketch.addEventListener("click", async () => {
  // Sicherheit: Note muss existieren
  if (!selectedNoteId) await createNewNote();
  openSketchModal();
});

btnCloseSketch.addEventListener("click", () => closeSketchModal());

toolPen.addEventListener("click", () => { mode = "pen"; toolPen.disabled = true; toolEraser.disabled = false; setSketchStatus("Stift aktiv"); });
toolEraser.addEventListener("click", () => { mode = "eraser"; toolEraser.disabled = true; toolPen.disabled = false; setSketchStatus("Radierer aktiv"); });

strokeWidth.addEventListener("input", () => applyToolStyle());
strokeColor.addEventListener("input", () => applyToolStyle());

btnUndo.addEventListener("click", async () => await sketchUndo());
btnRedo.addEventListener("click", async () => await sketchRedo());
btnClear.addEventListener("click", async () => await sketchClear());
btnSaveAsImage.addEventListener("click", async () => await saveCanvasAsVersion());

/* modal close on backdrop tap */
sketchModal.addEventListener("click", (e) => {
  if (e.target === sketchModal) closeSketchModal();
});

/* attach pointer events */
sketchCanvas.addEventListener("pointerdown", onPointerDown);
sketchCanvas.addEventListener("pointermove", onPointerMove);
sketchCanvas.addEventListener("pointerup", onPointerUp);
sketchCanvas.addEventListener("pointercancel", onPointerUp);
sketchCanvas.addEventListener("pointerleave", onPointerUp);

window.addEventListener("resize", () => {
  if (sketchModal.classList.contains("open")) resizeCanvasToShell();
});

/* Init */
(function init() {
  const fb = getFallbackName();
  elUploaderName.value = fb;
  elFallbackLabel.textContent = fb;

  // default tool states
  toolPen.disabled = true;
  toolEraser.disabled = false;
  btnUndo.disabled = true;
  btnRedo.disabled = true;

  setConn(false, "Verbinde…");
  resetDetail();

  loadNotes().catch(err => {
    console.error(err);
    setConn(false, "Fehler ❌");
  });
})();
