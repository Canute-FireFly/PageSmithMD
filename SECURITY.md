# Security policy

## Supported versions
Security fixes go into the latest release. Please update to the newest version from the
[Releases page](https://github.com/Canute-FireFly/PageSmithMD/releases) before reporting.

| Version | Supported |
|---|---|
| Latest release | Yes |
| Older releases | No |

## Reporting a vulnerability
**Please don't report security problems in public issues.**

Report them privately through GitHub: open the repository's
[Security tab](https://github.com/Canute-FireFly/PageSmithMD/security) and choose
**Report a vulnerability**. Only the maintainers can see the report.

Helpful things to include:
- the PageSmithMD version (Help > About) and your Windows version;
- what an attacker could do, and what they'd need (for example "the victim opens this Markdown file");
- steps to reproduce, ideally with a small example file;
- any idea you have for a fix.

We'll acknowledge the report as soon as we can, keep you updated while we work on a fix, and credit
you in the release notes if you'd like. Please give us a reasonable chance to release a fix before
you share details publicly.

## What counts
PageSmithMD opens files that may come from anyone, so we're especially interested in ways a
document could:
- run code or programs, or read or change files, without the user clearly choosing to;
- get around the HTML sanitising (for example script running from a crafted `.md` file);
- reach the app's internals from the page or from embedded content;
- send data somewhere without the user's knowledge.

Problems that need someone to already control your PC or account are generally out of scope.
