import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backend = path.join(root, "backend");
const frontend = path.join(root, "frontend");
const npm = process.env.npm_execpath ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
const npmArgs = process.env.npm_execpath ? [process.env.npm_execpath] : [];
const results = [];

function loadTestEnvironment() {
  const envFile = path.join(backend, ".env.test");
  if (!existsSync(envFile)) return;
  const require = createRequire(path.join(backend, "package.json"));
  require("dotenv").config({ path: envFile, override: false, quiet: true });
}

function productionUrlMatchesTestUrl() {
  const productionFile = path.join(backend, ".env");
  if (!existsSync(productionFile) || !process.env.TEST_DATABASE_URL) return false;
  const require = createRequire(path.join(backend, "package.json"));
  const production = require("dotenv").parse(readFileSync(productionFile));
  return production.DATABASE_URL === process.env.TEST_DATABASE_URL;
}

function frontendScripts(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return frontendScripts(target);
    return /\.(?:js|mjs)$/.test(entry.name) ? [target] : [];
  });
}

async function command(name, executable, args, cwd = root, env = process.env) {
  process.stdout.write(`\n[RUN] ${name}\n`);
  const exitCode = await new Promise((resolve) => {
    const child = spawn(executable, args, { cwd, env, stdio: "inherit", shell: false });
    child.once("error", (error) => {
      console.error(error.message);
      resolve(1);
    });
    child.once("exit", (code) => resolve(code ?? 1));
  });
  const status = exitCode === 0 ? "PASS" : exitCode === 2 ? "BLOCKED" : "FAIL";
  results.push({ name, status });
  console.log(`[${status}] ${name}`);
}

function blocked(name, reason) {
  results.push({ name, status: "BLOCKED" });
  console.log(`\n[BLOCKED] ${name}\n  ${reason}`);
}

loadTestEnvironment();

await command("backend typecheck", npm, [...npmArgs, "--prefix", "backend", "run", "typecheck"]);

for (const file of [
  "dynamic-policy-check.ts",
  "user-policy-check.ts",
  "user-role-contract-check.ts",
  "customer-bulk-contract-check.ts",
  "real-data-modules-contract-check.ts",
]) {
  await command(`backend contract: ${file}`, npm, [...npmArgs, "exec", "--", "tsx", `src/examples/${file}`], backend);
}

for (const file of [
  "customer-bulk-contract.mjs",
  "customer-import-contract.mjs",
  "customer-list-performance-contract.mjs",
  "module-shell-contract.mjs",
  "real-data-modules-contract.mjs",
  "role-permissions-contract.mjs",
]) {
  await command(`frontend contract: ${file}`, process.execPath, [`tests/${file}`], frontend);
}

for (const file of frontendScripts(frontend)) {
  await command(`javascript syntax: ${path.relative(root, file)}`, process.execPath, ["--check", file]);
}

if (process.env.TEST_DATABASE_GUARD !== "farock-test-only") {
  blocked("high-risk HTTP/PostgreSQL integration", "Set TEST_DATABASE_GUARD=farock-test-only in backend/.env.test.");
  blocked("PostgreSQL RLS integration", "Set TEST_DATABASE_GUARD=farock-test-only in backend/.env.test.");
} else if (!process.env.TEST_DATABASE_URL) {
  blocked("high-risk HTTP/PostgreSQL integration", "Set TEST_DATABASE_URL to a disposable, empty PostgreSQL database in backend/.env.test.");
  blocked("PostgreSQL RLS integration", "Set TEST_DATABASE_URL to a disposable, empty PostgreSQL database in backend/.env.test.");
} else if (productionUrlMatchesTestUrl()) {
  blocked("high-risk HTTP/PostgreSQL integration", "TEST_DATABASE_URL matches backend/.env DATABASE_URL; production/development data will not be used for destructive tests.");
  blocked("PostgreSQL RLS integration", "TEST_DATABASE_URL matches backend/.env DATABASE_URL; production/development data will not be used for destructive tests.");
} else {
  const integrationEnv = {
    ...process.env,
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    DIRECT_URL: process.env.TEST_DIRECT_URL || process.env.TEST_DATABASE_URL,
    JWT_SECRET: process.env.TEST_JWT_SECRET || "farock-test-secret-must-be-at-least-32-characters",
    NODE_ENV: "test",
  };
  await command(
    "high-risk HTTP/PostgreSQL integration",
    npm,
    [...npmArgs, "exec", "--", "tsx", "src/tests/high-risk-integration-check.ts"],
    backend,
    integrationEnv,
  );
  if (!process.env.TEST_RLS_DATABASE_URL) {
    blocked("PostgreSQL RLS integration", "Set TEST_RLS_DATABASE_URL to the same test database through a restricted, non-BYPASSRLS role.");
  } else {
    await command(
      "PostgreSQL RLS integration",
      npm,
      [...npmArgs, "exec", "--", "tsx", "src/tests/rls-integration-check.ts"],
      backend,
      integrationEnv,
    );
  }
}

await command("git diff whitespace", "git", ["diff", "--check"]);

console.log("\nTest summary");
console.log("============");
for (const result of results) console.log(`${result.status.padEnd(7)} ${result.name}`);

const passed = results.filter(({ status }) => status === "PASS").length;
const failed = results.filter(({ status }) => status === "FAIL").length;
const blockedCount = results.filter(({ status }) => status === "BLOCKED").length;
console.log(`\nPASS ${passed} | FAIL ${failed} | BLOCKED ${blockedCount}`);

if (failed) {
  console.log("RESULT: FAILED");
  process.exitCode = 1;
} else if (blockedCount) {
  console.log("RESULT: INCOMPLETE (blocked tests are not counted as passing)");
  process.exitCode = 2;
} else {
  console.log("RESULT: ALL TESTS PASSED");
}
