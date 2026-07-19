# External issue template

Template for opening an issue on a **third-party** repo whose package doesn't yet qualify
for the Open Audio Stack registry (missing license, release binaries, or preview image —
see [AGENTS.md](AGENTS.md) step 3).

## Usage (agent/maintainer notes — do not post this section)

**Goal: at most one Open Audio Stack issue per repo, ever — and it stays a single
comment (the issue body) that gets edited in place, never a growing comment thread.**
New comments notify every subscriber and watcher; editing the body does not. Re-checks
must never add a comment.

0. **Qualify before filing anything.** This template is only for a repo that is
   genuinely a plugin/app/preset/project (AGENTS.md step 3b) and fails purely on
   license, releases/binaries, or the image requirement — a real "few small
   changes" gap. It is **not** for a repo that fails 3b itself. That distinction
   needs more than the one-line description a batch list gave you — check what
   the repo's own README says it *is* and how it's meant to be used:

   - A library/framework/source-module meant for embedding into other projects
     (even if some third-party list calls it "a plugin"), a DAW/full application,
     a research repo with no packaged distributable, or a browser-only tool with
     no installable artifact at all — none of these qualify, regardless of
     license/release/image status.
   - If the README itself says a standalone/binary mode is unmaintained,
     untested, "do not use," or redirects users to a different (already
     registered) project — treat that the same as failing 3b.
   - If the package was previously in the registry and its own maintainer
     removed it deliberately, don't re-file. Respect that decision.
   - If GitHub Issues are disabled on the repo, filing isn't possible at all —
     don't skip it silently. Note the package as blocked with reason "Issues
     disabled" in the central tracker instead (see below), so it isn't
     re-investigated next run.
   - If the repo appears to belong to the person running this workflow (README,
     commit history, or contact info points back to them), flag it to them
     directly instead of auto-filing an issue against their own repo.

   Only once a repo clears this gate do steps 1+ below apply.

1. **Search before creating.** Every issue this template produces carries a hidden
   marker comment (`<!-- open-audio-stack-tracker: ... -->`). Before opening a new
   issue, check whether one already exists:

   ```bash
   gh issue list --repo <org>/<repo> --state all --search "open-audio-stack-tracker in:body"
   ```

   - If found → **do not open a new issue and do not post a comment.** Fetch the
     current body, update it in place (see step 3), and push it back with:

     ```bash
     gh issue edit <number> --repo <org>/<repo> --body-file <updated-file>
     ```

   - If not found → use the template below to create a new issue with
     `gh issue create --body-file <file>`.

2. **One checklist, not one issue per missing item.** Include every outstanding
   requirement in a single checklist. If a second requirement is discovered later
   (e.g. license was fine, then a release goes stale), that's an in-place body edit
   to the same issue, not a new comment or a new issue.

3. **Every re-check edits the body, silently.** On each pass over this repo:
   - Update `{{LAST_CHECKED}}` to today's date.
   - Flip any checklist items whose status changed (check off newly-satisfied ones,
     uncheck any that regressed).
   - Update or remove the per-item `{{...}}` notes to reflect current findings.
   - Re-post via `gh issue edit`, never `gh issue comment`.

4. **Check off what's already true.** Only tick a box when verified (e.g. license
   confirmed present, release confirmed has binaries). Leave genuinely missing items
   unchecked.

5. **Fully satisfied → close, don't comment.** Once every box is checked and the
   package has actually been added to the registry, edit the body one last time to
   say so, then close the issue (`gh issue close`). Closing is a terminal state
   change the maintainer will want to see; it isn't the noisy part — repeated
   comments are.

6. **Low-pressure tone.** This is a "when convenient" ask, not a demand — maintainers
   owe the registry nothing. Always include an easy opt-out.

7. **Fill in every `{{PLACEHOLDER}}`** below, delete this usage section, and post only
   the `## Template` content as the issue body (the marker comment stays — it's what
   step 1 searches for next time).

## Template

**Title:**

```
Add {{PACKAGE_NAME}} to the Open Audio Stack registry
```

**Body:**

```markdown
Hello!

We are curating a list of open-source audio software at [Open Audio Stack](https://github.com/open-audio-stack/open-audio-stack-registry). We've created an open registry and package manager for installing/upgrading audio plugins, apps, presets and projects (think npm/Homebrew, but for audio software). We'd like to include **{{PACKAGE_NAME}}**, but it requires a few small changes.

<!-- open-audio-stack-tracker: {{PACKAGE_TYPE}}/{{ORG}}/{{PACKAGE_NAME}} -->

**Requirements checklist:** _(last checked {{LAST_CHECKED}})_

- [ ] License [specified](https://choosealicense.com/appendix/) as a `LICENSE` file, SPDX/REUSE annotations, or a clear statement in the README {{license_note}}
- [ ] GitHub release with downloadable binaries (zip/tar/exe/dmg/deb — source-only releases don't count), tagged with a fixed date or semantic version {{release_note}}
- [ ] Preview image in the README or repo — a UI screenshot, or a logo/icon if the project is headless {{image_note}}

{{additional_notes}}

Once everything above is checked off, {{PACKAGE_NAME}} can be added automatically — no further action needed from your side beyond that. If any box looks wrong (e.g. we missed an existing license or image), add a comment to this issue and we'll correct it. And if you'd rather this project not be listed at all, feel free to close this issue — we'll leave it alone.

Thanks!
```

### Placeholder reference

| Placeholder            | Example                                                |
| :--------------------- | :----------------------------------------------------- |
| `{{PACKAGE_NAME}}`     | `liquidsfz`                                            |
| `{{PACKAGE_TYPE}}`     | `plugins` / `apps` / `presets` / `projects`            |
| `{{ORG}}`              | `swesterfeld`                                          |
| `{{LAST_CHECKED}}`     | `2026-07-17` — update every re-check, in place         |
| `{{license_note}}`     | short clarifier, or delete the whole line if satisfied |
| `{{release_note}}`     | e.g. `(latest release has no attached binaries)`       |
| `{{image_note}}`       | e.g. `(no screenshot in README, no icon in assets/)`   |
| `{{additional_notes}}` | any extra context, or delete if none                   |

## Central tracker (this repo)

One issue on `open-audio-stack/open-audio-stack-registry` aggregates every external
tracker issue into a single table, so it's possible to see every pending package's
external issue from one place in the registry, without visiting each repo. The
external issue itself stays minimal (no outbound links besides the license-list
reference) — the marker comment is enough for the rebuild step to find it later,
so there's nothing to add to the posted issue body for this to work.

**Format:** a table, one row per package, regenerated wholesale on each run — not
hand-edited row by row. Rebuilding from a search is the source of truth; the table
itself is a derived view, so there's only one place drift can happen (an issue's
checklist state), not two.

`Package` shows the full `org/repo` path, linked to the repo root (not just the
package name — some registry slugs use a brand name that differs from the GitHub
org, see AGENTS.md's `org-name`/`package-name` note, so the repo link is what
actually lets you navigate there).

`Outstanding` is always a list of unchecked item keywords (`license`, `release`,
`image`), one per line via `<br>`, even when only one remains — never a prose
sentence or a comma-separated run-on. Keeping the cell shape identical across
every row (list in, list out) is what makes the table scannable and easy to
regenerate mechanically from each issue's checklist state, rather than needing
per-row special-casing for the single-item case.

`Issue` is a **bare URL**, not a `[text](url)` markdown link. GitHub only expands
a link into its rich issue-status card (open/closed icon, title) when the URL
appears unwrapped — custom link text suppresses that autolinking, which defeats
the point of putting the issue in the table at all.

```markdown
<!-- open-audio-stack-central-tracker -->

Packages currently blocked on an upstream requirement, tracked one issue per repo
(see [issue-template.md](issue-template.md)). Rebuilt automatically — don't hand-edit rows.

| Package                                                                 | Type    | Outstanding          | Issue                                                | Last checked |
| :---------------------------------------------------------------------- | :------ | :------------------- | :--------------------------------------------------- | :----------- |
| [swesterfeld/liquidsfz](https://github.com/swesterfeld/liquidsfz)       | plugins | `image`              | https://github.com/swesterfeld/liquidsfz/issues/12   | 2026-07-18   |
| [rullopat/sfizioso-player](https://github.com/rullopat/sfizioso-player) | plugins | `license`<br>`image` | https://github.com/rullopat/sfizioso-player/issues/3 | 2026-07-18   |
```

**Rebuilding it:**

1. Find every open external tracker issue across GitHub (the marker text is unique
   enough to search globally, not just within one org):

   ```bash
   gh search issues "open-audio-stack-tracker in:body" --state open --json repository,number,title,url
   ```

2. Find the central tracker issue itself:

   ```bash
   gh issue list --repo open-audio-stack/open-audio-stack-registry --state open --search "open-audio-stack-central-tracker in:body"
   ```

   If it doesn't exist yet, create it once with `gh issue create` and the marker
   comment above.

3. For each result from step 1, read its `open-audio-stack-tracker: type/org/name`
   marker and its checklist state, rebuild the table in full, and push it with
   `gh issue edit` — never a comment, same as the per-repo issues. Rows for issues
   that closed (package added, or maintainer opted out) simply drop out of the
   table on the next rebuild instead of lingering.
