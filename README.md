<div align="center">
<h1>
  <img src="https://raw.githubusercontent.com/open-audio-stack/open-audio-stack-registry/refs/heads/main/src/assets/open-audio-stack-logo.svg" alt="Open Audio Stack Logo"><br />
  Open Audio Stack
</h1>
<p>Audio registry specification and API with searchable list of packages</p>
  <p>
    <a href="specification.md">Registry Specification</a>
    ⦁︎
    <a href="https://open-audio-stack.github.io/open-audio-stack-registry">Registry API</a>
    ⦁︎
    <a href="https://github.com/orgs/open-audio-stack/projects">Roadmap</a>
  </p>
<p>

![Test](https://github.com/open-audio-stack/open-audio-stack-registry/workflows/Test/badge.svg)
![Release](https://github.com/open-audio-stack/open-audio-stack-registry/workflows/Release/badge.svg)
<a href="https://discord.com/invite/9D94f98PxP" target="_blank"><img src="https://img.shields.io/badge/chat-on%20discord-7289DA.svg" alt="Join the chat at Discord"></a>

![Open Audio Stack - Registry - Specification 1.0.0](/src/assets/open-audio-stack-diagram-registry.svg)

</div>

# open-audio-stack-registry

Audio registry with searchable list of packages containing Plugins, Presets and Projects. Provides an API with file metadata and urls to binaries for installation.

This registry is primarily for distributing free open-source packages. There are plenty of solutions for closed-source, paid plugins. Packages should be built for cross-platform, supporting Linux, Mac and Windows. Packages which don't meet the guidelines may be rejected and/or removed at an Open Stack contributor at any time.

## How it works

Community members add Yaml files to a new branch of this code, one for each package version.
After yaml files have been scanned for security, they are merged into the main codebase.
GitHub Actions generates a GitHub static site containing json files for each part of the registry.
Compatible command-line tools, apps and websites can read the json files to discover packages.

## Contributing a package

Create a fork of the repo `open-audio-stack-registry`. Add new folders for your organization and package using [kebab-case](https://developer.mozilla.org/en-US/docs/Glossary/Kebab_case):

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

    npm install
    npm run dev:validate -- src/plugins/surge-synthesizer/surge/1.3.1/index.yaml

Ensure you provide the path to the yaml file which you have added/changed. The script will output any issues, for example:

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

## Badges

If your project utilizes the Open Stack Audio specification or API, we encourage linking back to this project using a badge:

```
<a href="https://github.com/open-audio-stack" target="_blank"><img src="https://raw.githubusercontent.com/open-audio-stack/open-audio-stack-registry/refs/heads/main/src/assets/powered-by-open-audio-stack.svg" alt="Powered by Open Audio Stack"></a>
```

Example:

<a href="https://github.com/open-audio-stack" target="_blank"><img src="https://raw.githubusercontent.com/open-audio-stack/open-audio-stack-registry/refs/heads/main/src/assets/powered-by-open-audio-stack.svg" alt="Powered by Open Audio Stack"></a>

## Developer information

Open Audio Stack Registry was built using:

- NodeJS 20.x
- TypeScript 5.x
- eslint 9.x
- prettier 3.x
- vitest 1.x

## Developer installation

Install dependencies using:

    npm install

## Developer usage

Run dev commands using:

    npm run lint
    npm run format
    npm run dev
    npm test

Create a production build using:

    npm run build

Run the production build:

    npm start

## Developer deployment

This package is versioned using git tags:

    npm version patch
    git push && git push origin --tags

GitHub Actions will automatically publish the package to Github pages at:

    https://open-audio-stack.github.io/open-audio-stack-registry

## Contact

For more information please contact kmturley
