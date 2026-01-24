# Instructions for Agents: Contributing to Open Audio Stack Registry via Command Line

## Fork the Repository

Use GitHub CLI to fork the repository:

```bash
gh repo fork open-audio-stack/open-audio-stack-registry --clone
cd open-audio-stack-registry
```

## Setup

Install dependencies:

```bash
npm install
```

## Create a Branch

Create and switch to a new branch for your contribution. Use descriptive branch names following these conventions:

- `feature/feature-name` for new features
- `fix/fix-name` for bug fixes
- `plugin/plugin-name` for plugin additions
- `preset/preset-name` for preset additions
- `project/project-name` for project additions
- `app/app-name` for app additions

Example:

```bash
git checkout -b plugin/plugin-name
```

## Contributing functional changes

Edit TypeScript/JavaScript files in the codebase using your tools. Ensure changes follow the project's coding standards, enforced by Prettier (.prettierrc.json) for code formatting, ESLint (eslint.config.js) for linting, and Vitest (vitest.config.ts) for the test suite.

Then proceed to the Validate Changes, Commit Changes, Push Changes, and Submit Pull Request sections below.

## Contributing a package

Prompt the user for a GitHub project url. For example they might respond with: `https://github.com/wolf-plugins/wolf-shaper`
Then rpompt the user for the url to the specific GitHub release: https://github.com/wolf-plugins/wolf-shaper/releases/tag/v1.0.2

Use these urls to automatically populate the package yaml metadata in the following steps.

Add new folders for your organization and package using [kebab-case](https://developer.mozilla.org/en-US/docs/Glossary/Kebab_case) In most cases this should match the Github org and repo name. Using our example it would be: `wolf-plugins/wolf-shaper`:

    ./src/plugins/org-name/package-name

Add a jpeg screenshot of the package, and flac audio file previewing the package:

    ./src/plugins/org-name/package-name/package-name.flac
    ./src/plugins/org-name/package-name/package-name.jpg

`.jpg` and `.flac` compressed formats were chosen to optimize loading times on compatible websites.

Create yaml files for each version of the package using [Semantic Versioning](https://semver.org).

    ./src/plugins/org-name/package-name/1.0.0/index.yaml
    ./src/plugins/org-name/package-name/2.0.0/index.yaml

Semantic versioning allows a compatible installer to install the latest non-breaking version of a package.

Open Audio Stack Registry validates each package's metadata, if you miss or enter incorrect information, your package will not be included in the registry. Use an existing yaml file as a starting point:

- App: [src/apps/free-audio/clapinfo/1.2.2/index.yaml](https://github.com/open-audio-stack/open-audio-stack-registry/blob/main/src/apps/free-audio/clapinfo/1.2.2/index.yaml)

- Plugin: [src/plugins/surge-synthesizer/surge/1.3.4/index.yaml](https://github.com/open-audio-stack/open-audio-stack-registry/blob/main/src/plugins/surge-synthesizer/surge/1.3.4/index.yaml)

- Preset: [src/presets/jh/floating-rhodes/1.0.0/index.yaml](https://github.com/open-audio-stack/open-audio-stack-registry/blob/main/src/presets/jh/floating-rhodes/1.0.0/index.yaml)

- Project: [src/projects/kmt/banwer/1.0.1/index.yaml](https://github.com/open-audio-stack/open-audio-stack-registry/blob/main/src/projects/kmt/banwer/1.0.1/index.yaml)

Update the .yaml details to match your plugin. Refer to the <a href="specification.md">Open Audio Registry Specification</a> for all the possible fields and values allowed.

For adding a plugin refer to:

- <a href="specification.md#plugin-1">Plugin fields/values</a>
- <a href="specification.md#plugin-formats">Plugin formats</a>
- <a href="specification.md#plugin-types">Plugin types</a>

For adding files refer to:

- <a href="specification.md#file">File fields/values</a>
- <a href="specification.md#file-formats">File formats</a>
- <a href="specification.md#file-format-recommendations">File format recommendations</a>
- <a href="specification.md#file-types">File types</a>

After making your changes, validate them locally by running these commands:

```bash
npm run dev:validate -- path/to/your/index.yaml
```

Additionally, ensure to run the general validation commands in the Validate Changes section below.

The script will output any issues, for example:

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

After validation passes, push your branch to GitHub and open a PR. During the PR review the automated GitHub Action will run test, validation and additional virus scanning checks which need to pass before your code is merged.

Then proceed to the Validate Changes, Commit Changes, Push Changes, and Submit Pull Request sections below.

## Validate Changes

Run formatting, linting, tests and build commands to validate your changes:

```bash
npm run format
npm run lint
npm test
npm run build
```

Verify that all tests pass and there are no linting errors.

Return the generated yaml file to the user for them to read/review.

Ask user for [Y/N] approval to proceed to Commit Changes, Push Changes and Submit Pull Request.

- If the user answers Yes or Y, continue to Commit Changes, Push Changes and Submit Pull Request steps below.
- If the user answers No or N, ask them what changes they would like to make, and iterate until they are happy with the result, each time asking for approval to continue to next steps.

## Commit Changes

Stage and commit your changes. Use descriptive commit messages with prefixes following these conventions:

- `[feature]` for new features
- `[fix]` for bug fixes
- `[plugin]` for plugin additions
- `[preset]` for preset additions
- `[project]` for project additions
- `[app]` for app additions

Example:

```bash
git add .
git commit -m "[feature] Feature name. Add descriptive commit message for your changes"
```

## Push Changes

Push the branch to your forked repository:

```bash
git push origin feature/your-contribution-name
```

## Submit Pull Request

Create a pull request using GitHub CLI:

```bash
gh pr create --title "Your PR Title" --body "Description of your changes"
```

## Conclusion

Respond to the user that the contribution has been submitted for review, with the url to the PR for them to monitor updates.
