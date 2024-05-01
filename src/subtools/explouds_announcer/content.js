/*
 This content script handles playing sounds when requested by the injected script
 */

import { browser } from '@guzztool/util/util.js';


const subtool = {
	init: async function () {
		const assetMap = await fetch(browser.runtime.getURL(`subtools/${this.manifest.id}/assets/assetMap.json`)).then(response => response.json());
		this.log.debug("Asset map: ", assetMap);

		const subtool = this;
		this.soundManager = {
			audio: new Audio(),
			queue: [],
			soundsPlayed: {},
			play: function (name, type = "sound") {
				try {
					subtool.log.debug(`Playing ${name} (${type})`);

					let url = `subtools/${subtool.manifest.id}/assets/`;

					switch (type) {
						case "move":
							if (!assetMap.moves.includes(name)) {
								return;
							}
							url += `moves/${name}.wav`;
							break;
						case "pokemon":
							if (!assetMap.pokemon.includes(name)) {
								return;
							}
							url += `pokemon/${name}.wav`;
							break;
						case "sound":
							url += `${name}/`;

							let all = assetMap[name];
							let minTimesPlayed = all.reduce((x, y) => Math.min(x, this.soundsPlayed[url + y]) || 0, Infinity);
							let candidates = all.filter((x) => (this.soundsPlayed[url + x] || 0) == minTimesPlayed);

							url += candidates[Math.floor(Math.random() * candidates.length)];
							break;
						default:
							throw `Unknown play type ${type}`;
					}

					if (this.audio.paused || this.audio.ended) {
						this._play(url);
					} else {
						this.queue.push(url);
					}
				} catch (e) {
					subtool.log.error(e);
				}
			},
			_play: function (url) {
				if (!(url in this.soundsPlayed)) {
					this.soundsPlayed[url] = 0;
				}
				this.soundsPlayed[url]++;
				this.audio.src = browser.runtime.getURL(encodeURI(url));
				this.audio.play();
			},
			init: function () {
				let self = this;
				this.audio.addEventListener('ended', function () {
					if (self.queue.length > 0) {
						self._play(self.queue.shift());
					}
				}, false);
			}
		}
		this.soundManager.init();

		// Setup listeners to receive messages from the injected script
		this.messaging.onMessage("play_sound", message => this.soundManager.play(message.content.soundName, message.content.soundType));
		this.messaging.onMessage("set_mute", message => this.soundManager.audio.muted = message.content.muted);
		this.messaging.onMessage("get_asset_map", message => this.messaging.postMessage({ replyTo: message, content: assetMap }));
	}
}

export default subtool;
