import { parseMarkdownSections, extractOutline, getSectionChunk, replaceSectionChunk } from "../lib/markdown-chunks";

function runCorruptionTest() {
  console.log("=================================================");
  console.log("  CORRUPTION TEST FOR MARKDOWN CHUNKING (PHASE G)");
  console.log("=================================================\n");

  const originalDocument = `# Main Document Title

## [section-one] Section One: Overview
This is the full text of section one.
It has multiple lines of crucial architectural data.
Line 3 of section one.

## [section-two] Section Two: Complex Features
Introductory paragraph of section two.

### [sub-feature-a] Sub-feature 2.A
Details about 2.A with some code:
\`\`\`typescript
const x = 42;
\`\`\`

### [sub-feature-b] Sub-feature 2.B
Details about 2.B that we will be modifying.
Extra notes for 2.B.

## [section-three] Section Three: Final Notes
This is section three.
It should remain 100% byte-for-byte untouched and uncorrupted.
Final conclusion line.`;

  console.log("1. Original Document Loaded (Byte length: " + Buffer.byteLength(originalDocument) + ")");
  
  // Extract Section 1 and Section 3 before modification
  const sec1Before = getSectionChunk(originalDocument, "section-one");
  const sec2Before = getSectionChunk(originalDocument, "section-two");
  const sec3Before = getSectionChunk(originalDocument, "section-three");
  const sub2aBefore = getSectionChunk(originalDocument, "sub-feature-a");
  const sub2bBefore = getSectionChunk(originalDocument, "sub-feature-b");

  console.log("\n2. Original Sections Parsed:");
  console.log(" - Section 1 Lines:", sec1Before.section?.startLine, "-", sec1Before.section?.endLine);
  console.log(" - Section 2 Lines (with nested 2.A and 2.B):", sec2Before.section?.startLine, "-", sec2Before.section?.endLine);
  console.log(" - Section 3 Lines:", sec3Before.section?.startLine, "-", sec3Before.section?.endLine);

  // TEST A: Replace Section Two entirely (including nested subsections)
  console.log("\n-------------------------------------------------");
  console.log("TEST A: Replace Entire Section Two (with nested children)");
  console.log("-------------------------------------------------");

  const newSectionTwoContent = `## [section-two] Section Two: Complex Features (UPDATED)
This is the brand new replacement content for section two.
All new paragraphs here.`;

  const replaceResultA = replaceSectionChunk(originalDocument, "section-two", newSectionTwoContent);

  if (!replaceResultA.success) {
    console.error("FAIL: replaceSectionChunk returned false:", replaceResultA.error);
    process.exit(1);
  }

  const modifiedDocA = replaceResultA.updatedContent;

  // Byte-for-byte comparison of untouched sections
  const sec1AfterA = getSectionChunk(modifiedDocA, "section-one");
  const sec3AfterA = getSectionChunk(modifiedDocA, "section-three");
  const sec2AfterA = getSectionChunk(modifiedDocA, "section-two");

  console.log("Checking Section One byte equality...");
  const sec1Match = sec1Before.chunk === sec1AfterA.chunk;
  console.log(" -> Section 1 Byte-Identical:", sec1Match ? "✅ PASSED" : "❌ FAILED");

  console.log("Checking Section Three byte equality...");
  const sec3Match = sec3Before.chunk === sec3AfterA.chunk;
  console.log(" -> Section 3 Byte-Identical:", sec3Match ? "✅ PASSED" : "❌ FAILED");

  console.log("Checking Section Two updated correctly...");
  const sec2UpdatedMatch = sec2AfterA.chunk === newSectionTwoContent;
  console.log(" -> Section 2 Content Clean:", sec2UpdatedMatch ? "✅ PASSED" : "❌ FAILED");

  if (!sec1Match || !sec3Match || !sec2UpdatedMatch) {
    console.error("FATAL: Corruption detected in Test A!");
    process.exit(1);
  }

  // TEST B: Targeted Nested Subsection Modification (Modify ONLY 2.B without touching 2.A or Section 2 Intro)
  console.log("\n-------------------------------------------------");
  console.log("TEST B: Nested Subsection Replace (Modify only 2.B)");
  console.log("-------------------------------------------------");

  const newSub2bContent = `### [sub-feature-b] Sub-feature 2.B (REVISED)
New modified implementation notes for 2.B only.`;

  const replaceResultB = replaceSectionChunk(originalDocument, "sub-feature-b", newSub2bContent);
  const modifiedDocB = replaceResultB.updatedContent;

  const sec1AfterB = getSectionChunk(modifiedDocB, "section-one");
  const sub2aAfterB = getSectionChunk(modifiedDocB, "sub-feature-a");
  const sec3AfterB = getSectionChunk(modifiedDocB, "section-three");
  const sub2bAfterB = getSectionChunk(modifiedDocB, "sub-feature-b");

  console.log("Checking Section 1 untouched...");
  const bSec1Match = sec1Before.chunk === sec1AfterB.chunk;
  console.log(" -> Section 1 Byte-Identical:", bSec1Match ? "✅ PASSED" : "❌ FAILED");

  console.log("Checking Sub-feature 2.A untouched...");
  const bSub2aMatch = sub2aBefore.chunk === sub2aAfterB.chunk;
  console.log(" -> Sub-feature 2.A Byte-Identical:", bSub2aMatch ? "✅ PASSED" : "❌ FAILED");

  console.log("Checking Section 3 untouched...");
  const bSec3Match = sec3Before.chunk === sec3AfterB.chunk;
  console.log(" -> Section 3 Byte-Identical:", bSec3Match ? "✅ PASSED" : "❌ FAILED");

  console.log("Checking Sub-feature 2.B revised cleanly...");
  const bSub2bMatch = sub2bAfterB.chunk === newSub2bContent;
  console.log(" -> Sub-feature 2.B Revised:", bSub2bMatch ? "✅ PASSED" : "❌ FAILED");

  if (!bSec1Match || !bSub2aMatch || !bSec3Match || !bSub2bMatch) {
    console.error("FATAL: Corruption detected in Test B!");
    process.exit(1);
  }

  console.log("\n=================================================");
  console.log("🎉 ALL BYTE-FOR-BYTE CORRUPTION TESTS PASSED (0 ERRORS)");
  console.log("=================================================");
}

runCorruptionTest();
