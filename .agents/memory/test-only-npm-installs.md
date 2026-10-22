---
name: Test-only npm installs
description: Replit package installation behavior for npm dev-only packages
---

The package-install callback installs npm packages into `dependencies` by default, even if the caller intends a test-only addition. After installation, move test-only packages to `devDependencies` in both the project manifest and lockfile, including the lockfile package's `dev` flag.

**Why:** The callback accepts a list of package names but offers no documented save-as-dev option. A test-only renderer was initially recorded as a runtime dependency until the manifests were corrected.

**How to apply:** When a task permits one dev dependency but prohibits production dependencies, check both manifests after installation and verify that the installed package is dev-only.

Tests should declare their imported build tools directly as development
dependencies rather than relying on an unrelated runtime package to supply them.

**Why:** Removing an unused ORM exposed test bundler imports that had depended
on its transitive installation. Pinning a newer already-installed bundler also
exposed mock-resolution incompatibilities, so presence alone was not sufficient.

**How to apply:** Check direct test-tool declarations when removing packages;
verify mounted-test compatibility as well as production-tree exclusion.