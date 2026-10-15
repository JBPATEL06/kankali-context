import { prioritizeSearchBlobs } from "../lib/tools-git";

function runSearchStarvationRegressionTest() {
  console.log("=================================================");
  console.log(" REGRESSION TEST: SEARCH_FILES ALPHABETICAL STARVATION");
  console.log("=================================================\n");

  // Construct a realistic vault file list (>60 files)
  const files: Array<{ path: string; content: string }> = [];

  // 1. 30 activity log files (alphabetically first: 'a')
  for (let i = 1; i <= 30; i++) {
    const day = String(i).padStart(2, "0");
    files.push({
      path: `activity-log/2026-09-${day}.md`,
      content: `# Activity Log 2026-09-${day}\nRegular daily sync notes and commit logs.`,
    });
  }

  // 2. 12 files in project/ai-manager
  for (let i = 1; i <= 12; i++) {
    files.push({
      path: `project/ai-manager/note-${i}.md`,
      content: i === 5 ? "Using pglite for embedded postgres storage." : `Note ${i} for ai-manager.`,
    });
  }

  // 3. 10 files in project/kankali
  for (let i = 1; i <= 10; i++) {
    files.push({
      path: `project/kankali/module-${i}.md`,
      content: i === 3 ? "Kankali vault core architecture design." : `Kankali module ${i} details.`,
    });
  }

  // 4. 11 files in project/quickcart
  const UNIQUE_TOKEN = "quickcart_zxqtoken1_secret_hit";
  for (let i = 1; i <= 11; i++) {
    files.push({
      path: `project/quickcart/doc-${i}.md`,
      content: i === 7 ? `Checkout pipeline with token ${UNIQUE_TOKEN}.` : `QuickCart feature ${i} specification.`,
    });
  }

  console.log(`Total files in test vault: ${files.length}`);
  console.log("Alphabetical order first 5:", files.slice(0, 5).map((f) => f.path));
  console.log("Alphabetical order last 5:", files.slice(-5).map((f) => f.path));

  // TEST 1: Priority Sorting ensures projects are not starved by activity logs
  console.log("\n--- TEST 1: Priority Sorting Verification ---");
  const sorted = prioritizeSearchBlobs(files, UNIQUE_TOKEN);
  const first15Paths = sorted.slice(0, 15).map((f) => f.path);
  console.log("Top 5 prioritized paths for token query:");
  first15Paths.slice(0, 5).forEach((p, idx) => console.log(` ${idx + 1}. ${p}`));

  const targetDoc = "project/quickcart/doc-7.md";
  const targetIndex = sorted.findIndex((f) => f.path === targetDoc);
  console.log(`\nPosition of ${targetDoc} in prioritized list: ${targetIndex} (out of ${sorted.length})`);

  if (targetIndex >= 40) {
    console.error(`❌ FAILED: ${targetDoc} was pushed beyond scan limit (index ${targetIndex} >= 40)`);
    process.exit(1);
  } else {
    console.log("✅ PASSED: Target project file is safely within high-priority scan range!");
  }

  // TEST 2: Simulate Full Search Without path_prefix
  console.log("\n--- TEST 2: Simulated Full Search (bina path_prefix) ---");
  function simulateSearch(query: string, maxScan = 300, maxHits = 30) {
    const q = query.toLowerCase();
    const prioritized = prioritizeSearchBlobs(files, q);
    const candidates = prioritized.slice(0, maxScan);
    const hits: Array<{ path: string; snippet: string }> = [];

    for (const file of candidates) {
      if (hits.length >= maxHits) break;
      const lower = file.content.toLowerCase();
      const idx = lower.indexOf(q);
      if (idx >= 0) {
        hits.push({ path: file.path, snippet: file.content.slice(idx, idx + 40) });
      } else if (file.path.toLowerCase().includes(q)) {
        hits.push({ path: file.path, snippet: file.content.slice(0, 40) });
      }
    }
    return hits;
  }

  // Search 2A: Search for UNIQUE_TOKEN without prefix
  console.log(`Searching for "${UNIQUE_TOKEN}" without prefix...`);
  const hitsToken = simulateSearch(UNIQUE_TOKEN);
  console.log(`Hits found: ${hitsToken.length}`);
  if (hitsToken.length === 0 || !hitsToken.some((h) => h.path === targetDoc)) {
    console.error("❌ FAILED: Unique token in QuickCart not found without path_prefix!");
    process.exit(1);
  }
  console.log(`✅ PASSED: Found unique token in ${hitsToken[0]?.path}`);

  // Search 2B: Search for "vault" without prefix (kankali project)
  console.log("\nSearching for 'vault' without prefix...");
  const hitsVault = simulateSearch("vault");
  console.log(`Hits found: ${hitsVault.length}`);
  if (hitsVault.length === 0 || !hitsVault.some((h) => h.path.includes("kankali"))) {
    console.error("❌ FAILED: 'vault' in project/kankali not found without path_prefix!");
    process.exit(1);
  }
  console.log(`✅ PASSED: Found 'vault' in ${hitsVault.map((h) => h.path).join(", ")}`);

  // Search 2C: Search for "pglite" without prefix (ai-manager project)
  console.log("\nSearching for 'pglite' without prefix...");
  const hitsPglite = simulateSearch("pglite");
  console.log(`Hits found: ${hitsPglite.length}`);
  if (hitsPglite.length === 0 || !hitsPglite.some((h) => h.path.includes("ai-manager"))) {
    console.error("❌ FAILED: 'pglite' in project/ai-manager not found without path_prefix!");
    process.exit(1);
  }
  console.log(`✅ PASSED: Found 'pglite' in ${hitsPglite[0]?.path}`);

  // Search 2D: Search for "QuickCart" without prefix
  console.log("\nSearching for 'QuickCart' without prefix...");
  const hitsQuickCart = simulateSearch("QuickCart");
  console.log(`Hits found: ${hitsQuickCart.length}`);
  if (hitsQuickCart.length < 11) {
    console.error(`❌ FAILED: Expected 11 files for QuickCart, found ${hitsQuickCart.length}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: All 11 QuickCart files found without prefix!`);

  console.log("\n=================================================");
  console.log("🎉 ALL SEARCH STARVATION REGRESSION TESTS PASSED!");
  console.log("=================================================");
}

runSearchStarvationRegressionTest();

