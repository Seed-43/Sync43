// ============================================================
//  Sync43 — Main UI Controller (browser prototype)
// ============================================================

const { invoke } = window.__TAURI__.core;
const { open }   = window.__TAURI__.dialog;

// True when running inside the real Tauri app (not the browser mock).
const IS_TAURI = !!(window.__TAURI__ && !window.__TAURI__.__MOCK__);

// ============================================================
//  PERSISTENCE BRIDGE (real app only)
//  The whole UI state is saved as one JSON document via the
//  Rust backend. persist() is debounced and safe to call often.
// ============================================================

let _persistTimer = null;

function collectState() {
  if (typeof ensurePublishFiles === "function") ensurePublishFiles();
  return {
    projects,
    emailPolicies,
    domainPolicies,
    activityLog: activityLog.slice(0, 500),
    appSettings,
    templates,
    publishFiles: (typeof publishFiles !== "undefined" && publishFiles) ? publishFiles : {},
  };
}

function persist() {
  if (!IS_TAURI) return;
  clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    invoke("save_state", { state: collectState() }).catch(err => console.error("save_state failed:", err));
  }, 400);
}

async function loadStateFromDisk() {
  appSettings = JSON.parse(JSON.stringify(window.DEFAULT_SETTINGS));
  try {
    const info = await invoke("app_info");
    if (info && info.os) appSettings.os = info.os;
  } catch (e) {}
  let s = null;
  try { s = await invoke("load_state"); } catch (e) { console.error("load_state failed:", e); }
  if (s && Array.isArray(s.projects)) {
    projects       = s.projects;
    emailPolicies  = s.emailPolicies  || [];
    domainPolicies = s.domainPolicies || [];
    activityLog    = s.activityLog    || [];
    Object.assign(appSettings, s.appSettings || {});
    if (Array.isArray(s.templates) && s.templates.length) templates = s.templates;
    if (s.publishFiles && typeof publishFiles !== "undefined") publishFiles = s.publishFiles;
  } else {
    // First run: clean slate.
    projects = []; emailPolicies = []; domainPolicies = []; activityLog = [];
    if (typeof publishFiles !== "undefined") publishFiles = {};
  }
}

// ============================================================
//  APP STATE
// ============================================================

const currentUser = {
  email: "fred@nagel.co.nz",
  role:  "admin",
};

const pageTitles = {
  dashboard:     "Dashboard",
  projects:      "My Projects",
  publish:       "Publish Files",
  settings:      "Settings",
  grouppolicies: "Group Policies",
};

let publicDomains  = [];
let templates      = [
  { id:"standard", name:"Standard Construction", folders:["Architecture","Structure","Civil","Mechanical","Electrical","Plumbing","Documents"] },
  { id:"civil",    name:"Civil Infrastructure",  folders:["Survey","Civil","Structural","Environmental","Documents"] },
  { id:"fitout",   name:"Interior Fit-out",       folders:["Architecture","Joinery","Mechanical","Electrical","Documents"] },
  { id:"blank",    name:"Blank",                  folders:[] },
];

let projects           = [];
let clonedFolders      = null;
let currentFilter      = "all";
let inviteEmails       = [];
let projInviteEmails   = [];
let activeProjectIndex = null;
let activeProjectTab   = "share";

let emailPolicies  = [];
let domainPolicies = [];
let appSettings    = {};
let gpSelectedEmails = new Set();   // multi-select in GP Emails tab

let indexMode        = "name";
let activeIndexLetter = null;

let activityLog = [];

// ============================================================
//  PUBLIC DOMAINS
// ============================================================

function loadPublicDomains() {
  publicDomains = window.PUBLIC_DOMAINS || [];
}

function isPublicDomain(domain) {
  return publicDomains.includes(domain.replace(/^@/,"").toLowerCase());
}

// ============================================================
//  HELPERS
// ============================================================

function isAdmin() { return currentUser.role === "admin"; }

function fileIcon(name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (ext === "rvt") return "mdi-cube-outline";
  if (ext === "dwg") return "mdi-vector-square";
  if (ext === "pdf") return "mdi-file-pdf-box";
  if (ext === "xlsx" || ext === "csv") return "mdi-file-table-outline";
  if (ext === "docx") return "mdi-file-document-outline";
  return "mdi-file-outline";
}

function getEmailPolicy(email) {
  return emailPolicies.find(p => p.email.toLowerCase() === email.toLowerCase());
}

function getDomainPolicy(email) {
  const domain = "@" + email.split("@")[1].toLowerCase();
  return domainPolicies.find(p => p.domain.toLowerCase() === domain);
}

// ---- Multi-folder helpers --------------------------------------------------
function asFolders(x) {
  if (Array.isArray(x)) return x.slice();
  if (typeof x === "string" && x) return [x];
  return [];
}

function allTemplateFolders() {
  const fromTemplates = templates.flatMap(t => t.folders);
  const fromProjects  = projects.flatMap(p => p.folders || []);
  return [...new Set([...fromTemplates, ...fromProjects])].sort();
}

function foldersLabel(folders) {
  const f = asFolders(folders);
  if (f.length === 0) return "— none —";
  if (f.includes("all")) return "All folders";
  if (f.length <= 2) return f.join(", ");
  return `${f[0]} +${f.length - 1} more`;
}

// Returns { folders:[], lockedBy:"domain"|"email"|null }
function getEffectiveFolders(email, fallbackFolders) {
  const dp = getDomainPolicy(email);
  if (dp) return { folders: asFolders(dp.folders), lockedBy: "domain" };
  const ep = getEmailPolicy(email);
  if (ep) return { folders: asFolders(ep.folders), lockedBy: "email" };
  return { folders: asFolders(fallbackFolders), lockedBy: null };
}

function projectsForUser(email) {
  return projects.filter(p => p.users?.some(u => u.email === email));
}

function projectsForDomain(domain) {
  const cleanDomain = domain.replace(/^@/,"").toLowerCase();
  return projects.filter(p =>
    p.users?.some(u => u.email.split("@")[1].toLowerCase() === cleanDomain)
  );
}

async function confirmPolicyAdd(domain, folder) {
  const ok = await uiConfirm({
    title: "Save to Group Policies?",
    message: `Assign  ${domain}  →  ${folder}  across all projects.`,
    icon: "mdi-account-badge",
    confirmText: "Save policy",
  });
  if (!ok) return false;
  if (domain.startsWith("@") && isPublicDomain(domain)) {
    const sure = await uiConfirm({
      title: "Public email domain",
      message: `"${domain}" is a public email domain (e.g. Gmail, Outlook). Creating a group policy for it will affect every user with that address. Are you sure?`,
      tone: "danger", icon: "mdi-alert-octagon", confirmText: "I understand, continue",
    });
    if (!sure) return false;
    const typed = await uiPrompt({
      title: "Type CONFIRM to proceed",
      message: `This is a public domain. Type CONFIRM to apply a policy for "${domain}".`,
      placeholder: "CONFIRM", tone: "danger", icon: "mdi-shield-alert", confirmText: "Apply policy",
    });
    if (typed !== "CONFIRM") { toast("Cancelled", { kind: "warn", sub: "You must type CONFIRM exactly." }); return false; }
  }
  return true;
}

async function confirmFolderChange(label, affectedProjects, newFolder) {
  if (!affectedProjects.length) return true;
  const names = affectedProjects.map(p => p.name).join(", ");
  return uiConfirm({
    title: "Change affects active projects",
    message: `Changing the folder for "${label}" to "${newFolder}" will reassign these projects:\n\n${names}`,
    icon: "mdi-folder-swap-outline", confirmText: "Apply change",
  });
}

// ============================================================
//  TOPBAR
// ============================================================

function buildDashboardTopbar() {
  const counts = {};
  ["synced","syncing","pending","failed","offline"].forEach(s => {
    counts[s] = activityLog.filter(r => r.status === s).length;
  });
  const total = activityLog.length;

  document.getElementById("topbar-title").textContent = "Dashboard";
  document.getElementById("topbar-controls").innerHTML = `
    <div style="display:flex; align-items:center; gap:7px; width:100%; flex-wrap:nowrap;">
      <div class="topbar-filter ${currentFilter==="all"?"topbar-filter-active":""}" data-filter="all">
        <span class="status-dot online"></span><span>${total} All</span>
      </div>
      <div class="topbar-filter ${currentFilter==="synced"?"topbar-filter-active":""}" data-filter="synced">
        <span class="status-dot synced"></span><span>${counts.synced} Synced</span>
      </div>
      <div class="topbar-filter ${currentFilter==="syncing"?"topbar-filter-active":""}" data-filter="syncing">
        <span class="status-dot syncing"></span><span>${counts.syncing} Syncing</span>
      </div>
      <div class="topbar-filter ${currentFilter==="pending"?"topbar-filter-active":""}" data-filter="pending">
        <span class="status-dot pending"></span><span>${counts.pending} Pending</span>
      </div>
      <div class="topbar-filter ${currentFilter==="failed"?"topbar-filter-active":""}" data-filter="failed">
        <span class="status-dot failed"></span><span>${counts.failed} Failed</span>
      </div>
      <div class="topbar-filter ${currentFilter==="offline"?"topbar-filter-active":""}" data-filter="offline">
        <span class="status-dot offline"></span><span>${counts.offline} Offline</span>
      </div>
      <div style="flex:1;"></div>
      <button class="btn btn-danger" id="clear-log-btn">
        <span class="mdi mdi-trash-can-outline"></span> Clear Log
      </button>
    </div>
  `;

  document.querySelectorAll(".topbar-filter").forEach(item => {
    item.addEventListener("click", () => {
      currentFilter = currentFilter === item.dataset.filter ? "all" : item.dataset.filter;
      renderActivityLog();
      buildDashboardTopbar();
    });
  });
  document.getElementById("clear-log-btn").addEventListener("click", async () => {
    if (await uiConfirm({ title: "Clear activity log?", message: "This removes all entries from the dashboard log. This can't be undone.", tone: "danger", danger: true, confirmText: "Clear log", icon: "mdi-trash-can-outline" })) {
      activityLog = []; renderActivityLog(); renderDashboardStats(); buildDashboardTopbar();
      toast("Activity log cleared", { kind: "info" });
    }
  });
}

function buildProjectsTopbar() {
  document.getElementById("topbar-title").textContent = "My Projects";
  document.getElementById("topbar-controls").innerHTML = `
    <div style="display:flex; align-items:center; gap:8px; width:100%; flex-wrap:nowrap;">
      <div style="position:relative; max-width:300px; flex:1;">
        <span class="mdi mdi-magnify" style="position:absolute; left:10px; top:50%; transform:translateY(-50%); opacity:0.45; font-size:15px; pointer-events:none;"></span>
        <input class="input" id="project-search" placeholder="Search projects..." style="padding-left:30px; width:100%;" />
      </div>
      <div style="flex:1;"></div>
      <button class="btn btn-small" id="sync-all-btn">
        <span class="mdi mdi-sync"></span> Sync All
      </button>
    </div>
  `;
  document.getElementById("project-search").addEventListener("input", e => renderProjectsTable(e.target.value));
  document.getElementById("sync-all-btn").addEventListener("click", () => toast("Sync started", { sub: "Checking all projects for changes…", kind: "info", icon: "mdi-sync" }));
}

function buildProjectSettingsTopbar(p) {
  const label = [p.number, p.name].filter(Boolean).join(" · ");
  document.getElementById("topbar-title").innerHTML = `
    <button class="btn btn-secondary" id="back-to-projects-btn" style="font-size:11px; height:26px; padding:0 10px;">
      <span class="mdi mdi-arrow-left"></span>
    </button>
    <span style="font-size:13px; font-weight:700; white-space:nowrap; margin-left:6px;">${label}</span>
  `;
  document.getElementById("topbar-controls").innerHTML = `
    <div style="display:flex; align-items:center; gap:6px; justify-content:flex-end; width:100%; flex-wrap:nowrap;">
      <button class="btn ${activeProjectTab==="dash"?"btn-small":"btn-secondary"} proj-tab-btn" data-tab="dash" style="font-size:11px; height:26px;">
        <span class="mdi mdi-view-dashboard-outline"></span> Dash
      </button>
      <button class="btn ${activeProjectTab==="permissions"?"btn-small":"btn-secondary"} proj-tab-btn" data-tab="permissions" style="font-size:11px; height:26px;">
        <span class="mdi mdi-shield-account"></span> Permissions
      </button>
      <button class="btn ${activeProjectTab==="grouppolicies"?"btn-small":"btn-secondary"} proj-tab-btn" data-tab="grouppolicies" style="font-size:11px; height:26px;">
        <span class="mdi mdi-account-badge"></span> Group Policies
      </button>
      <button class="btn ${activeProjectTab==="share"?"btn-small":"btn-secondary"} proj-tab-btn" data-tab="share" style="font-size:11px; height:26px;">
        <span class="mdi mdi-share-variant"></span> Share
      </button>
    </div>
  `;
  document.getElementById("back-to-projects-btn").addEventListener("click", closeProjectSettings);
  document.querySelectorAll(".proj-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      activeProjectTab = btn.dataset.tab;
      switchProjectTab(activeProjectTab);
      buildProjectSettingsTopbar(projects[activeProjectIndex]);
    });
  });
}

// ============================================================
//  GROUP POLICIES TOPBAR
// ============================================================

function buildGroupPoliciesTopbar() {
  document.getElementById("topbar-title").textContent = "Group Policies";
  document.getElementById("topbar-controls").innerHTML = `
    <div style="display:flex; align-items:center; gap:6px; width:100%; flex-wrap:nowrap;">
      <button class="btn ${activeGPTab==="emails"?"btn-small":"btn-secondary"} gp-tab-btn" data-gptab="emails" style="font-size:11px; height:26px;">
        <span class="mdi mdi-email-multiple-outline"></span> Emails
      </button>
      <button class="btn ${activeGPTab==="domains"?"btn-small":"btn-secondary"} gp-tab-btn" data-gptab="domains" style="font-size:11px; height:26px;">
        <span class="mdi mdi-domain"></span> Domains
      </button>
      <div style="position:relative; max-width:240px; flex:1;">
        <span class="mdi mdi-magnify" style="position:absolute; left:10px; top:50%; transform:translateY(-50%); opacity:0.45; font-size:15px; pointer-events:none;"></span>
        <input class="input" id="gp-email-search" placeholder="Search emails..." style="padding-left:30px; width:100%; height:30px;" />
      </div>
    </div>
  `;
  document.querySelectorAll(".gp-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      activeGPTab = btn.dataset.gptab;
      switchGPTab(activeGPTab);
      buildGroupPoliciesTopbar();
    });
  });
  document.getElementById("gp-email-search")?.addEventListener("input", () => {
    activeIndexLetter = null;
    updateIndexActive();
    renderGPEmailsTab();
  });
}

function navigateTo(page) {
  if (typeof closeFolderPicker === "function") closeFolderPicker();
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.page === page);
  });
  document.querySelectorAll(".page").forEach(el => el.style.display = "none");
  const target = document.getElementById("page-" + page);
  if (target) target.style.display = "block";

  if (page === "dashboard")     { renderDashboardStats(); renderActivityLog(); buildDashboardTopbar(); }
  if (page === "projects")      { showProjectsList(); buildProjectsTopbar(); renderProjectsTable(); }
  if (page === "grouppolicies") { renderGroupPoliciesPage(); buildGroupPoliciesTopbar(); }
  if (page === "settings")      { renderSettingsPage(); document.getElementById("topbar-title").textContent = "Settings"; document.getElementById("topbar-controls").innerHTML = ""; }
}

// ============================================================
//  PROJECT LIST / SETTINGS VIEW
// ============================================================

function showProjectsList() {
  document.getElementById("projects-list-view").style.display = "block";
  document.getElementById("project-settings-view").style.display = "none";
}

function showProjectSettings() {
  document.getElementById("projects-list-view").style.display = "none";
  document.getElementById("project-settings-view").style.display = "block";
}

function closeProjectSettings() {
  activeProjectIndex = null;
  showProjectsList();
  buildProjectsTopbar();
  renderProjectsTable();
}

function openProjectSettings(index) {
  activeProjectIndex = index;
  activeProjectTab   = "dash";
  pubFolder = null;
  pubSelected.clear();
  const p = projects[index];
  document.getElementById("proj-settings-seed-code").textContent = p.seedCode;
  document.getElementById("proj-email-share-panel").style.display = "none";
  projInviteEmails = [];
  renderProjInviteEmails();
  renderDomainRules();
  renderPermissionsTable();
  setupAddUserRow();
  switchProjectTab("dash");
  showProjectSettings();
  buildProjectSettingsTopbar(p);
}

function switchProjectTab(tab) {
  ["dash","share","permissions","grouppolicies"].forEach(t => {
    const el = document.getElementById("proj-tab-" + t);
    if (el) el.style.display = t === tab ? "block" : "none";
  });
  if (tab === "dash") renderProjectDash();
}

// ============================================================
//  MODAL HELPERS
// ============================================================

const modalIds = ["modal-create-project","modal-seed-code","modal-save-template"];

function openModal(id) {
  document.getElementById("modal-overlay").style.display = "block";
  document.getElementById(id).style.display = "block";
}

function closeModal(id) {
  document.getElementById(id).style.display = "none";
  const anyOpen = modalIds.some(m => document.getElementById(m).style.display !== "none");
  if (!anyOpen) document.getElementById("modal-overlay").style.display = "none";
}

// ============================================================
//  SETTINGS PAGE
// ============================================================

function renderSettingsPage() {
  document.getElementById("account-email").textContent = currentUser.email;
  document.getElementById("account-role").textContent  = isAdmin() ? "Company Admin" : "User";
  const locked = !isAdmin();

  // hydrate values from appSettings
  document.getElementById("sync-dir").value = appSettings.syncDir;
  document.querySelectorAll('input[name="sync-pref"]').forEach(r => r.checked = (r.value === appSettings.syncPref));
  document.getElementById("version-retention").value = appSettings.receivedKeep;
  document.getElementById("archive-issued").checked = appSettings.archiveIssued;
  document.getElementById("archive-date-format").value = appSettings.dateFormat;
  document.getElementById("archive-name-pattern").value = appSettings.namePattern;
  updateArchivePreview();

  // lock states
  document.getElementById("sync-pref-controls").querySelectorAll("input").forEach(i => { i.disabled = locked; i.style.opacity = locked ? "0.4" : "1"; });
  document.getElementById("sync-pref-locked").style.display  = locked ? "block" : "none";
  document.getElementById("version-retention").disabled      = locked;
  document.getElementById("retention-locked").style.display  = locked ? "block" : "none";
  ["sync-dir","sync-dir-browse"].forEach(id => document.getElementById(id).disabled = locked);
  document.getElementById("sync-dir-locked").style.display = locked ? "block" : "none";
  ["archive-issued","archive-date-format","archive-name-pattern"].forEach(id => document.getElementById(id).disabled = locked);
  document.getElementById("archive-locked").style.display = locked ? "block" : "none";
}

function updateArchivePreview() {
  const el = document.getElementById("archive-preview");
  if (!el) return;
  const d = new Date();
  const fmt = appSettings.dateFormat || "YYYYMMDD";
  const map = { YYYY: d.getFullYear(), YY: String(d.getFullYear()).slice(-2), MM: String(d.getMonth()+1).padStart(2,"0"), DD: String(d.getDate()).padStart(2,"0") };
  const date = fmt.replace(/YYYY|YY|MM|DD/g, t => map[t]);
  const sample = (appSettings.namePattern || "{date}_{name}").replace("{date}", date).replace("{name}", "S-001 Foundation Plan.rvt");
  el.textContent =
    `…/City Centre Tower/Structure/\n` +
    `  S-001 Foundation Plan.rvt        ← live (new version)\n` +
    `  Versions/${sample}   ← previous issue`;
}

function setupSettingsPage() {
  document.getElementById("sync-dir-browse")?.addEventListener("click", async () => {
    if (!isAdmin()) return;
    if (IS_TAURI) {
      // Real OS folder picker.
      const chosen = await open({ directory: true, multiple: false, title: "Choose default project location" });
      if (chosen) {
        appSettings.syncDir = chosen;
        document.getElementById("sync-dir").value = chosen;
        updateArchivePreview();
        toast("Default project location updated", { sub: chosen, icon: "mdi-folder-sync-outline" });
      }
      return;
    }
    const picker = window.OS_PICKERS[appSettings.os] || window.OS_PICKERS.windows;
    const chosen = await uiPrompt({
      title: `Choose sync folder`,
      message: `Pick the directory where Sync43 stores managed files (opens ${picker.name} on your machine).`,
      placeholder: appSettings.syncDir, icon: picker.icon, tone: "info", confirmText: "Use this folder",
    });
    if (chosen) { appSettings.syncDir = chosen.trim(); document.getElementById("sync-dir").value = appSettings.syncDir; updateArchivePreview(); toast("Sync location updated", { sub: appSettings.syncDir, icon: "mdi-folder-sync-outline" }); }
  });
  document.getElementById("sync-dir")?.addEventListener("change", e => { appSettings.syncDir = e.target.value.trim(); updateArchivePreview(); persist(); });
  document.querySelectorAll('input[name="sync-pref"]').forEach(r => r.addEventListener("change", () => { if (r.checked) { appSettings.syncPref = r.value; persist(); } }));
  document.getElementById("version-retention")?.addEventListener("change", e => { appSettings.receivedKeep = parseInt(e.target.value) || 5; persist(); });
  document.getElementById("archive-issued")?.addEventListener("change", e => { appSettings.archiveIssued = e.target.checked; persist(); });
  document.getElementById("archive-date-format")?.addEventListener("change", e => { appSettings.dateFormat = e.target.value; updateArchivePreview(); persist(); });
  document.getElementById("archive-name-pattern")?.addEventListener("change", e => { appSettings.namePattern = e.target.value; updateArchivePreview(); persist(); });
}

// ============================================================
//  GROUP POLICIES PAGE
// ============================================================

let activeGPTab = "emails";

function renderGroupPoliciesPage() {
  document.getElementById("grouppolicies-locked-banner").style.display = isAdmin() ? "none" : "block";
  populateGPFolderDropdown();
  buildIndexStrip();
  renderGPEmailsTab();
  renderGPDomainsTab();
  switchGPTab(activeGPTab);
}

function switchGPTab(tab) {
  activeGPTab = tab;
  ["emails","domains"].forEach(t => {
    const el = document.getElementById("gp-tab-" + t);
    if (el) el.style.display = t === tab ? "block" : "none";
  });
  document.querySelectorAll(".gp-tab-btn").forEach(btn => {
    const active = btn.dataset.gptab === tab;
    btn.classList.toggle("active-gp-tab", active);
    btn.classList.toggle("btn-small", active);
    btn.classList.toggle("btn-secondary", !active);
  });
}

function populateGPFolderDropdown() {
  newEmailFolders = [];
  updateNewEmailFolderBtn();
}

// ============================================================
//  GP EMAILS TAB
// ============================================================

function renderGPEmailsTab(filterLetter) {
  const tbody    = document.getElementById("gp-emails-tbody");
  const noEmails = document.getElementById("gp-no-emails");
  if (!tbody) return;

  const searchVal = (document.getElementById("gp-email-search")?.value || "").toLowerCase();
  let list = [...emailPolicies];

  if (filterLetter && filterLetter !== "#") {
    if (filterLetter !== "@") {
      list = list.filter(p => {
        const target = indexMode === "name" ? p.email.split("@")[0] : p.email.split("@")[1] || "";
        return target.toLowerCase().startsWith(filterLetter.toLowerCase());
      });
    }
  }
  if (searchVal) list = list.filter(p => p.email.toLowerCase().includes(searchVal));

  // prune selection to what's still visible/existing
  const visibleEmails = new Set(list.map(p => p.email));
  [...gpSelectedEmails].forEach(e => { if (!emailPolicies.find(p => p.email === e)) gpSelectedEmails.delete(e); });

  renderGPBulkBar();

  if (list.length === 0) { tbody.innerHTML = ""; noEmails.style.display = "block"; updateGPSelectAll(list); return; }
  noEmails.style.display = "none";

  tbody.innerHTML = list.map((ep) => {
    const dp           = getDomainPolicy(ep.email);
    const domainLocked = !!dp;
    const domain       = "@" + ep.email.split("@")[1];
    const sel          = gpSelectedEmails.has(ep.email);
    return `
      <tr class="${sel?"row-selected":""}">
        <td style="width:34px;">
          <span class="ccheck ${sel?"checked":""} gp-row-check" data-email="${ep.email}" ${domainLocked?"style='opacity:0.35; pointer-events:none;'":""}><span class="mdi mdi-check"></span></span>
        </td>
        <td style="font-size:12px; color:var(--color-text-primary);">${ep.email}</td>
        <td>
          ${domainLocked
            ? `<span class="lock-badge"><span class="mdi mdi-lock"></span> ${foldersLabel(dp.folders)} (domain rule)</span>`
            : folderBtnHTML(ep.folders, `data-email="${ep.email}"`, { disabled: !isAdmin() })
          }
        </td>
        <td>
          ${domainLocked
            ? `<span style="font-size:11px; color:var(--color-green);">${domain}</span>`
            : `<button class="btn btn-secondary promote-domain-btn" data-email="${ep.email}"
                style="font-size:10px; height:24px; padding:0 9px;" title="Promote to a domain rule">
                <span class="mdi mdi-arrow-up-circle-outline"></span> ${domain}
               </button>`
          }
        </td>
        <td style="text-align:right;">
          ${isAdmin() ? `<button class="btn btn-danger remove-email-policy-btn" data-email="${ep.email}">
            <span class="mdi mdi-close"></span>
          </button>` : ""}
        </td>
      </tr>`;
  }).join("");

  updateGPSelectAll(list);

  // row checkboxes
  tbody.querySelectorAll(".gp-row-check").forEach(chk => {
    chk.addEventListener("click", () => {
      const email = chk.dataset.email;
      if (gpSelectedEmails.has(email)) gpSelectedEmails.delete(email); else gpSelectedEmails.add(email);
      renderGPEmailsTab(filterLetter);
    });
  });
  // folder picker buttons
  tbody.querySelectorAll(".folder-btn:not([disabled])").forEach(btn => {
    btn.addEventListener("click", () => {
      const email = btn.dataset.email;
      const ep = getEmailPolicy(email);
      openFolderPicker(btn, {
        selected: asFolders(ep?.folders),
        options: allTemplateFolders(),
        onChange: (folders) => applyEmailFolders([email], folders),
      });
    });
  });
  tbody.querySelectorAll(".promote-domain-btn").forEach(btn => {
    btn.addEventListener("click", () => promoteToDomain(btn.dataset.email));
  });
  tbody.querySelectorAll(".remove-email-policy-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      emailPolicies = emailPolicies.filter(p => p.email !== btn.dataset.email);
      gpSelectedEmails.delete(btn.dataset.email);
      renderGPEmailsTab(filterLetter);
      toast("Email policy removed", { kind: "info" });
    });
  });
}

function applyEmailFolders(emails, folders) {
  emails.forEach(email => {
    const ep = getEmailPolicy(email);
    if (ep) ep.folders = folders.slice();
    // propagate to project users not under a domain rule
    projectsForUser(email).forEach(p => {
      const u = p.users?.find(u => u.email === email);
      if (u && !getDomainPolicy(email)) u.folders = folders.slice();
    });
  });
  renderGPEmailsTab(activeIndexLetter);
  const label = foldersLabel(folders);
  toast(emails.length > 1 ? `Updated ${emails.length} policies` : "Policy updated", { sub: label === "— none —" ? "Folder assignment cleared" : `→ ${label}` });
}

function renderGPBulkBar() {
  const host = document.getElementById("gp-bulk-host");
  if (!host) return;
  const n = gpSelectedEmails.size;
  if (n === 0) { host.innerHTML = ""; return; }
  host.innerHTML = `
    <div class="gp-bulk-bar">
      <span class="mdi mdi-checkbox-multiple-marked-outline" style="font-size:18px; color:var(--color-green);"></span>
      <span class="gb-count">${n} email${n>1?"s":""} selected</span>
      <div style="flex:1;"></div>
      <button class="btn btn-secondary" id="gp-bulk-clear" style="height:30px;">Clear</button>
      <button class="btn btn-primary" id="gp-bulk-assign" style="height:30px; padding:0 14px;"><span class="mdi mdi-folder-cog-outline"></span> Assign folders</button>
    </div>`;
  document.getElementById("gp-bulk-clear").onclick = () => { gpSelectedEmails.clear(); renderGPEmailsTab(activeIndexLetter); };
  document.getElementById("gp-bulk-assign").onclick = (e) => {
    openFolderPicker(e.currentTarget, {
      selected: [],
      options: allTemplateFolders(),
      onChange: (folders) => {
        const targets = [...gpSelectedEmails].filter(em => !getDomainPolicy(em));
        applyEmailFolders(targets, folders);
      },
    });
  };
}

function updateGPSelectAll(list) {
  const head = document.getElementById("gp-select-all");
  if (!head) return;
  const selectable = list.filter(ep => !getDomainPolicy(ep.email));
  const allSel = selectable.length > 0 && selectable.every(ep => gpSelectedEmails.has(ep.email));
  head.classList.toggle("checked", allSel);
  head.onclick = () => {
    if (allSel) selectable.forEach(ep => gpSelectedEmails.delete(ep.email));
    else selectable.forEach(ep => gpSelectedEmails.add(ep.email));
    renderGPEmailsTab(activeIndexLetter);
  };
}

async function promoteToDomain(email) {
  const domain = "@" + email.split("@")[1];
  const ep     = getEmailPolicy(email);
  const folders = asFolders(ep?.folders);
  if (!await confirmPolicyAdd(domain, foldersLabel(folders))) return;
  const affected = projectsForDomain(domain);
  if (!await confirmFolderChange(domain, affected, foldersLabel(folders))) return;
  if (!domainPolicies.find(p => p.domain.toLowerCase() === domain.toLowerCase())) {
    domainPolicies.push({ domain, folders });
  }
  renderGPEmailsTab(); renderGPDomainsTab();
  toast("Promoted to domain rule", { sub: `${domain} → ${foldersLabel(folders)}` });
}

function setupGPEmailsTab() {
  document.getElementById("gp-add-email-btn")?.addEventListener("click", () => {
    if (!isAdmin()) return;
    const row = document.getElementById("gp-emails-add-row");
    row.style.display = row.style.display === "flex" ? "none" : "flex";
    if (row.style.display === "flex") {
      document.getElementById("gp-new-email").value = "";
      newEmailFolders = [];
      updateNewEmailFolderBtn();
      document.getElementById("gp-new-email").focus();
    }
  });
  document.getElementById("gp-cancel-email-btn")?.addEventListener("click", () => {
    document.getElementById("gp-emails-add-row").style.display = "none";
  });
  // folder picker for the add-row (optional)
  document.getElementById("gp-new-email-folder-btn")?.addEventListener("click", (e) => {
    openFolderPicker(e.currentTarget, {
      selected: newEmailFolders,
      options: allTemplateFolders(),
      onChange: (folders) => { newEmailFolders = folders; updateNewEmailFolderBtn(); },
    });
  });
  document.getElementById("gp-save-email-btn")?.addEventListener("click", async () => {
    if (!isAdmin()) return;
    const raw = document.getElementById("gp-new-email").value.trim();
    if (!raw) { toast("Enter at least one email address", { kind: "warn" }); return; }
    // allow comma / space / newline separated bulk add
    const emails = raw.split(/[\s,;]+/).filter(e => e.includes("@"));
    if (!emails.length) { toast("Enter a valid email address", { kind: "warn" }); return; }
    let added = 0, skipped = 0;
    emails.forEach(email => {
      if (getEmailPolicy(email)) { skipped++; return; }
      emailPolicies.push({ email, folders: newEmailFolders.slice() });
      added++;
    });
    document.getElementById("gp-emails-add-row").style.display = "none";
    newEmailFolders = [];
    renderGPEmailsTab(); buildIndexStrip();
    const folderNote = newEmailFolders.length ? ` → ${foldersLabel(newEmailFolders)}` : " (no folder assigned)";
    toast(`Added ${added} email${added!==1?"s":""}${skipped?`, ${skipped} already existed`:""}`, { sub: added===1?emails[0]+folderNote:undefined });
  });
}

let newEmailFolders = [];
function updateNewEmailFolderBtn() {
  const btn = document.getElementById("gp-new-email-folder-btn");
  if (!btn) return;
  btn.innerHTML = `<span class="mdi ${newEmailFolders.includes("all")?"mdi-folder-multiple-outline":"mdi-folder-outline"}"></span>
    <span class="fb-label">${newEmailFolders.length?foldersLabel(newEmailFolders):"Folder (optional)"}</span>
    <span class="mdi mdi-menu-down fb-caret"></span>`;
  btn.classList.toggle("is-empty", newEmailFolders.length === 0);
}

// ============================================================
//  INDEX STRIP
// ============================================================

function buildIndexStrip() {
  const container = document.getElementById("index-letters");
  if (!container) return;
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  container.innerHTML = letters.map(l =>
    `<div class="index-letter ${activeIndexLetter===l?"active":""}" data-letter="${l}">${l}</div>`).join("");

  container.querySelectorAll(".index-letter").forEach(el => {
    el.addEventListener("click", () => {
      const letter = el.dataset.letter;
      activeIndexLetter = activeIndexLetter === letter ? null : letter;
      updateIndexActive(); renderGPEmailsTab(activeIndexLetter);
    });
  });

  document.querySelectorAll(".index-letter[data-letter='#'], .index-letter[data-letter='@']").forEach(el => {
    el.addEventListener("click", () => {
      const letter = el.dataset.letter;
      if (letter === "@") { toggleIndexMode(); return; }
      activeIndexLetter = activeIndexLetter === letter ? null : letter;
      updateIndexActive(); renderGPEmailsTab(activeIndexLetter);
    });
  });

  document.getElementById("index-mode-toggle")?.addEventListener("click", toggleIndexMode);
}

function toggleIndexMode() {
  indexMode = indexMode === "name" ? "domain" : "name";
  const modeBtn  = document.getElementById("index-mode-toggle");
  const modeIcon = document.getElementById("index-mode-icon");
  modeBtn.classList.toggle("domain-mode", indexMode === "domain");
  modeIcon.className = indexMode === "domain" ? "mdi mdi-at" : "mdi mdi-account";
  activeIndexLetter = null; updateIndexActive(); renderGPEmailsTab();
}

function updateIndexActive() {
  document.querySelectorAll(".index-letter").forEach(el => {
    el.classList.toggle("active", el.dataset.letter === activeIndexLetter);
  });
}

// ============================================================
//  GP DOMAINS TAB
// ============================================================

function renderGPDomainsTab() {
  const container = document.getElementById("gp-domains-list");
  const noEl      = document.getElementById("gp-no-domains");
  if (!container) return;

  if (domainPolicies.length === 0) { container.innerHTML = ""; noEl.style.display = "block"; return; }
  noEl.style.display = "none";

  container.innerHTML = domainPolicies.map((dp, di) => {
    const domainName = dp.domain.replace(/^@/,"").toLowerCase();
    const policyEmails = emailPolicies.filter(ep => ep.email.split("@")[1].toLowerCase() === domainName);
    const allProjectEmails = [...new Set(
      projects.flatMap(p => p.users || []).map(u => u.email)
        .filter(e => e.split("@")[1]?.toLowerCase() === domainName))];
    const allEmails = [...new Set([...policyEmails.map(ep => ep.email), ...allProjectEmails])];

    const emailRows = allEmails.map(email => {
      const inPolicy = !!getEmailPolicy(email);
      return `
        <div class="domain-email-row">
          <span style="flex:1; color:var(--color-text-primary);">${email}</span>
          ${inPolicy
            ? `<span class="lock-badge"><span class="mdi mdi-lock"></span> ${foldersLabel(dp.folders)} (domain rule)</span>`
            : `<button class="btn btn-secondary add-email-to-gp-btn" data-email="${email}" data-di="${di}"
                style="font-size:10px; height:22px; padding:0 9px;">
                <span class="mdi mdi-plus"></span> Add to Emails
               </button>`}
        </div>`;
    }).join("") || `<div class="domain-email-row" style="opacity:0.4;">No emails from this domain yet.</div>`;

    return `
      <div class="domain-group">
        <div class="domain-group-header" data-di="${di}">
          <span class="domain-group-arrow mdi mdi-chevron-right"></span>
          <span class="domain-group-name">${dp.domain}</span>
          <span class="domain-group-count">${allEmails.length} email${allEmails.length !== 1 ? "s" : ""}</span>
          <span style="flex:1;"></span>
          ${folderBtnHTML(dp.folders, `data-di="${di}"`, { disabled: !isAdmin() })}
          <span style="width:8px;"></span>
          ${isAdmin() ? `<button class="btn btn-danger remove-domain-policy-btn" data-di="${di}">
            <span class="mdi mdi-close"></span></button>` : ""}
        </div>
        <div class="domain-group-body" id="domain-body-${di}">${emailRows}</div>
      </div>`;
  }).join("");

  container.querySelectorAll(".add-email-to-gp-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const email = btn.dataset.email, di = parseInt(btn.dataset.di), dp = domainPolicies[di];
      if (!getEmailPolicy(email)) emailPolicies.push({ email, folders: asFolders(dp.folders) });
      renderGPDomainsTab(); renderGPEmailsTab();
      toast("Added to email policies", { sub: email });
    });
  });
  container.querySelectorAll(".domain-group-header").forEach(header => {
    header.addEventListener("click", e => {
      if (e.target.closest("button")) return;
      const di = header.dataset.di;
      document.getElementById("domain-body-" + di).classList.toggle("open");
      header.querySelector(".domain-group-arrow").classList.toggle("open");
    });
  });
  container.querySelectorAll(".folder-btn:not([disabled])").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const di = parseInt(btn.dataset.di), dp = domainPolicies[di];
      openFolderPicker(btn, {
        selected: asFolders(dp.folders),
        options: allTemplateFolders(),
        onChange: async (folders) => {
          const affected = projectsForDomain(dp.domain);
          if (!await confirmFolderChange(dp.domain, affected, foldersLabel(folders))) return;
          dp.folders = folders.slice();
          const dn = dp.domain.replace(/^@/,"").toLowerCase();
          emailPolicies.forEach(ep => { if (ep.email.split("@")[1].toLowerCase() === dn) ep.folders = folders.slice(); });
          affected.forEach(p => p.users?.forEach(u => { if (u.email.split("@")[1].toLowerCase() === dn) u.folders = folders.slice(); }));
          renderGPDomainsTab(); renderGPEmailsTab();
          toast("Domain rule updated", { sub: `${dp.domain} → ${foldersLabel(folders)}` });
        },
      });
    });
  });
  container.querySelectorAll(".remove-domain-policy-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      domainPolicies.splice(parseInt(btn.dataset.di), 1);
      renderGPDomainsTab(); renderGPEmailsTab();
      toast("Domain rule removed", { kind: "info" });
    });
  });
}

function setupGPDomainsTab() {
  document.getElementById("add-policy-btn")?.addEventListener("click", () => {
    if (!isAdmin()) return;
    const row = document.getElementById("grouppolicies-add-row");
    row.style.display = row.style.display === "flex" ? "none" : "flex";
    if (row.style.display === "flex") { document.getElementById("policy-domain").value = ""; document.getElementById("policy-domain").focus(); }
  });
  document.getElementById("gp-cancel-domain-btn")?.addEventListener("click", () => {
    document.getElementById("grouppolicies-add-row").style.display = "none";
  });
  document.getElementById("gp-save-domain-btn")?.addEventListener("click", async () => {
    if (!isAdmin()) return;
    let domain = document.getElementById("policy-domain").value.trim();
    if (!domain) return;
    if (!domain.startsWith("@")) domain = "@" + domain;
    const matchingEmail = emailPolicies.find(ep => ep.email.split("@")[1].toLowerCase() === domain.replace(/^@/,"").toLowerCase());
    const folders = asFolders(matchingEmail?.folders);
    if (!await confirmPolicyAdd(domain, folders.length?foldersLabel(folders):"(no folder)")) return;
    if (!domainPolicies.find(p => p.domain.toLowerCase() === domain.toLowerCase())) domainPolicies.push({ domain, folders });
    document.getElementById("grouppolicies-add-row").style.display = "none";
    renderGPDomainsTab(); renderGPEmailsTab();
    toast("Domain policy added", { sub: domain });
  });
}

// ============================================================
//  DASHBOARD
// ============================================================

function renderDashboardStats() {
  const host = document.getElementById("dashboard-stats");
  if (!host) return;
  const counts = {};
  ["synced","syncing","pending","failed","offline"].forEach(s => counts[s] = activityLog.filter(r => r.status === s).length);
  const tiles = [
    { label: "Active Projects", icon: "mdi-folder-network", value: projects.length, sub: `${projects.reduce((n,p)=>n+(p.users?.filter(u=>u.active).length||0),0)} active collaborators` },
    { label: "Synced", icon: "mdi-check-circle-outline", value: counts.synced, sub: "Up to date with peers" },
    { label: "In Progress", icon: "mdi-sync", value: counts.syncing + counts.pending, sub: `${counts.syncing} syncing · ${counts.pending} pending` },
    { label: "Needs Attention", icon: "mdi-alert-circle-outline", value: counts.failed + counts.offline, sub: `${counts.failed} failed · ${counts.offline} offline` },
  ];
  host.innerHTML = tiles.map(t => `
    <div class="stat-tile">
      <div class="stat-label"><span class="mdi ${t.icon}"></span> ${t.label}</div>
      <div class="stat-value">${t.value}</div>
      <div class="stat-sub">${t.sub}</div>
    </div>`).join("");
}

function renderActivityLog() {
  const container = document.getElementById("activity-log");
  const filtered  = currentFilter === "all" ? activityLog : activityLog.filter(r => r.status === currentFilter);
  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state"><span class="mdi mdi-inbox-outline"></span><div class="es-main">No activity to show</div><div class="es-sub">${currentFilter==="all"?"Publish a file to see it appear here.":"Try a different filter."}</div></div>`;
    return;
  }
  container.innerHTML = filtered.map((row, i) => `
    <div class="log-row" data-logi="${i}" style="cursor:pointer;" title="Open ${row.project} · ${row.folder}">
      <span class="log-file"><span class="mdi ${fileIcon(row.file)}"></span><span class="fname">${row.file}</span></span>
      <span class="log-project">${row.project}</span>
      <span class="log-folder">${row.folder}</span>
      <span class="log-peer">${row.peer}</span>
      <span class="status-pill ${row.status}"><span class="status-dot ${row.status}"></span>${row.status}</span>
      <span class="log-time">${row.time}</span>
    </div>`).join("");

  container.querySelectorAll(".log-row").forEach(el => {
    el.addEventListener("click", () => {
      const r = filtered[parseInt(el.dataset.logi)];
      if (r) goToActivity(r.project, r.folder, r.file);
    });
  });
}

function goToActivity(project, folder, file) {
  const idx = projects.findIndex(p => p.name === project);
  if (idx === -1) { toast("Project not found", { kind: "warn" }); return; }
  navigateTo("projects");
  openProjectSettings(idx);          // opens the Dash tab
  const proj = projects[idx];
  const allowed = foldersForUserInProject(proj);
  if (folder && allowed.includes(folder)) pubFolder = folder;
  flashFile = file;
  pubSelected.clear();
  renderProjectDash();
}

// ============================================================
//  PROJECTS TABLE
// ============================================================

function renderProjectsTable(filter) {
  const tbody      = document.getElementById("projects-tbody");
  const noProjects = document.getElementById("no-projects");
  if (!tbody) return;
  const search = (filter !== undefined ? filter : (document.getElementById("project-search")?.value || "")).toLowerCase();
  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search) ||
    (p.number||"").toLowerCase().includes(search) ||
    (p.address||"").toLowerCase().includes(search)
  ).slice().sort((a, b) => {
    const numA = parseInt(a.number) || 0, numB = parseInt(b.number) || 0;
    if (numA !== numB) return numA - numB;
    return a.name.localeCompare(b.name);
  });
  if (filtered.length === 0) { tbody.innerHTML = ""; noProjects.style.display = "block"; return; }
  noProjects.style.display = "none";
  tbody.innerHTML = filtered.map((p) => {
    const realIndex = projects.indexOf(p);
    const disabled = !!p.disabled;
    return `
    <tr data-index="${realIndex}" style="${disabled?"opacity:0.5;":""}">
      <td><span class="status-dot ${disabled?"offline":"online"}"></span></td>
      <td class="proj-name">${p.name} ${disabled?`<span class="status-pill offline" style="margin-left:6px;">Disabled</span>`:""}</td>
      <td class="proj-number">${p.number||"—"}</td>
      <td class="proj-address">${p.address||"—"}</td>
      <td class="proj-date">${p.startDate||"—"}</td>
      <td class="proj-date">${p.endDate||"—"}</td>
      <td class="proj-date">${p.created}</td>
      <td style="text-align:right;">
        <button class="btn btn-secondary proj-settings-btn" data-index="${realIndex}" title="Project settings"
          style="padding:0; width:28px; height:28px; border-radius:6px;">
          <span class="mdi mdi-cog-outline"></span>
        </button>
      </td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll(".proj-settings-btn").forEach(btn => {
    btn.addEventListener("click", e => { e.stopPropagation(); openProjectConfigDialog(parseInt(btn.dataset.index)); });
  });
  tbody.querySelectorAll("tr").forEach((row) => {
    row.addEventListener("click", () => openProjectSettings(parseInt(row.dataset.index)));
  });
}

// ---- Project Settings dialog (from the cog) --------------------------------
function openProjectConfigDialog(index) {
  const p = projects[index];
  if (!p) return;
  const ov = document.getElementById("modal-overlay");
  const host = document.getElementById("ui-dialog");
  ov.style.display = "block";
  host.style.width = "460px";

  const render = () => {
    host.innerHTML = `
      <div class="card modal-card modal-pop" style="margin:0;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
          <div class="section-label" style="margin:0;"><span class="mdi mdi-cog-outline"></span> Project Settings</div>
          <button class="btn btn-ghost" id="pc-close" style="width:28px; height:28px; padding:0;"><span class="mdi mdi-close"></span></button>
        </div>
        <div class="help-text" style="margin-bottom:14px;">${p.number?p.number+" · ":""}${p.name}</div>

        <button class="btn btn-secondary" id="pc-open" style="width:100%; justify-content:flex-start; margin-bottom:8px;">
          <span class="mdi mdi-folder-open-outline"></span> Open project dashboard
        </button>

        <div style="display:flex; align-items:center; gap:11px; padding:11px 12px; background:var(--color-sunken); border:1px solid var(--color-divider); border-radius:8px; margin-bottom:8px;">
          <span class="mdi ${p.disabled?"mdi-pause-circle-outline":"mdi-power"}" style="font-size:18px; color:${p.disabled?"var(--color-pending)":"var(--color-green)"};"></span>
          <div style="flex:1;">
            <div style="font-size:12px; font-weight:600;">${p.disabled?"Project disabled":"Project active"}</div>
            <div style="font-size:11px; color:var(--color-text-secondary);">${p.disabled?"Syncing is paused for all members.":"Syncing is running for all members."}</div>
          </div>
          <button class="btn ${p.disabled?"btn-small":"btn-danger"}" id="pc-toggle" style="height:28px; ${p.disabled?"":"border:1px solid var(--color-danger);"}">
            ${p.disabled?'<span class="mdi mdi-play"></span> Enable':'<span class="mdi mdi-pause"></span> Disable'}
          </button>
        </div>

        <div style="font-size:10.5px; color:var(--color-text-tertiary); text-align:center; padding:8px 0 2px;">
          <span class="mdi mdi-dots-horizontal"></span> More project settings to follow
        </div>
      </div>`;
    const close = () => { host.style.display="none"; host.innerHTML=""; host.style.width=""; _maybeHideOverlay(); };
    document.getElementById("pc-close").onclick = close;
    document.getElementById("pc-open").onclick  = () => { close(); openProjectSettings(index); };
    document.getElementById("pc-toggle").onclick = async () => {
      if (!p.disabled) {
        const ok = await uiConfirm({ title:"Disable project?", message:`Disabling "${p.name}" pauses syncing for every member until it's re-enabled.`, tone:"danger", danger:true, confirmText:"Disable project", icon:"mdi-pause-circle-outline" });
        if (!ok) { openProjectConfigDialog(index); return; }
        p.disabled = true; toast("Project disabled", { kind:"warn", sub:p.name, icon:"mdi-pause-circle-outline" });
      } else {
        p.disabled = false; toast("Project enabled", { sub:p.name, icon:"mdi-play-circle-outline" });
      }
      renderProjectsTable();
      render();
    };
  };
  host.style.display = "block";
  render();
}

// ============================================================
//  DOMAIN RULES (project level)
// ============================================================

function renderDomainRules() {
  const list = document.getElementById("domain-rules-list");
  if (!list) return;
  const p = projects[activeProjectIndex];
  if (!p?.domainRules?.length) {
    list.innerHTML = `<div style="font-size:11px; opacity:0.4; padding:6px 2px;">No domain rules yet.</div>`;
    return;
  }
  list.innerHTML = p.domainRules.map((rule,i) => `
    <div class="policy-row">
      <span class="policy-domain">${rule.domain}</span>
      <span class="mdi mdi-arrow-right" style="opacity:0.4;"></span>
      <span class="policy-folder">${asFolders(rule.folders).length ? foldersLabel(rule.folders) : "<em style='opacity:0.5;'>inherit</em>"}</span>
      ${isAdmin() ? `<button class="btn btn-danger remove-domain-rule" data-index="${i}"><span class="mdi mdi-close"></span></button>` : ""}
    </div>`).join("");
  if (isAdmin()) {
    list.querySelectorAll(".remove-domain-rule").forEach(btn => {
      btn.addEventListener("click", () => {
        projects[activeProjectIndex].domainRules.splice(parseInt(btn.dataset.index),1);
        renderDomainRules();
      });
    });
  }
}

function setupDomainRuleAdd() {
  document.getElementById("add-domain-rule-btn")?.addEventListener("click", () => {
    if (!isAdmin()) return;
    const row = document.getElementById("domain-rule-add-row");
    row.style.display = row.style.display === "flex" ? "none" : "flex";
    if (row.style.display === "flex") { document.getElementById("perm-domain-input").value = ""; document.getElementById("perm-domain-input").focus(); }
  });
  document.getElementById("domain-rule-cancel-btn")?.addEventListener("click", () => {
    document.getElementById("domain-rule-add-row").style.display = "none";
  });
  document.getElementById("domain-rule-save-btn")?.addEventListener("click", async () => {
    if (!isAdmin()) return;
    let domain = document.getElementById("perm-domain-input").value.trim();
    if (!domain) return;
    if (!domain.startsWith("@")) domain = "@" + domain;
    const dp = domainPolicies.find(p => p.domain.toLowerCase() === domain.toLowerCase());
    const matchingEmail = emailPolicies.find(ep => ep.email.split("@")[1].toLowerCase() === domain.replace(/^@/,"").toLowerCase());
    const folders = asFolders(dp?.folders).length ? asFolders(dp.folders) : asFolders(matchingEmail?.folders);
    if (!await confirmPolicyAdd(domain, folders.length?foldersLabel(folders):"(inherit from policies)")) return;
    const p = projects[activeProjectIndex];
    if (!p.domainRules) p.domainRules = [];
    if (!p.domainRules.find(r => r.domain.toLowerCase() === domain.toLowerCase())) p.domainRules.push({ domain, folders });
    document.getElementById("domain-rule-add-row").style.display = "none";
    renderDomainRules();
    toast("Domain rule added", { sub: domain });
  });
}

// ============================================================
//  ADD USER ROW (Permissions tab)
// ============================================================

function setupAddUserRow() {
  const btn = document.getElementById("add-user-btn"), row = document.getElementById("add-user-row");
  const saveBtn = document.getElementById("add-user-save-btn"), cancelBtn = document.getElementById("add-user-cancel-btn");
  const emailInput = document.getElementById("add-user-email-input"), datalist = document.getElementById("gp-email-datalist");
  if (datalist) datalist.innerHTML = emailPolicies.map(ep => `<option value="${ep.email}">`).join("");

  btn?.addEventListener("click", () => {
    if (!isAdmin()) return;
    row.style.display = row.style.display === "flex" ? "none" : "flex";
    if (row.style.display === "flex") {
      emailInput.value = ""; emailInput.focus();
      if (datalist) datalist.innerHTML = emailPolicies.map(ep => `<option value="${ep.email}">`).join("");
    }
  });
  cancelBtn?.addEventListener("click", () => { row.style.display = "none"; });
  saveBtn?.addEventListener("click", () => {
    const email = emailInput.value.trim();
    if (!email || !email.includes("@")) { toast("Enter a valid email address", { kind: "warn" }); return; }
    const p = projects[activeProjectIndex]; if (!p) return;
    if (!p.users) p.users = [];
    if (p.users.find(u => u.email === email)) { toast("User is already on the project", { kind: "warn" }); return; }
    const effective = getEffectiveFolders(email, p.folders[0] ? [p.folders[0]] : []);
    p.users.push({ email, active: false, folders: effective.folders, joined: new Date().toLocaleDateString("en-NZ") });
    row.style.display = "none";
    renderPermissionsTable();
    toast("User added", { sub: email });
  });
  emailInput?.addEventListener("keydown", e => { if (e.key === "Enter") saveBtn?.click(); });
}

// ============================================================
//  PERMISSIONS TABLE
// ============================================================

function renderPermissionsTable() {
  const tbody   = document.getElementById("permissions-tbody");
  const noUsers = document.getElementById("no-users");
  if (!tbody) return;
  const p = projects[activeProjectIndex];
  if (!p?.users?.length) { tbody.innerHTML = ""; noUsers.style.display = "block"; return; }
  noUsers.style.display = "none";

  tbody.innerHTML = p.users.map((u,i) => {
    const effective  = getEffectiveFolders(u.email, u.folders);
    const isLocked   = !!effective.lockedBy;
    const allSaved   = !!getEmailPolicy(u.email) && !!getDomainPolicy(u.email);
    return `
      <tr>
        <td><span class="status-dot ${u.active?"online":"failed"} ${isAdmin()?"clickable":""}" data-userindex="${i}" title="${u.active?"Active":"Inactive"}"></span></td>
        <td style="font-size:12px;">${u.email}</td>
        <td>
          ${isLocked
            ? `<span class="lock-badge"><span class="mdi mdi-lock"></span> ${foldersLabel(effective.folders)} (${effective.lockedBy} rule)</span>`
            : folderBtnHTML(u.folders, `data-userindex="${i}"`, { disabled: !isAdmin() })}
        </td>
        <td style="font-size:11px; opacity:0.6;">${u.joined}</td>
        <td>
          <button class="btn ${allSaved?"btn-secondary":"btn-small"} save-to-policy-btn" data-userindex="${i}"
            style="font-size:10px; height:26px; padding:0 9px; ${allSaved?"opacity:0.45; cursor:not-allowed;":""}" ${allSaved?"disabled":""}>
            <span class="mdi mdi-account-badge"></span> ${allSaved?"Saved":"Save"}
          </button>
        </td>
        <td style="text-align:right;">
          ${isAdmin() ? `<button class="btn btn-danger remove-user-btn" data-userindex="${i}"><span class="mdi mdi-close"></span></button>` : ""}
        </td>
      </tr>`;
  }).join("");

  if (isAdmin()) {
    tbody.querySelectorAll(".status-dot.clickable").forEach(dot => {
      dot.addEventListener("click", () => {
        projects[activeProjectIndex].users[parseInt(dot.dataset.userindex)].active ^= true;
        renderPermissionsTable();
      });
    });
    tbody.querySelectorAll(".folder-btn:not([disabled])").forEach(btn => {
      btn.addEventListener("click", () => {
        const ui = parseInt(btn.dataset.userindex);
        const u = projects[activeProjectIndex].users[ui];
        openFolderPicker(btn, {
          selected: asFolders(u.folders),
          options: projects[activeProjectIndex].folders,
          onChange: (folders) => { u.folders = folders.slice(); renderPermissionsTable(); },
        });
      });
    });
    tbody.querySelectorAll(".remove-user-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        projects[activeProjectIndex].users.splice(parseInt(btn.dataset.userindex),1);
        renderPermissionsTable();
      });
    });
  }
  tbody.querySelectorAll(".save-to-policy-btn:not([disabled])").forEach(btn => {
    btn.addEventListener("click", () => saveUserToGroupPolicy(parseInt(btn.dataset.userindex)));
  });
}

async function saveUserToGroupPolicy(userIndex) {
  const p = projects[activeProjectIndex], user = p.users[userIndex];
  if (!user) return;
  const email = user.email, domain = "@" + email.split("@")[1];
  const effective = getEffectiveFolders(email, user.folders);
  const folders = effective.folders;

  const choice = await uiChoose({
    title: "Save to Group Policies",
    message: "Save this user as an individual email policy, or as a rule for their whole domain?",
    icon: "mdi-account-badge",
    aText: `Email · ${email.split("@")[0]}`,
    bText: `Domain · ${domain}`,
  });
  if (!choice) return;
  const saveAs = choice === "a" ? email : domain;
  if (!await confirmPolicyAdd(saveAs, foldersLabel(folders))) return;
  if (choice === "a") { if (!getEmailPolicy(email)) emailPolicies.push({ email, folders: folders.slice() }); }
  else { if (!domainPolicies.find(pp => pp.domain.toLowerCase() === domain.toLowerCase())) domainPolicies.push({ domain, folders: folders.slice() }); }
  renderPermissionsTable();
  toast("Saved to Group Policies", { sub: `${saveAs} → ${foldersLabel(folders)}` });
}

// ============================================================
//  PROJECT SHARE TAB
// ============================================================

function setupProjectShareTab() {
  document.getElementById("proj-settings-seed-code").addEventListener("click", () => {
    navigator.clipboard?.writeText(document.getElementById("proj-settings-seed-code").textContent);
    toast("Seed code copied", { icon: "mdi-content-copy" });
  });
  document.getElementById("proj-copy-seed-btn").addEventListener("click", () => {
    navigator.clipboard?.writeText(document.getElementById("proj-settings-seed-code").textContent);
    toast("Seed code copied", { icon: "mdi-content-copy" });
  });
  document.getElementById("proj-share-email-btn").addEventListener("click", () => {
    const panel = document.getElementById("proj-email-share-panel");
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  });
  document.getElementById("proj-add-invite-btn").addEventListener("click", addProjInviteEmail);
  document.getElementById("proj-invite-email-input").addEventListener("keydown", e => { if(e.key==="Enter") addProjInviteEmail(); });
  document.getElementById("proj-send-invites-btn").addEventListener("click", sendProjInvites);
}

function addProjInviteEmail() {
  const input = document.getElementById("proj-invite-email-input");
  const email = input.value.trim();
  if (!email || !email.includes("@") || projInviteEmails.includes(email)) return;
  projInviteEmails.push(email); input.value = "";
  renderProjInviteEmails();
}

function renderProjInviteEmails() {
  const list = document.getElementById("proj-invite-email-list");
  if (!list) return;
  list.innerHTML = projInviteEmails.map((email,i) => `
    <div class="email-chip">
      <span style="flex:1;">${email}</span>
      <button class="btn btn-danger proj-remove-invite" data-index="${i}"><span class="mdi mdi-close"></span></button>
    </div>`).join("");
  list.querySelectorAll(".proj-remove-invite").forEach(btn => {
    btn.addEventListener("click", () => { projInviteEmails.splice(parseInt(btn.dataset.index),1); renderProjInviteEmails(); });
  });
}

function sendProjInvites() {
  if (!projInviteEmails.length) { toast("Add at least one email address", { kind: "warn" }); return; }
  const p = projects[activeProjectIndex];
  if (!p.users) p.users = [];
  projInviteEmails.forEach(email => {
    if (!p.users.find(u => u.email===email)) {
      const effective = getEffectiveFolders(email, p.folders[0] ? [p.folders[0]] : []);
      p.users.push({ email, active:true, folders: effective.folders, joined:new Date().toLocaleDateString("en-NZ") });
    }
  });
  toast(`Invites sent to ${projInviteEmails.length} recipient${projInviteEmails.length>1?"s":""}`, { icon: "mdi-send" });
  projInviteEmails = [];
  renderProjInviteEmails(); renderPermissionsTable();
  document.getElementById("proj-email-share-panel").style.display = "none";
}

// ============================================================
//  SEED CODE MODAL
// ============================================================

function generateSeedCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const rand  = n => Array.from({length:n}, () => chars[Math.floor(Math.random()*chars.length)]).join("");
  return `S43-${rand(4)}-${rand(4)}`;
}

function showSeedCode(code) {
  document.getElementById("seed-code-display").textContent = code;
  document.getElementById("email-share-panel").style.display = "none";
  inviteEmails = []; renderInviteEmails();
  closeModal("modal-create-project");
  openModal("modal-seed-code");
}

function setupSeedCodeModal() {
  document.getElementById("seed-code-display").addEventListener("click", () => {
    navigator.clipboard?.writeText(document.getElementById("seed-code-display").textContent);
    toast("Seed code copied", { icon: "mdi-content-copy" });
  });
  document.getElementById("copy-seed-btn").addEventListener("click", () => {
    navigator.clipboard?.writeText(document.getElementById("seed-code-display").textContent);
    toast("Seed code copied", { icon: "mdi-content-copy" });
  });
  document.getElementById("share-via-email-btn").addEventListener("click", () => {
    const panel = document.getElementById("email-share-panel");
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  });
  document.getElementById("add-invite-email-btn").addEventListener("click", addInviteEmail);
  document.getElementById("invite-email-input").addEventListener("keydown", e => { if(e.key==="Enter") addInviteEmail(); });
  document.getElementById("send-invites-btn").addEventListener("click", sendInvites);
  document.getElementById("seed-close-btn").addEventListener("click", () => closeModal("modal-seed-code"));
  document.getElementById("open-project-btn").addEventListener("click", () => { closeModal("modal-seed-code"); navigateTo("projects"); openProjectSettings(activeProjectIndex); });
}

function addInviteEmail() {
  const input = document.getElementById("invite-email-input");
  const email = input.value.trim();
  if (!email || !email.includes("@") || inviteEmails.includes(email)) return;
  inviteEmails.push(email); input.value = ""; renderInviteEmails();
}

function renderInviteEmails() {
  const list = document.getElementById("invite-email-list");
  list.innerHTML = inviteEmails.map((email,i) => `
    <div class="email-chip">
      <span style="flex:1;">${email}</span>
      <button class="btn btn-danger invite-remove" data-index="${i}"><span class="mdi mdi-close"></span></button>
    </div>`).join("");
  list.querySelectorAll(".invite-remove").forEach(btn => {
    btn.addEventListener("click", () => { inviteEmails.splice(parseInt(btn.dataset.index),1); renderInviteEmails(); });
  });
}

function sendInvites() {
  if (!inviteEmails.length) { toast("Add at least one email address", { kind: "warn" }); return; }
  const p = projects[projects.length-1];
  if (p) {
    if (!p.users) p.users = [];
    inviteEmails.forEach(email => {
      if (!p.users.find(u => u.email===email)) {
        const effective = getEffectiveFolders(email, p.folders[0] ? [p.folders[0]] : []);
        p.users.push({ email, active:true, folders:effective.folders, joined:new Date().toLocaleDateString("en-NZ") });
      }
    });
  }
  toast(`Invites sent to ${inviteEmails.length} recipient${inviteEmails.length>1?"s":""}`, { icon: "mdi-send" });
  inviteEmails = []; renderInviteEmails();
  document.getElementById("email-share-panel").style.display = "none";
}

// ============================================================
//  CREATE PROJECT
// ============================================================

async function createProject() {
  const name = document.getElementById("proj-name").value.trim();
  if (!name) { toast("Please enter a project name", { kind: "warn" }); return; }
  const location = document.getElementById("proj-location").value.trim();
  if (IS_TAURI && !location) { toast("Please choose a project location", { kind: "warn" }); return; }
  const templateId = document.getElementById("proj-template").value;
  const seedCode   = generateSeedCode();
  const project = {
    name,
    number:      document.getElementById("proj-number").value.trim(),
    address:     document.getElementById("proj-address").value.trim(),
    startDate:   document.getElementById("proj-start").value,
    endDate:     document.getElementById("proj-end").value,
    folders:     clonedFolders ? flattenTop(clonedFolders) : templates.find(t => t.id===templateId)?.folders || [],
    seedCode,
    created:     new Date().toLocaleDateString("en-NZ"),
    users:       [],
    domainRules: [],
    localPath:   null,
  };
  // Create the real folder tree on disk before adding the project.
  if (IS_TAURI) {
    try {
      project.localPath = await invoke("create_project_folders", {
        base: location, name: project.name, folders: project.folders,
      });
    } catch (err) {
      toast("Could not create project folders", { kind: "warn", sub: String(err) });
      return;
    }
  }
  projects.push(project);
  activeProjectIndex = projects.length - 1;
  clonedFolders = null;
  document.getElementById("folder-preview").style.display = "none";
  ["proj-name","proj-number","proj-address","proj-start","proj-end"].forEach(id => { document.getElementById(id).value = ""; });
  showSeedCode(seedCode);
  toast("Project created", { sub: project.localPath || name, icon: "mdi-folder-plus-outline" });
}

function flattenTop(paths) {
  return [...new Set(paths.map(p => p.split("/")[0]))];
}

// ============================================================
//  FOLDER CLONE
// ============================================================

function buildTree(paths) {
  const root = {};
  for (const p of paths) {
    const parts = p.split("/"); let node = root;
    for (const part of parts) { if (!node[part]) node[part] = {}; node = node[part]; }
  }
  return root;
}

function renderTreeNode(name, children) {
  const hasChildren = Object.keys(children).length > 0;
  const item  = document.createElement("div"); item.className = "tree-item";
  const row   = document.createElement("div"); row.className  = "tree-row";
  const arrow = document.createElement("span"); arrow.className = "tree-arrow mdi mdi-chevron-right"; if (!hasChildren) arrow.style.visibility = "hidden";
  const icon  = document.createElement("span"); icon.className = "mdi mdi-folder-outline"; icon.style.color = "var(--color-pending)";
  const label = document.createElement("span"); label.textContent = name;
  row.appendChild(arrow); row.appendChild(icon); row.appendChild(label); item.appendChild(row);
  if (hasChildren) {
    const cc = document.createElement("div"); cc.className = "tree-children collapsed";
    for (const [n,c] of Object.entries(children)) cc.appendChild(renderTreeNode(n,c));
    item.appendChild(cc);
    row.addEventListener("click", () => { const o = !cc.classList.contains("collapsed"); cc.classList.toggle("collapsed",o); arrow.classList.toggle("open",!o); });
  }
  return item;
}

function renderFolderTree(folders, container) {
  container.innerHTML = "";
  if (!folders?.length) { container.textContent = "No folders found."; return; }
  const tree = buildTree(folders);
  for (const [name,children] of Object.entries(tree)) container.appendChild(renderTreeNode(name,children));
}

async function cloneFolderStructure() {
  try {
    const selected = await open({ directory:true, multiple:false, title:"Select Folder to Clone" });
    if (!selected) return;
    const folders = await invoke("scan_folder_structure", { path: selected });
    clonedFolders = folders;
    renderFolderTree(folders, document.getElementById("folder-tree"));
    document.getElementById("folder-preview").style.display = "block";
    toast("Folder structure cloned", { sub: selected, icon: "mdi-content-copy" });
  } catch(err) {
    toast("Could not read folder structure", { kind: "warn" });
  }
}

// ============================================================
//  TEMPLATE SAVE
// ============================================================

function confirmSaveTemplate() {
  const name = document.getElementById("template-name").value.trim();
  if (!name) { toast("Please enter a template name", { kind: "warn" }); return; }
  const id = name.toLowerCase().replace(/\s+/g,"-");
  templates.push({ id, name, folders: clonedFolders ? flattenTop(clonedFolders) : [] });
  const select = document.getElementById("proj-template");
  const option = document.createElement("option");
  option.value = id; option.textContent = name;
  select.appendChild(option); select.value = id;
  closeModal("modal-save-template");
  toast("Template saved", { sub: name });
}

// ============================================================
//  INIT
// ============================================================

function seedState() {
  // Deep clone seed data so prototype edits don't mutate the source object.
  const S = window.SEED;
  projects       = JSON.parse(JSON.stringify(S.projects));
  emailPolicies  = JSON.parse(JSON.stringify(S.emailPolicies));
  domainPolicies = JSON.parse(JSON.stringify(S.domainPolicies));
  activityLog    = JSON.parse(JSON.stringify(S.activityLog));
  appSettings    = JSON.parse(JSON.stringify(window.DEFAULT_SETTINGS));
}

window.addEventListener("DOMContentLoaded", async () => {
  loadPublicDomains();
  if (IS_TAURI) await loadStateFromDisk();
  else seedState();

  // Stage 1 runs in local mode — be honest about connection status.
  if (IS_TAURI) {
    const dot = document.getElementById("conn-dot"), lbl = document.getElementById("conn-label");
    if (dot) dot.className = "status-dot pending";
    if (lbl) lbl.textContent = "Local mode — P2P in Stage 3";
  }

  // Safety nets so nothing is lost when the window hides to tray.
  if (IS_TAURI) {
    setInterval(persist, 20000);
    document.addEventListener("visibilitychange", () => { if (document.hidden) persist(); });
  }

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => navigateTo(btn.dataset.page));
  });

  document.getElementById("create-project-btn").addEventListener("click",  () => {
    // Prefill the project location from the default in Settings.
    const loc = document.getElementById("proj-location");
    if (loc && !loc.value.trim()) loc.value = appSettings.syncDir || "";
    openModal("modal-create-project");
  });
  document.getElementById("proj-location-browse")?.addEventListener("click", async () => {
    if (!IS_TAURI) { toast("Folder picker is only available in the app", { kind: "info" }); return; }
    const sel = await open({ directory: true, multiple: false, title: "Choose project location" });
    if (sel) document.getElementById("proj-location").value = sel;
  });
  document.getElementById("modal-close-btn").addEventListener("click",     () => closeModal("modal-create-project"));
  document.getElementById("modal-cancel-btn").addEventListener("click",    () => closeModal("modal-create-project"));
  document.getElementById("modal-create-btn").addEventListener("click",    createProject);
  document.getElementById("clone-folder-btn").addEventListener("click",    cloneFolderStructure);
  document.getElementById("clear-clone-btn").addEventListener("click",     () => { clonedFolders=null; document.getElementById("folder-preview").style.display="none"; });
  document.getElementById("save-template-btn").addEventListener("click",   () => { document.getElementById("template-name").value=""; openModal("modal-save-template"); });
  document.getElementById("save-template-confirm-btn").addEventListener("click", confirmSaveTemplate);
  document.getElementById("save-template-cancel-btn").addEventListener("click",  () => closeModal("modal-save-template"));

  // overlay click closes the topmost simple modal
  document.getElementById("modal-overlay").addEventListener("click", () => {
    ["modal-create-project","modal-seed-code","modal-save-template"].forEach(id => {
      const el = document.getElementById(id); if (el && el.style.display !== "none") closeModal(id);
    });
  });

  setupSeedCodeModal();
  setupProjectShareTab();
  setupDomainRuleAdd();
  setupGPEmailsTab();
  setupGPDomainsTab();
  setupSettingsPage();
  setupPublishPage();

  navigateTo("dashboard");
});
