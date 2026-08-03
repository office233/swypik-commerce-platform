#!/bin/bash
cd /opt/swypik/app
echo "--- config_files label:"
docker inspect swypik-prod-web-next-1 | grep -E 'config_files|"com.docker.compose.project"'
echo "--- 3005 in infra/hetzner:"
grep -rn '3005' infra/hetzner/ 2>/dev/null | grep -v Binary | head -8
echo "--- compose refs in safe-deploy-web.sh:"
grep -n 'compose\|COMPOSE\|ENV_FILE\|env.production' infra/hetzner/safe-deploy-web.sh | head -12
echo "--- override files:"
ls infra/hetzner/*.yml infra/hetzner/*.override* 2>/dev/null
echo "--- 3005 anywhere in repo yml:"
grep -rln '3005' --include='*.yml' . 2>/dev/null | grep -v node_modules | head
