# Guzztool

#### A multitool for improving the Pokemon Showdown experience.

<img src="./src/static/icons/icon.svg" alt="Guzztool" width="200px" height="200px">

Guzztool is a Chrome/Firefox extension with many subtools that let you change Pokemon Showdown in different ways:

- **Zorua's Spoilerguard** prevents spoiling the suspense of Pokemon Showdown battles by hiding the end-of-battle controls until the final turn ends.
- **Pikachu's Elo Hider** hides your elo changes at the end of battles to reduce stress.
- **Exploud's Announcer** adds the Pokemon Stadium 2 announcer to battles.
- **Meowth's TTS** uses text-to-speech to read out battles and replays.
- **Togepi's Lucky Button** adds an "I'm feeling lucky" button to the teambuilder that generates random sets from usage data.

## Building

Steps to build this extension from scratch:

- Clone this repo
- `git submodule init`
- `git submodule update`
- `npm install`
- `npm run build` for development or `npm run export` for minified production version + zip
- Results will be in `dist-dev/` or `dist/` respectively

Adding new subtools is relatively straightforward. If you build one please contribute it to the repo.
