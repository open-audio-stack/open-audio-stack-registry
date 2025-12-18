# Open Audio Stack \- Registry \- Specification 1.0.0

**Date**: 28th October 2024  
**Status:** Review  
**Authors:**

- Kim T, StudioRack
- Arthur P, OwlPlug

This document is licensed under a [Creative Commons 4.0](https://creativecommons.org/licenses/by/4.0/) license.

## Introduction

This document describes an open specification for audio package metadata stored in a registry. The goal is to enable interoperability between multiple audio platforms and the software installed locally on users computers.

![Open Audio Stack - Registry - Specification 1.0.0](/src/assets/open-audio-stack-diagram-registry.svg)

This dotted line in the diagram indicates the scope of this specification. A second specification focuses on the lower area of the diagram: audio package managers (apps, cli, websites): [Open Audio Stack - Manager - Specification 1.0.0](https://github.com/open-audio-stack/open-audio-stack-core/blob/main/specification.md)

### Definitions

- **Developer** \- Audio plugin developer who releases audio plugins.
- **Package** \- Collection of files to be distributed along with metadata about those files:
  - **Plugin** \- File which adds digital signal processing or sound synthesis to audio software.
  - **Preset** \- File containing predefined settings for an audio plugin.
  - **Project** \- File which contains song data, in a format only for a specific DAW(s).
- **Registry** \- Database containing audio package metadata with an API for read access.
- **Audio plugin manager** \- Search, view, download and install audio plugins, using one of:
  - **App \-** Via a native application.
  - **Cli \-** Via a command-line tool.
  - **Website \-** Via a web page within a web browser.
  - **Plugin** \- Via an existing audio plugin, install additional features/presets.
- **User \-** Musician using a computer to run audio software.
  - **Digital Audio Workstation (DAW)** \- software that allows users to record, edit, and produce audio.

### Problems solved

Musicians install Digital Audio Workstation (DAW) software on computers to record and arrange music. They add audio plugins such as instruments and effects to extend their DAW functionality. The method of downloading and installing audio plugins differs depending on the company or individual distributing the software. The result is:

1. Manual installation of audio plugins.
2. Broken links.
3. Unsupported systems/versions.
4. Different audio plugin formats.
5. Insecure binaries.
6. Multiple audio plugin manager accounts.
7. Multiple audio plugin managers with different interfaces and settings.
8. No version control.
9. No portability to other systems or collaborators.
10. Difficulty expanding plugins with new presets.

This specification aims to solve these issues by applying established conventions and best practices from other well-known software package managers such as [npm](https://docs.npmjs.com), [pip](https://pip.pypa.io/en/stable/), [maven](https://maven.apache.org), [gems](https://guides.rubygems.org) and [composer](https://getcomposer.org). Audio plugin managers adopting this specification will be compatible and interoperable with each other. Musicians using compatible audio plugin managers will benefit from well-established package management features.

### Use cases

1. Search for audio plugins and filter by metadata attributes such as platform or license.
2. View audio plugin details such as description and size and preview image and audio.
3. Download and install audio plugins, including specific versions.
4. Install a list of multiple plugin versions automatically choosing the best version for your system.
5. Downloading and extracting files into configured directories.
6. Extend existing plugin functionality by installing additional presets.

## Registry

Registries are a database containing audio package metadata with an API for read access. Registries can be built in any technology or language, but they must have an API and make metadata available in the `json` format. They can optionally support other formats if they choose (such as `xml)`. Registries can be implemented with backend server rendering or static site generation depending on the implementation. This specification favors paths (`/example/hello`) over query params (`?example=hello`) to allow flexibility in choice of technology stack.

### Registry root

Each registry has a root url such as:  
`https://open-audio-stack.github.io/open-audio-stack-registry`

#### Registry versioning (optional)

Registries can expose versioned endpoints to avoid breaking changes when introducing new features. When a registry is versioned, managers should append the version segment to the registry root when requesting resources.

Example: Registry root `https://example.com/registry` with version `v1` → fetch plugin list at `https://example.com/registry/v1/plugins`.

Versioning is optional — if Managers call the root url, they will get the latest version by default.

### Registry

| Field    | Type                      | Description                                                                                     | Example                                                          |
| :------- | :------------------------ | :---------------------------------------------------------------------------------------------- | :--------------------------------------------------------------- |
| name     | string                    | Registry name brand-specific                                                                    | `"Open Audio Registry"`                                          |
| apps.    | \[slug: string\]: Package | Registry app packages                                                                           | `"apps": { ... }`                                                |
| plugins  | \[slug: string\]: Package | Registry plugin packages                                                                        | `"plugins": { ... }`                                             |
| presets  | \[slug: string\]: Package | Registry preset packages                                                                        | `"presets": { ... }`                                             |
| projects | \[slug: string\]: Package | Registry project packages                                                                       | `"projects": { ... }`                                            |
| url      | string                    | Registry url (https) where it is hosted, also can be used for base/root url for other requests. | `"https://open-audio-stack.github.io/open-audio-stack-registry"` |
| version  | string                    | Registry [Semantic Version](https://semver.org) which should match this specification version.  | `"1.0.0"`                                                        |

#### List registry information

```
GET /
{
  "name": "Open Audio Registry",
  "apps": { ... },
  "plugins": { ... },
  "presets": { ... },
  "projects": { ... },
  "url": "https://open-audio-stack.github.io/open-audio-stack-registry",
  "version": "1.0.0"
}
```

## Config

### Architectures

| Name                            | Description                                                                                   | Value   |
| :------------------------------ | :-------------------------------------------------------------------------------------------- | :------ |
| Advanced RISC Machine \- 32-bit | ARM processors are commonly used in battery-powered devices, such as smartphones and tablets. | `arm32` |
| Advanced RISC Machine \- 64-bit | ARM processors are commonly used in battery-powered devices, such as smartphones and tablets. | `arm64` |
| x86 machine \- 32-bit           | X86 processors are commonly used in desktop computers and laptops.                            | `x32`   |
| x86 machine \- 64-bit           | X86 processors are commonly used in desktop computers and laptops.                            | `x64`   |

#### List architectures

```
GET /config/architectures
{
  "items": [
    { "name": "Advanced RISC Machine - 32-bit", "value": "arm32" },
  ]
}
```

#### Get architecture by id

```
GET /config/architectures/{id}
{
  "name": "Advanced RISC Machine - 32-bit",
  "value": "arm32",
}
```

### Systems

| Name      | Description                                                                             | Value   |
| :-------- | :-------------------------------------------------------------------------------------- | :------ |
| Linux     | Open-source operating system. One of the most widely used for IT computers and servers. | `linux` |
| Macintosh | Operating system designed and sold by Apple, and is known for its ease of use.          | `mac`   |
| Windows   | Most popular home operating system, preloaded on most new personal computers.           | `win`   |

#### List systems

```
GET /config/systems
{
  "items": [
    { "name": "Linux", "value": "linux" },
  ]
}
```

#### Get system by id

```
GET /config/systems/{id}
{
  "name": "Linux",
  "value": "linux",
}
```

### Licenses

List curated by [Choose a license](https://choosealicense.com/appendix/).

| Name                                                                                                              | Description | Value                 |
| :---------------------------------------------------------------------------------------------------------------- | :---------- | :-------------------- |
| [BSD Zero Clause License](https://choosealicense.com/licenses/0bsd)                                               |             | `0bsd`                |
| [Academic Free License v3.0](https://choosealicense.com/licenses/afl-3.0)                                         |             | `afl-3.0`             |
| [GNU Affero General Public License v3.0](https://choosealicense.com/licenses/agpl-3.0)                            |             | `agpl-3.0`            |
| [Apache License 2.0](https://choosealicense.com/licenses/apache-2.0)                                              |             | `apache-2.0`          |
| [Artistic License 2.0](https://choosealicense.com/licenses/artistic-2.0)                                          |             | `artistic-2.0`        |
| [Blue Oak Model License 1.0.0](https://choosealicense.com/licenses/blueoak-1.0.0)                                 |             | `blueoak-1.0.0`       |
| [BSD-2-Clause Plus Patent License](https://choosealicense.com/licenses/bsd-2-clause-patent)                       |             | `bsd-2-clause-patent` |
| [BSD 2-Clause "Simplified" License](https://choosealicense.com/licenses/bsd-2-clause)                             |             | `bsd-2-clause`        |
| [BSD 3-Clause Clear License](https://choosealicense.com/licenses/bsd-3-clause-clear)                              |             | `bsd-3-clause-clear`  |
| [BSD 3-Clause "New" or "Revised" License](https://choosealicense.com/licenses/bsd-3-clause)                       |             | `bsd-3-clause`        |
| [BSD 4-Clause "Original" or "Old" License](https://choosealicense.com/licenses/bsd-4-clause)                      |             | `bsd-4-clause`        |
| [Boost Software License 1.0](https://choosealicense.com/licenses/bsl-1.0)                                         |             | `bsl-1.0`             |
| [Creative Commons Attribution 4.0 International](https://choosealicense.com/licenses/cc-by-4.0)                   |             | `cc-by-4.0`           |
| [Creative Commons Attribution Share Alike 4.0 International](https://choosealicense.com/licenses/cc-by-sa-4.0)    |             | `cc-by-sa-4.0`        |
| [Creative Commons Zero v1.0 Universal](https://choosealicense.com/licenses/cc0-1.0)                               |             | `cc0-1.0`             |
| [CeCILL Free Software License Agreement v2.1](https://choosealicense.com/licenses/cecill-2.1)                     |             | `cecill-2.1`          |
| [CERN Open Hardware Licence Version 2 \- Permissive](https://choosealicense.com/licenses/cern-ohl-p-2.0)          |             | `cern-ohl-p-2.0`      |
| [CERN Open Hardware Licence Version 2 \- Strongly Reciprocal](https://choosealicense.com/licenses/cern-ohl-s-2.0) |             | `cern-ohl-s-2.0`      |
| [CERN Open Hardware Licence Version 2 \- Weakly Reciprocal](https://choosealicense.com/licenses/cern-ohl-w-2.0)   |             | `cern-ohl-w-2.0`      |
| [Educational Community License v2.0](https://choosealicense.com/licenses/ecl-2.0)                                 |             | `ecl-2.0`             |
| [Eclipse Public License 1.0](https://choosealicense.com/licenses/epl-1.0)                                         |             | `epl-1.0`             |
| [Eclipse Public License 2.0](https://choosealicense.com/licenses/epl-2.0)                                         |             | `epl-2.0`             |
| [European Union Public License 1.1](https://choosealicense.com/licenses/eupl-1.1)                                 |             | `eupl-1.1`            |
| [European Union Public License 1.2](https://choosealicense.com/licenses/eupl-1.2)                                 |             | `eupl-1.2`            |
| [GNU Free Documentation License v1.3](https://choosealicense.com/licenses/gfdl-1.3)                               |             | `gfdl-1.3`            |
| [GNU General Public License v2.0](https://choosealicense.com/licenses/gpl-2.0)                                    |             | `gpl-2.0`             |
| [GNU General Public License v3.0](https://choosealicense.com/licenses/gpl-3.0)                                    |             | `gpl-3.0`             |
| [ISC License](https://choosealicense.com/licenses/isc)                                                            |             | `isc`                 |
| [GNU Lesser General Public License v2.1](https://choosealicense.com/licenses/lgpl-2.1)                            |             | `lgpl-2.1`            |
| [GNU Lesser General Public License v3.0](https://choosealicense.com/licenses/lgpl-3.0)                            |             | `lgpl-3.0`            |
| [LaTeX Project Public License v1.3c](https://choosealicense.com/licenses/lppl-1.3c)                               |             | `lppl-1.3c`           |
| [MIT No Attribution](https://choosealicense.com/licenses/mit-0)                                                   |             | `mit-0`               |
| [MIT License](https://choosealicense.com/licenses/mit)                                                            |             | `mit`                 |
| [Mozilla Public License 2.0](https://choosealicense.com/licenses/mpl-2.0)                                         |             | `mpl-2.0`             |
| [Microsoft Public License](https://choosealicense.com/licenses/ms-pl)                                             |             | `ms-pl`               |
| [Microsoft Reciprocal License](https://choosealicense.com/licenses/ms-rl)                                         |             | `ms-rl`               |
| [Mulan Permissive Software License, Version 2](https://choosealicense.com/licenses/mulanpsl-2.0)                  |             | `mulanpsl-2.0`        |
| [University of Illinois/NCSA Open Source License](https://choosealicense.com/licenses/ncsa)                       |             | `ncsa`                |
| [Open Data Commons Open Database License v1.0](https://choosealicense.com/licenses/odbl-1.0)                      |             | `odbl-1.0`            |
| [SIL Open Font License 1.1](https://choosealicense.com/licenses/ofl-1.1)                                          |             | `ofl-1.1`             |
| [Open Software License 3.0](https://choosealicense.com/licenses/osl-3.0)                                          |             | `osl-3.0`             |
| [PostgreSQL License](https://choosealicense.com/licenses/postgresql)                                              |             | `postgresql`          |
| [The Unlicense](https://choosealicense.com/licenses/unlicense)                                                    |             | `unlicense`           |
| [Universal Permissive License v1.0](https://choosealicense.com/licenses/upl-1.0)                                  |             | `upl-1.0`             |
| [Vim License](https://choosealicense.com/licenses/vim)                                                            |             | `vim`                 |
| [Do What The F\*ck You Want To Public License](https://choosealicense.com/licenses/wtfpl)                         |             | `wtfpl`               |
| [zlib License](https://choosealicense.com/licenses/zlib)                                                          |             | `zlib`                |
| Other                                                                                                             |             | `other`               |

#### List licenses

```
GET /config/licenses
{
  "items": [
    { "name": "BSD Zero Clause License", "value": "0bsd" },
  ]
}
```

#### Get license by id

```
GET /config/licenses/{id}
{
  "name": "BSD Zero Clause License",
  "value": "0bsd",
}
```

## Package

Package is a common wrapper for all Plugin, Project and Preset metadata which handles unique slug/id and versioning.

### Package

| Field    | Type                | Description                                                         | Example                     |
| :------- | :------------------ | :------------------------------------------------------------------ | :-------------------------- |
| slug     | string              | Package slug                                                        | `"surge-synthesizer/surge"` |
| version  | string              | Package latest version using [Semantic Version](https://semver.org) | `"1.3.1"`                   |
| versions | \[version: string\] | Package versions Object containing all released versions.           | `"versions": [ ... ]`       |

## Plugin

### Plugins directory

Default plugin installation path per platform. Users are able to change the path via settings.

| Platform         | Path                                                                                |
| :--------------- | :---------------------------------------------------------------------------------- |
| Linux platform   | `$HOME/usr/local/lib/$format`                                                       |
| Mac platform     | `$HOME/Library/Audio/Plug-ins/$format`                                              |
| Windows platform | `C:\Program Files\Common Files\$format C:\Program Files (x86)\Common Files\$format` |

### Plugin sub-directory

Recommended sub-directory hierarchy to keep installed plugins separate and easier to manage:  
`$plugin_dir/$plugin_slug/$plugin_version/`

For example:  
`$plugin_dir/surge-synthesizer/surge/1.3.1/surge.vst3`

### Plugin

| Field       | Type                | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Example                                                                                                                                                                                         |
| :---------- | :------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| audio       | string              | Audio preview url (https). Allows users to preview the sound of the plugin before downloading. Technically this could be any [audio file format](https://caniuse.com/?search=audio%20format), but we recommend `.flac` as it is compressed and widely supported. Tips: Keep the length short, show off the plugin, if unsure, play a middle-C note using a default piano instrument.                                                                                                         | `"https://myplugin.com/audio.flac"`                                                                                                                                                             |
| author      | string              | Plugin author name                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `"Surge Synth Team"`                                                                                                                                                                            |
| changes     | string              | Plugin changes made since previous version                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `"- Fixed bug with audio\n- New feature added"`                                                                                                                                                 |
| date        | string              | Plugin release datetime in ISO 8601 format in UTC (e.g. `YYYY-MM-DDTHH:mm:ss.sssZ`).                                                                                                                                                                                                                                                                                                                                                                                                         | `"2024-03-02T00:00:00.000Z"`                                                                                                                                                                    |
| description | string              | Plugin description                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `"Hybrid synthesizer featuring many synthesis techniques, a great selection of filters, a flexible modulation engine, a smorgasbord of effects, and modern features like MPE and microtuning."` |
| donate      | string              | Donation url                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `"https://paypal.me/example"`                                                                                                                                                                   |
| files       | array\<PluginFile\> | Plugin files available                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `{ "contains": ["vst3"], "sha256": "3af35f0212", "systems": [ { "type": "mac" } ], "size": 94448096, "type": "archive", "url": "https://a.com/b/file.zip" }`                                    |
| image       | string              | Image preview url (https). Allows users to preview the user interface of the plugin before downloading. Technically this could be any [image file format](https://caniuse.com/?search=image%20format), but we recommend `.jpg` as it is compressed and widely supported. Tips: Crop to plugin UI edges, avoid backgrounds, borders and/or drop-shadows. Can be any shape/dimension (square, rectangle) but limit size to around 1000px to optimize loading times for large lists of plugins. | `"https://myplugin.com/image.jpg"`                                                                                                                                                              |
| license     | License             | Plugin license id                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `"gpl-3.0"`                                                                                                                                                                                     |
| name        | string              | Plugin name                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `"Surge XT"`                                                                                                                                                                                    |
| tags        | array\<string\>     | Plugin tags/keywords                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `[   "80s",   "Synth",   "Modulation" ]`                                                                                                                                                        |
| type        | PluginType          | Plugin type from table below                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `"instrument"`                                                                                                                                                                                  |
| url         | string              | Website url (https). This could be anywhere, but we recommend GitHub.                                                                                                                                                                                                                                                                                                                                                                                                                        | `"https://github.com/surge-synthesizer/surge"`                                                                                                                                                  |
| verified    | boolean             | Computed during registry build, set to `true` if the package slug matches the download url                                                                                                                                                                                                                                                                                                                                                                                                   | `true`                                                                                                                                                                                          |

#### List plugins

```
GET /plugins
{
  "surge-synthesizer/surge": { "slug": "surge-synthesizer/surge", "version": "1.3.1", "versions": [ ... ]},
}
```

#### Get plugin by org

```
GET /plugins/{org}
{
  "surge-synthesizer/surge": {
    "slug": "surge-synthesizer/surge",
    "version": "1.3.1",
    "versions": [ ... ]
  }
}
```

#### Get plugin by org \+ package id \= slug

```
GET /plugins/{slug}
{
  "slug": "surge-synthesizer/surge",
  "version": "1.3.1",
  "versions": [ ... ]
}
```

#### Get plugin package by slug and version

```
GET /plugins/{slug}/{version}
{
  "audio": "https://myplugin.com/audio.flac",
  "author": "Surge Synth Team",
  "changes": "- Fixed bug with audio\n- New feature added",
  "date": "2024-03-02T00:00:00.000Z",
  "description": "Hybrid synthesizer featuring many synthesis techniques, a great selection of filters, a flexible modulation engine, a smorgasbord of effects, and modern features like MPE and microtuning.",
  "donate": "https://paypal.me/example",
  "files": [ ... ],
  "image": "https://myplugin.com/image.jpg",
  "license": "gpl-3.0",
  "name": "Surge XT",
  "tags": ["80s", "Synth", "Modulation"],
  "type": "instrument",
  "url": "https://github.com/surge-synthesizer/surge"
}
```

### Plugin formats

| Name                              | Description                                                                | Value       |
| :-------------------------------- | :------------------------------------------------------------------------- | :---------- |
| Audio Units                       | Apple's proprietary plugin format for macOS and iOS.                       | `component` |
| Avid Audio Extension              | Avid's plugin format for Pro Tools, offering deep integration.             | `aax`       |
| Clever Audio Plugin               | Modern open-source plugin format designed for performance and flexibility. | `clap`      |
| LADSPA Version 2                  | Linux-friendly plugin format primarily used in open-source environments.   | `lv2`       |
| Linux Standalone                  | Linux standalone application.                                              | `elf`       |
| MacOS Standalone                  | MacOS standalone application.                                              | `app`       |
| Real-Time AudioSuite              | Real-time plugin format used in Avid's Pro Tools.                          | `rta`       |
| SoundFont 2                       | Widely used format for sound samples in musical instruments.               | `sf2`       |
| SFZ                               | An open standard for defining instrument patches and sound samples.        | `sfz`       |
| Time-Division-Multiplexing        | Legacy plugin format used in early Pro Tools systems.                      | `tdm`       |
| Virtual Studio Technology (Linux) | Linux version of the VST plugin format for audio effects and instruments.  | `so`        |
| Virtual Studio Technology (Mac)   | Mac version of the VST plugin format used in DAWs like Logic and Ableton.  | `vst`       |
| Virtual Studio Technology (Win)   | Windows version of the VST plugin format for digital audio workstations.   | `dll`       |
| Virtual Studio Technology 3       | Third-generation VST format, offering better performance and features.     | `vst3`      |
| Windows Standalone                | Windows standalone application.                                            | `exe`       |

### Plugin types

| Name       | Description                                                                         | Value        |
| :--------- | :---------------------------------------------------------------------------------- | :----------- |
| Effect     | Digital signal processing based on an existing audio signal.                        | `effect`     |
| Generator  | Generates midi patterns or samples which can be fed into other instruments/effects. | `generator`  |
| Instrument | Sound synthesis based on audio or midi input.                                       | `instrument` |
| Sampler    | Sample playback based on audio or midi input.                                       | `sampler`    |
| Tool       | Helper tool which provides automations and other useful functions for music.        | `tool`       |

### Plugin files

Recommended minimum cross-platform binaries:

- `plugin-name-linux-x64.zip`
- `plugin-name-mac-x64.zip`
- `plugin-name-win-x64.zip`

Recommended image and audio previews:

- `plugin-name.jpg`
- `plugin-name.flac`

Recommended file formats:

- `.zip` \- which has cross-platform support and can be extracted automatically.
- `.jpg` \- to optimize loading times on compatible websites.
- `.flac` \- to optimize loading times and cross-browser compatibility.

## Project

### Projects directory

Default project installation path per platform. Users are able to change the path via settings.

| Platform         | Path                    |
| :--------------- | :---------------------- |
| Mac platform     | `$HOME/Documents/Audio` |
| Linux platform   | `$HOME/Documents/Audio` |
| Windows platform | `$HOME\Documents\Audio` |

### Project sub-directory

Recommended sub-directory hierarchy to keep installed plugins separate and easier to manage:  
`$project_dir/$project_slug/$project_version/`

For example:  
`$project_dir/kmt/banwer/1.2.0/Banwer.als`

### Project

Same as a plugin metadata except for an additional field for plugin dependencies

| Field       | Type                               | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Example                                                                                                                                                                           |
| :---------- | :--------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| audio       | string                             | Audio preview url (https). Allows users to preview the sound of the project before downloading. Technically this could be any [audio file format](https://caniuse.com/?search=audio%20format), but we recommend `.flac` as it is compressed and widely supported. Tips: Keep the length short, show off the project, if unsure, loop a bar of the song.                                                                                                                                    | `"https://myproject.com/audio.flac"`                                                                                                                                              |
| author      | string                             | Project author name                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `"KMT"`                                                                                                                                                                           |
| changes     | string                             | Project changes made since previous version                                                                                                                                                                                                                                                                                                                                                                                                                                                | `"- Fixed levels\n- New instrument added"`                                                                                                                                        |
| date        | string                             | Project datetime in ISO 8601 format in UTC (e.g. `YYYY-MM-DDTHH:mm:ss.sssZ`).                                                                                                                                                                                                                                                                                                                                                                                                              | `"2024-08-02T05:32:40.394Z"`                                                                                                                                                      |
| description | string                             | Project description                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `"Song idea using synthesizers"`                                                                                                                                                  |
| donate      | string                             | Donation url                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `"https://paypal.me/example"`                                                                                                                                                     |
| files       | array\<ProjectFile\>               | Project files available                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `{ "contains": ["als"], "sha256": "3af35f0212", "systems": [ { "type": "mac" } ], "size": 94448096, "type": "archive", "open": "Banwer.als", "url": "https://a.com/b/file.zip" }` |
| image       | string                             | Image preview url (https). Allows users to preview the interface of the project before downloading. Technically this could be any [image file format](https://caniuse.com/?search=image%20format), but we recommend `.jpg` as it is compressed and widely supported. Tips: Crop to project UI edges, avoid backgrounds, borders and/or drop-shadows. Can be any shape/dimension (square, rectangle) but limit size to around 1000px to optimize loading times for large lists of projects. | `"https://myproject.com/image.jpg"`                                                                                                                                               |
| license     | License                            | Project license id                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `"gpl-3.0"`                                                                                                                                                                       |
| name        | string                             | Project name                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `"Banwer"`                                                                                                                                                                        |
| plugins     | object\<\[slug: string\]: string\> | Project plugin dependencies                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `{   "freepats/glasses": "1.0.0",   "surge-synthesizer/surge": "1.3.1", }`                                                                                                        |
| tags        | array \<string\>                   | Project tags/keywords                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `[   "Idea",   "Synth",   "Rock" ]`                                                                                                                                               |
| type        | ProjectType                        | Project type see from table below                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `"song"`                                                                                                                                                                          |
| url         | string                             | Website url (https). This could be anywhere, but we recommend GitHub.                                                                                                                                                                                                                                                                                                                                                                                                                      | `"https://myproject.com"`                                                                                                                                                         |
| verified    | boolean                            | Computed during registry build, set to `true` if the package slug matches the download url                                                                                                                                                                                                                                                                                                                                                                                                 | `true`                                                                                                                                                                            |

#### List projects

```
GET /projects
`[
  { "slug": "kmt/banwer", "version": "1.0.1", "versions": [ ... ]},
]`
```

#### Get project by slug

```
GET /projects/{slug}
{
  "slug": "kmt/banwer",
  "version": "1.0.1",
  "versions": [ ... ]
}
```

#### Get project by slug and version

```
GET /projects/{slug}/{version}
{
  "audio": "https://myproject.com/audio.flac",
  "author": "KMT",
  "changes": "- Fixed levels\n- New instrument added",
  "date": "2024-03-02T00:00:00.000Z",
  "description": "Song idea using synthesizers",
  "donate": "https://paypal.me/example",
  "files": [ ... ],
  "image": "https://myproject.com/image.jpg",
  "license": "cc0-1.0",
  "plugins": {
    "surge-synthesizer/surge": "1.3.1"
  },
  "name": "Banwer",
  "tags": ["Idea", "Synth", "Rock"],
  "type": "song",
  "url": "https://myproject.com"
}
```

### Project formats

| Name                 | Description                                                            | Value        |
| :------------------- | :--------------------------------------------------------------------- | :----------- |
| Ableton Live Project | Used to store all information about a Live set.                        | `als`        |
| Bitwig Project       | Containing all Bitwig project-related information.                     | `bwproject`  |
| Cubase Project       | Used to save Steinberg Cubase arrangements and settings.               | `cpr`        |
| DAWproject Project   | Open standard for storing various audio project settings.              | `dawproject` |
| FL Studio Project    | Used for saving FL Studio compositions and arrangements.               | `flp`        |
| Garageband Project   | A package containing audio files and Garageband timeline and settings. | `band`       |
| LMMS Project         | Music project for open-source, cross-platform software.                | `mmp`        |
| Logic Project        | Containing all Apple's Logic Pro audio, MIDI, and arrangement data.    | `logic`      |
| Musescore Project    | Compressed Musescore project along with metadata and image preview.    | `mscz`       |
| Pro Tools Project    | Used for Avid Pro Tools audio recording and production.                | `ptx`        |
| Reaper Project       | Containing Reaper tracks, arrangements, and settings.                  | `rpp`        |
| Sonar Project        | Used for Cakewalk Sonar music production and audio editing.            | `cwp`        |

### Project types

| Name        | Description                                                                              | Value         |
| :---------- | :--------------------------------------------------------------------------------------- | :------------ |
| Audiobook   | Spoken audio for books or literature.                                                    | `audiobook`   |
| DJ set      | Live DJ performances, often including mixes of various tracks.                           | `dj`          |
| Performance | Solo or ensemble musical performance, showcasing artistic expression.                    | `performance` |
| Podcast     | Discussions, interviews, or other content for audio broadcast..                          | `podcast`     |
| Remix       | Reworking or improving an existing song or track to create a new version.                | `remix`       |
| Song        | Composing, recording, and producing original songs with multiple instruments and vocals. | `song`        |
| Score       | Composing and producing music for film, TV, video games, or other visual media.          | `score`       |

## Preset

### Presets directory

Default preset installation path per platform. Users are able to change the path via settings.

| Platform         | Path                           |
| :--------------- | :----------------------------- |
| Linux platform   | `$HOME/.vst3/presets`          |
| Mac platform     | `$HOME/Library/Audio/Presets`  |
| Windows platform | `$HOME/Documents/VST3 Presets` |

### Preset sub-directory

Recommended sub-directory hierarchy to keep installed plugins separate and easier to manage:  
`$preset_dir/$preset_slug/$preset_version/`

For example:  
`$preset_dir/acme-corp/woodstock/2.1.0/jimi.vstpreset`

### Preset schema

Same as a plugin metadata except for an additional field for plugin dependencies.

| Field       | Type                               | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Example                                                                                                                                                           |
| :---------- | :--------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| audio       | string                             | Audio preview url (https). Allows users to preview the sound of the preset before downloading. Technically this could be any [audio file format](https://caniuse.com/?search=audio%20format), but we recommend `.flac` as it is compressed and widely supported. Tips: Keep the length short, show off the preset, if unsure, play a middle-C note using a default piano instrument. Previews can be shared across versions or specific to a version.                                                                                                        | `"https://open-audio-stack.github.io/open-audio-stack-registry/presets/jh/floating-rhodes/floating-rhodes.flac"`                                                  |
| author      | string                             | Preset author name                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `"JH"`                                                                                                                                                            |
| changes     | string                             | Preset changes made since previous version                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `"- First version"`                                                                                                                                               |
| date        | string                             | Preset datetime in ISO 8601 format in UTC (e.g. `YYYY-MM-DDTHH:mm:ss.sssZ`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `"2024-03-02T00:00:00.000Z"`                                                                                                                                      |
| description | string                             | Preset description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `"Floating Rhodes sounds."`                                                                                                                                       |
| donate      | string                             | Donation url                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `"https://paypal.me/example"`                                                                                                                                     |
| files       | array\<PresetFile\>                | Preset files available                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `{ "contains": ["vstpreset"], "sha256": "3af35f0212", "systems": [ { "type": "mac" } ], "size": 94448096, "type": "archive", "url": "https://a.com/b/file.zip" }` |
| image       | string                             | Image preview url (https). Allows users to preview the user interface of the preset before downloading. Technically this could be any [image file format](https://caniuse.com/?search=image%20format), but we recommend `.jpg` as it is compressed and widely supported. Tips: Crop to plugin UI edges, avoid backgrounds, borders and/or drop-shadows. Can be any shape/dimension (square, rectangle) but limit size to around 1000px to optimize loading times for large lists of preset. Previews can be shared across versions or specific to a version. | `"https://open-audio-stack.github.io/open-audio-stack-registry/presets/jh/floating-rhodes/floating-rhodes.jpg"`                                                   |
| license     | License                            | Preset license id                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `"gpl-3.0"`                                                                                                                                                       |
| name        | string                             | Preset name                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `"Floating Rhodes"`                                                                                                                                               |
| plugins     | object\<\[slug: string\]: string\> | Preset plugin dependencies                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `{   "surge-synthesizer/surge": "1.3.1", }`                                                                                                                       |
| tags        | array \<string\>                   | Preset tags/keywords                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `[   "Preset",   "Synth",   "Rhodes" ]`                                                                                                                           |
| type        | PresetType                         | Preset type from table below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `"patch"`                                                                                                                                                         |
| url         | string                             | Website url (https). This could be anywhere, but we recommend GitHub.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `"https://presetshare.com/p763"`                                                                                                                                  |
| verified    | boolean                            | Computed during registry build, set to `true` if the package slug matches the download url                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `true`                                                                                                                                                            |

#### List presets

```
GET /presets
`[
  { "slug": "jh/floating-rhodes", "version": "2.2.0", "versions": [ ... ]},
]`
```

#### Get preset by slug

```
GET /presets/{slug}
{
  "slug": "jh/floating-rhodes",
  "version": "1.0.0",
  "versions": [ ... ]
}
```

#### Get preset by slug and version

```
GET /presets/{slug}/{version}
{
  "audio": "https://open-audio-stack.github.io/open-audio-stack-registry/presets/jh/floating-rhodes/floating-rhodes.flac",
  "author": "JH",
  "changes": "- First version",
  "date": "2024-03-02T00:00:00.000Z",
  "description": "Floating Rhodes sounds.",
  "donate": "https://paypal.me/example",
  "files": [ ... ],
  "image": "https://open-audio-stack.github.io/open-audio-stack-registry/presets/jh/floating-rhodes/floating-rhodes.jpg",
  "license": "gpl-3.0",
  "plugins": {
    "surge-synthesizer/surge": "1.3.1"
  },
  "name": "Floating Rhodes",
  "tags": ["Preset", "Synth", "Rhodes"],
  "type": "patch",
  "url": "https://presetshare.com/p763"
}
```

### Preset formats

| Name                                  | Description                                                                       | Value        |
| :------------------------------------ | :-------------------------------------------------------------------------------- | :----------- |
| Audio Unit preset                     | Apple's proprietary plugin format for macOS and iOS.                              | `aupreset`   |
| Avid Audio preset                     | Avid's plugin format for Pro Tools, offering deep integration.                    | `tfx`        |
| Clever Audio preset                   | Modern open-source plugin format designed for performance and flexibility.        | `clap`       |
| LADSPA Version 2 preset               | Linux-friendly plugin format primarily used in open-source environments.          | `preset.lv2` |
| Native Instruments preset             | Used by Native Instruments for their software instruments and effects.            | `nksf`       |
| Real-Time AudioSuite preset           | Real-time plugin format used in Avid's Pro Tools.                                 | `rtas`       |
| SoundFont 2 preset                    | Widely used format for sound samples in musical instruments.                      | `preset.sf2` |
| SFZ preset                            | An open standard for defining instrument patches and sound samples.               | `preset.sfz` |
| Time-Division-Multiplexing preset     | Legacy plugin format used in early Pro Tools systems.                             | `tdm`        |
| Virtual Studio Technology bank preset | Standard bank preset format for VST plugins.                                      | `fxb`        |
| Virtual Studio Technology preset      | Standard preset format for VST plugins, allowing users to save and load settings. | `fxp`        |
| Virtual Studio Technology 3 preset    | Preset format for VST3 plugins including new features.                            | `vstpreset`  |

### Preset types

| Name    | Description                                                                                                                                                  | Value     |
| :------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------- |
| Chain   | Saved configurations of multiple plugins with specific routing, processing order, and parameter settings, often used in mixing and mastering plugins.        | `chain`   |
| Layout  | Saved configurations of a plugin’s overall layout or workspace, especially in modular plugins, which help streamline specific workflows or user preferences. | `layout`  |
| Mapping | Preset mappings that assign plugin parameters to external MIDI controllers, making it easier to manipulate sounds in real-time or during live performances.  | `mapping` |
| Patch   | Sound presets containing saved parameter settings for synths or instruments, often focused on specific sounds or tonal qualities.                            | `patch`   |
| Pattern | Rhythmic and harmonic variations of MIDI data.                                                                                                               | `pattern` |
| Theme   | Visual customizations that change the interface design, colors, or style of a plugin, providing a personalized or visually enhanced experience.              | `theme`   |

## File

| Field         | Type                                                   | Description                                                                                                                                                                            | Example                                                                                                              |
| :------------ | :----------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------- |
| architectures | Architecture\[\]                                       | System architectures supported by this binary file.                                                                                                                                    | `[  "x32" , "x64" ]`                                                                                                 |
| contains      | array\<PluginFormat \| PresetFormat \| ProjectFormat\> | Plugin/Project/Preset formats (see tables for list of possible values).                                                                                                                | `["vst3"]`                                                                                                           |
| sha256        | string                                                 | File checksum for security validation that the published file matches the downloaded file.                                                                                             | `"3af35f02121a3c7ad6375bfe9c29a382f5882fa443bbf4c2df347a255c0edf2a"`                                                 |
| size          | number                                                 | Total size of the file in bytes.                                                                                                                                                       | `94448096`                                                                                                           |
| systems       | System\[\]                                             | Operating systems supported, optionally including min/max version check.                                                                                                               | `[  { "min": 11.1,  "max": 20.5,  "type": "linux"} ]`                                                                |
| type          | FileType                                               | File type from list in below table.                                                                                                                                                    | `"archive"`                                                                                                          |
| open          | string                                                 | Open command/entry for this file on the target system. Defined per-file to allow OS-specific entry points (e.g. Linux = `pluginval`, Mac = `pluginval.app` and Win = `pluginval.exe`). | `"pluginval.app"`                                                                                                    |
| url           | string                                                 | File download url (https). Files can be hosted anywhere on the web, but we recommend using GitHub Releases because it provides auditability of who changed the files and when.         | `"https://github.com/surge-synthesizer/releases-xt/releases/download/1.3.1/surge-xt-linux-1.3.1-pluginsonly.tar.gz"` |

### File formats

| Name                 | Description                                                                          | Value      | Recommended format   |
| :------------------- | :----------------------------------------------------------------------------------- | :--------- | :------------------- |
| AppImage             | App package for Linux systems. Does not support headless installation.               | `appimage` |                      |
| Apple Disk Image     | Disk image format used on macOS. User friendly, but can result in nested installers. | `dmg`      |                      |
| Apple package        | macOS and iOS software package installer.                                            | `pkg`      | ✅ Mac installer     |
| Debian package       | Package for Debian-based Linux such as Ubuntu                                        | `deb`      | ✅ Linux installer   |
| Executable installer | Executable file format used by Windows.                                              | `exe`      |                      |
| Red Hat package      | Originally developed for Red Hat based enterprise systems.                           | `rpm`      |                      |
| Tarball              | Compressed archive format common on Linux and Unix systems.                          | `tar.gz`   |                      |
| Tarball (alt)        | Legacy compressed archive format similar to .tar.gz.                                 | `tgz`      |                      |
| Windows installer    | Installer format for Windows.                                                        | `msi`      | ✅ Windows installer |
| Zip                  | Widely-used compressed file format compatible with many operating systems.           | `zip`      | ✅ Archive           |
| 7-Zip                | Archive file format which compresses files and folders into a single file.           | `7z`       |                      |

### File format recommendations

- Use an installer if you want to specify the installation paths
- Archives will be extracted and installed based on the package manager configuration.
- Avoid file formats which don't support automatic installation e.g. appimage
- Avoid nesting files such as an archive `plugin.zip` which contains an installer `plugin.msi`.
- Consider using a package generator such as [CPack](https://cmake.org/cmake/help/book/mastering-cmake/chapter/Packaging%20With%20CPack.html) or [JUCE](https://juce.com/tutorials/tutorial_app_plugin_packaging/) to build cross-platform packages for distribution.

### File types

Plugin manager will download and extract archives into a temporary directory. Then copy corresponding files into the correct Plugin and Preset locations. If an installer, plugin manager will run the installer via the command line and delegate responsibility of paths to the installer.

| Name      | Description                                                                           | Value       |
| :-------- | :------------------------------------------------------------------------------------ | :---------- |
| Archive   | Composed of one or more files along with metadata and compression.                    | `archive`   |
| Installer | Installs one or multiple files into specific locations along with script automations. | `installer` |
