# Instructions for Agents: Contributing via command line

## 1. Setup git repo

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
git pull
npm install
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

If not already supplied by the user, prompt for a package homepage url. For example they might respond with: `https://github.com/wolf-plugins/wolf-shaper`.

- If the url is a GitHub url then you can use the GitHub API to retrieve the package information.
- If the url is any other website url, then do your best to scrape the package information from the html page.
- If the user did not specify file downloads/releases, get the latest that corresponds to the date they provided.
- If the user did not provide a specific release or a specific date, then use the latest.
- If the user provided a link that does not open or have any packages, inform the user and ask them to clarify

For GitHub repos you can get detailed metadata and release filesizes and SHA256 hashes via curl such as:

```bash
curl -s https://api.github.com/repos/wolf-plugins/wolf-shaper
curl -s https://raw.githubusercontent.com/wolf-plugins/wolf-shaper/refs/heads/master/README.md
curl -s https://api.github.com/repos/wolf-plugins/wolf-shaper/releases
curl -s https://api.github.com/repos/wolf-plugins/wolf-shaper/releases/tags/v1.0.2
```

The information you have gathered will be used to populate the package yaml metadata.

First add new folders for the organization and package using [kebab-case](https://developer.mozilla.org/en-US/docs/Glossary/Kebab_case) In most cases this should match the Github org and repo name. Using our example it would be: `wolf-plugins/wolf-shaper`. If another website then use the domain name without extension for the org-name:

    ./src/plugins/org-name/package-name

If the url has a preview image and/or audio files. Download them to this directory. For GitHub projects these are usually linked from the README.md file.
Ensure the image is in jpeg format, and audio is in flac format (if files already exist then do not change them):

    ./src/plugins/org-name/package-name/package-name.flac
    ./src/plugins/org-name/package-name/package-name.jpg

`.jpg` and `.flac` compressed formats were chosen to optimize loading times on websites which display these packages.

Create yaml files for each version of the package using [Semantic Versioning](https://semver.org).

    ./src/plugins/org-name/package-name/1.0.0/index.yaml
    ./src/plugins/org-name/package-name/2.0.0/index.yaml

Semantic versioning allows a compatible installer to install the latest non-breaking version of a package.
Use an existing yaml file as a starting point:

- App: [src/apps/free-audio/clapinfo/1.2.2/index.yaml](https://github.com/open-audio-stack/open-audio-stack-registry/blob/main/src/apps/free-audio/clapinfo/1.2.2/index.yaml)

- Plugin: [src/plugins/surge-synthesizer/surge/1.3.4/index.yaml](https://github.com/open-audio-stack/open-audio-stack-registry/blob/main/src/plugins/surge-synthesizer/surge/1.3.4/index.yaml)

- Preset: [src/presets/jh/floating-rhodes/1.0.0/index.yaml](https://github.com/open-audio-stack/open-audio-stack-registry/blob/main/src/presets/jh/floating-rhodes/1.0.0/index.yaml)

- Project: [src/projects/kmt/banwer/1.0.1/index.yaml](https://github.com/open-audio-stack/open-audio-stack-registry/blob/main/src/projects/kmt/banwer/1.0.1/index.yaml)

Update the .yaml details to match your package. Refer to the <a href="specification.md">Open Audio Registry Specification</a> for all the possible fields and values allowed.

For adding an app refer to:

- <a href="specification.md#app">App fields/values</a>

For adding a plugin refer to:

- <a href="specification.md#plugin-1">Plugin fields/values</a>
- <a href="specification.md#plugin-formats">Plugin formats</a>
- <a href="specification.md#plugin-types">Plugin types</a>

For adding an preset refer to:

- <a href="specification.md#preset">Preset fields/values</a>

For adding a project refer to:

- <a href="specification.md#project">Project fields/values</a>

For adding files refer to:

- <a href="specification.md#file">File fields/values</a>
- <a href="specification.md#file-formats">File formats</a>
- <a href="specification.md#file-format-recommendations">File format recommendations</a>
- <a href="specification.md#file-types">File types</a>

After making your changes, validate them locally by running these commands:

```bash
npm run dev:validate -- path/to/your/index.yaml
```

The script will output any issues as logs (you can't rely on the script exit code), for example:

    X surge-synthesizer/surge/1.3.1
    - changes (String must contain at most 256 character(s))

This error tells you the `changes` field is too long and needs to be shortened.

During file validation you may recieve a `size` or `sha256` error such as:

    X surge-synthesizer/surge/1.3.1
    - sha256 (Required) received 'e30b218700d4067edb3a0eadb4128784e41f91f663cff19e3fbb38460883cf59' expected '3d766adb0d04b86f7aca8c136bc4c7b0727d316ec10895f679f1c01b0c236a00'
    - size (Required) received '411860016' expected '68741234'

File `size` field informs users how big the file is before it is downloaded. If the file size does not match, this could create a bad user experience where the user thinks they are downloading a small package, which turns out to be larger.

File `sha256` field is a hash of the file, if the file is modified in any way the hash will change. This is for security to ensure the file downloaded matches the file intended for distribution.

When displaying errors, the script will output the `received` and `expected` values. Confirm the file url is correct, and confirm the downloaded file contains the correct version of the package. Then update `size` and `sha256` values to resolve the error.

Then proceed to step 3.

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

Create a pull request using GitHub CLI:

```bash
gh pr create --title "Your PR Title" --body "Description of your changes"
```

Then proceed to step 5.

## 5. Conclusion

Respond to the user that the contribution has been submitted for review, with the url to the PR for them to view VirusTotal scans and peer review.
