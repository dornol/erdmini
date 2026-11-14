# Full test results — 2026-11-14

User explicitly authorized the entire suite after focused validation.
All configured suites ran sequentially and passed without failures, skips or
retries. No implementation/test correction was needed during this full run.

| Suite | Result | Duration | Log |
| --- | ---: | ---: | --- |
| Unit (`pnpm test`) | 3,491 passed, 112 files | 2.41s | /tmp/erdmini-full-unit.log |
| Local E2E | 374 passed | 13.2m | /tmp/erdmini-full-local.log |
| Server E2E | 477 passed | 36.8m | /tmp/erdmini-full-server.log |
| Isolated startup E2E | 5 passed | 21.6s | /tmp/erdmini-full-startup.log |
| Docker/Compose E2E | 4 passed | 1.7m | /tmp/erdmini-full-docker.log |
| **Total** | **4,351 passed (860 E2Es)** | | |

Final `pnpm check`: **0 errors, 0 warnings** (/tmp/erdmini-full-check.log).
Final `git diff --check`: clean. No test Vite/Playwright processes or test-named
containers remained at final inspection. Docker Desktop remains running.

Every passing E2E title and its source/log is preserved in E2E-FULL-PASSES.tsv.
The pass count and absence of failed case markers were checked against each full
log. Expected authentication rejection logs belong to negative test scenarios;
they are not test failures.

Commands used:

```sh
pnpm test
CI=1 pnpm exec playwright test --retries=0 --reporter=list
CI=1 pnpm exec playwright test --config=playwright.server.config.ts --retries=0 --reporter=list
CI=1 pnpm exec playwright test --config=playwright.startup.config.ts --reporter=list
CI=1 pnpm exec playwright test --config=playwright.docker.config.ts --reporter=list
pnpm check
git diff --check
```

The focused-phase fixes remain documented in E2E-VALIDATION-RESULTS.md. The full
run confirms those changes together with all existing tests. A green suite is
execution evidence for the written scenarios; it is not a timing benchmark or a
claim to cover every imaginable input combination.
