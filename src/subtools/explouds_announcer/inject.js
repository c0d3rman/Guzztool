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

	modifyRoom: async function (room) {
		try {
			const subtool = this;

			const dataHandler = {
				currentMove: {},
				currentWeather: "",
				battleStarted: false,
				handle: function (data) {
					const lines = data.split("\n");
					if (lines[0] == "|init|battle") return; // This is a catch-up message, ignore
					for (const line of lines) {
						this.processLine(line);
					}
				},
				processLine: function (line) {
					const [command, ...params] = line.slice(1).split("|");
					subtool.log.debug("Command:", command, params);

					switch (command) {
						case "":
							this.completeMove();
							break;
						case "teampreview":
						case "start":
							if (!this.battleStarted) {
								subtool.soundManager.play("battle_start");
								this.battleStarted = true;
							}
							break;
						case "move":
							this.completeMove();

							let move = params[1];
							this.currentMove = { "name": move, "target": params[2] };
							if (subtool.assetMap.moves.includes(move)) {
								subtool.soundManager.play(move, "move");
							}
							break;
						case "switch":
							this.completeMove();

							const pokemon = params[1].split(", ")[0];
							if (subtool.assetMap.pokemon.includes(pokemon)) {
								subtool.soundManager.play(pokemon, "pokemon");
							} else if (room.battle.turn > 0) { // Don't play switch messages on lead (pokemon names are OK)
								subtool.soundManager.play("switch");
							}
							break;
						case "drag":
							subtool.soundManager.play("switch_forced");
							break;
						case "-miss":
							// TODO: repeat misses / multi misses
							this.currentMove.miss = true;
							break;
						case "-weather":
							if (params[1] == "[upkeep]") {
								break;
							}
							switch (params[0]) {
								case "Sandstorm":
									subtool.soundManager.play("sand_start");
									break;
								case "RainDance":
									subtool.soundManager.play("rain_start");
									break;
								case "SunnyDay":
									subtool.soundManager.play("sun_start");
									break;
								case "none":
									switch (this.currentWeather) {
										case "Sandstorm":
											subtool.soundManager.play("sand_end");
											break;
										case "RainDance":
											subtool.soundManager.play("rain_end");
											break;
										case "SunnyDay":
											subtool.soundManager.play("sun_end");
											break;
									}

							}
							this.currentWeather = params[0];
							break;
						case "-fail":
							this.currentMove.fail = true;
							subtool.soundManager.play("fail");
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
										subtool.soundManager.play("blocked");
										break;
									case "Substitute":
										subtool.soundManager.play("sub_hit");
										break;
								}
							}
							break;
						case "-start":
							switch (params[1]) {
								case "Substitute":
									subtool.soundManager.play("sub_start");
									break;
							}
							break;
						case "-end":
							switch (params[1]) {
								case "Disable":
									subtool.soundManager.play("disable_end");
									break;
								case "Substitute":
									subtool.soundManager.play("sub_hit");
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
								subtool.soundManager.play("flinch");
							}
							break;
					}
				},
				completeMove: function () {
					if (!this.currentMove.name) {
						return;
					}

					if (this.currentMove.no_effect) {
						subtool.soundManager.play("no_effect");
					} else if (this.currentMove.miss) {
						subtool.soundManager.play("miss");
					} else if (this.currentMove.hpAfter) {
						if (this.currentMove.crit) {
							subtool.soundManager.play("attack_crit");
						} else if (this.currentMove.supereffective) {
							subtool.soundManager.play("supereffective");
						} else if (this.currentMove.resisted) {
							subtool.soundManager.play("not_very_effective");
						}

						if (this.currentMove.hpAfter == 0) {
							if (room.battle.turn == 1) {
								subtool.soundManager.play("ko_firstturn");
							} else if (this.currentMove.hpBefore == 1) {
								subtool.soundManager.play("ko_ohko");
							} else if (this.currentMove.hpBefore < 0.25) {
								subtool.soundManager.play("ko_lighthit");
							} else {
								subtool.soundManager.play("ko");
							}
						} else {
							let damage = this.currentMove.hpAfter - this.currentMove.hpBefore;
							if (this.currentMove.hpAfter < 0.25) {
								subtool.soundManager.play("attack_redhealth");
							} else if (damage > 0.5) {
								if (room.battle.turn == 1) {
									subtool.soundManager.play("attack_strong_firstturn");
								} else if (this.currentMove.resisted) {
									subtool.soundManager.play("attack_strong_nve");
								} else {
									subtool.soundManager.play("attack_strong");
								}
							} else if (damage < 0.25) {
								subtool.soundManager.play("attack_lighthit");
							} else {
								subtool.soundManager.play("attack");
							}
						}
					}

					this.currentMove = {};
				}
			};

			// Hijack the function that receives Sim Protocol messages from the server
			((receive) => {
				room.receive = (...args) => {
					receive.apply(room, args);
					dataHandler.handle(args[0]);
				};
			})(room.receive);
		} catch (e) {
			this.log.error(e);
			throw e;
		}
	}
};

export default subtool;
