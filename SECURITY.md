# Security Policy

## Supported Versions

MamaSQL is under active development. Security fixes are applied to the latest
release on the `main` branch.

| Version | Supported |
| ------- | --------- |
| latest (`main`) | ✅ |
| older releases  | ❌ |

## Reporting a Vulnerability

Please **do not** open a public issue for security vulnerabilities.

Instead, report it privately through GitHub's
[**private vulnerability reporting**](https://github.com/fizzexual/MamaSQL/security/advisories/new)
(Security → *Report a vulnerability*). This keeps the details confidential
until a fix is available.

When reporting, please include:

- A description of the vulnerability and its impact
- Steps to reproduce (a minimal proof of concept if possible)
- The affected component (desktop/Tauri, web build, or the Node bridge)
- Any suggested remediation

You can expect an initial response within a few days. Once the issue is
confirmed, a fix will be prepared and a security advisory published crediting
the reporter (unless anonymity is requested).

## Scope

MamaSQL is local-first and stores credentials in the OS keychain (desktop) or
encrypted in IndexedDB (web). Reports concerning credential handling, SQL
identifier/literal escaping, or the Node bridge's network surface are
especially welcome.
