import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const candidates = [
  process.env.PYTHON,
  join(process.cwd(), ".venv", "Scripts", "python.exe"),
  join(process.cwd(), "workers", "video-worker", ".venv", "Scripts", "python.exe"),
  join(process.cwd(), "workers", "ai-worker", ".venv", "Scripts", "python.exe"),
  "python",
  "py",
  process.env.USERPROFILE &&
    join(process.env.USERPROFILE, "AppData", "Local", "Programs", "Python", "Python312", "python.exe"),
  process.env.USERPROFILE &&
    join(
      process.env.USERPROFILE,
      ".cache",
      "codex-runtimes",
      "codex-primary-runtime",
      "dependencies",
      "python",
      "python.exe"
    ),
].filter(Boolean);

function canRun(command) {
  if (command.includes("\\") && !existsSync(command)) return false;
  const result = spawnSync(command, ["-m", "pytest", "--version"], { stdio: "ignore", shell: false });
  return result.status === 0;
}

const python = candidates.find(canRun);

if (!python) {
  console.error(
    "Could not find Python with pytest. Create a local .venv and install worker requirements, or set PYTHON to a Python executable with pytest."
  );
  process.exit(1);
}

const tempRoot = join(process.cwd(), ".cache", "pytest-temp");
mkdirSync(tempRoot, { recursive: true });
const runId = `${Date.now()}-${process.pid}`;

const runs = [
  {
    name: "video-worker",
    args: [
      "-m",
      "pytest",
      "-p",
      "no:cacheprovider",
      "--basetemp",
      join(tempRoot, `video-worker-${runId}`),
      "-c",
      "workers/video-worker/pytest.ini",
      "workers/video-worker",
    ],
    tempDir: join(tempRoot, `video-worker-${runId}`),
  },
  {
    name: "ai-worker",
    args: [
      "-m",
      "pytest",
      "-p",
      "no:cacheprovider",
      "--basetemp",
      join(tempRoot, `ai-worker-${runId}`),
      "-c",
      "workers/ai-worker/pytest.ini",
      "workers/ai-worker",
    ],
    tempDir: join(tempRoot, `ai-worker-${runId}`),
  },
];

for (const run of runs) {
  mkdirSync(run.tempDir, { recursive: true });
  const result = spawnSync(python, run.args, {
    env: {
      ...process.env,
      TMP: run.tempDir,
      TEMP: run.tempDir,
      TMPDIR: run.tempDir,
    },
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
