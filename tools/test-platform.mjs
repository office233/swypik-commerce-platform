import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const workspaceRoot = process.cwd();
const platformApiDir = join(workspaceRoot, "services", "platform-api");
const goCacheDir = join(workspaceRoot, ".cache", "go-build");

mkdirSync(goCacheDir, { recursive: true });

const command = process.platform === "win32" ? "go.exe" : "go";
const result = spawnSync(command, ["test", "./..."], {
  cwd: platformApiDir,
  env: {
    ...process.env,
    GOCACHE: goCacheDir,
  },
  stdio: "inherit",
  shell: false,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
