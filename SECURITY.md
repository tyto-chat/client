# Security Policy

This repository holds the tyto.chat web client (a React single-page app).
We take the security of the codebase and of the operators and communities who
run it seriously.

## Supported versions

Security fixes are provided for the latest release on the `master` branch.
Operators are expected to track `master` (or the most recent tagged release)
and apply updates promptly. Older versions do not receive backported fixes.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report privately through either channel:

- **GitHub Security Advisories** — open a private advisory at
  <https://github.com/tyto-chat/client/security/advisories/new>. This is the
  preferred channel.
- **Email** — security@tyto.chat with the details below.

Include, where possible:

- a description of the vulnerability and its impact,
- the affected view, component, or file,
- steps to reproduce (proof-of-concept, screenshots, or a minimal example),
- the version or commit you tested against,
- any suggested remediation.

## What to expect

tyto.chat is an open-source project maintained on a best-effort basis, so we
do not commit to fixed response or resolution windows. Every report is taken
seriously, and we will:

- **acknowledge** your report and apply best effort to respond as quickly as
  we can,
- **assess** its severity, the affected versions, and a remediation plan,
- **fix and disclose** — prioritising by severity, with actively exploited or
  high-severity issues handled first — and coordinate a disclosure timeline
  with you, crediting you in the advisory unless you prefer to remain
  anonymous.

We do not run a bug-bounty programme and cannot offer monetary rewards, but
every genuine report is appreciated.

## Scope

In scope: the client code in this repository — rendering of untrusted
content, XSS surfaces, token handling in the browser, and the build output.

Out of scope: vulnerabilities in third-party dependencies (report those
upstream, though we appreciate a heads-up), issues that require a
misconfigured or outdated self-hosted deployment, and server-side issues,
which belong in the `tyto-chat/core` repository.

## Operator responsibilities

Because tyto.chat is self-hosted, the operator is the data controller and is
responsible for serving the client over HTTPS with the recommended security
headers and keeping their deployment patched.

The software is provided "as is", without warranty of any kind, as set out in
the MIT License.
