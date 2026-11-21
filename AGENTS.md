# Working in this repository

`dsh-plusvibe-balance` — a DeepSeek Harness plugin that shows the PlusVibeAPI balance beside
the composer. Checks, the release procedure, and how a listing reaches the plugin
directories are in [CONTRIBUTING.md](CONTRIBUTING.md); what the plugin does is in
[README.md](README.md).

## A release is the maintainer's decision, not the agent's

**Do not release unless the user asked for a release in this conversation, in so many
words.** That covers every step that makes one, not only the last:

- `git tag`, and pushing a tag;
- a GitHub Release — draft, prerelease, or published. Publishing it runs
  `.github/workflows/publish.yml`, which publishes to npm over OIDC;
- `npm publish`, `gh release create`, and a manual `workflow_dispatch` of `publish.yml`;
- bumping `version` in `package.json` and adding a `CHANGELOG.md` release entry — that is
  the first step of a release, so it waits for the same request.

These are **not** a request for a release: fixing a bug, preparing or squashing commits,
pushing to `main`, updating the docs, adding a screenshot, preparing a catalog entry, or
asking where the release button is. When a task looks like it is heading for a release,
stop and ask.

While no release is pending, `version` in `package.json` and the newest `CHANGELOG.md`
entry describe the last published version. Leave them alone.

When the request does come, follow "Releasing (maintainers)" in CONTRIBUTING.md: the tag
has to equal the manifest version, and a version already on npm is skipped.
