import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const releasedProjectRef = ["snzep", "jldr", "tojb", "vrfy", "jtw"].join("");
const deployWorkflow = join(root, ".github", "workflows", "deploy-supabase-ai.yml");
const projectConfigPath = join(root, "src", "integrations", "supabase", "project-config.ts");
const serverClientPath = join(root, "src", "integrations", "supabase", "client.server.ts");
const supabaseConfigPath = join(root, "supabase", "config.toml");
const envExamplePath = join(root, ".env.example");

const textExtensions = new Set([
  ".css",
  ".env",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

function collectTextFiles(path: string): string[] {
  if (!existsSync(path)) return [];
  const stat = statSync(path);
  if (stat.isFile()) return [path];

  return readdirSync(path).flatMap((name) => {
    if ([".git", "node_modules", "dist", ".output"].includes(name)) return [];
    const child = join(path, name);
    const childStat = statSync(child);
    if (childStat.isDirectory()) return collectTextFiles(child);
    if (name === ".env" || textExtensions.has(extname(name))) return [child];
    return [];
  });
}

describe("released Supabase project isolation", () => {
  it("requires new Score Predictor-specific runtime variables", () => {
    const projectConfig = readFileSync(projectConfigPath, "utf8");
    const serverClient = readFileSync(serverClientPath, "utf8");
    const envExample = readFileSync(envExamplePath, "utf8");

    expect(projectConfig).toContain("VITE_SCORE_PREDICTOR_SUPABASE_URL");
    expect(projectConfig).toContain("VITE_SCORE_PREDICTOR_SUPABASE_PUBLISHABLE_KEY");
    expect(projectConfig).not.toMatch(/\bVITE_SUPABASE_URL\b/);
    expect(projectConfig).not.toMatch(/\bVITE_SUPABASE_PUBLISHABLE_KEY\b/);

    expect(serverClient).toContain("SCORE_PREDICTOR_SUPABASE_URL");
    expect(serverClient).toContain("SCORE_PREDICTOR_SUPABASE_SERVICE_ROLE_KEY");
    expect(serverClient).not.toMatch(/process\.env\.SUPABASE_URL\b/);
    expect(serverClient).not.toMatch(/process\.env\.SUPABASE_SERVICE_ROLE_KEY\b/);
    expect(serverClient).not.toMatch(/process\.env\.SUPABASE_SECRET_KEY\b/);

    expect(envExample).toContain("VITE_SCORE_PREDICTOR_SUPABASE_URL=");
    expect(envExample).toContain("SCORE_PREDICTOR_SUPABASE_URL=");
  });

  it("removes the remote Supabase deployment workflow and keeps config local-only", () => {
    const supabaseConfig = readFileSync(supabaseConfigPath, "utf8");
    expect(existsSync(deployWorkflow)).toBe(false);
    expect(supabaseConfig).toContain('project_id = "score-predictor-pro"');
  });

  it("contains no active repository reference to the released remote project", () => {
    const roots = [
      join(root, ".github"),
      join(root, "src"),
      join(root, "supabase"),
      join(root, ".env"),
      join(root, ".env.example"),
      join(root, "README.md"),
    ];
    const offenders = roots
      .flatMap(collectTextFiles)
      .filter((path) => readFileSync(path, "utf8").includes(releasedProjectRef));

    expect(offenders).toEqual([]);
  });
});
