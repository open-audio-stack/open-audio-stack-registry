<div align="center">
<h1>
  <img src="https://avatars.githubusercontent.com/u/184897286?s=200&v=4" alt="Open Audio Stack Logo"><br />
  Open Audio Stack
</h1>
<p>Audio registry specification and API with searchable list of packages</p>
  <p>
    <a href="https://github.com/open-audio-stack/open-audio-stack-core/wiki/Open-Audio-Stack-%E2%80%90-Registry-%E2%80%90-Specification-1.0.0">Registry Specification</a>
    ⦁︎
    <a href="https://open-audio-stack.github.io/open-audio-stack-registry">Registry API</a>
    ⦁︎
    <a href="https://github.com/orgs/open-audio-stack/projects">Roadmap</a>
  </p>
<p>

![Test](https://github.com/open-audio-stack/open-audio-stack-registry/workflows/Test/badge.svg)
![Release](https://github.com/open-audio-stack/open-audio-stack-registry/workflows/Release/badge.svg)
<a href="https://discord.com/invite/9D94f98PxP"><img src="https://img.shields.io/badge/chat-on%20discord-7289DA.svg" alt="Join the chat at Discord"></a>

![Open Audio Stack - Registry - Specification 1.0.0](https://github.com/open-audio-stack/open-audio-stack-registry/blob/main/src/assets/Open%20Audio%20Stack%20-%20Registry%20-%20Specification%201.0.0.svg)

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

Use the below template yaml files as a starting point. Open Audio Stack Registry validates each package's metadata,
if you miss or enter incorrect information, your package will not be included in the registry.

Plugin example:

    src/plugins/surge-synthesizer/surge/1.3.4/index.yaml

Preset example:

    src/presets/jh/floating-rhodes/1.0.0/index.yaml

Project example:

    src/projects/kmt/banwer/1.0.1/index.yaml

For file downloads, we recommend `.zip` files which are cross-platform and can be extracted automatically and placed into the correct locations without user interaction.

If you use other formats such as `deb, dmg, exe, msi` compatible apps will download and copy the file to the users directory, but might not support full installation.

Validate your changes locally by running these command:

    npm install
    npm run dev:validate -- src/plugins/surge-synthesizer/surge/1.3.1/index.yaml

Ensure you provide the path to the yaml file you changed.

After validation passes, push your branch to GitHub to have the automated GitHub Action run additional checks and return any issues with your changes.

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
