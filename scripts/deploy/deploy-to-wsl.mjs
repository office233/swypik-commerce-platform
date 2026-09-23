#!/usr/bin/env node
import { execSync } from "node:child_process";

function run(cmd, opts = {}) {
    console.log(`\n> ${cmd}`);
    return execSync(cmd, { stdio: "inherit", ...opts });
}

try {
    console.log("=== 1. Git Add & Commit ===");
    run("git add -A");
    try {
        run('git commit -m "feat(movies-audio): always render movies and audio without gating"');
    } catch {
        console.log("No new changes to commit or already committed.");
    }

    console.log("\n=== 2. Git Push origin main ===");
    run("git push origin main");

    console.log("\n=== 3. Pull & Rebuild on WSL (distro swypik) ===");
    const wslCommands = [
        "cd /opt/swypik/app",
        "git checkout -- .",
        "git clean -fd",
        "git pull origin main",
        "docker compose -f infra/hetzner/docker-compose.prod.yml -f infra/hetzner/docker-compose.vps.yml -f infra/hetzner/docker-compose.minio.yml --env-file infra/hetzner/.env.production build web-next",
        "docker rm -f swypik-prod-web-next-1 2>/dev/null || true",
        "docker compose -f infra/hetzner/docker-compose.prod.yml -f infra/hetzner/docker-compose.vps.yml -f infra/hetzner/docker-compose.minio.yml --env-file infra/hetzner/.env.production up -d --no-deps web-next",
        "docker ps | grep web-next"
    ].join(" && ");

    run(`wsl -d swypik bash -c "${wslCommands}"`);

    console.log("\n=== 4. Deployment Complete! ===");
} catch (err) {
    console.error("Deployment step failed:", err.message);
    process.exit(1);
}
