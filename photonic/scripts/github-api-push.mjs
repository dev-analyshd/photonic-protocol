#!/usr/bin/env node
/**
 * Push photonic/ directory to GitHub using the Contents API.
 * Works on empty repos. Reads GITHUB_TOKEN from env.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PHOTONIC_DIR = path.join(__dirname, "..");

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) throw new Error("GITHUB_TOKEN not set");

const REPO_NAME = "photonic-protocol";

async function apiCall(method, endpoint, body) {
  const res = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      Authorization: `token ${TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "User-Agent": "photonic-deploy",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, data };
}

async function getUser() {
  const { data } = await apiCall("GET", "/user");
  return data.login;
}

async function ensureRepo(owner) {
  const { status } = await apiCall("GET", `/repos/${owner}/${REPO_NAME}`);
  if (status === 404) {
    await apiCall("POST", "/user/repos", {
      name: REPO_NAME,
      description: "PHOTONIC — Self-Evolving Agent Commerce Protocol. CROO Agent Hackathon 2026.",
      private: false,
      auto_init: false,
    });
    console.log(`Created repo: ${REPO_NAME}`);
  } else {
    console.log(`Repo exists: ${REPO_NAME}`);
  }
}

function collectFiles(dir, base = "") {
  const SKIP = new Set(["node_modules", ".git", "cache", "artifacts", "target", ".nyc_output"]);
  const files = [];
  for (const entry of fs.readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = path.join(dir, entry);
    const rel = base ? `${base}/${entry}` : entry;
    if (fs.statSync(full).isDirectory()) {
      files.push(...collectFiles(full, rel));
    } else {
      files.push({ full, rel });
    }
  }
  return files;
}

async function getFileSha(owner, filePath) {
  const { status, data } = await apiCall("GET", `/repos/${owner}/${REPO_NAME}/contents/${filePath}`);
  if (status === 200 && data.sha) return data.sha;
  return null;
}

async function putFile(owner, filePath, content, existingSha) {
  const encoded = Buffer.from(content).toString("base64");
  const body = {
    message: `feat: add ${filePath}`,
    content: encoded,
  };
  if (existingSha) body.sha = existingSha;

  const { status, data } = await apiCall("PUT", `/repos/${owner}/${REPO_NAME}/contents/${filePath}`, body);
  if (status !== 200 && status !== 201) {
    console.error(`  WARN: ${filePath} -> HTTP ${status}: ${data.message || "unknown error"}`);
    return false;
  }
  return true;
}

async function main() {
  const owner = await getUser();
  console.log("GitHub user:", owner);

  await ensureRepo(owner);

  const files = collectFiles(PHOTONIC_DIR);
  console.log(`Found ${files.length} files in photonic/`);

  // Also include the deployments directory if it exists
  const deploymentsDir = path.join(PHOTONIC_DIR, "contracts/deployments");
  if (fs.existsSync(deploymentsDir)) {
    for (const f of fs.readdirSync(deploymentsDir)) {
      const full = path.join(deploymentsDir, f);
      if (!files.some(x => x.full === full)) {
        files.push({ full, rel: `contracts/deployments/${f}` });
      }
    }
  }

  let count = 0;
  let failed = 0;
  for (const { full, rel } of files) {
    const remotePath = `photonic/${rel}`;
    const content = fs.readFileSync(full);

    // Skip binary files > 5MB
    if (content.length > 5 * 1024 * 1024) {
      console.log(`  SKIP (too large): ${rel}`);
      continue;
    }

    const existingSha = await getFileSha(owner, remotePath);
    const ok = await putFile(owner, remotePath, content, existingSha);
    if (ok) count++;
    else failed++;

    if ((count + failed) % 5 === 0) {
      console.log(`  ${count + failed}/${files.length} processed (${count} ok, ${failed} failed)...`);
    }
  }

  console.log(`\n✓ Pushed ${count} files to https://github.com/${owner}/${REPO_NAME}`);
  if (failed > 0) console.log(`  ${failed} files failed`);
  console.log("\n=== GITHUB PUSH COMPLETE ===");
  console.log(`Repository: https://github.com/${owner}/${REPO_NAME}`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
