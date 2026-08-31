#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendConfigPath = path.resolve(__dirname, "../frontend/src/config/contracts.ts");

function parseContracts() {
  const content = fs.readFileSync(frontendConfigPath, "utf-8");
  const contracts = {};
  const regex = /(\w+_ID):\s*"(C[A-Z2-7]{55})"/g;
  let m;
  while ((m = regex.exec(content)) !== null) {
    contracts[m[1]] = m[2];
  }
  return contracts;
}
function validate(addr) {
  return /^C[A-Z2-7]{55}$/.test(addr);
}

const contracts = parseContracts();
console.log(`🔍 Drift guard: checking ${Object.keys(contracts).length} contract IDs...`);
let mismatches = [];

for (const [k, v] of Object.entries(contracts)) {
  if (!validate(v)) {
    console.error(`❌ Invalid address for ${k}: ${v}`);
    mismatches.push(k);
  }
}

try {
  const out = execSync('grep -r "initializeContractClients" frontend --include="*.ts" --include="*.tsx" || true', { encoding: "utf-8" });
  if (out.trim()) {
    console.error("❌ Legacy initializer still present:\n", out);
    mismatches.push("legacy_initializer");
  } else {
    console.log("✓ No legacy initializer found");
  }
} catch {}

const legacyPath = path.resolve(__dirname, "../frontend/src/lib/contracts.ts");
if (fs.existsSync(legacyPath)) {
  console.error("❌ Legacy file still exists: frontend/src/lib/contracts.ts");
  mismatches.push("legacy_file");
} else {
  console.log("✓ Legacy file correctly deleted");
}

const clientPath = path.resolve(__dirname, "../frontend/src/lib/client.ts");
if (!fs.existsSync(clientPath)) {
  console.error("❌ Unified client missing");
  mismatches.push("client");
} else {
  console.log("✓ Unified client present");
}

const queuePath = path.resolve(__dirname, "../frontend/src/lib/offlineQueue.ts");
if (!fs.existsSync(queuePath)) {
  console.error("❌ Offline queue missing");
  mismatches.push("queue");
} else {
  console.log("✓ Offline queue present");
}

if (mismatches.length) {
  console.error(`\n❌ Drift guard FAILED: ${mismatches.join(", ")}`);
  process.exit(1);
} else {
  console.log("\n✅ Drift guard PASSED — no drift");
  process.exit(0);
}

// Check NUM_PUBLIC_SIGNALS mismatch (IDL source-of-truth drift)
try {
  const votingLib = fs.readFileSync(path.resolve(__dirname, "../contracts/voting/src/lib.rs"), "utf-8");
  const frontendTypes = fs.readFileSync(path.resolve(__dirname, "../frontend/src/types/index.ts"), "utf-8");
  
  const rustMatch = votingLib.match(/NUM_PUBLIC_SIGNALS:\s*u32\s*=\s*(\d+)/);
  const tsMatch = frontendTypes.match(/NUM_PUBLIC_SIGNALS\s*=\s*(\d+)/);
  
  if (rustMatch && tsMatch) {
    if (rustMatch[1] !== tsMatch[1]) {
      console.error(`❌ Drift guard FAILED: NUM_PUBLIC_SIGNALS mismatch! Rust: ${rustMatch[1]}, TS: ${tsMatch[1]}`);
      process.exit(1);
    }
  }
} catch (e) {
  console.error("Failed to check NUM_PUBLIC_SIGNALS drift", e);
}
