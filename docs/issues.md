# Issues

## Open Bugs

### Critical — Security
- `[Critical]` `firebase-applet-config.json` committed in past repo history (project API key exposed).
- `[Critical]` CORS middleware uses `Access-Control-Allow-Origin: *` in production (`server.ts` L262).
- `[Critical]` `multiTenantMiddleware` uses raw `?user=` query param as userId — auth bypass for all `/api/` routes (`server.ts` L213).

### High — Functionality
- `[High]` Missing `drive.appdata` / file OAuth scope in Google sign-in → 403 on Drive operations (`firebaseAuth.ts` L23).
- `[High]` Firebase auth sign-out callback is a no-op — stale sessions persist in UI (`App.tsx` L262).
- `[High]` `ClaudeMcpHub` destructures none of its 4 props — `onSaveFileToDrive` / `onSaveNewMemory` are dead (`ClaudeMcpHub.tsx` L12).
- `[High]` Google Drive "Connect" button in `IntegrationsTab` is a non-functional placeholder (`IntegrationsTab.tsx` L204).

### Medium — Reliability / Logic
- `[Medium]` In-memory `sessionStore` lost on server restart — requires persistent backing (`mcp/server.ts` L29).
- `[Medium]` `rateLimitStore` Map grows unboundedly — memory leak in cloud mode (`server.ts` L153).
- `[Medium]` `googleAccessToken` persisted to Firestore — bearer tokens should not be stored in database (`firebaseStore.ts` L124).
- `[Medium]` `mcp_keys` Firestore collection has no security rules — client writes blocked by default deny (`firestore.rules`).

### Low — Code Quality
- `[Low]` `server.ts` is 3500+ lines monolith — needs modular route splitting.
- `[Low]` Catalog index entries use `file:///` URIs — invalid across remote machines (`server.ts` L289).

---

## Known Gaps
- Lack of book-style context templates for new context repositories (`notice.md`, `index.md`, `commit.md` scaffolding).
