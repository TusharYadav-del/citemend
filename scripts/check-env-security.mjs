import fs from "node:fs";
import { execFileSync } from "node:child_process";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const names = ["GROQ_API_KEY", "TAVILY_API_KEY", "GEMINI_API_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const values = names.map((name) => process.env[name]).filter((value) => value && value.length >= 12);
const git = (args, options = {}) => execFileSync("git", args, { encoding: "utf8", ...options });
const files = git(["ls-files", "-z"]).split("\0").filter(Boolean);
const sourceFiles = git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean);
const privateEnvTracked = files.filter((file) => /(^|\/)\.env(?:\.|$)/.test(file) && file !== ".env.example");
const trackedValueMatches = sourceFiles.filter((file) => fs.existsSync(file) && values.some((value) => fs.readFileSync(file).includes(Buffer.from(value))));
const history = git(["rev-list", "--all"]).trim().split(/\r?\n/).filter(Boolean);
const historicalMatches = [];
for (const commit of history) {
  if (!values.length) break;
  try { git(["grep", "-F", "-q", "-f", "-", commit], { input: values.join("\n") + "\n", stdio: ["pipe", "pipe", "pipe"] }); historicalMatches.push(commit); }
  catch (error) { if (error.status !== 1) throw new Error("Git history scan failed without exposing secret values."); }
}
const privateEnvHistory = git(["log", "--all", "--format=%H", "--", ".env.local"]).trim();
const ignored = git(["check-ignore", ".env.local"]).trim() === ".env.local";
const privateNames = ["GROQ_API_KEY", "TAVILY_API_KEY", "GEMINI_API_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const privateValues = privateNames.map((name) => process.env[name]).filter((value) => value && value.length >= 12);
const browserBundleMatches = [];
function scanBuild(directory) {
  for (const item of fs.readdirSync(directory, {withFileTypes:true})) {
    const path = directory + "/" + item.name;
    const info = fs.statSync(path);
    if (info.isDirectory()) scanBuild(path);
    else if (info.isFile()) { const bytes = fs.readFileSync(path); if (privateValues.some((value) => bytes.includes(Buffer.from(value)))) browserBundleMatches.push(path); }
  }
}
if (process.argv.includes("--build")) {
  if (!fs.existsSync(".next/static")) throw new Error("Build the app before scanning browser bundles.");
  scanBuild(".next/static");
}
console.log(JSON.stringify({ browserBundleMatches, privateEnvIgnored: ignored, privateEnvTracked, trackedValueMatches, historicalMatches, privateEnvEverTracked: !!privateEnvHistory, commitsChecked: history.length, configuredValuesChecked: values.length }, null, 2));
if (browserBundleMatches.length || !ignored || privateEnvTracked.length || trackedValueMatches.length || historicalMatches.length || privateEnvHistory) process.exitCode = 1;
