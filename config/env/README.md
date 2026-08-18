# Committed 1Password environment templates

Files in this directory are safe-to-commit templates for GitHub Actions jobs that use the 1Password CLI.

Rules:

1. Values must be either `op://...` references or documented non-secret constants.
2. Never place plaintext credentials, tokens, passwords, private keys, or service-role values in these files.
3. Workflows should pass these templates to `op run --env-file` so secrets are resolved only at runtime.
4. Local `.env*` files remain ignored by Git.
5. Any new template should receive the same secret-reference guard used by CI.

These templates are configuration pointers, not environment files containing resolved secrets.
