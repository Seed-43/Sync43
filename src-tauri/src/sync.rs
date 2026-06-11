// ============================================================
//  Sync43 — P2P sync engine (Stage 3)
//
//  This module will hold the Iroh-based engine. It is stubbed
//  for Stage 1 so the app compiles and everything local works.
//
//  Planned shape (locked-in design):
//
//  * Identity: an Ed25519 keypair generated on first sign-in,
//    stored in the app config dir, tied to the user's email.
//  * Discovery: Iroh endpoint using the free public n0 relays
//    now; swapped for the self-hosted Seed43 relay later by
//    changing the relay URL in config.
//  * Project membership: the admin signs the project manifest
//    (member list + folder assignments). Peers verify the
//    signature before accepting any data.
//  * Folder manifests: each publishing company signs its folder
//    manifest (file list + BLAKE3 hashes). Whoever in that
//    company publishes first "claims" the sync; everyone else
//    sees the manifest already updated — no overlap.
//  * Transfer: content-addressed blobs; receivers verify hashes,
//    write into the read-only project folder, and apply the
//    received-version retention rule from Settings.
// ============================================================

#[allow(dead_code)]
pub fn status() -> &'static str {
    // Stage 1: always offline. The UI shows local-only mode.
    "offline"
}
