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

Create a new branch for your contribution. Use descriptive branch names following these conventions:

- `app/app-name` for app additions
- `plugin/plugin-name` for plugin additions
- `preset/preset-name` for preset additions
- `project/project-name` for project additions

If the user provides a GitHub issue number, read the issue body first to extract the package details:

```bash
gh issue view NUMBER --repo open-audio-stack/open-audio-stack-registry
```

The issue body will contain pre-filled YAML — use it directly as the basis for the `index.yaml`.

If not already supplied by the user, prompt for a package homepage url. For example they might respond with: `https://github.com/wolf-plugins/wolf-shaper`.

- If the url is a GitHub url, use the fetch script (see below) to collect metadata automatically.
- If the url is any other website url, then do your best to scrape the package information from the html page.
- If the user provided a link that does not open or have any packages, inform the user and ask them to clarify

### Running the fetch script

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
- Writes `src/plugins/org-name/package-name/version/index.yaml` and the image/audio files

### Reviewing and correcting the output

The script is deterministic — it reads only what GitHub's API and the README provide. It cannot make editorial judgments. After running it, review every field in the generated YAML and correct where needed:

**`name`** — derived from the GitHub repository slug (e.g. `analog-tape-model` → `Analog Tape Model`). Check that it matches the plugin's actual display name. The repo slug often differs from the brand name (e.g. `AnalogTapeModel` → `Chow Tape Model`).

**`author`** — fetched from the GitHub user's display name. If the developer has not set a display name on GitHub, this falls back to their login (e.g. `jatinchowdhury18` instead of `Chowdhury DSP`). Look up the correct author name from the plugin's website or README.

**`description`** — taken from the GitHub repository "About" field (≤255 characters). This is often shorter or less accurate than the plugin's own documentation. Expand or rewrite if needed.

**`type`** — inferred by scoring keywords in the description, topics, and README. This can misfire, especially for plugins that are clearly effects (tape, distortion, EQ) but whose README doesn't use the expected keywords. Always confirm: `instrument` / `effect` / `sampler` / `generator` / `tool`.

**`tags`** — sourced from GitHub repository topics and converted to Title Case. GitHub topics are technical (e.g. `vst3-plugin`, `juce`) while registry tags should be semantic categories (e.g. `Effect`, `Filter`, `Tape`). Replace with meaningful registry tags.

**`changes`** — taken verbatim from the GitHub release body, trimmed to 255 characters. Release bodies often include headers, markdown formatting, or unrelated links. Clean up to a concise bullet list of changes.

**`audio`** — only populated if the README contains a direct link to an audio file. Most READMEs do not. If no audio is found, source a demo clip manually, convert to FLAC (`ffmpeg -i input -t 10 -c:a flac output.flac`), and place it at `src/plugins/org-name/package-name/package-name.flac`.

**`image`** — downloaded from the first non-badge image found in the README. External images hosted on third-party sites may block downloads (HTTP 403). If the image is missing, find a screenshot from the plugin's website, GitHub, or documentation. Convert it with: `ffmpeg -i input.png -vf "scale='min(1000,iw)':-1" -q:v 10 output.jpg`

**`architectures`** — inferred from asset filenames (e.g. `x64`, `arm64`, `m1`). Filenames that give no architecture hint default to `[x64]`. Mac builds that are universal binaries (arm64 + x64) often have no hint in the filename — check the release notes or README to confirm.

**`contains`** — inferred from asset filenames first, then the release body, then the README. For installer packages (`.exe`, `.dmg`, `.deb`) this is especially unreliable because the installer bundles multiple formats internally. Check the release notes or README to find the complete list of formats included.

**File list** — the script includes every release asset that matches a known platform. Some releases contain multiple distinct products in separate files (e.g. a synth and a companion FX plugin). Remove any files that are not part of the package being added.

**`org-name` / `package-name` path** — derived from the GitHub org and repo name in kebab-case. If the developer publishes under a personal GitHub account but the plugin is associated with an organisation or brand, use the brand name instead (e.g. `chowdhury-dsp/chowtapemodel` rather than `jatinchowdhury18/analogtapemodel`). Check `src/plugins/` for any existing entry for the same plugin.

### Validating file data

For guitar / amp / pedal plugins:
If a plugin supports Neural Amp Modeler (NAM (.nam)), tag is as "NAM".
If a plugin supports AIDA-X (.json / RTNeural), tag is as "AIDA-X".
If a plugin supports Proteus (GuitarML), tag is as "Proteus".

Be careful with "vst" and "vst3", vst refers to vst2 for Mac and vst3 refers to vst3 for all operating systems.

After reviewing and correcting the YAML fields above, run the validate script against the generated file:

```bash
npm run dev:validate -- src/plugins/org-name/package-name/1.0.0/index.yaml
```

The validate script downloads each release asset and recomputes the `sha256` and `size` values, then compares them against what is in the YAML. This is the authoritative check for file data — it catches cases where:

- The fetch script read a size from the GitHub API that differs from the actual downloaded file (GitHub sometimes reports a pre-compression size)
- A file URL redirects to a different binary than expected
- The `architectures` field was inferred from the filename but the binary itself targets a different architecture

The script outputs issues as log lines (you cannot rely on the exit code):

    X surge-synthesizer/surge/1.3.1
    - changes (String must contain at most 256 character(s))

    X surge-synthesizer/surge/1.3.1
    - sha256 (Required) received 'e30b218700...' expected '3d766adb0d...'
    - size (Required) received '411860016' expected '68741234'

When you see a `sha256` or `size` mismatch, confirm the file URL is correct and that the URL resolves to the right version. Then update the values in the YAML to match what the validator reports as `expected`.

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

Return the generated yaml file to the user for them to read/review.

Ask user for [Y/N] approval to proceed to Commit Changes, Push Changes and Submit Pull Request.

- If the user answers Yes or Y, continue to step 4.
- If the user answers No or N, ask them what changes they would like to make, and iterate until they are happy with the result, each time asking for approval before continuing to step 4.

## 4. Commit, push and pr changes

Stage and commit your changes. Use descriptive commit messages with prefixes following these conventions:

- `[feature]` for new features
- `[fix]` for bug fixes
- `[app]` for app additions
- `[plugin]` for plugin additions
- `[preset]` for preset additions
- `[project]` for project additions

Example:

```bash
git add .
git commit -m "[feature] Feature name. Add descriptive commit message for your changes"
```

Push the branch to your forked repository:

```bash
git push origin feature/your-contribution-name
```

Create a pull request using GitHub CLI, referencing the source issue so it is closed automatically on merge:

```bash
gh pr create --title "Your PR Title" --body "Description of your changes

Closes #NUMBER"
```

Then proceed to step 5.

## 5. Conclusion

Respond to the user that the contribution has been submitted for review, with the url to the PR for them to view VirusTotal scans and peer review.
