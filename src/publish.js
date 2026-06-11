// ============================================================
//  Sync43 — Project "Dash" tab: files, linking & publishing
//  (project-scoped; the project is already selected)
// ============================================================

let publishFiles   = null;          // working copy of SEED.localFiles
let pubProject     = null;          // selected project name (= active project)
let pubFolder      = null;          // selected folder name
let pubSelected    = new Set();     // selected file names in current folder
let pubBusy        = false;
let linkSelected   = new Set();     // selected file ids in the link dialog
let linkCwd        = ["C:","Work","CCT"]; // current dir in the browse view
let flashFile      = null;          // file name to flash after navigating from log

function pubKey(proj, folder) { return `${proj}::${folder}`; }

// ---- Issued-file archiving (audit record) ----------------------------------
function fmtDate(fmt, d) {
  const map = { YYYY: d.getFullYear(), YY: String(d.getFullYear()).slice(-2), MM: String(d.getMonth()+1).padStart(2,"0"), DD: String(d.getDate()).padStart(2,"0") };
  return (fmt || "YYMMDD").replace(/YYYY|YY|MM|DD/g, t => map[t]);
}
function archiveFolderName(d = new Date()) { return fmtDate(appSettings.dateFormat || "YYYYMMDD", d); }
function archiveFileName(file, d = new Date()) {
  const date = archiveFolderName(d);
  return (appSettings.namePattern || "{date}_{name}").replace("{date}", date).replace("{name}", file.name);
}

function ensurePublishFiles() {
  if (!publishFiles) publishFiles = JSON.parse(JSON.stringify(window.SEED.localFiles || {}));
}

function filesFor(proj, folder) {
  ensurePublishFiles();
  return publishFiles[pubKey(proj, folder)] || [];
}

function folderCount(proj, folder) {
  return filesFor(proj, folder).filter(f => f.state !== "synced").length;
}

// Folders the CURRENT user may manage in this project.
// Admins manage all folders; a regular user only manages their assigned folder.
function foldersForUserInProject(project) {
  if (!project) return [];
  if (isAdmin()) return project.folders;
  const me = project.users?.find(u => u.email.toLowerCase() === currentUser.email.toLowerCase());
  const eff = getEffectiveFolders(currentUser.email, me ? me.folders : []);
  if (!eff.folders.length || eff.folders.includes("all")) return project.folders;
  return project.folders.filter(f => eff.folders.includes(f));
}

// ---- Project Dash render ---------------------------------------------------
function renderProjectDash() {
  ensurePublishFiles();
  const proj = projects[activeProjectIndex];
  if (!proj) return;
  pubProject = proj.name;

  const myFolders = foldersForUserInProject(proj);
  if (!myFolders.includes(pubFolder)) {
    pubFolder = myFolders.find(f => filesFor(pubProject, f).length > 0) || myFolders[0] || null;
    pubSelected.clear();
  }

  const host = document.getElementById("proj-tab-dash");
  if (!host) return;

  const files = filesFor(pubProject, pubFolder);
  const scoped = !isAdmin() && myFolders.length < proj.folders.length;

  host.innerHTML = `
    <div class="publish-grid">
      <div class="publish-side">
        <div class="card side-card">
          <div class="side-section-title">${isAdmin() ? "Folders" : "My Folders"}</div>
          <div id="publish-folder-list" style="display:flex; flex-direction:column; gap:2px;"></div>
          ${scoped ? `<div style="font-size:10.5px; color:var(--color-text-tertiary); margin-top:8px; padding:0 2px; line-height:1.5;"><span class="mdi mdi-lock" style="font-size:12px;"></span> You can manage your assigned folder. An admin manages the rest.</div>` : ""}
        </div>
        <div class="card side-card">
          <div class="side-section-title">Sync</div>
          <div style="display:flex; align-items:center; gap:9px; font-size:11.5px; color:var(--color-text-secondary); margin-bottom:8px;">
            <span class="status-dot ${(typeof IS_TAURI!=="undefined"&&IS_TAURI)?"pending":"online"}"></span> ${(typeof IS_TAURI!=="undefined"&&IS_TAURI)?"Local mode — P2P in Stage 3":"Connected · 3 peers"}
          </div>
          <div style="display:flex; align-items:center; gap:9px; font-size:11.5px; color:var(--color-text-secondary);">
            <span class="mdi mdi-history" style="color:var(--color-green); font-size:16px;"></span>
            Keeping last <b style="color:var(--color-text-primary);">${appSettings.receivedKeep||5}</b> versions
          </div>
        </div>
      </div>

      <div class="publish-main">
        <div class="dropzone" id="publish-dropzone">
          <span class="mdi mdi-link-variant-plus"></span>
          <div class="dz-main">Link a file to ${pubFolder || "this folder"}</div>
          <div class="dz-sub">Search your files — Sync43 saves a managed copy to share &amp; version</div>
        </div>

        <div class="card" style="padding:0; overflow:hidden;">
          <div style="display:flex; align-items:center; justify-content:space-between; padding:14px 16px 12px;">
            <div class="section-label" style="margin:0;"><span class="mdi mdi-folder-outline"></span> ${pubFolder || "—"}</div>
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:11px; color:var(--color-text-tertiary);">${files.length} file${files.length!==1?"s":""}</span>
              <button class="btn btn-small" id="link-file-btn"><span class="mdi mdi-link-variant"></span> Link File</button>
            </div>
          </div>
          <div id="publish-file-area"></div>
        </div>

        <div id="publish-bar-host"></div>
      </div>
    </div>`;

  renderPublishFolderList();
  renderPublishFileTable();
  wireDropzone();
  document.getElementById("link-file-btn")?.addEventListener("click", openLinkFile);
}

function renderPublishFolderList() {
  const hostEl = document.getElementById("publish-folder-list");
  const proj = projects[activeProjectIndex];
  if (!hostEl || !proj) return;
  const myFolders = foldersForUserInProject(proj);
  hostEl.innerHTML = myFolders.map(f => {
    const n = folderCount(pubProject, f);
    const total = filesFor(pubProject, f).length;
    return `
      <div class="folder-pick ${f===pubFolder?"active":""}" data-folder="${f}">
        <span class="mdi mdi-folder-outline"></span>
        <span style="flex:1; overflow:hidden; text-overflow:ellipsis;">${f}</span>
        ${n>0 ? `<span class="fp-count">${n}</span>` : (total>0?`<span class="fp-count" style="background:transparent; color:var(--color-text-tertiary);">${total}</span>`:"")}
      </div>`;
  }).join("");
  hostEl.querySelectorAll(".folder-pick").forEach(el => {
    el.addEventListener("click", () => {
      pubFolder = el.dataset.folder;
      pubSelected.clear();
      renderProjectDash();
    });
  });
}

function renderPublishFileTable() {
  const area = document.getElementById("publish-file-area");
  if (!area) return;
  const files = filesFor(pubProject, pubFolder);
  if (files.length === 0) {
    area.innerHTML = `<div class="empty-state" style="padding:36px 20px;"><span class="mdi mdi-link-variant-off"></span><div class="es-main">No files linked here</div><div class="es-sub">Use <b>Link File</b> to bring a file into this folder for syncing.</div></div>`;
    renderPublishBar();
    return;
  }
  const publishable = files.filter(f => f.state !== "synced");
  const allSel = publishable.length > 0 && publishable.every(f => pubSelected.has(f.name));

  area.innerHTML = `
    <table class="file-table">
      <thead>
        <tr>
          <th style="width:34px;"><span class="ccheck ${allSel?"checked":""}" id="pub-select-all"><span class="mdi mdi-check"></span></span></th>
          <th>File</th>
          <th style="width:112px;">Status</th>
          <th style="width:96px;">Version</th>
          <th style="width:130px;">Modified</th>
        </tr>
      </thead>
      <tbody>
        ${files.map((f) => {
          const sel = pubSelected.has(f.name);
          const label = f.state === "new" ? (f.linked ? "Linked" : "New") : f.state === "modified" ? "Modified" : "Up to date";
          const pill  = f.state === "new" ? "pending" : f.state === "modified" ? "syncing" : "synced";
          const verText = f.state === "new" ? "—" : `v${f.version}`;
          return `
          <tr class="${sel?"row-selected":""}" data-name="${f.name}">
            <td><span class="ccheck ${sel?"checked":""} pub-check" data-name="${f.name}"><span class="mdi mdi-check"></span></span></td>
            <td>
              <div class="file-name">
                <span class="ficon"><span class="mdi ${fileIcon(f.name)}"></span></span>
                <div style="min-width:0;">
                  <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f.name} ${f.linked?'<span class="mdi mdi-link-variant" style="font-size:12px; color:var(--color-green); margin-left:2px;" title="Linked — managed copy"></span>':''}</div>
                  <div class="file-meta">${f.size}</div>
                </div>
              </div>
            </td>
            <td><span class="status-pill ${pill}"><span class="status-dot ${pill}"></span>${label}</span></td>
            <td><span class="ver-badge">${verText}</span>${(f.archives&&f.archives.length)?`<span class="ver-badge" style="margin-left:5px; color:var(--color-green);" title="${f.archives.length} archived issue${f.archives.length>1?"s":""}"><span class="mdi mdi-archive-outline" style="font-size:11px;"></span> ${f.archives.length}</span>`:""}</td>
            <td style="font-size:11px; color:var(--color-text-tertiary);">${f.modified}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;

  area.querySelectorAll(".pub-check").forEach(chk => {
    chk.addEventListener("click", e => {
      e.stopPropagation();
      const name = chk.dataset.name;
      if (pubSelected.has(name)) pubSelected.delete(name); else pubSelected.add(name);
      renderPublishFileTable();
    });
  });
  area.querySelectorAll("tr[data-name]").forEach(row => {
    row.addEventListener("click", () => {
      const name = row.dataset.name;
      if (pubSelected.has(name)) pubSelected.delete(name); else pubSelected.add(name);
      renderPublishFileTable();
    });
  });
  document.getElementById("pub-select-all")?.addEventListener("click", () => {
    if (allSel) publishable.forEach(f => pubSelected.delete(f.name));
    else publishable.forEach(f => pubSelected.add(f.name));
    renderPublishFileTable();
  });

  if (flashFile) {
    const row = area.querySelector(`tr[data-name="${(window.CSS && CSS.escape) ? CSS.escape(flashFile) : flashFile}"]`);
    if (row) { row.classList.add("row-flash"); }
    flashFile = null;
  }

  renderPublishBar();
}

function renderPublishBar() {
  const host = document.getElementById("publish-bar-host");
  if (!host) return;
  const files = filesFor(pubProject, pubFolder);
  const selected = files.filter(f => pubSelected.has(f.name));
  if (selected.length === 0) { host.innerHTML = ""; return; }
  host.innerHTML = `
    <div class="publish-bar">
      <span class="mdi mdi-cloud-upload-outline" style="font-size:20px; color:var(--color-green);"></span>
      <span class="pb-count"><b>${selected.length}</b> file${selected.length>1?"s":""} selected to publish</span>
      <div style="flex:1;"></div>
      <button class="btn btn-secondary" id="pub-clear-btn" style="height:30px;">Clear</button>
      <button class="btn btn-primary" id="pub-publish-btn" style="padding:8px 18px;">
        <span class="mdi mdi-publish"></span> Publish ${selected.length} file${selected.length>1?"s":""}
      </button>
    </div>`;
  document.getElementById("pub-clear-btn").addEventListener("click", () => { pubSelected.clear(); renderPublishFileTable(); });
  document.getElementById("pub-publish-btn").addEventListener("click", openPublishReview);
}

// ---- Dropzone → opens link dialog ------------------------------------------
function wireDropzone() {
  const dz = document.getElementById("publish-dropzone");
  if (!dz) return;
  dz.addEventListener("click", openLinkFile);
  dz.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("drag"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
  dz.addEventListener("drop", e => { e.preventDefault(); dz.classList.remove("drag"); openLinkFile(); });
}

// ============================================================
//  LINK A FILE — search your files, create a managed copy
// ============================================================

// ---- Real app: link via the actual OS file picker --------------------------
async function linkViaPicker() {
  if (pubBusy || !pubFolder) return;
  const proj = projects[activeProjectIndex];
  if (!(await ensureProjectLocation(proj))) return;
  let picked = null;
  try {
    picked = await window.__TAURI__.dialog.open({ multiple: true, title: `Link files to ${pubFolder}` });
  } catch (err) {
    toast("Could not open file picker", { kind: "warn", sub: String(err) });
    return;
  }
  if (!picked) return;
  const paths = Array.isArray(picked) ? picked : [picked];
  ensurePublishFiles();
  const key = pubKey(pubProject, pubFolder);
  if (!publishFiles[key]) publishFiles[key] = [];
  let added = 0;
  for (const p of paths) {
    const name = String(p).split(/[\\/]/).pop();
    if (existingNames().has(name.toLowerCase())) { toast("Already linked", { kind: "warn", sub: name }); continue; }
    let st = { size: "—", modified: "Just now" };
    try { st = await window.__TAURI__.core.invoke("file_stat", { path: p }); } catch (e) {}
    publishFiles[key].push({ name, size: st.size, modified: st.modified, version: 0, state: "new", linked: true, sourcePath: p });
    added++;
  }
  if (added) afterLink();
}

// Make sure the project has a real folder on this machine
// (e.g. a project restored from state without a location yet).
async function ensureProjectLocation(proj) {
  if (!proj) return false;
  if (proj.localPath) return true;
  toast("Choose where this project lives on this computer", { icon: "mdi-folder-question-outline" });
  const sel = await window.__TAURI__.dialog.open({ directory: true, multiple: false, title: `Choose location for "${proj.name}"` });
  if (!sel) return false;
  try {
    proj.localPath = await window.__TAURI__.core.invoke("create_project_folders", {
      base: sel, name: proj.name, folders: proj.folders,
    });
  } catch (err) {
    toast("Could not create project folders", { kind: "warn", sub: String(err) });
    return false;
  }
  toast("Project location set", { sub: proj.localPath, icon: "mdi-folder-check-outline" });
  return true;
}

function openLinkFile() {
  if (typeof IS_TAURI !== "undefined" && IS_TAURI) { linkViaPicker(); return; }
  if (pubBusy) return;
  linkSelected = new Set();
  linkCwd = ["C:","Work","CCT"];
  const ov = document.getElementById("modal-overlay");
  const host = document.getElementById("ui-dialog");
  ov.style.display = "block";
  host.style.width = "560px";
  host.innerHTML = `
    <div class="card modal-card modal-pop" style="margin:0;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
        <div class="section-label" style="margin:0;"><span class="mdi mdi-link-variant"></span> Link a file to ${pubFolder}</div>
        <button class="btn btn-ghost" id="link-close" style="width:28px; height:28px; padding:0;"><span class="mdi mdi-close"></span></button>
      </div>
      <div class="help-text">Browse a folder or search for a file. Sync43 copies it into <b style="color:var(--color-text-primary);">${pubProject} · ${pubFolder}</b> so it can be shared and versioned — your original stays untouched.</div>
      <div style="display:flex; gap:8px; margin:4px 0 10px;">
        <div style="position:relative; flex:1;">
          <span class="mdi mdi-magnify" style="position:absolute; left:10px; top:50%; transform:translateY(-50%); opacity:0.45; font-size:16px; pointer-events:none;"></span>
          <input class="input" id="link-search" placeholder="Search all files, or browse below…" style="padding-left:32px;" />
        </div>
        <button class="btn btn-secondary" id="link-os-browse" title="Open your system file manager">
          <span class="mdi ${(window.OS_PICKERS[appSettings.os]||window.OS_PICKERS.windows).icon}"></span> Browse…
        </button>
      </div>
      <div id="link-crumbs" class="link-crumbs"></div>
      <div id="link-results" style="background:var(--color-sunken); border:1px solid var(--color-divider); border-top:none; border-radius:0 0 8px 8px; max-height:248px; overflow-y:auto;"></div>
      <div style="display:flex; align-items:center; gap:8px; margin-top:16px;">
        <span id="link-count" style="font-size:11.5px; color:var(--color-text-secondary);"></span>
        <div style="flex:1;"></div>
        <button class="btn btn-secondary" id="link-cancel">Cancel</button>
        <button class="btn btn-primary" id="link-confirm" disabled><span class="mdi mdi-link-variant-plus"></span> Link file</button>
      </div>
    </div>`;
  host.style.display = "block";
  const search = document.getElementById("link-search");
  search.focus();
  search.addEventListener("input", () => renderLinkResults(search.value));
  renderLinkResults("");

  const close = () => { host.style.display = "none"; host.innerHTML = ""; host.style.width = ""; _maybeHideOverlay(); };
  document.getElementById("link-close").onclick = close;
  document.getElementById("link-cancel").onclick = close;
  document.getElementById("link-confirm").onclick = () => { const n = commitLinks(); close(); if (n) afterLink(); };
  document.getElementById("link-os-browse").onclick = openOSPicker;
}

// ---- Simulated native OS file picker --------------------------------------
function openOSPicker() {
  const os = appSettings.os || "windows";
  const picker = window.OS_PICKERS[os] || window.OS_PICKERS.windows;
  const ov = document.getElementById("modal-overlay");
  const host = document.getElementById("ui-dialog");
  // remember the link dialog markup to restore on cancel
  const prevHTML = host.innerHTML, prevW = host.style.width;
  ov.style.display = "block";
  host.style.width = "560px";

  let cwd = ["C:","Work","CCT"];
  let chosen = null;

  const dotColors = os === "macos" ? ["#FF5F57","#FEBC2E","#28C840"] : ["#5b6675","#5b6675","#5b6675"];

  const render = () => {
    const node = fsResolve(cwd);
    const entries = Object.values(node.children);
    const dirs  = entries.filter(e => e.type === "dir").sort((a,b)=>a.name.localeCompare(b.name));
    const files = entries.filter(e => e.type === "file").sort((a,b)=>a.file.name.localeCompare(b.file.name));
    host.innerHTML = `
      <div class="card modal-card modal-pop" style="margin:0; padding:0; overflow:hidden;">
        <div class="osp-bar">
          <div class="osp-dots">${dotColors.map(c=>`<span style="background:${c};"></span>`).join("")}</div>
          <span class="mdi ${picker.icon}" style="margin-left:6px;"></span> ${picker.name}
          <span style="flex:1;"></span>
          <span style="font-size:10.5px; color:var(--color-text-tertiary); font-weight:400;">Select a file to link</span>
        </div>
        <div style="padding:12px 14px;">
          <div class="link-crumbs" style="border-radius:8px; margin-bottom:0;">
            ${["This PC", ...cwd].map((n,i)=>`<span class="crumb ${i===cwd.length?"crumb-last":""}" data-i="${i}">${i===0?'<span class="mdi mdi-laptop" style="font-size:13px;"></span> ':''}${n}</span>${i===cwd.length?"":'<span class="mdi mdi-chevron-right crumb-sep"></span>'}`).join("")}
          </div>
          <div style="background:var(--color-sunken); border:1px solid var(--color-divider); border-top:none; border-radius:0 0 8px 8px; max-height:280px; overflow-y:auto;">
            ${cwd.length > 3 ? "" : ""}
            ${dirs.map(d=>`<div class="fs-row fs-dir" data-dir="${d.name}"><span class="mdi mdi-folder" style="color:var(--color-pending); font-size:18px;"></span><span style="flex:1; font-size:12px; font-weight:600;">${d.name}</span><span class="mdi mdi-chevron-right" style="color:var(--color-text-tertiary);"></span></div>`).join("")}
            ${files.map(e=>{const f=e.file; const sel=chosen===fileId(f); return `<div class="fs-row osp-file ${sel?"is-sel":""}" data-id="${fileId(f)}"><span class="ficon" style="width:28px; height:28px;"><span class="mdi ${fileIcon(f.name)}"></span></span><div style="flex:1; min-width:0;"><div style="font-size:12px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f.name}</div><div class="file-meta">${f.size} · ${f.modified}</div></div>${sel?'<span class="mdi mdi-check-circle" style="color:var(--color-green); font-size:18px;"></span>':''}</div>`;}).join("")}
            ${dirs.length===0&&files.length===0?`<div class="empty-state" style="padding:26px;"><span class="mdi mdi-folder-open-outline"></span><div class="es-main">Empty folder</div></div>`:""}
          </div>
          <div style="display:flex; align-items:center; gap:8px; margin-top:14px;">
            <span style="font-size:11px; color:var(--color-text-tertiary); font-family:'Liberation Mono',monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">${chosen?chosen:"No file selected"}</span>
            <button class="btn btn-secondary" id="osp-cancel">Cancel</button>
            <button class="btn btn-primary" id="osp-open" ${chosen?"":"disabled"}><span class="mdi mdi-link-variant-plus"></span> Link this file</button>
          </div>
        </div>
      </div>`;
    host.querySelectorAll(".crumb").forEach(c => c.addEventListener("click", () => { cwd = cwd.slice(0, parseInt(c.dataset.i)); chosen=null; render(); }));
    host.querySelectorAll(".fs-dir").forEach(r => r.addEventListener("click", () => { cwd=[...cwd, r.dataset.dir]; chosen=null; render(); }));
    host.querySelectorAll(".osp-file").forEach(r => r.addEventListener("click", () => { chosen = (chosen===r.dataset.id)?null:r.dataset.id; render(); }));
    host.querySelector("#osp-cancel").onclick = restore;
    host.querySelector("#osp-open").onclick = () => {
      if (!chosen) return;
      const src = findMock(chosen);
      restore();
      if (!src) return;
      if (existingNames().has(src.name.toLowerCase())) { toast("Already linked", { kind:"warn", sub: src.name }); return; }
      ensurePublishFiles();
      const key = pubKey(pubProject, pubFolder);
      if (!publishFiles[key]) publishFiles[key] = [];
      publishFiles[key].push({ name: src.name, size: src.size, modified: "Just now", version: 0, state: "new", linked: true });
      afterLink();
    };
  };
  const restore = () => {
    // close OS picker; if the link dialog was open behind it, reopen it
    host.style.width = ""; host.innerHTML = ""; host.style.display = "none"; _maybeHideOverlay();
  };
  render();
}

// ---- mock filesystem (built from the local file index) ---------------------
function getFS() {
  if (window.__SYNC43_FS) return window.__SYNC43_FS;
  const root = { name: "This PC", type: "dir", children: {} };
  (window.MOCK_LOCAL_FILES || []).forEach(f => {
    let node = root;
    f.path.split("/").forEach(part => {
      node.children[part] = node.children[part] || { name: part, type: "dir", children: {} };
      node = node.children[part];
    });
    node.children["\u0000" + f.name] = { name: f.name, type: "file", file: f };
  });
  window.__SYNC43_FS = root;
  return root;
}

function fsResolve(cwd) {
  let node = getFS();
  for (const name of cwd) { if (!node.children[name]) return node; node = node.children[name]; }
  return node;
}

function fileId(f) { return f.path + "/" + f.name; }
function findMock(id) { return (window.MOCK_LOCAL_FILES || []).find(f => fileId(f) === id); }

function existingNames() {
  return new Set(filesFor(pubProject, pubFolder).map(f => f.name.toLowerCase()));
}

// ---- dispatch: search when typing, browse when empty -----------------------
function renderLinkResults(query) {
  const q = (query || "").trim();
  const crumbs = document.getElementById("link-crumbs");
  if (q) { if (crumbs) crumbs.style.display = "none"; renderLinkSearch(q); }
  else   { if (crumbs) crumbs.style.display = "flex"; renderLinkBrowse(); }
}

function renderLinkCrumbs() {
  const el = document.getElementById("link-crumbs");
  if (!el) return;
  const full = ["This PC", ...linkCwd];
  el.innerHTML = full.map((name, i) => {
    const isLast = i === full.length - 1;
    return `<span class="crumb ${isLast?"crumb-last":""}" data-i="${i}">${i===0?'<span class="mdi mdi-laptop" style="font-size:13px;"></span> ':''}${name}</span>${isLast?"":'<span class="mdi mdi-chevron-right crumb-sep"></span>'}`;
  }).join("");
  el.querySelectorAll(".crumb").forEach(c => {
    c.addEventListener("click", () => {
      const i = parseInt(c.dataset.i);   // 0 = This PC (root)
      linkCwd = linkCwd.slice(0, i);
      renderLinkResults("");
    });
  });
}

function renderLinkBrowse() {
  renderLinkCrumbs();
  const box = document.getElementById("link-results");
  if (!box) return;
  const node = fsResolve(linkCwd);
  const entries = Object.values(node.children);
  const dirs  = entries.filter(e => e.type === "dir").sort((a,b)=>a.name.localeCompare(b.name));
  const files = entries.filter(e => e.type === "file").sort((a,b)=>a.file.name.localeCompare(b.file.name));
  const have = existingNames();

  if (dirs.length === 0 && files.length === 0) {
    box.innerHTML = `<div class="empty-state" style="padding:28px 20px;"><span class="mdi mdi-folder-open-outline"></span><div class="es-main">Empty folder</div></div>`;
    updateLinkCount();
    return;
  }

  const dirHtml = dirs.map(d => `
    <div class="fs-row fs-dir" data-dir="${d.name}">
      <span class="mdi mdi-folder" style="color:var(--color-pending); font-size:18px;"></span>
      <span style="flex:1; font-size:12px; font-weight:600;">${d.name}</span>
      <span class="mdi mdi-chevron-right" style="color:var(--color-text-tertiary);"></span>
    </div>`).join("");

  const fileHtml = files.map(e => {
    const f = e.file, id = fileId(f);
    const already = have.has(f.name.toLowerCase());
    const sel = linkSelected.has(id);
    return `
      <div class="fs-row link-row ${already?"is-linked":""} ${sel?"is-sel":""}" data-id="${id}">
        <span class="ccheck ${sel?"checked":""}" ${already?"style='visibility:hidden;'":""}><span class="mdi mdi-check"></span></span>
        <span class="ficon" style="width:28px; height:28px;"><span class="mdi ${fileIcon(f.name)}"></span></span>
        <div style="flex:1; min-width:0;">
          <div style="font-size:12px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f.name}</div>
          <div class="file-meta">${f.size} · ${f.modified}</div>
        </div>
        ${already ? `<span class="status-pill synced" style="background:var(--color-green-soft); color:#6fdc8c;"><span class="mdi mdi-check" style="font-size:12px;"></span> Linked</span>` : ""}
      </div>`;
  }).join("");

  box.innerHTML = dirHtml + fileHtml;

  box.querySelectorAll(".fs-dir").forEach(row => {
    row.addEventListener("click", () => { linkCwd = [...linkCwd, row.dataset.dir]; renderLinkResults(""); });
  });
  box.querySelectorAll(".link-row").forEach(row => {
    if (row.classList.contains("is-linked")) return;
    row.addEventListener("click", () => { toggleLink(row.dataset.id); renderLinkResults(""); });
  });
  updateLinkCount();
}

function renderLinkSearch(query) {
  const box = document.getElementById("link-results");
  if (!box) return;
  const q = query.toLowerCase();
  const have = existingNames();
  const list = (window.MOCK_LOCAL_FILES || []).filter(f =>
    f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q));

  if (list.length === 0) {
    box.innerHTML = `<div class="empty-state" style="padding:30px 20px;"><span class="mdi mdi-file-search-outline"></span><div class="es-main">No files match “${query}”</div><div class="es-sub">Try a different name or path.</div></div>`;
    updateLinkCount();
    return;
  }

  box.innerHTML = list.map(f => {
    const id = fileId(f);
    const already = have.has(f.name.toLowerCase());
    const sel = linkSelected.has(id);
    return `
      <div class="fs-row link-row ${already?"is-linked":""} ${sel?"is-sel":""}" data-id="${id}">
        <span class="ccheck ${sel?"checked":""}" ${already?"style='visibility:hidden;'":""}><span class="mdi mdi-check"></span></span>
        <span class="ficon" style="width:28px; height:28px;"><span class="mdi ${fileIcon(f.name)}"></span></span>
        <div style="flex:1; min-width:0;">
          <div style="font-size:12px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f.name}</div>
          <div class="file-meta" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f.path} · ${f.size}</div>
        </div>
        ${already ? `<span class="status-pill synced" style="background:var(--color-green-soft); color:#6fdc8c;"><span class="mdi mdi-check" style="font-size:12px;"></span> Linked</span>` : ""}
      </div>`;
  }).join("");

  box.querySelectorAll(".link-row").forEach(row => {
    if (row.classList.contains("is-linked")) return;
    row.addEventListener("click", () => { toggleLink(row.dataset.id); renderLinkResults(document.getElementById("link-search").value); });
  });
  updateLinkCount();
}

function toggleLink(id) {
  if (linkSelected.has(id)) linkSelected.delete(id); else linkSelected.add(id);
}

function updateLinkCount() {
  const n = linkSelected.size;
  const label = document.getElementById("link-count");
  const btn = document.getElementById("link-confirm");
  if (label) label.textContent = n ? `${n} file${n>1?"s":""} selected` : "";
  if (btn) {
    btn.disabled = n === 0;
    btn.innerHTML = `<span class="mdi mdi-link-variant-plus"></span> Link ${n>1?n+" files":"file"}`;
  }
}

function commitLinks() {
  ensurePublishFiles();
  const key = pubKey(pubProject, pubFolder);
  if (!publishFiles[key]) publishFiles[key] = [];
  const have = existingNames();
  let added = 0;
  linkSelected.forEach(id => {
    const src = findMock(id);
    if (!src || have.has(src.name.toLowerCase())) return;
    publishFiles[key].push({ name: src.name, size: src.size, modified: "Just now", version: 0, state: "new", linked: true });
    added++;
  });
  return added;
}

function afterLink() {
  renderProjectDash();
  toast("File linked", { sub: "Sync43 copied it into the folder. Select it and Publish to share.", icon: "mdi-link-variant" });
}

// ---- Publish review dialog -------------------------------------------------
function openPublishReview() {
  if (pubBusy) return;
  const files = filesFor(pubProject, pubFolder).filter(f => pubSelected.has(f.name));
  if (!files.length) return;

  const ov = document.getElementById("modal-overlay");
  const host = document.getElementById("ui-dialog");
  ov.style.display = "block";
  host.style.width = "480px";
  host.innerHTML = `
    <div class="card modal-card modal-pop" style="margin:0;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
        <div class="section-label" style="margin:0;"><span class="mdi mdi-publish"></span> Publish to ${pubFolder}</div>
        <button class="btn btn-ghost" id="pub-review-close" style="width:28px; height:28px; padding:0;"><span class="mdi mdi-close"></span></button>
      </div>
      <div class="help-text">${files.length} file${files.length>1?"s":""} will be published to <b style="color:var(--color-text-primary);">${pubProject} · ${pubFolder}</b> and synced to peers on this folder.</div>

      <div style="background:var(--color-sunken); border:1px solid var(--color-divider); border-radius:8px; padding:6px 4px; margin:12px 0; max-height:190px; overflow-y:auto;">
        ${files.map(f => `
          <div style="display:flex; align-items:center; gap:10px; padding:7px 10px;">
            <span class="ficon" style="width:24px; height:24px; background:var(--color-card-bg);"><span class="mdi ${fileIcon(f.name)}" style="font-size:14px;"></span></span>
            <span style="flex:1; font-size:11.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f.name}</span>
            <span class="ver-badge">${f.state==="new"?"new → v1":"v"+f.version+" → v"+(f.version+1)}</span>
          </div>`).join("")}
      </div>

      ${(appSettings.archiveIssued && files.some(f => (f.version||0) > 0)) ? `
        <div style="display:flex; align-items:flex-start; gap:9px; font-size:11px; color:var(--color-text-secondary); background:var(--color-green-soft); border:1px solid var(--color-green-line); border-radius:7px; padding:9px 11px; margin-bottom:12px;">
          <span class="mdi mdi-archive-outline" style="color:var(--color-green); font-size:15px;"></span>
          <span>The current issued version of each existing file is archived to <b style="color:var(--color-text-primary); font-family:'Liberation Mono',monospace;">${archiveFolderName()}/</b> before being replaced — keeping a full issued record.</span>
        </div>` : ""}

      <div class="field-label">Version note <span style="color:var(--color-text-tertiary); font-weight:400;">(optional)</span></div>
      <input class="input" id="pub-version-note" placeholder="e.g. Updated foundation setdown to RL 12.4" />

      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:18px;">
        <button class="btn btn-secondary" id="pub-review-cancel">Cancel</button>
        <button class="btn btn-primary" id="pub-review-confirm"><span class="mdi mdi-check"></span> Publish now</button>
      </div>
    </div>`;
  host.style.display = "block";
  document.getElementById("pub-version-note").focus();

  const close = () => { host.style.display = "none"; host.innerHTML = ""; host.style.width = ""; _maybeHideOverlay(); };
  document.getElementById("pub-review-close").onclick = close;
  document.getElementById("pub-review-cancel").onclick = close;
  document.getElementById("pub-review-confirm").onclick = () => {
    const note = document.getElementById("pub-version-note").value.trim();
    close();
    runPublish(files, note);
  };
}

// ---- Run publish ------------------------------------------------------------
function runPublish(files, note) {
  if (typeof IS_TAURI !== "undefined" && IS_TAURI) { runPublishReal(files, note); return; }
  runPublishSim(files, note);
}

// Real publish: archive previous version → copy new version into the
// project folder on disk. (P2P propagation to peers arrives in Stage 3.)
async function runPublishReal(files, note) {
  const proj = projects[activeProjectIndex];
  if (!(await ensureProjectLocation(proj))) return;
  pubBusy = true;
  const host = document.getElementById("publish-bar-host");
  if (host) {
    host.innerHTML = `
      <div class="publish-bar" style="flex-direction:column; align-items:stretch; gap:10px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="mdi mdi-sync mdi-spin" style="font-size:18px; color:var(--color-syncing);"></span>
          <span class="pb-count" id="pub-progress-label">Publishing ${files.length} file${files.length>1?"s":""}…</span>
        </div>
        <div class="progress-track"><div class="progress-fill" id="pub-progress-fill"></div></div>
      </div>`;
  }
  const fill = document.getElementById("pub-progress-fill");
  const label = document.getElementById("pub-progress-label");

  files.forEach(f => {
    activityLog.unshift({ status:"syncing", file:f.name, project:pubProject, folder:pubFolder, peer:"You", time:"now" });
  });

  const list = filesFor(pubProject, pubFolder);
  let archivedCount = 0, ok = 0, done = 0;
  for (const f of files) {
    const target = list.find(x => x.name === f.name);
    const logEntry = activityLog.find(l => l.file === f.name && l.status === "syncing");
    try {
      const res = await window.__TAURI__.core.invoke("publish_file", {
        source:      target?.sourcePath || "",
        projectPath: proj.localPath,
        folder:      pubFolder,
        archive:     !!appSettings.archiveIssued,
        dateFormat:  appSettings.dateFormat || "YYMMDD",
        namePattern: appSettings.namePattern || "{date}_{name}",
      });
      if (target) {
        if (res && res.archived) {
          target.archives = target.archives || [];
          target.archives.push({ folder: "Versions", name: res.archived, version: target.version });
          archivedCount++;
        }
        target.version = (target.version || 0) + 1;
        target.state = "synced";
        target.modified = "Just now";
        if (note) target.note = note;
      }
      if (logEntry) { logEntry.status = "synced"; logEntry.time = "just now"; }
      ok++;
    } catch (err) {
      if (logEntry) { logEntry.status = "failed"; logEntry.time = "just now"; }
      toast("Publish failed", { kind: "warn", sub: `${f.name} — ${err}` });
    }
    done++;
    if (fill) fill.style.width = `${Math.round((done / files.length) * 100)}%`;
    if (label) label.textContent = `Publishing ${done}/${files.length}…`;
  }

  pubSelected.clear();
  pubBusy = false;
  renderProjectDash();
  if (ok) {
    toast(`Published ${ok} file${ok>1?"s":""}`, {
      sub: archivedCount ? `${archivedCount} previous version${archivedCount>1?"s":""} moved to Versions/` : (note ? `"${note}"` : `${pubProject} · ${pubFolder}`),
      icon: "mdi-cloud-check-outline",
    });
  } else {
    persist();
  }
}

// ---- Browser-preview simulation (unchanged behaviour) -----------------------
function runPublishSim(files, note) {
  pubBusy = true;
  const host = document.getElementById("publish-bar-host");
  const peer = "You";
  if (host) {
    host.innerHTML = `
      <div class="publish-bar" style="flex-direction:column; align-items:stretch; gap:10px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="mdi mdi-sync mdi-spin" style="font-size:18px; color:var(--color-syncing);"></span>
          <span class="pb-count" id="pub-progress-label">Publishing ${files.length} file${files.length>1?"s":""}…</span>
        </div>
        <div class="progress-track"><div class="progress-fill" id="pub-progress-fill"></div></div>
      </div>`;
  }
  const fill = document.getElementById("pub-progress-fill");
  requestAnimationFrame(() => { if (fill) fill.style.width = "92%"; });

  files.forEach(f => {
    activityLog.unshift({ status:"syncing", file:f.name, project:pubProject, folder:pubFolder, peer, time:"now" });
  });

  setTimeout(() => {
    if (fill) fill.style.width = "100%";
    const list = filesFor(pubProject, pubFolder);
    let archivedCount = 0;
    files.forEach(f => {
      const target = list.find(x => x.name === f.name);
      if (target) {
        // Issued-file audit: archive the previous version before replacing.
        if (appSettings.archiveIssued && (target.version || 0) > 0) {
          target.archives = target.archives || [];
          target.archives.push({ folder: archiveFolderName(), name: archiveFileName(target), version: target.version });
          archivedCount++;
        }
        target.version = (target.version || 0) + 1;
        target.state = "synced"; target.modified = "Just now"; target.linked = false;
      }
      const logEntry = activityLog.find(l => l.file === f.name && l.status === "syncing");
      if (logEntry) { logEntry.status = "synced"; logEntry.time = "just now"; }
    });
    pubSelected.clear();
    pubBusy = false;
    renderProjectDash();
    toast(`Published ${files.length} file${files.length>1?"s":""}`, {
      sub: archivedCount ? `${archivedCount} previous version${archivedCount>1?"s":""} archived to ${archiveFolderName()}/` : (note ? `"${note}"` : `${pubProject} · ${pubFolder}`),
      icon: "mdi-cloud-check-outline",
    });
  }, 1500);
}

function setupPublishPage() { /* dash builds itself when its tab is opened */ }
