# Changesets

Every pull request that changes the published package needs a changeset: a small markdown file in this folder that
says how to bump the version (`major`, `minor` or `patch`) and what to write in the changelog.

```sh
npx changeset         # pick the bump and write the summary
npx changeset --empty # for changes that don't need a release (tests, CI, docs)
```

On every push to `master`, the Release workflow opens (or updates) a **"chore: version packages"** pull request that
applies the pending changesets to `package.json` and `CHANGELOG.md`. Merging it publishes to npm and creates the GitHub
release. See the [Changesets docs](https://github.com/changesets/changesets) for details.
