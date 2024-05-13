class DataHandler {
	constructor(subtool) {
		this.subtool = subtool;

		this.currentMove = {};
		this.currentWeather = "";
		this.battleStarted = false;
	}

	handleBattleMessage([command, ...params], data) {
		// For reference, look at runMajor and runMinor in battle.ts

		switch (command) {
			case "":
				this.completeMove();
				break;
			case "teampreview":
			case "start":
				if (!this.battleStarted) {
					this.subtool.soundManager.play("battle_start");
					this.battleStarted = true;
				}
				break;
			case "move":
				this.completeMove();

				let move = params[1];
				this.currentMove = { "name": move, "target": params[2] };
				if (this.subtool.assetMap.moves.includes(move)) {
					this.subtool.soundManager.play(move, "move");
				}
				break;
			case "switch":
				this.completeMove();

				const pokemon = params[1].split(", ")[0];
				if (this.subtool.assetMap.pokemon.includes(pokemon)) {
					this.subtool.soundManager.play(pokemon, "pokemon");
				} else if (room.battle.turn > 0) { // Don't play switch messages on lead (pokemon names are OK)
					this.subtool.soundManager.play("switch");
				}
				break;
			case "drag":
				this.subtool.soundManager.play("switch_forced");
				break;
			case "-miss":
				// TODO: repeat misses / multi misses
				this.currentMove.miss = true;
				break;
			case "-weather":
				if (data["upkeep"]) {
					break;
				}
				switch (params[0]) {
					case "Sandstorm":
						this.subtool.soundManager.play("sand_start");
						break;
					case "RainDance":
						this.subtool.soundManager.play("rain_start");
						break;
					case "SunnyDay":
						this.subtool.soundManager.play("sun_start");
						break;
					case "none":
						switch (this.currentWeather) {
							case "Sandstorm":
								this.subtool.soundManager.play("sand_end");
								break;
							case "RainDance":
								this.subtool.soundManager.play("rain_end");
								break;
							case "SunnyDay":
								this.subtool.soundManager.play("sun_end");
								break;
						}

				}
				this.currentWeather = params[0];
				break;
			case "-fail":
				this.currentMove.fail = true;
				this.subtool.soundManager.play("fail");
				break;
			case "-activate":
				if (params[1].startsWith("move: ")) {
					let move = params[1].split(": ")[1];
					switch (move) {
						case "Protect":
						case "Detect":
						case "Baneful Bunker":
						case "Crafty Shield":
						case "King's Shield":
						case "Mat Block":
						case "Obstruct":
						case "Quick Guard":
						case "Spiky Shield":
						case "Wide Guard":
						case "Max Guard":
							this.subtool.soundManager.play("blocked");
							break;
						case "Substitute":
							this.subtool.soundManager.play("sub_hit");
							break;
					}
				}
				break;
			case "-start":
				switch (params[1]) {
					case "Substitute":
						this.subtool.soundManager.play("sub_start");
						break;
				}
				break;
			case "-end":
				switch (params[1]) {
					case "Disable":
						this.subtool.soundManager.play("disable_end");
						break;
					case "Substitute":
						this.subtool.soundManager.play("sub_hit");
						break;
				}
				break;
			case "-enditem":
				let item = params[1];
				let reason = params[2];
				if (reason == "[eat]") {
					// TODO
				}
				break;
			case "-immune":
				this.currentMove.no_effect = true;
				break;
			case "-crit":
				this.currentMove.crit = true;
				break;
			case "-supereffective":
				this.currentMove.supereffective = true;
				break;
			case "-resisted":
				this.currentMove.resisted = true;
				break;
			case "-damage":
				// If there's an active move and its target just got damaged
				if (this.currentMove.name && params[0] == this.currentMove.target) {
					let hpStr = params[1].split(" ")[0];

					let newHP;
					if (hpStr == "0") {
						newHP = 0
					} else {
						let hpParts = hpStr.split("/");
						newHP = hpParts[0] / hpParts[1];
					}

					let targetSide = this.currentMove.target.slice(0, 2);
					let target = room.battle.getSide(targetSide).active[0];
					let oldHP = target.hp / target.maxHP;

					this.currentMove.hpBefore = oldHP
					this.currentMove.hpAfter = newHP;
				}
				break;
			case "cant":
				if (params[1] == "flinch") {
					this.subtool.soundManager.play("flinch");
				}
				break;
		}
	}

	completeMove() {
		if (!this.currentMove.name) return;

		if (this.currentMove.no_effect) {
			this.subtool.soundManager.play("no_effect");
		} else if (this.currentMove.miss) {
			this.subtool.soundManager.play("miss");
		} else if (this.currentMove.hpAfter) {
			if (this.currentMove.crit) {
				this.subtool.soundManager.play("attack_crit");
			} else if (this.currentMove.supereffective) {
				this.subtool.soundManager.play("supereffective");
			} else if (this.currentMove.resisted) {
				this.subtool.soundManager.play("not_very_effective");
			}

			if (this.currentMove.hpAfter == 0) {
				if (room.battle.turn == 1) {
					this.subtool.soundManager.play("ko_firstturn");
				} else if (this.currentMove.hpBefore == 1) {
					this.subtool.soundManager.play("ko_ohko");
				} else if (this.currentMove.hpBefore < 0.25) {
					this.subtool.soundManager.play("ko_lighthit");
				} else {
					this.subtool.soundManager.play("ko");
				}
			} else {
				const damage = this.currentMove.hpAfter - this.currentMove.hpBefore;
				if (this.currentMove.hpAfter < 0.25) {
					this.subtool.soundManager.play("attack_redhealth");
				} else if (damage > 0.5) {
					if (room.battle.turn == 1) {
						this.subtool.soundManager.play("attack_strong_firstturn");
					} else if (this.currentMove.resisted) {
						this.subtool.soundManager.play("attack_strong_nve");
					} else {
						this.subtool.soundManager.play("attack_strong");
					}
				} else if (damage < 0.25) {
					this.subtool.soundManager.play("attack_lighthit");
				} else {
					this.subtool.soundManager.play("attack");
				}
			}
		}

		this.currentMove = {};
	}
}

const subtool = {
	init: async function () {
		if (!this.roomListener) return;

		// Get the asset map
		this.assetMap = await this.messaging.sendMessage("get_asset_map", {}, "content-script");

		// This object manages sending messages to play sounds
		this.soundManager = {
			play: (name, type = "sound") => {
				this.messaging.sendMessage("play_sound", { soundName: name, soundType: type }, "content-script");
			},
			setMute: (muted) => {
				this.messaging.sendMessage("set_mute", { muted: muted }, "content-script");
			}
		};

		// Hijack the mute function so we can mute too
		(setMute => {
			window.BattleSound.setMute = (muted) => {
				this.soundManager.setMute(muted);
				setMute(muted);
			};
		})(window.BattleSound.setMute);
		this.soundManager.setMute(window.BattleSound.muted); // Send initial mute data

		// Listen for rooms
		this.roomListener.on("new", (roomId, room) => {
			if (roomId.startsWith("battle-")) this.modifyRoom(room);
		});
	},

	intercept(obj, methodName, callback) {
		const originalMethod = obj[methodName];
		obj[methodName] = (...args) => {
			try {
				callback(...args);
			} catch (e) {
				this.subtool.log.error(e);
			}
			return originalMethod.apply(obj, args);
		}
	},

	modifyRoom: async function (room) {
		try {
			const dataHandler = new DataHandler(this);

			// Intercept init and team preview, which don't make it to addBattleMessage
			let isInit = false;
			(originalMethod => {
				room.receive = function (...args) {
					if (args[0].startsWith("|init")) {
						isInit = true;
						setTimeout(() => isInit = false, 100); // Wait a bit for the init message to go by
					} else if (/^\|teampreview/m.test(args[0])) {
						dataHandler.handleBattleMessage(["teampreview"]);
					}
					return originalMethod.apply(this, args);
				};
			})(room.receive);

			// Intercept battle messages being added (which is timed alongside animations)
			(originalMethod => {
				room.battle.scene.log.addBattleMessage = function (...args) {
					if (!isInit) { // Avoid catch-up
						dataHandler.handleBattleMessage(...args);
					}
					return originalMethod.apply(this, args);
				}
			})(room.battle.scene.log.addBattleMessage);
		} catch (e) {
			this.log.error(e);
			throw e;
		}
	},
};

export default subtool;
