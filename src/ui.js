// ============================================================
//  Sync43 Prototype — Polished dialogs & toasts
//  Promise-based replacements for confirm / alert / prompt.
// ============================================================

// ---- Toasts ----------------------------------------------------------------
function toast(title, opts = {}) {
  // Nearly every state change in the app announces itself with a toast,
  // so this doubles as the catch-all "save state to disk" trigger.
  try { if (typeof persist === "function") persist(); } catch (e) {}
  const stack = document.getElementById("toast-stack");
  if (!stack) return;
  const kind = opts.kind || "ok";
  const icon = opts.icon || (kind === "ok" ? "mdi-check-circle"
    : kind === "warn" ? "mdi-alert" : "mdi-information");
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.innerHTML = `
    <span class="mdi ${icon}"></span>
    <div style="flex:1; min-width:0;">
      <div class="t-title">${title}</div>
      ${opts.sub ? `<div class="t-sub">${opts.sub}</div>` : ""}
    </div>`;
  stack.appendChild(el);
  const ttl = opts.duration || 3200;
  const remove = () => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 220);
  };
  setTimeout(remove, ttl);
  el.addEventListener("click", remove);
}

// ---- Confirm / Alert -------------------------------------------------------
// uiConfirm({ title, message, confirmText, cancelText, tone, danger })
// resolves true / false.
function uiConfirm(o = {}) {
  return _dialog({
    title: o.title || "Are you sure?",
    message: o.message || "",
    tone: o.tone || (o.danger ? "danger" : "warn"),
    icon: o.icon,
    confirmText: o.confirmText || "Confirm",
    cancelText: o.cancelText || "Cancel",
    danger: !!o.danger,
    showCancel: true,
  });
}

function uiAlert(o = {}) {
  return _dialog({
    title: o.title || "Notice",
    message: o.message || "",
    tone: o.tone || "info",
    icon: o.icon,
    confirmText: o.confirmText || "OK",
    showCancel: false,
  });
}

// uiChoose — three-way: returns "a" | "b" | null (cancel)
function uiChoose(o = {}) {
  return new Promise((resolve) => {
    _renderDialog({
      title: o.title || "Choose",
      message: o.message || "",
      tone: o.tone || "info",
      icon: o.icon,
      buttons: [
        { label: o.cancelText || "Cancel", cls: "btn-secondary", val: null },
        { label: o.bText || "Option B", cls: "btn-secondary", val: "b" },
        { label: o.aText || "Option A", cls: "btn-primary", val: "a" },
      ],
    }, resolve);
  });
}

// uiPrompt({ title, message, placeholder, mustEqual }) → string | null
function uiPrompt(o = {}) {
  return new Promise((resolve) => {
    const ov = document.getElementById("modal-overlay");
    const host = document.getElementById("ui-dialog");
    ov.style.display = "block";
    const tone = o.tone || "warn";
    const icon = o.icon || "mdi-shield-alert";
    host.innerHTML = `
      <div class="card modal-card modal-pop" style="margin:0;">
        <div style="display:flex; gap:13px; align-items:flex-start;">
          <div class="dlg-icon ${tone}"><span class="mdi ${icon}"></span></div>
          <div style="flex:1; min-width:0;">
            <div class="dlg-title">${o.title || "Confirm"}</div>
            <div class="dlg-msg">${o.message || ""}</div>
            <input class="input" id="ui-prompt-input" placeholder="${o.placeholder || ""}" style="margin-top:12px;" />
          </div>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:18px;">
          <button class="btn btn-secondary" id="ui-prompt-cancel">Cancel</button>
          <button class="btn btn-primary" id="ui-prompt-ok">${o.confirmText || "Confirm"}</button>
        </div>
      </div>`;
    host.style.display = "block";
    const input = document.getElementById("ui-prompt-input");
    input.focus();
    const done = (val) => { host.style.display = "none"; host.innerHTML = ""; _maybeHideOverlay(); resolve(val); };
    document.getElementById("ui-prompt-cancel").onclick = () => done(null);
    document.getElementById("ui-prompt-ok").onclick = () => done(input.value);
    input.addEventListener("keydown", e => { if (e.key === "Enter") done(input.value); if (e.key === "Escape") done(null); });
  });
}

// ---- internals -------------------------------------------------------------
function _dialog(cfg) {
  return new Promise((resolve) => {
    const buttons = [];
    if (cfg.showCancel) buttons.push({ label: cfg.cancelText, cls: "btn-secondary", val: false });
    buttons.push({ label: cfg.confirmText, cls: cfg.danger ? "btn-primary dlg-danger-btn" : "btn-primary", val: true });
    _renderDialog({ ...cfg, buttons }, resolve);
  });
}

function _renderDialog(cfg, resolve) {
  const ov = document.getElementById("modal-overlay");
  const host = document.getElementById("ui-dialog");
  ov.style.display = "block";
  const tone = cfg.tone || "info";
  const icon = cfg.icon || (tone === "danger" ? "mdi-alert-octagon"
    : tone === "warn" ? "mdi-alert" : "mdi-information");
  const btnHtml = cfg.buttons.map((b, i) =>
    `<button class="btn ${b.cls}" data-i="${i}">${b.label}</button>`).join("");
  host.innerHTML = `
    <div class="card modal-card modal-pop" style="margin:0;">
      <div style="display:flex; gap:13px; align-items:flex-start;">
        <div class="dlg-icon ${tone}"><span class="mdi ${icon}"></span></div>
        <div style="flex:1; min-width:0;">
          <div class="dlg-title">${cfg.title}</div>
          ${cfg.message ? `<div class="dlg-msg">${cfg.message}</div>` : ""}
        </div>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:18px;">${btnHtml}</div>
    </div>`;
  host.style.display = "block";
  host.querySelectorAll("button[data-i]").forEach(btn => {
    btn.onclick = () => {
      const val = cfg.buttons[parseInt(btn.dataset.i)].val;
      host.style.display = "none"; host.innerHTML = "";
      _maybeHideOverlay();
      resolve(val);
    };
  });
  // make the danger confirm red
  const dbtn = host.querySelector(".dlg-danger-btn");
  if (dbtn) { dbtn.style.background = "var(--color-danger)"; }
}

function _maybeHideOverlay() {
  // Only hide overlay if no other modal is open.
  const modalIds = ["modal-create-project","modal-seed-code","modal-save-template","ui-dialog"];
  const anyOpen = modalIds.some(m => {
    const el = document.getElementById(m);
    return el && el.style.display !== "none" && el.style.display !== "";
  });
  if (!anyOpen) document.getElementById("modal-overlay").style.display = "none";
}

// ============================================================
//  FOLDER MULTI-PICKER POPOVER
//  openFolderPicker(anchorEl, { selected:[], options:[], allowAll, onChange })
// ============================================================
function openFolderPicker(anchorEl, opts = {}) {
  closeFolderPicker();
  const options  = opts.options || [];
  const allowAll = opts.allowAll !== false;
  let selected   = new Set(opts.selected || []);

  const pop = document.createElement("div");
  pop.className = "folder-pop";
  pop.id = "folder-pop";

  const render = () => {
    const allRow = allowAll ? `
      <div class="fp-opt ${selected.has("all")?"sel":""}" data-f="all">
        <span class="ccheck ${selected.has("all")?"checked":""}"><span class="mdi mdi-check"></span></span>
        <span class="mdi mdi-folder-multiple-outline" style="color:var(--color-green);"></span> All folders
      </div>` : "";
    pop.innerHTML = `
      <div class="fp-head">Assign to folders</div>
      <div class="fp-list">
        ${allRow}
        ${options.map(f => `
          <div class="fp-opt ${selected.has(f)?"sel":""}" data-f="${f}">
            <span class="ccheck ${selected.has(f)?"checked":""}"><span class="mdi mdi-check"></span></span>
            <span class="mdi mdi-folder-outline"></span> ${f}
          </div>`).join("")}
      </div>
      <div class="fp-foot">
        <span class="fp-count">${selected.size===0?"None selected":(selected.has("all")?"All folders":selected.size+" selected")}</span>
        <button class="btn btn-secondary" id="fp-clear" style="height:26px; font-size:11px;">Clear</button>
        <button class="btn btn-primary" id="fp-done" style="height:26px; font-size:11px; padding:0 14px;">Done</button>
      </div>`;
    pop.querySelectorAll(".fp-opt").forEach(o => {
      o.addEventListener("click", () => {
        const f = o.dataset.f;
        if (f === "all") {
          if (selected.has("all")) selected.delete("all");
          else selected = new Set(["all"]);
        } else {
          selected.delete("all");
          if (selected.has(f)) selected.delete(f); else selected.add(f);
        }
        render();
      });
    });
    pop.querySelector("#fp-clear").onclick = () => { selected = new Set(); render(); };
    pop.querySelector("#fp-done").onclick  = () => { const arr = [...selected]; closeFolderPicker(); opts.onChange && opts.onChange(arr); };
  };

  document.body.appendChild(pop);
  render();

  const r = anchorEl.getBoundingClientRect();
  pop.style.position = "fixed";
  pop.style.zIndex = "1400";
  pop.style.top  = (r.bottom + 6) + "px";
  pop.style.left = r.left + "px";
  requestAnimationFrame(() => {
    const pr = pop.getBoundingClientRect();
    if (pr.bottom > window.innerHeight - 10) pop.style.top  = Math.max(10, r.top - pr.height - 6) + "px";
    if (pr.right  > window.innerWidth  - 10) pop.style.left = Math.max(10, window.innerWidth - pr.width - 12) + "px";
  });
  setTimeout(() => document.addEventListener("mousedown", _fpOutside), 0);
}

function _fpOutside(e) {
  const pop = document.getElementById("folder-pop");
  if (pop && !pop.contains(e.target)) closeFolderPicker();
}

function closeFolderPicker() {
  const pop = document.getElementById("folder-pop");
  if (pop) pop.remove();
  document.removeEventListener("mousedown", _fpOutside);
}

// Convenience: a clickable folder-assignment chip-button (for table cells)
function folderBtnHTML(folders, attrs = "", opts = {}) {
  const label = foldersLabel(folders);
  const empty = asFolders(folders).length === 0;
  const disabled = opts.disabled ? "disabled" : "";
  return `<button class="folder-btn ${empty?"is-empty":""}" ${attrs} ${disabled}>
    <span class="mdi ${asFolders(folders).includes("all")?"mdi-folder-multiple-outline":"mdi-folder-outline"}"></span>
    <span class="fb-label">${label}</span>
    ${opts.disabled?"":'<span class="mdi mdi-menu-down fb-caret"></span>'}
  </button>`;
}
