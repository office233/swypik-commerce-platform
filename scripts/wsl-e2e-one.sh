#!/bin/bash
# Ruleaza un singur spec E2E: sed 's/\r//' wsl-e2e-one.sh | bash -s -- tests/e2e/search.spec.ts
SPEC="${1:-tests/e2e/search.spec.ts}"
docker run --rm --network host -v /opt/swypik/app:/app -w /app \
  -e PLAYWRIGHT_BASE_URL=http://127.0.0.1:3005 \
  mcr.microsoft.com/playwright:v1.60.0-noble \
  sh -c "npx playwright test $SPEC --reporter=line > /tmp/e2e1.out 2>&1; ec=\$?; echo E2E_EXIT=\$ec; tail -8 /tmp/e2e1.out"
