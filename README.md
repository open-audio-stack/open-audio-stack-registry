# open-audio-stack-registry

![Release](https://github.com/open-audio-stack/open-audio-stack-registry/workflows/Release/badge.svg)

Audio registry with searchable list of packages containing Plugins, Presets and Projects. Provides an API with file metadata and urls to binaries for installation.

## How it works

Community members add Yaml files to a new branch of this code, one for each package version.
After yaml files have been scanned for security, they are merged into the main codebase.
GitHub Actions generates a GitHub static site containing json files for each part of the registry.
Compatible command-line tools, apps and websites can read the json files to discover packages.

## Contributing a package

Create a fork of the repo `open-audio-stack-registry`. Add new folders for your organization and package using [kebab-case](https://developer.mozilla.org/en-US/docs/Glossary/Kebab_case):

    ./src/packages/org-name/package-name

Add a jpeg screenshot of the package, and flac audio file previewing the package:

    ./src/packages/org-name/package-name/package-name.flac
    ./src/packages/org-name/package-name/package-name.jpg

`.jpg` and `.flac` compressed formats were chosen to optimize loading times on compatible websites.

Create yaml files for each version of the package using [Semantic Versioning](https://semver.org).

    ./src/packages/org-name/package-name/1.0.0.yaml
    ./src/packages/org-name/package-name/2.0.0.yaml

Semantic versioning allows a compatible installer to install the latest non-breaking version of a package.

Use the below template yaml file as a starting point. Open Audio Stack Registry validates each package's metadata,
if you miss or enter incorrect information, your package will not be included in the registry.

    ---
    author: Surge Synth Team
    changes: |-
      - Fixed bug with audio
      - New feature added
    date: '2024-03-02T00:00:00.000Z'
    description: Hybrid synthesizer featuring many synthesis techniques, a great selection
      of filters, a flexible modulation engine, a smorgasbord of effects, and modern features
      like MPE and microtuning.
    files:
      - architectures:
          - bit32
        format: zip
        formats:
          - vst3
        hash: 3af35f0212
        systems:
          - min: 13.7
            type: mac
        size: 94448096
        type: archive
        url: https://a.com/b/file.zip
    license: gpl-3.0
    name: Surge XT
    tags:
      - 80s
      - Synth
      - Modulation
    type: instrument
    url: https://github.com/surge-synthesizer/surge

For file downloads, we recommend `.zip` files which are cross-platform and can be extracted automatically and placed into the correct locations without user interaction.
If you use other formats such as `deb, dmg, exe, msi` compatible apps will download and copy the file to the users directory, but might not support full installation.

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

    https://open-audio-stack.github.io/open-audio-stack-registry/

## Contact

For more information please contact kmturley
