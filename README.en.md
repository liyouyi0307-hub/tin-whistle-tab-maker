# Tin Whistle Tab Maker

**Numbered notation and fingering editor for the tin whistle** · [中文](README.md)

Turn numbered notation (jianpu) into printable six-hole tin whistle tablature. Edit notes directly in the score, shift selected passages by an octave, choose local numbering modes, and save personal fingerings. Includes D whistle chromatic notes and sourced alternative-fingering presets.

Plain HTML, CSS and JavaScript. No installation, account or build step is required: download the source and open `index.html`.

[Download source ZIP](https://github.com/liyouyi0307-hub/tin-whistle-tab-maker/archive/refs/heads/main.zip) · [Detailed instructions in Chinese](D调半音更新说明.md) · [Fingering research in Chinese](叉指资料核验.md)

![Passage selection and direct note editing](docs/images/note-edit.jpg)

## Origin and authors

This project builds on **[TwinkleLee / tin-whistle-sheet-generator](https://gitee.com/twinklelee/tin-whistle-sheet-generator)** and is maintained by **[liyouyi0307-hub](https://github.com/liyouyi0307-hub)**. Thanks to TwinkleLee for the original generator.

The original provides notation-to-diagram conversion, basic key mappings, printing and tune persistence. This version extends D whistle chromatic support, personal fingerings and score editing. The upstream README declares MIT License; this project keeps MIT and credits the original work and subsequent modifications separately.

See [UPSTREAM.md](UPSTREAM.md) for the base commit and change list. Original README files are preserved under [docs/upstream/](docs/upstream/).

## Features

| Feature | What it does |
| --- | --- |
| Printable tablature | Six-hole diagrams, notation labels, print styling and visible input / range errors |
| D whistle chromatic notes | Accidentals, natural signs and half-hole diagrams based on sounding pitch and register |
| Personal fingerings | 20 register-specific cross-fingering presets with sources and trial guidance; custom six-hole patterns with preview before applying |
| Octave changes | Shift the whole score or a selected passage, preserving rhythm symbols and layout |
| Local numbering modes | D whistle bottom-note modes 1/3/4/5; different passages can use different modes, with visible transition labels |
| Direct note editing | Double-click or press F2; valid edits update notation and diagrams immediately; cancel an editing session to restore its original note |
| Save and restore | JSON import/export and browser storage retain personal fingerings and local modes; invalid imports preserve the existing tune |

## Quick start

1. Download and extract the source ZIP, then open `index.html`, or serve it with a static web server.
2. Select the whistle key and global numbering mode, enter notation and generate the score.
3. Click, drag, or Shift-click notes to select a passage. A two-endpoint option is also available for touch input.
4. Use the score toolbar to change the selected passage's mode or octave. Double-click a note to edit it directly.
5. Export the tune with the save button, reload it from JSON later, or print the diagrams.

Export JSON regularly. Browser storage is not a backup and does not automatically migrate between browsers or devices.

## Notation examples

Natural scale for a D whistle with bottom note 1:

```text
1 2 3 4 5 6 7 1'
```

Chromatic exercise in the same mode:

```text
1 #1 2 b3 3 4 #4 5 #5 6 b7 7 1'
```

| Syntax | Meaning |
| --- | --- |
| `#1` / `♯1` | Raise the numbered scale degree by a semitone |
| `b3` / `♭3` | Lower the numbered scale degree by a semitone |
| `n3` / `♮3` | Restore degree 3 of the current numbered scale; still F♯ for D whistle mode 1 |
| `1'` / `1.` | Upper / lower octave |
| `3·` | Dotted note |
| `0` / `2---` | Rest / duration extension |
| `\|` | Bar separator |

Accidentals apply only to the immediately following note. A local numbering-mode change keeps the written numbers and recalculates sounding pitches and fingerings; it does not change the physical key of the whistle.

[MixedTubeModes.json](MixedTubeModes.json) demonstrates three local modes in one score. [KingdomDance.json](KingdomDance.json) is an upstream sample tune.

## Fingering scope

The chromatic extension targets ordinary six-hole D whistles. Original C/G/F mappings are retained. Modes 3 and 4 have lowest numbered notes `3.` and `4.` respectively; the physical lowest note remains D.

The 20 alternative presets cover 7 of 10 chromatic pitch/register combinations. Both E-flat registers and low F retain half-holing. Fingerings come from published charts and instrument-specific or player reports; results depend on the whistle and breath. The presets have not been play-tested here.

This version focuses on numbered notation and fingering editing. It does not include audio playback or ABC, MusicXML or MIDI import. Detailed instructions and research evidence are available in [D调半音更新说明.md](D调半音更新说明.md) and [叉指资料核验.md](叉指资料核验.md).

## Development and checks

The app needs no runtime dependencies or build tools. With Node.js installed, run:

```sh
node --test tests/chromatic.test.cjs
```

The 40 checks cover pitch and fingering mappings, octave changes, score selection, direct note editing, local modes, persistence and invalid-input protection. Automated checks do not replace real-device testing or instrument play-testing.

Report issues through [GitHub Issues](https://github.com/liyouyi0307-hub/tin-whistle-tab-maker/issues), including notation, whistle key, numbering mode, steps and expected results. Fingering proposals should identify the instrument, octave and source.

## Project files

```text
index.html                  Main program
MixedTubeModes.json         Local numbering-mode exercise
KingdomDance.json            Upstream sample tune
tests/chromatic.test.cjs     Automated checks
docs/images/note-edit.jpg    Interface example
docs/upstream/               Original README files
UPSTREAM.md                 Origin and changes
DESCRIPTION.md              Project descriptions
LICENSE                     MIT terms
```

## License

The software uses the [MIT License](LICENSE), with attribution for the original work and subsequent modifications. Tunes, cited publications and linked websites may have separate rights; the software license does not replace permission for those works. Local research downloads and packaged output in `tmp/` and `output/` are excluded from the source repository.
