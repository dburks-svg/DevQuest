# Releasing

Releases are published to npm automatically by `.github/workflows/release.yml`
using npm trusted publishing (OIDC). No token or one-time password is needed
once the trusted publisher is configured.

## One-time setup (npmjs.com)

1. Sign in to npmjs.com and open the `devquest` package settings.
2. Under Trusted Publisher, choose GitHub Actions and enter:
   - Organization or user: `dburks-svg`
   - Repository: `DevQuest`
   - Workflow filename: `release.yml`
   - Environment: leave empty
3. Save. From then on, only this workflow in this repo can publish, and
   provenance is generated automatically.

## Per release

1. On a branch: bump `version` in package.json and add a CHANGELOG entry.
2. Open a PR, wait for CI, merge to main.
3. Tag and push:

   ```bash
   git checkout main && git pull
   git tag -a vX.Y.Z -m "Release X.Y.Z"
   git push origin vX.Y.Z
   ```

4. The Release workflow runs lint and tests, verifies the tag matches
   package.json, and publishes to npm with provenance.
5. Create the GitHub release notes from the CHANGELOG entry:

   ```bash
   gh release create vX.Y.Z --title "vX.Y.Z" --notes "..."
   ```

The workflow refuses to publish when the tag and package.json versions
disagree, so a mistagged release fails fast instead of shipping the wrong
code.
