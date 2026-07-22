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
   the repo's own README says it _is_ and how it's meant to be used:

   - A library/framework/source-module meant for embedding into other projects
     (even if some third-party list calls it "a plugin"), a DAW/full application,
     a research repo with no packaged distributable, or a browser-only tool with
     no installable artifact at all — none of these qualify, regardless of
     license/release/image status. Archived repos fail this too, regardless of
     what their last release contains — nothing further is ever coming.
   - **Read the README's own language before filing, not just its one-line
     description.** Any of these phrases is the maintainer telling you directly
     the repo isn't meant for general use: "learning resource," "code
     example(s)," "experimental," "thesis"/"demo," "proof of concept." Treat it
     the same as failing 3b.
   - **A fork that exists only to feed a bundler/host project** (its own
     description says so — e.g. "downstream fork to aid in bundling into X") has
     no intention of shipping its own releases/images, even if it says it
     welcomes contributions. The underlying plugin format may be real; this
     particular repo still isn't where a release will come from.
   - **Orphaned/abandoned**: no commits or releases in a year or more, combined
     with the README/description calling the project "alpha," "unfinished," or
     "WIP" — don't file on the assumption someone is still actively working on
     it. Check `gh repo view <org>/<repo> --json pushedAt`.
   - **GitHub is a mirror, not the release channel** — Flathub apps, AppStream-
     catalogued Linux software, and plugins with their own vendor site often
     treat GitHub purely as a source mirror, permanently. Look for an
     AppStream/`metainfo.xml` file, a README/site saying "official builds are
     at ...", or a repo description calling itself a mirror. If confirmed,
     this is the same as failing 3b — don't file asking for GitHub releases
     the maintainer has no intention of ever adding.
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

   - If found → **do not open a new issue and do not post a comment.** First
     confirm the repo and issue still actually exist (repos get deleted or
     renamed after a tracking issue was filed — a 404 here means there's
     nothing left to update). If it's gone, drop it from the central tracker as
     excluded ("repo no longer exists") instead of retrying. Otherwise, fetch the
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

8. **Write in the language of the README of the repo.** e.g. If the README is written in French, write in French.

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

Once everything above is checked off, {{PACKAGE_NAME}} can be added automatically — no further action needed from your side beyond that. If any box looks wrong (e.g. we missed an existing license or image), add a comment to this issue and we'll correct it. And if you'd rather this project not be listed at all, feel free to close this issue — we'll leave it alone. To see a full list of all currently added plugins, click [here](https://studiorack.github.io/studiorack-site/plugins).

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
tracker issue plus every excluded candidate into one place, so it's possible to see
the state of every package the registry has ever considered without visiting each
repo individually.

**Shape:** the issue **body** is a short status summary (one row per bucket, with a
count and a link to the comment that holds the detail) — it is not the data table
itself. The detail lives in **three separate comments**, one per bucket, each
carrying its own hidden marker so a rebuild can find and edit it in place:

| Bucket                   | Marker comment                               | Contains                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| :----------------------- | :------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1) Ready for integration | `<!-- open-audio-stack-tracker-ready -->`    | Packages with no remaining blocker — real license, real release binaries, real image. Next step is a normal PR (AGENTS.md step 2b), not more upstream waiting.                                                                                                                                                                                                                                                                                                       |
| 2) Requires action       | `<!-- open-audio-stack-tracker-action -->`   | Everything still blocked on an upstream requirement: the full external-tracker table (one row per open per-repo issue), plus repos that can't even carry a tracking issue (GitHub Issues disabled, not on GitHub at all, or GitHub is a passive mirror of a GitLab/other-primary repo), plus anything blocked only on _our_ side (e.g. a multi-plugin repo needing individual per-plugin submission).                                                                |
| 3) Excluded              | `<!-- open-audio-stack-tracker-excluded -->` | Packages that will not be added — either a maintainer explicitly declined via a tracker-issue reply, the repo disappeared, or it was ruled out before ever filing an issue (archived, academic/thesis/demo, non-free license, or not actually a packaged plugin). Each row records the reason quoted/paraphrased from the source, plus a short "pattern to watch for" so the same shape gets caught pre-filing next time instead of spawning another dead-end issue. |

Splitting these into separate comments (rather than one long body) keeps them
visually distinct when skimming the issue, and keeps each comment's diff small and
independent on a rebuild — editing the "Excluded" comment never touches "Requires
action"'s rows.

**Why comments instead of the body, here specifically:** this is the one place in
the workflow that intentionally departs from "always edit in place, never post a
comment" (contrast the per-repo external issues in the section above, which must
stay a single edited body forever). The body's job is to be readable at a glance;
GitHub renders a very long single body as one wall of table, whereas three
separate comments with their own headings scroll and scan far better. The
per-bucket comments still get edited in place on every rebuild via the API
(`gh api .../issues/comments/<id> -X PATCH -f body=...`) — the "no new comments"
rule still holds, it just applies at the granularity of three fixed comments
instead of one.

**Body format** — a summary table only, three rows, linking straight to each comment:

```markdown
<!-- open-audio-stack-central-tracker -->

Tracker of registry candidates that needed an upstream fix before they could be added, one issue per repo (see [issue-template.md](issue-template.md)). Full detail lives in the three comments below — this body is just a status summary. _Last full check: {{LAST_CHECKED}}._

| Status                                            | Count              | Meaning                                                                                                                   |
| :------------------------------------------------ | :----------------- | :------------------------------------------------------------------------------------------------------------------------ |
| [1) Ready for integration]({{READY_COMMENT_URL}}) | {{READY_COUNT}}    | No blockers left — can go straight to a real PR.                                                                          |
| [2) Requires action]({{ACTION_COMMENT_URL}})      | {{ACTION_COUNT}}   | Still blocked on license/release/image, awaiting a maintainer reply, or not trackable via a GitHub issue at all.          |
| [3) Excluded]({{EXCLUDED_COMMENT_URL}})           | {{EXCLUDED_COUNT}} | Won't be included — maintainer declined, repo gone, or ruled out before filing (archived/academic/non-free/not a plugin). |

See the comments below for the full package tables and reasons.
```

**Comment 1 — Ready for integration:**

```markdown
<!-- open-audio-stack-tracker-ready -->

## 1) Ready for integration

_Response check {{LAST_CHECKED}}._ No remaining blockers — these can go straight to a real PR, no further upstream ask needed.

| Package                                                                           | Notes                                                                              | Issue                                                           |
| :-------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------- | :-------------------------------------------------------------- |
| [jurihock/stftPitchShiftPlugin](https://github.com/jurihock/stftPitchShiftPlugin) | Maintainer confirmed downloadable binaries are now available starting from v1.1.3. | [#9](https://github.com/jurihock/stftPitchShiftPlugin/issues/9) |
| [QuentinStoll/VstProfiler](https://github.com/QuentinStoll/VstProfiler)           | Recognized license, real release binaries, real screenshots.                       | — (no tracking issue needed)                                    |
```

**Comment 2 — Requires action:**

```markdown
<!-- open-audio-stack-tracker-action -->

## 2) Requires action

Blocked on an upstream requirement (license / release / image), tracked one issue per repo (see [issue-template.md](issue-template.md)). Rebuilt automatically — don't hand-edit rows. _Response check {{LAST_CHECKED}}._

| Package                                                                 | Status                                                                                                           | Issue                                                       |
| :---------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------- |
| [swesterfeld/liquidsfz](https://github.com/swesterfeld/liquidsfz)       | Missing: `image`. No reply yet.                                                                                  | [#12](https://github.com/swesterfeld/liquidsfz/issues/12)   |
| [rullopat/sfizioso-player](https://github.com/rullopat/sfizioso-player) | Missing: `license`<br>`image`. No reply yet.                                                                     | [#3](https://github.com/rullopat/sfizioso-player/issues/3)  |
| [calf-studio-gear/calf](https://github.com/calf-studio-gear/calf)       | Maintainer engaging — asked which archive format we'd prefer; we replied with spec guidance. Awaiting a release. | [#406](https://github.com/calf-studio-gear/calf/issues/406) |

**Can't be tracked via a GitHub issue (Issues disabled or no GitHub issue tracker at all):**

| Package                                           | Status                                                         |
| :------------------------------------------------ | :------------------------------------------------------------- |
| [p-hlp/CTAGDRC](https://github.com/p-hlp/CTAGDRC) | Issues disabled. Otherwise qualifies — missing only `release`. |

**Needs individual package submission, not a tracking issue:**

| Package                                                   | Status                                                                                                                                                                                         |
| :-------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ryukau/VSTPlugins](https://github.com/ryukau/VSTPlugins) | Already has real GPL-3.0 releases with per-plugin zip assets — not blocked upstream, just needs each bundled plugin registered individually (action needed on our side, not the maintainer's). |
```

Row shape rules, same reasoning as the old single-table format:

- `Package` is the full `org/repo` path linked to the repo root (brand-vs-slug
  mismatches mean the link, not just the name, is what lets you navigate there).
- The `Status`/`Notes` column holds either `Missing: `keyword`<br>`keyword`. No
reply yet.` for an untouched issue, or a short paraphrase/quote of the
  maintainer's actual reply once one exists — never leave a stale "no reply yet."
  next to a package that has one.
- `Issue` is a short `[#N](url)` link (unlike the old bare-URL rule — with three
  focused comments instead of one giant table, the rich autolink card is less
  important than keeping each row scannable; use whichever your working session
  already has other rows using, for consistency within the comment).

**Comment 3 — Excluded:**

```markdown
<!-- open-audio-stack-tracker-excluded -->

## 3) Excluded

Won't be included — reason given per repo, and the pattern to catch earlier next time so we stop opening issues against repos that were never going to qualify. _Response check {{LAST_CHECKED}}._

**Maintainer replied and declined, or the repo is gone:**

| Package                                                                            | Reason given                                                                           | Pattern to watch for                                                                                                                                 |
| :--------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------- |
| [hollance/mda-plugins-juce](https://github.com/hollance/mda-plugins-juce/issues/3) | "These plug-ins aren't really intended to be used, but only serve as code examples..." | README frames the repo as teaching material, not a distributable — the existing 3f "content type invalid" bucket should have caught this pre-filing. |

**Archived / academic / demo / non-free license — not a fixable gap, no tracking issue was filed:**

| Package                 | Reason                                              |
| :---------------------- | :-------------------------------------------------- |
| facebookresearch/demucs | Python research library/CLI, not a packaged plugin. |

**Recurring signals worth checking before filing a tracking issue:**

- README/description says "learning resource," "code example," "experimental," or "thesis/demo" → likely a 3f content-type exclusion, not a fixable gap.
- Repo description frames it as a fork feeding a bundler/host app, with no packaging of its own.
- No commits/releases in 1+ years plus an explicit "alpha"/unfinished status → check for an orphaned project before assuming the gap is fixable.
- Project has its own distribution channel (Flathub, AppStream, vendor site) separate from GitHub → GitHub Releases may never be the intended channel; check the README/website for "official builds are at ..." wording first.
- Repo may be deleted/renamed after a tracking issue was filed — confirm the repo still exists before re-checking an old issue.
```

The two tables inside Comment 3 are genuinely different populations, so keep them
separate rather than merging: the first is repos that _had_ a tracking issue and a
real reply; the second never had one because 3b/3f ruled them out on sight. Both
still belong under "Excluded" — the split is about provenance, not severity.

**Rebuilding it, end to end:**

1. Find every open external tracker issue across GitHub. `gh search issues` free-text
   search does **not** do exact-phrase matching — it tokenizes on the hyphens, so
   past the first ~30 results it starts returning unrelated issues that merely
   contain "open", "audio", "stack", or "tracker" somewhere. Always pass a high
   `--limit` (the default silently truncates once the real count exceeds it) *and*
   filter results down to ones that actually contain the literal marker comment:

   ```bash
   gh search issues "open-audio-stack-tracker in:body" --state open --limit 100 \
     --json repository,number,title,url,body \
     --jq '[.[] | select(.body | test("open-audio-stack-tracker: [^ ]+ -->"))]'
   ```

   If the filtered count comes back at or near whatever `--limit` you passed, raise
   the limit and re-run — that's a sign of truncation, not a sign you've found
   everything.

2. Find the central tracker issue itself:

   ```bash
   gh issue list --repo open-audio-stack/open-audio-stack-registry --state open --search "open-audio-stack-central-tracker in:body"
   ```

   If it doesn't exist yet, create it once with `gh issue create` using the body
   template above, then create the three comments with `gh issue comment` (only
   ever this once — every subsequent pass edits them, never adds a fourth).

3. For each result from step 1, read its `open-audio-stack-tracker: type/org/name`
   marker and checklist state to decide which bucket it now belongs in: any reply
   on the external issue (check with `gh api repos/<org>/<repo>/issues/<n>/comments`)
   moves it from an unread "no reply yet" row into a quoted status, either staying
   in "Requires action" (still blocked but not a dead end) or moving to "Excluded"
   (maintainer declined) — read AGENTS.md step 3f's distinctions for how to tell
   those apart. A 404 on the issue URL means the repo/issue is gone; drop the row
   and record it as excluded ("repo no longer exists").

4. Find the three per-bucket comments on the central issue via their markers:

   ```bash
   gh api repos/open-audio-stack/open-audio-stack-registry/issues/581/comments \
     --jq '.[] | {id, body: .body[0:60]}'
   ```

5. Rebuild each bucket's full table and push it with a `PATCH` to that comment
   (never `gh issue comment`, which would create a fourth comment):

   ```bash
   gh api repos/open-audio-stack/open-audio-stack-registry/issues/comments/<id> \
     -X PATCH -f body="$(cat updated-comment.md)"
   ```

6. Recompute the three counts and push the summary body with `gh issue edit`,
   updating each bucket's link to the comment URL from step 4 if the comment IDs
   changed (they normally won't — same three comments, edited forever).

Rows for issues that closed (package actually added, or maintainer opted out and
closed it themselves) simply drop out of "Requires action" on the next rebuild —
either into "Ready for integration" (if it was closed because the package got
added) or off the tracker entirely (if the maintainer just opted out with no
further reason worth recording).
