# SEC-001 — Sanitized credential exposure review

2026-10-15. Read-only review. No secret, token fragment, hash of a secret, or credential-bearing URL is recorded here or was printed during the review. Every scan reported only match counts. No PostgreSQL connection, migration, authentication activation or deployment occurred. Sprint 0.3B was not started.

## Status

- **Issuer revocation: OPERATOR-CONFIRMED, not independently verified.** The operator states that the `git-access` Personal Access Token (classic) was deleted through GitHub Developer Settings. This review has no authenticated GitHub access, so it cannot observe token state.
- **External exposure review: INCOMPLETE.** No exposure was detected on any inspected surface. Several high-relevance surfaces could not be accessed.
- **SEC-001: OPEN (P0).**

## Detection method

Two patterns were counted on every surface:

1. GitHub token formats: `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_` or `github_pat_`, followed by 15 or more token characters.
2. URLs with embedded credentials on github.com: `scheme://user[:secret]@github.com`.

Matches were counted, never displayed. `package.json` `repository.url` was also parsed in every commit, reporting only the boolean "credentials present".

## Surfaces inspected

| Surface | Scope | Result |
| --- | --- | --- |
| Local git history | All 8 commits on all refs, full patches and commit messages | 0 hits |
| `package.json` repository.url, per commit | All 8 commits (absent in initial commit) | No credential in any committed version |
| Stash entries | 4 entries, including untracked files | 0 hits |
| Unreachable/dangling objects | 4 objects | 0 hits |
| Reflog-wide patches | All reflogs | 0 hits |
| Working tree | All files except `node_modules` and `.git` | 0 hits |
| Local build output `dist/` | All files | 0 hits |
| `node_modules` | All files, token-format scan | 0 hits |
| GitHub repository metadata (public API, unauthenticated) | Repo, 4 branches, 7 default-branch commits, 3 PRs with bodies, issue comments, PR review comments, commit comments, releases, tags, forks, deployments, public events | 0 hits. 0 forks, 0 releases, 0 tags |
| GitHub remote vs local commits | 8 distinct remote SHAs (branch heads, PR heads, default-branch commits) | All 8 exist locally and were scanned. No remote-only commits |
| GitHub Actions | Workflow runs, artifacts, `.github/workflows` | 0 runs, 0 artifacts, no workflows. Nothing to expose |
| Netlify deploy metadata | All 15 deploys (`listSiteDeploys`, `getDeploy` for production) | 0 hits |
| Netlify published files | All 15 deploy permalinks: `index.html`, every referenced asset, plus probes for `/package.json`, `/netlify.toml`, `/.env`, `/.git/config` | 0 hits. `package.json`, `.env` and `.git/config` are not published (the SPA fallback returns `index.html`). The initial empty deploy returned 404 |

## Surfaces not accessible

| Surface | Reason | Relevance |
| --- | --- | --- |
| GitHub token state, security log, PAT usage audit | Requires authenticated owner access | Confirms revocation time and any use after exposure |
| GitHub secret-scanning alerts | Requires authenticated repo admin | Would report detections GitHub itself made |
| GitHub events older than the public API window | The API returned only 10 recent PR and comment events, no push events | Force-pushed or deleted refs cannot be ruled out from public data alone |
| Netlify build logs | `getSiteBuild` / `listSiteBuilds` rejected. There is no log-read API method | **High.** Includes 5 agent-runner deploys built from uncommitted working trees during the session when the token was in local `package.json` |
| Netlify deploy source archives | Production reports that a source zip exists. No read method is exposed to this runner | **High.** Agent-session source zips may contain the uncommitted `package.json` |
| Netlify agent-runner session transcripts and logs from earlier sprints | Not retrievable here | The risk register already flags previously emitted runner logs |
| Third-party caches and mirrors (search engines, archive services, package registries) | Out of scope for read-only API review | `package.json` is `private: true` and no npm publish is known |

## Assessment

There is no evidence that the token was ever committed, pushed to GitHub, published in a deployed asset, or present in GitHub Actions. Every committed `package.json` is clean, and the repository has no workflows or artifacts.

The remaining exposure path is Netlify-side material produced from **uncommitted working trees**: agent-runner build logs, deploy source archives and agent session logs from the first sessions. This path could not be inspected. Combined with issuer revocation that is operator-confirmed only, closure cannot be declared.

## Required operator actions to close SEC-001

1. In GitHub, signed in as the token owner: open Settings → Developer settings → Tokens to confirm the token no longer appears, and record the deletion time. Review the account security log for token use between creation and deletion. Check Security → Secret scanning alerts for the repository. Optionally attach screenshots, with token values redacted, as evidence.
2. Review Netlify build logs in the Netlify UI for all 15 deploys, prioritizing the 5 agent-runner deploys without a commit reference. Search for `ghp_`, `github_pat_` and `@github.com`, recording only yes or no.
3. Download and inspect, or delete, the deploy source archives for the earliest agent-session deploys. If any contain the token, delete those deploys under the 90-day retention policy.
4. If any token use by an unknown party appears in the GitHub security log, treat it as an incident: review repositories the token could access, and rotate any credentials reachable from them.
5. Provide a written confirmation of steps 1–3. SEC-001 can then move to CLOSED with "issuer revocation operator-confirmed; exposure review complete".

## Verdict

**SEC-001 remains OPEN.** Revocation is OPERATOR-CONFIRMED, and no exposure was detected on inspected surfaces. The Netlify logs and source archives were inaccessible, so the exposure review is not complete. The Sprint 0.3A database execution gate remains **BLOCKED** on SEC-001.
