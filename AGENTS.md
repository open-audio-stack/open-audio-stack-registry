# Instructions for Agents: Contributing via command line

## 1. Setup git repo

Verify that the GitHub CLI is installed and authenticated:

```bash
gh --version
gh auth status
```

If `gh` is not installed, follow the [installation guide](https://cli.github.com/). If not authenticated, run:

```bash
gh auth login
```

Check to see if you are inside the registry repository:

```bash
git status
```

If you see an error message like `fatal: not a git repository`, then use GitHub CLI to fork the repository:

```bash
gh repo fork open-audio-stack/open-audio-stack-registry --clone
cd open-audio-stack-registry
```

Ensure you are on the main branch and up-to-date with changes:

```bash
git checkout main
gh repo sync
npm install
```

Note: `gh repo sync` will refuse to run if there are uncommitted or untracked local changes. If that happens, use `git pull` instead:

```bash
git pull
```

Then continue to step 2.

## 2. Contributing changes

You can contribute either functional changes to the codebase or add new packages (apps, plugins, presets, projects) to the registry.
Infer the type of change from the user prompt. If unclear ask them to clarify.

- For functional changes continue to step 2a.
- For adding new packages continue to step 2b.

## 2a. Contributing functional changes

Create a new branch for your contribution. Use descriptive branch names following these conventions:

- `feature/feature-name` for new features
- `fix/fix-name` for bug fixes

Edit TypeScript/JavaScript files in the codebase using your tools. Ensure changes follow the project's coding standards, enforced by Prettier (.prettierrc.json) for code formatting, ESLint (eslint.config.js) for linting, and Vitest (vitest.config.ts) for the test suite.

Then proceed to step 3.

## 2b. Contributing a package

### Step 1: Obtain URLs

Extract the URL(s) to be added from the user's prompt. URLs may be provided directly in the message, or linked from a GitHub issue.

Note: for batch uploads, the user may provide multiple URLs, a mixture of GitHub/website URLs, multiple issue numbers, or a text file containing a list of URLs. Process each one through the steps below independently.

If the user gives an issue number, read it first:

```bash
gh issue view NUMBER --repo open-audio-stack/open-audio-stack-registry
```

The issue body will contain a `url:` field with the package homepage. Extract all URLs before continuing.

If no URL was provided or found, ask the user to supply one before proceeding.

### Step 2: Route each URL

For each URL, determine how to proceed:

- **GitHub URL** → validate it (Step 3), then use the fetch script (see below).
- **Other website URL** → scrape the page manually and construct the `index.yaml` by hand. Refer to the specification for required fields.
- **URL that does not load or has no relevant content** → inform the user and ask them to clarify.

Note: non-GitHub URLs in a batch are handled the same way as any other package — manual YAML construction — and will receive their own branch/PR if successful.

### Step 3: Validate each GitHub URL

Before running any scripts, confirm the repository meets all requirements. Run all checks below.

- If processing a **single** package, **stop** if any check fails.
- If processing a **batch**, and a check fails for one package, mark that package "Failed" with the reason and continue validating the rest. Do not abort the whole batch over one failure.

**3a. Valid GitHub repository**

```bash
gh repo view <org>/<repo>
```

If this returns an error, the repository does not exist or is private. Inform the user and stop.

**3b. Valid content type**

Confirm the repository is an audio application, plugin, preset, or project — not a library, framework, DAW, or unrelated tool. Read the repository description and README to decide. If it is not a valid content type for this registry, inform the user and stop.

**App vs. plugin**: if the release ships any plugin format (`vst`/`vst3`/`component`/`clap`/`lv2`/`aax`/etc.), add it under `src/plugins` even if it also ships a standalone build — the plugin formats are usually the primary distribution. Only use `src/apps` when **none** of the release assets contain a plugin format (pure standalone executables, installers, CLI tools). When unsure, inspect the assets first (see `contains` below) before picking a folder — several submissions this way round needed a late move from `src/plugins` to `src/apps` after fetch had already run, which is wasted work you can avoid by checking formats before generating files.

**3c. No existing entry or open PR**

Convert the GitHub URL to the expected kebab-case path and check for an existing registry entry:

```bash
# e.g. https://github.com/GuitarML/SmartGuitarAmp -> guitarml/smartguitaramp
ls src/<type>/<org-name>/<package-name>/
```

Directory-name matching alone misses two common cases: a plugin re-published under a different brand/org than its code repo (e.g. `jatinchowdhury18/AnalogTapeModel` is registered as `chowdhury-dsp/chowtapemodel` — same plugin, different slug), and an actively-maintained fork of a repo that itself has no releases. Also grep for the source URL across every existing entry, not just the expected directory:

```bash
grep -rli "url: https://github.com/<org>/<repo>" src/plugins src/apps
```

If check finds a match that is the same version code, **stop**. If the match is a newer versiin, **continue**. Comment on the issue to let the submitter know the package is already in the registry and include the existing registry URL:

```
https://open-audio-stack.github.io/open-audio-stack-registry/<type>/<org-name>/<package-name>
```

**3d. Free open-source license**

```bash
gh repo view <org>/<repo> --json licenseInfo --jq '.licenseInfo'
```

The license must be a recognised open-source license (MIT, GPL, Apache, LGPL, AGPL, etc.). If the repository has no license or a proprietary/commercial license, inform the user, file/update an upstream tracking issue per [issue-template.md](issue-template.md), and stop.

`licenseInfo`/the GitHub API's `license.key` field is null for repos that don't have a single root `LICENSE` file — including projects using per-file SPDX annotations (a `REUSE.toml` plus a `LICENSES/` folder) or a license file with a nonstandard name. Before concluding "no license", double check:

```bash
gh api repos/<org>/<repo>/contents --jq '.[].name' | grep -i licen
gh api repos/<org>/<repo>/contents/REUSE.toml --jq '.content' | base64 -d   # if a LICENSES/ folder exists
```

**3e. Has releases with binary builds**

```bash
gh release list --repo <org>/<repo>
```

The repository must have at least one GitHub release containing downloadable binary files (`.zip`, `.tar.gz`, `.exe`, `.dmg`, `.deb`, etc.). Source-only releases or releases with no assets are not sufficient — this includes "build it yourself" repos whose GitHub releases only contain a manual/PDF/changelog while the actual compiled plugin is sold or distributed elsewhere (e.g. the author's own store). Check the actual release assets, not just the presence of a release.

**Exception — binaries committed directly to the repository:** If the repository has no releases but ships pre-built binaries committed to the repository itself (common for SFZ sample libraries and similar assets), you may add an entry using a commit-pinned archive URL. See the [Linking to committed binaries](#linking-to-committed-binaries) section of README.md for the required URL format.

If neither condition is met, inform the user, file/update an upstream tracking issue per [issue-template.md](issue-template.md), and stop.

**3f. Filing upstream tracking issues for failures**

Any package that fails 3d (license), 3e (releases/binaries), or the `image` requirement (see [Reviewing and correcting the output](#reviewing-and-correcting-the-output) below) is a candidate for an upstream tracking issue, not just a silent failure. Follow [issue-template.md](issue-template.md) exactly — it already covers deduping (search for the hidden marker before creating anything), editing the issue body in place on re-checks instead of posting comments, and the central tracker on this repo. Don't improvise a different issue format or post ad hoc comments; that file is the single source of truth for this workflow.

Do this for every failing package, single or batch, unless the user has said not to file issues for this run.

If processing a batch, once all URLs have been checked, present a validation table to the user before continuing:

| Package     | Status    | Reason          | Tracking issue     |
| ----------- | --------- | --------------- | ------------------ |
| wolf-shaper | ✅ Ready  |                 |                    |
| cool-plugin | ❌ Failed | Missing license | org/cool-plugin#42 |

---

Once all checks pass (for a single package), or for each passing package (for a batch), generate the registry files as described below.

Note: if processing a batch, do **not** create branches yet — stay on `main` and generate all YAMLs and assets together first. Branching happens per-package in step 4, once all files are generated and validated.

For a single package, create a new branch for your contribution now. Use descriptive branch names following these conventions:

- `app/app-name` for app additions
- `plugin/plugin-name` for plugin additions
- `preset/preset-name` for preset additions
- `project/project-name` for project additions

Use these reference yaml files as starting points:

- App: [src/apps/free-audio/clapinfo/1.2.2/index.yaml](src/apps/free-audio/clapinfo/1.2.2/index.yaml)

- Plugin: [src/plugins/surge-synthesizer/surge/1.3.4/index.yaml](src/plugins/surge-synthesizer/surge/1.3.4/index.yaml)

- Preset: [src/presets/jh/floating-rhodes/1.0.0/index.yaml](src/presets/jh/floating-rhodes/1.0.0/index.yaml)

- Project: [src/projects/kmt/banwer/1.0.1/index.yaml](src/projects/kmt/banwer/1.0.1/index.yaml)

Update `.yaml` details to match your package. Refer to the <a href="specification.md">Open Audio Registry Specification</a> for all the possible fields and values allowed.

### Running GitHub repo fetch script

For GitHub repos, run the fetch script with the repository url and an optional version tag:

```bash
npm run dev:fetch -- https://github.com/wolf-plugins/wolf-shaper
npm run dev:fetch -- https://github.com/wolf-plugins/wolf-shaper v1.0.2
```

The script automatically:

- Derives `org-name` and `package-name` from the GitHub URL in kebab-case
- Fetches repo metadata: name, description, license, topics/tags
- Finds and downloads a preview image from the README, converting it to JPEG (max 1000px, 70% quality)
- Finds and downloads a demo audio file from the README, converting it to a 10-second FLAC clip
- Fetches the latest (or specified) release assets with sizes and SHA256 hashes
- Infers systems, architectures, and plugin formats from asset filenames and README text
- For `.zip`/`.tar.gz`/`.tar.xz`/`.tar.bz2` assets where the filename alone doesn't reveal the platform or plugin format, downloads and extracts the archive and inspects the real contents (bundle extensions like `.vst3`/`.component`/`.clap`/`.lv2`, and the actual binaries via `file`) instead of guessing. This does **not** apply to installer types (`.dmg`, `.pkg`, `.exe`, `.deb`) — those still need the manual inspection steps below.
- Writes `src/<type>/org-name/package-name/version/index.yaml` and the image/audio files
- Prints a warning listing any release assets it could not confidently place (unrecognized platform, unsupported architecture, or unknown format), plus a separate list of files where the architecture is an unverified default (typically a Mac build with no arch token in the filename, where archive inspection also found nothing conclusive) — always read both lists, don't just look at the generated YAML

**Before trusting the output, verify you fetched the right release.** A repo can have multiple release "channels" that are easy to confuse:

- The GitHub-flagged "latest" release is not always the one with usable binaries — it may have zero assets (check `gh release list --repo <org>/<repo> --json tagName,isLatest,isPrerelease,publishedAt` and pick the newest tag that actually has assets), or it may be a different product entirely (e.g. a repo that publishes both a VST/CLAP DAW plugin release and a separate VCV Rack / web / source-only release under different tags — read the asset filenames before assuming the "latest" one is the DAW plugin).
- If every release is marked prerelease, `gh release view` (and the fetch script) without an explicit tag will fail outright — pass the tag explicitly as the second argument, picking the most recently published one with real binary assets.
- **Cross-check the asset count.** Compare the number of files in the generated YAML against `gh release view <tag> --repo <org>/<repo> --json assets --jq '.assets[].name'`. The fetch script drops assets it can't classify (checksums and source tarballs are correctly excluded, but so are real binaries with unrecognized filenames) — the printed warning above should catch this, but a manual count is a cheap second check.
- If the release tag itself isn't valid semver (e.g. `Nightly`, `DAWPlugin`, `ui-yay`), the script normalizes it, but a normalization like `26.02` → `26.0.2` can obscure the actual meaning (year.month vs major.minor.patch). Prefer renaming the version folder yourself to something unambiguous, such as the build date embedded in the asset filenames (`2026.7.3`), and note why in the PR description.

### Reviewing and correcting the output

The script is deterministic — it reads only what GitHub's API and the README provide. It cannot make editorial judgments. After running it, review every field in the generated YAML and correct where needed. If processing a batch, review each generated YAML independently — do not assume a correction needed for one package applies to the others.

**`name`** — derived from the GitHub repository slug (e.g. `analog-tape-model` → `Analog Tape Model`). Check that it matches the plugin's actual display name. The repo slug often differs from the brand name (e.g. `AnalogTapeModel` → `Chow Tape Model`).

**`author`** — fetched from the GitHub user's display name. If the developer has not set a display name on GitHub, this falls back to their login (e.g. `jatinchowdhury18` instead of `Chowdhury DSP`). Look up the correct author name from the plugin's website or README.

**`description`** — taken from the GitHub repository "About" field (≤255 characters). This is often shorter or less accurate than the plugin's own documentation. Expand or rewrite if needed.

**`type`** — inferred by scoring keywords in the description, topics, and README. This can misfire, especially for plugins that are clearly effects (tape, distortion, EQ) but whose README doesn't use the expected keywords. Always confirm: `instrument` / `effect` / `sampler` / `generator` / `tool`.

**`tags`** — **All tags MUST be Title Case** (e.g. `Guitar`, `Pitch Shifter`, `Noise Gate`). The fetch script converts GitHub topics automatically; if you add or edit tags manually, apply Title Case. GitHub topics are technical (e.g. `vst3-plugin`, `juce`) while registry tags should be semantic categories (e.g. `Effect`, `Filter`, `Tape`). Replace with meaningful registry tags. Run `npm run dev:fix-tags` to bulk-fix any all-lowercase tags across the registry.

**`changes`** — taken verbatim from the GitHub release body, trimmed to 255 characters. Release bodies often include headers, markdown formatting, or unrelated links. Clean up to a concise bullet list of changes. `changes` is a required field — if the release body is empty (common for rolling/nightly tags), the fetch script falls back to `"<tag> release."`; feel free to replace that with something more specific (e.g. summarizing the latest commit message) if one is available.

**`audio`** — only populated if the README contains a direct link to an audio file. Most READMEs do not. If no audio is found, source a demo clip manually, convert to FLAC (`ffmpeg -i input -t 10 -c:a flac output.flac`), and place it at `src/plugins/org-name/package-name/package-name.flac`.

**`image`** — downloaded from the first non-badge image found in the README. External images hosted on third-party sites may block downloads (HTTP 403). If the image is missing, look for one in this order: repo README → repo's `resources`/`assets`/`images`/`docs` folders (an app icon or logo is an acceptable fallback if there's no dedicated screenshot) → the plugin's own website if one is linked. Convert it with: `ffmpeg -i input.png -vf "scale='min(1000,iw)':-1" -q:v 10 output.jpg`. If the source image is transparent (common for logos), composite it onto a solid background first or the plugin will render as a blank white square: `ffmpeg -f lavfi -i "color=c=black:s=WxH" -i logo.png -filter_complex "[0:v][1:v]overlay=(W-w)/2:(H-h)/2:format=auto" -frames:v 1 output.jpg`.

`image` is a **required** field — the validate script will throw and abort if it's missing, not just warn. If, after checking all of the above, no image exists anywhere (no screenshot, no icon, no logo, and the plugin genuinely has no UI to capture), the package cannot be added by automated fetch. Report it to the user as failed with the reason, the same as a licensing or binary-availability failure — don't fabricate a placeholder image. File/update an upstream tracking issue per [3f](#3f-filing-upstream-tracking-issues-for-failures) / [issue-template.md](issue-template.md).

**`architectures`** — inferred from asset filenames (e.g. `x64`, `arm64`, `arm64ec`, `arm32`, `m1`). Filenames that give no architecture hint default to `[x64]`. Mac builds that are universal binaries (arm64 + x64) often have no hint in the filename — for `.zip`/`.tar.*` assets the fetch script now extracts the archive and runs `file` on the binary itself to confirm the real architecture(s) automatically; for `.dmg`/`.pkg` installers (which it doesn't extract), check the release notes or README, or download and run `lipo -info` on the binary yourself. If the script couldn't confirm an architecture either way, it prints the file in an "architectures unconfirmed" list at the end — treat every entry there as still defaulted to `[x64]` and needing a manual check, not as verified. There is no registry value for RISC-V (`riscv64`) — the fetch script drops these assets automatically and flags them in its "skipped" list; leave them out rather than mislabeling the architecture.

**`systems[].min` / `systems[].max`** — optional OS version bounds (see <a href="specification.md#file">the spec</a>). **The default is no constraint** — if a plugin author doesn't say otherwise, assume the build works on every version of that OS and leave `min`/`max` off entirely. Only add a bound when there's actual evidence: a filename token (`windows7`, `macos-10.15`), a release-notes line, a README requirement, or a CI config that targets a specific minimum.

The fetch script auto-detects the common filename patterns:

- Windows: a literal `win7`/`windows7`/`win10`/`win11`-style token → `min` set to that number. This is usually a _compatibility_ build offered _alongside_ a regular build, not a replacement — see below.
- macOS: a deployment-target-looking number next to `mac`/`macos`/`osx` (e.g. `macos-10.15.dmg`, `mac-universal-11.dmg`) → `min` set to that number. Genuine macOS versions are always low two-digit numbers with an optional decimal (`10.13`, `11`, `14.2`) — the detector deliberately won't match a longer digit run, so a date-stamped filename like `macOS-2026-06-27-abc123.dmg` (common in CI-built nightlies) correctly produces no constraint instead of misreading "20" as the OS version.
- Linux is **intentionally never auto-constrained**. A distro tag like `ubuntu-20.04` or `fedora-38` reflects the CI build environment's glibc floor, not a "Linux OS version" in the same sense — there's no single number that means the same thing to an end user the way `mac`/`win` versions do. If a Linux binary genuinely won't run on older distros, note this as a limitation but don't fabricate a `min`.

What the script **cannot** infer, and you should add by hand after checking the repo:

- The Windows _minimum_ for a **regular** (non-`win7`-tagged) build. When a project ships both a `win7`-suffixed compatibility build and a plain one, the plain build usually has an implicit floor (often Windows 10, because the current JUCE/toolchain dropped support for older Windows) even though nothing in its filename says so. Check the CI workflow (look for a flag like `downgrade_juce`/`ONJUCE7`/similar paired with the win7 variant) or ask upstream — don't leave the regular build unconstrained if you have good evidence it doesn't run on 7/8.
- Any minimum stated only in prose ("Requires macOS 11 Big Sur or later", "Windows 10 1903+ required") — read the README/release notes for this, since the filename won't always carry it.
- An upper bound (`max`). This is rare — only add one if you have positive evidence the build is broken or blocked on newer OS versions (e.g. an old 32-bit-only Windows build that Windows 11 dropped support for). Don't infer a `max` just because a `min` exists elsewhere; a compatibility build is usually a floor, not a ceiling — most old-OS builds keep working on newer systems too.

**`contains`** — inferred from asset filenames first, then the release body, then the README. If none of those give an answer, the fetch script downloads the asset and extracts it for real — this now covers `.zip`/`.tar.gz`/`.tar.xz`/`.tar.bz2` **and** the common installer formats (`.pkg`, `.dmg`, `.deb`, `.exe`, `.msi`), using `pkgutil`, `ar`/`tar`, `hdiutil`, `innoextract`, and `7z` respectively. It looks for `.vst3`/`.component`/`.clap`/`.lv2`/`.aaxplugin`/`.vst` bundle paths, a macOS `.app`, and — when there's exactly one plausible candidate — a loose Windows `.exe`/Linux ELF binary that isn't inside a plugin bundle (tagged `exe`/`elf`). A `.dmg`/`.zip` that wraps a `.pkg` instead of shipping raw bundles is unwrapped automatically too. Each installer extractor is gated behind a tool-availability check and degrades gracefully to the pre-existing filename/text-inference guess if the tool isn't installed locally — don't be surprised if this works better on a machine that already has `7z`/`innoextract`/`pkgutil` set up than on a bare CI runner.

Two things the script deliberately still **won't** do:

- **`.AppImage`** is never auto-extracted. Every other format above is inspected by passively parsing the file — none of them execute the downloaded binary. The standard way to read an AppImage's contents is `--appimage-extract`, which runs its bundled runtime stub, a meaningfully different trust boundary for a script that processes untrusted community submissions. AppImages always fall back to the manual steps below.
- A handful of installer frameworks (older InstallShield, some self-extracting archives) resist both `innoextract` and `7z`. When that happens the script leaves `contains` empty and flags the file in its "unknown format" list rather than guessing.

When the fetch script still flags a file's `contains` as unknown, prints an "ambiguous standalone binaries" warning (found more than one plausible entry-point candidate and couldn't tell which, if any, is the real one), or when you just want to double-check its answer, download the asset and list its contents directly:

```bash
# zip/tar archives
unzip -l file.zip        # or: tar -tJf file.tar.xz

# macOS .dmg — try a quick listing first (works for plain app-bundle dmgs):
7z l file.dmg
# If that fails or the dmg wraps a .pkg, mount and expand instead. Some dmgs show
# an embedded software-license prompt on attach; `yes |` auto-accepts it so the
# command doesn't hang waiting for interactive input:
yes | hdiutil attach file.dmg -nobrowse -mountpoint /tmp/mnt
pkgutil --expand /tmp/mnt/*.pkg /tmp/pkg-expand && find /tmp/pkg-expand -maxdepth 2
hdiutil detach /tmp/mnt

# Linux .deb
mkdir /tmp/deb && cd /tmp/deb && ar x /path/to/file.deb && tar -tf data.tar.*

# Windows .exe/.msi — try innoextract first (Inno Setup installers):
innoextract -l file.exe
# If that fails ("not a supported Inno Setup installer" or a loader-revision
# error — either a different installer framework, or a newer Inno Setup
# version than the installed innoextract supports), fall back to 7z, forcing
# the NSIS type if the plain listing comes back empty/wrong:
7z l file.exe
7z l -tnsis file.exe
7z l file.msi
```

This is the only reliable way to confirm formats for installer packages — filename and README text both routinely disagree with what's actually inside the archive (GitHub topics like `vst2` or `lv2` may not reflect what's actually shipped, and vice versa — including inventing formats that don't exist at all, e.g. a plugin _manager_ app whose README mentions the formats it manages, not what it ships as). Even after automated archive inspection, always spot-check the `contains` the script produced against the file list printed in its output. If every tool above fails to open an installer, fall back to reading the repo's own packaging script (an Inno Setup `.iss`, NSIS `.nsi`, or macOS `distribution.xml.template`/`installer.iss` under a `packaging/` folder) or its CI workflow — these usually list the exact components/formats bundled per platform even when the binary itself resists extraction. Treat a component listed only in a packaging _script_ as weaker evidence than one actually found inside the extracted installer, though — a script can declare an optional component that isn't present in a particular build.

**File list** — include **every** binary release asset for the package. Do not trim the list to one file per platform. Releases often ship multiple variants for the same platform (e.g. a compatibility build, an optimised/SSE build, a standalone app, and per-format archives). Each is a separate entry in the `files` array with its own `contains` value. To determine what each file contains:

1. Check the release body — authors often describe what each archive includes.
2. Check the repository's CI workflow `.github/workflows/`
3. When in doubt, name the file variant in a comment or derive from the filename suffix (e.g. `-clap-` → `clap`, `-vst2-` → `vst`, `-app-` → `elf`/`exe`).

Exclude files that are: source archives (e.g. `-src.tar.xz`), checksums (`.sha256`, `.md5`), or entirely different products bundled in the same release.

**`org-name` / `package-name` path** — derived from the GitHub org and repo name in kebab-case. If the developer publishes under a personal GitHub account but the plugin is associated with an organisation or brand, use the brand name instead (e.g. `chowdhury-dsp/chowtapemodel` rather than `jatinchowdhury18/analogtapemodel`). Check `src/plugins/` for any existing entry for the same plugin.

### Validating file data

For guitar / amp / pedal plugins:
If a plugin supports Neural Amp Modeler (NAM (.nam)), tag it as "NAM".
If a plugin supports AIDA-X (.json / RTNeural), tag it as "AIDA-X".
If a plugin supports Proteus (GuitarML), tag it as "Proteus".

For synths:
If a plugin supports audio input for oscillators, tag it as 'Audio Input'.

For all plugins:
If the plugin is a successor to another plugin, write that in its description and use the original pluign's name as a tag.

**`contains` values are platform-specific for VST2 — do not use a generic value.** The registry's plugin-format enum (see `node_modules/@open-audio-stack/core/build/types/PluginFormat.js` or <a href="specification.md#file-formats">the spec</a>) is:

| What it is        | Correct value | Common mistake                                                                                                                 |
| :---------------- | :------------ | :----------------------------------------------------------------------------------------------------------------------------- |
| VST2 on Mac       | `vst`         | —                                                                                                                              |
| VST2 on Linux     | `so`          | writing `vst` (only valid on Mac)                                                                                              |
| VST2 on Windows   | `dll`         | writing `vst` (only valid on Mac)                                                                                              |
| VST3 (any OS)     | `vst3`        | —                                                                                                                              |
| Audio Units (Mac) | `component`   | writing `au` — **not a valid enum value**, will silently pass validation and then render as an unrecognized format on the site |
| CLAP              | `clap`        | —                                                                                                                              |
| LV2               | `lv2`         | —                                                                                                                              |

The fetch script now derives the correct per-platform VST2 value automatically from each file's `systems` entry. If you're hand-editing `contains` (e.g. after inspecting an archive yourself), always double check the value against the enum above rather than typing the human-readable abbreviation — the schema does not reject invalid values, so a typo like `au` will pass `npm run dev:validate` silently.

After reviewing and correcting the YAML fields above, run the validate script against the generated file:

```bash
npm run dev:validate -- src/<type>/org-name/package-name/1.0.0/index.yaml
```

For a batch, run the validate script individually against each successfully generated YAML.

The validate script downloads each release asset and recomputes the `sha256` and `size` values, then compares them against what is in the YAML. This is the authoritative check for file data — it catches cases where:

- The fetch script read a size from the GitHub API that differs from the actual downloaded file (GitHub sometimes reports a pre-compression size)
- A file URL redirects to a different binary than expected
- The `architectures` field was inferred from the filename but the binary itself targets a different architecture

The script exits with code 1 if any errors are found (missing image/audio, SHA256/size mismatch), and exits 0 for informational warnings only. All issues are logged before exiting:

    X surge-synthesizer/surge/1.3.1
    - changes (String must contain at most 256 character(s))

    X surge-synthesizer/surge/1.3.1
    - sha256 (Required) received 'e30b218700...' expected '3d766adb0d...'
    - size (Required) received '411860016' expected '68741234'

When you see a `sha256` or `size` mismatch, confirm the file URL is correct and that the URL resolves to the right version. Then update the values in the YAML to match what the validator reports as `expected`.

**Known quirk — AppImage format recognition**: the registry's shared format-recognition logic (in `@open-audio-stack/core`, a separate repo) compares the URL's file extension case-sensitively against its format enum. The enum's `AppImage` value is lowercase (`appimage`), but the conventional filename casing used by virtually every AppImage in the wild is `.AppImage` — so any AppImage submission will trigger a "url not a supported format" advisory even though it's a recognized, valid format. This is a non-blocking advisory (validation still passes), safe to ignore/note in the PR description. A real fix requires a change in `open-audio-stack-core`, not this repo.

If you need to recompute `sha256` and `size` manually:

```bash
gh release download v1.0.2 --repo wolf-plugins/wolf-shaper --pattern "filename.zip" -D /tmp/
shasum -a 256 /tmp/filename.zip
wc -c < /tmp/filename.zip
```

For reference on all allowed file fields and format values:

- <a href="specification.md#file">File fields/values</a>
- <a href="specification.md#file-formats">File formats</a>
- <a href="specification.md#file-format-recommendations">File format recommendations</a>
- <a href="specification.md#file-types">File types</a>

Once validation passes with no errors, proceed to step 3.

## 3. Validate Changes

Run the check command which will run code formatting, linting, tests and build commands to validate the changes:

```bash
npm run check
```

Verify that all tests pass and there are no linting errors.

- For a single package, return the generated yaml file to the user for them to read/review.
- For a batch, return a summary list of all successfully generated packages and their paths — do not dump the full YAML contents. List any failed packages separately with their reason.

Ask user for [Y/N] approval to proceed to Commit Changes, Push Changes and Submit Pull Request(s) for the successful package(s).

- If the user answers Yes or Y, continue to step 4.
- If the user answers No or N, ask them what changes they would like to make (and, for a batch, whether the changes apply to a specific package or the whole batch), and iterate until they are happy with the result, each time asking for approval before continuing to step 4.

## 4. Commit, push and pr changes

Use descriptive commit messages with prefixes following these conventions:

- `[feature]` for new features
- `[fix]` for bug fixes
- `[app]` for app additions
- `[plugin]` for plugin additions
- `[preset]` for preset additions
- `[project]` for project additions

For a single package, create a new branch, stage and commit your changes, then push and open a PR:

```bash
git add .
git commit -m "[feature] Feature name. Add descriptive commit message for your changes"
git push origin feature/your-contribution-name
gh pr create --title "Your PR Title" --body "Description of your changes

Closes #NUMBER"
```

For a batch, process each successful package independently — if one package fails at this step, log the failure and continue with the rest. For **each** successful package:

1. Create a new branch using the conventions from step 2b: `app/app-name`, `plugin/plugin-name`, `preset/preset-name`, `project/project-name`.
2. Stage and commit **only** the files for this package — never combine multiple package additions in one commit:

   ```bash
   git add src/plugins/org-name/package-name/
   git commit -m "[plugin] Add Package Name"
   ```

3. Push the branch to your forked repository:

   ```bash
   git push origin plugin/package-name
   ```

4. Create a separate pull request, referencing only the source issue for this package:

   ```bash
   gh pr create --title "[Plugin] Add Package Name" --body "Adds Package Name

   Closes #NUMBER"
   ```

Then proceed to step 5.

## 5. Conclusion

- For a single package, respond to the user that the contribution has been submitted for review, with the url to the PR for them to view VirusTotal scans and peer review.
- For a batch, respond with a final summary: packages successfully submitted with their individual PR URLs (for VirusTotal scans and peer review), and packages that were skipped or failed with the reason for each. Include the upstream tracking issue URL (see [3f](#3f-filing-upstream-tracking-issues-for-failures)) alongside any failure due to license, releases, or image.
