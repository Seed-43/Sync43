// ============================================================
//  Sync43 Prototype — Mock layer, seed data, dialogs & toasts
//  (browser-runnable replacement for the Tauri backend)
// ============================================================

// ---- Mock Tauri shim -------------------------------------------------------
// The real app talks to a Rust backend via window.__TAURI__. When the file is
// opened directly in a browser (UI prototyping) we stub it so screens work.
// __MOCK__ lets the rest of the code know it's running outside Tauri.
window.__TAURI__ = window.__TAURI__ || {
  __MOCK__: true,
  core: {
    invoke: async (cmd, args) => {
      if (cmd === "scan_folder_structure") {
        // Pretend we scanned a real directory.
        return [
          "Architecture/Plans",
          "Architecture/Details",
          "Architecture/Schedules",
          "Structure/Foundations",
          "Structure/Framing",
          "Civil/Drainage",
          "Civil/Earthworks",
          "Services/Mechanical",
          "Services/Electrical",
          "Documents/Specifications",
          "Documents/Reports",
        ];
      }
      return null;
    },
  },
  dialog: {
    open: async () => "/Users/fred/Projects/City Centre Tower",
  },
};

// ---- Inlined public domains (was fetched from /assets) ---------------------
window.PUBLIC_DOMAINS = [
  "gmail.com","googlemail.com","hotmail.com","hotmail.co.nz","hotmail.co.uk",
  "outlook.com","outlook.co.nz","live.com","live.co.nz","yahoo.com","yahoo.co.nz",
  "yahoo.co.uk","icloud.com","me.com","mac.com","protonmail.com","proton.me",
  "xtra.co.nz","clear.net.nz","slingshot.co.nz","orcon.net.nz","vodafone.co.nz",
  "2degrees.nz","aol.com","msn.com","zoho.com",
];

// ---- Seed data -------------------------------------------------------------
// Realistic content so every screen is populated on load.
window.SEED = {
  projects: [
    {
      name: "City Centre Tower", number: "2401", address: "120 Albert St, Auckland",
      startDate: "2025-02-03", endDate: "2027-08-30",
      folders: ["Architecture","Structure","Civil","Mechanical","Electrical","Plumbing","Documents"],
      seedCode: "S43-7HQK-3M2P", created: "3/02/2025",
      users: [
        { email: "david@smithstructural.co.nz", active: true,  folders: ["Structure"],    joined: "5/02/2025" },
        { email: "priya@smithstructural.co.nz", active: true,  folders: ["Structure"],    joined: "5/02/2025" },
        { email: "mark@jonesarch.co.nz",        active: true,  folders: ["Architecture"], joined: "6/02/2025" },
        { email: "lucy@mepgroup.co.nz",         active: false, folders: ["Mechanical"],   joined: "9/02/2025" },
        { email: "fred@nagel.co.nz",            active: true,  folders: ["all"],          joined: "3/02/2025" },
      ],
      domainRules: [
        { domain: "@smithstructural.co.nz", folders: ["Structure"] },
      ],
    },
    {
      name: "Harbour Bridge Retrofit", number: "2398", address: "SH1 Northern Approach, Auckland",
      startDate: "2024-11-12", endDate: "2026-12-15",
      folders: ["Survey","Civil","Structural","Environmental","Documents"],
      seedCode: "S43-PB9D-XK4T", created: "12/11/2024",
      users: [
        { email: "mark@jonesarch.co.nz", active: true,  folders: ["Structural"],    joined: "13/11/2024" },
        { email: "sam@civilco.co.nz",    active: true,  folders: ["Civil"],          joined: "15/11/2024" },
        { email: "tina@civilco.co.nz",   active: false, folders: ["Civil"],          joined: "20/11/2024" },
      ],
      domainRules: [],
    },
    {
      name: "Westfield Carpark", number: "2375", address: "277 Broadway, Newmarket",
      startDate: "2024-06-01", endDate: "2025-10-30",
      folders: ["Architecture","Joinery","Mechanical","Electrical","Documents"],
      seedCode: "S43-44LM-9QZR", created: "1/06/2024",
      users: [
        { email: "lucy@mepgroup.co.nz", active: true,  folders: ["Mechanical"], joined: "3/06/2024" },
        { email: "ben@sparkltd.co.nz",  active: true,  folders: ["Electrical"], joined: "4/06/2024" },
      ],
      domainRules: [],
    },
  ],

  emailPolicies: [],   // generated below → window.SEED.emailPolicies

  domainPolicies: [
    { domain: "@smithstructural.co.nz", folders: ["Structure"] },
    { domain: "@jonesarch.co.nz",       folders: ["Architecture"] },
  ],

  activityLog: [
    { status:"synced",  file:"S-001 Foundation Plan.rvt", project:"City Centre Tower",       folder:"Structure",    peer:"Smith Structural", time:"2 min ago" },
    { status:"pending", file:"A-201 Floor Plan L3.rvt",   project:"Harbour Bridge Retrofit", folder:"Architecture", peer:"Jones Architects", time:"5 min ago" },
    { status:"syncing", file:"C-101 Site Plan.dwg",       project:"Westfield Carpark",       folder:"Civil",        peer:"Civil Co",         time:"10 min ago" },
    { status:"failed",  file:"M-301 HVAC Layout.rvt",     project:"City Centre Tower",       folder:"Mechanical",   peer:"MEP Group",        time:"1 hr ago" },
    { status:"offline", file:"E-201 Electrical Plan.rvt", project:"Westfield Carpark",       folder:"Electrical",   peer:"Spark Ltd",        time:"3 hr ago" },
    { status:"synced",  file:"D-001 Project Spec.pdf",    project:"City Centre Tower",       folder:"Documents",    peer:"Smith Structural", time:"1 day ago" },
  ],

  // Local files available to publish, keyed by "project::folder"
  localFiles: {
    "City Centre Tower::Structure": [
      { name:"S-001 Foundation Plan.rvt", size:"24.6 MB", modified:"Today, 09:14", version:3, state:"modified" },
      { name:"S-102 Level 2 Framing.rvt", size:"31.2 MB", modified:"Today, 08:50", version:2, state:"modified" },
      { name:"S-201 Column Schedule.xlsx", size:"412 KB", modified:"Yesterday, 17:22", version:5, state:"synced" },
      { name:"S-310 Connection Details.dwg", size:"8.1 MB", modified:"Today, 10:02", version:0, state:"new" },
    ],
    "City Centre Tower::Mechanical": [
      { name:"M-301 HVAC Layout.rvt", size:"18.9 MB", modified:"Today, 11:40", version:4, state:"modified" },
      { name:"M-401 Ductwork Plan.dwg", size:"6.3 MB", modified:"Today, 07:15", version:1, state:"synced" },
    ],
    "City Centre Tower::Architecture": [
      { name:"A-100 Ground Floor.rvt", size:"42.1 MB", modified:"Today, 09:55", version:7, state:"synced" },
      { name:"A-201 Floor Plan L3.rvt", size:"39.8 MB", modified:"Today, 12:03", version:6, state:"modified" },
      { name:"A-500 Door Schedule.pdf", size:"1.2 MB", modified:"2 days ago", version:2, state:"synced" },
    ],
    "City Centre Tower::Documents": [
      { name:"D-001 Project Spec.pdf", size:"3.4 MB", modified:"1 day ago", version:2, state:"synced" },
      { name:"D-014 RFI Register.xlsx", size:"288 KB", modified:"Today, 13:10", version:11, state:"modified" },
    ],
  },
};

// ---- Searchable local file index (for "Link a file") -----------------------
// Pretends to be files found on the user's computer that can be linked into
// a project folder. Linking creates a managed copy Sync43 shares & versions.
window.MOCK_LOCAL_FILES = [
  { name:"S-101 Level 1 Framing.rvt",        path:"C:/Work/CCT/Structure/Revit",        size:"29.8 MB", modified:"Today, 08:21" },
  { name:"S-220 Steel Connections.dwg",      path:"C:/Work/CCT/Structure/CAD",          size:"7.4 MB",  modified:"Yesterday, 16:02" },
  { name:"S-301 Rebar Schedule.xlsx",        path:"C:/Work/CCT/Structure/Schedules",    size:"512 KB",  modified:"Today, 11:30" },
  { name:"A-110 Level 1 Plan.rvt",           path:"C:/Work/CCT/Architecture/Revit",     size:"41.2 MB", modified:"Today, 09:48" },
  { name:"A-305 Ceiling Plan L3.rvt",        path:"C:/Work/CCT/Architecture/Revit",     size:"37.6 MB", modified:"2 days ago" },
  { name:"A-600 Finishes Schedule.pdf",      path:"C:/Work/CCT/Architecture/Docs",      size:"1.8 MB",  modified:"3 days ago" },
  { name:"M-310 Plant Room Layout.rvt",      path:"C:/Work/CCT/Mechanical/Revit",       size:"22.1 MB", modified:"Today, 07:05" },
  { name:"M-450 Ductwork Sections.dwg",      path:"C:/Work/CCT/Mechanical/CAD",         size:"5.9 MB",  modified:"Yesterday, 14:40" },
  { name:"E-210 Lighting Layout L2.rvt",     path:"C:/Work/CCT/Electrical/Revit",       size:"18.3 MB", modified:"Today, 10:12" },
  { name:"E-500 Cable Schedule.xlsx",        path:"C:/Work/CCT/Electrical/Schedules",   size:"288 KB",  modified:"4 days ago" },
  { name:"C-120 Drainage Plan.dwg",          path:"C:/Work/CCT/Civil/CAD",              size:"9.2 MB",  modified:"Today, 12:55" },
  { name:"C-205 Earthworks Sections.dwg",    path:"C:/Work/CCT/Civil/CAD",              size:"6.6 MB",  modified:"Yesterday, 09:18" },
  { name:"P-101 Drainage Riser.rvt",         path:"C:/Work/CCT/Plumbing/Revit",         size:"15.7 MB", modified:"2 days ago" },
  { name:"D-020 Methodology Statement.pdf",  path:"C:/Work/CCT/Documents",              size:"2.4 MB",  modified:"Today, 13:44" },
  { name:"D-031 Site Photos March.pdf",      path:"C:/Work/CCT/Documents",              size:"11.3 MB", modified:"5 days ago" },
  { name:"RFI-204 Slab Penetration.pdf",     path:"C:/Work/CCT/Documents/RFI",          size:"640 KB",  modified:"Today, 15:01" },
];

// ---- Generated test set: 50 emails across 20 companies ---------------------
// Deterministic (no randomness) so the A–Z index & tests stay stable.
// Some entries have folders, some are intentionally left unassigned ([]) to
// demonstrate that a folder assignment is optional.
(function generateEmailPolicies() {
  const companies = [
    { domain: "smithstructural.co.nz", folders: ["Structure"] },
    { domain: "jonesarch.co.nz",       folders: ["Architecture"] },
    { domain: "mepgroup.co.nz",        folders: ["Mechanical","Electrical"] },
    { domain: "civilco.co.nz",         folders: ["Civil"] },
    { domain: "sparkltd.co.nz",        folders: ["Electrical"] },
    { domain: "harboursurvey.co.nz",   folders: ["Survey"] },
    { domain: "apexbuild.co.nz",       folders: ["all"] },
    { domain: "greenfieldenv.co.nz",   folders: ["Environmental"] },
    { domain: "pacificjoinery.co.nz",  folders: ["Joinery"] },
    { domain: "deltahvac.co.nz",       folders: ["Mechanical"] },
    { domain: "metroelectrical.co.nz", folders: ["Electrical"] },
    { domain: "kauriconsult.co.nz",    folders: [] },
    { domain: "fortisfire.co.nz",      folders: ["Documents"] },
    { domain: "anchorgeo.co.nz",       folders: ["Civil","Structural"] },
    { domain: "lumenlighting.co.nz",   folders: ["Electrical"] },
    { domain: "vertexcost.co.nz",      folders: [] },
    { domain: "oceanicplumbing.co.nz", folders: ["Plumbing"] },
    { domain: "summitcranes.co.nz",    folders: ["Documents"] },
    { domain: "terracivil.co.nz",      folders: ["Civil","Earthworks"] },
    { domain: "nimbusarch.co.nz",      folders: ["Architecture"] },
  ];
  const firsts = ["alex","beth","cam","dan","ella","finn","grace","hana","ian","jade",
                  "kane","leo","maia","noah","olive","piper","quinn","ruby","sam","tara",
                  "uma","vince","will","xena","yusuf","zoe","ava","ben","cleo","drew",
                  "ed","faye","gus","holly","isla","jack","kira","liam","mona","nina",
                  "omar","paul","rose","seth","theo","una","vera","wade","yara","zane"];
  const lasts  = ["adams","brooke","chen","diaz","evans","fox","grant","hughes","irwin","jones",
                  "kerr","lowe","mills","ngata","ofei","park","reid","singh","tane","udo"];

  const out = [];
  for (let i = 0; i < 50; i++) {
    const c = companies[i % companies.length];
    const first = firsts[i];
    const last  = lasts[i % lasts.length];
    const email = `${first}.${last}@${c.domain}`;
    // ~38% intentionally unassigned to show the optional-folder case
    const assigned = (i % 8 === 0 || i % 8 === 3 || i % 8 === 6) ? [] : c.folders.slice();
    out.push({ email, folders: assigned });
  }
  // keep a couple of recognisable named accounts at the top
  out.unshift(
    { email: "david@smithstructural.co.nz", folders: ["Structure"] },
    { email: "mark@jonesarch.co.nz",        folders: ["Architecture"] },
    { email: "lucy@mepgroup.co.nz",         folders: ["Mechanical","Electrical"] },
  );
  window.SEED.emailPolicies = out;
})();

// ---- Default settings ------------------------------------------------------
window.DEFAULT_SETTINGS = {
  syncDir:        "C:/Sync43/Projects",
  syncPref:       "auto",
  receivedKeep:   5,              // versions of RECEIVED files to retain
  archiveIssued:  true,           // archive my issued files on replace
  dateFormat:     "YYMMDD",       // archive date prefix (e.g. 260611_file001)
  namePattern:    "{date}_{name}",// archive copy naming
  os:             "windows",      // windows | macos | linux  (for native picker label)
};

// ---- OS file-manager labels (for the native "Browse…" affordance) ----------
window.OS_PICKERS = {
  windows: { name: "File Explorer", icon: "mdi-microsoft-windows" },
  macos:   { name: "Finder",        icon: "mdi-apple" },
  linux:   { name: "Files (Nautilus)", icon: "mdi-linux" },
};
