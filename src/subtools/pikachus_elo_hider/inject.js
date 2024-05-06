const subtool = {
	init: function () {
		if (!this.roomListener) return;
		this.roomListener.on("new", (roomId, room) => {
			if (!roomId.startsWith("battle-")) return;

			// Hide elo messages
			const battleLog = room.battle.scene.log;
			const originalAdd = battleLog.add;
			battleLog.add = (...args) => {
				const [command, message] = args[0];
				if (command == "raw" && /'s rating: \d+/.test(message)) {
					this.log.info(`Suppressing Elo message: | ${message}`);
					return;
				}
				return originalAdd.apply(battleLog, args);
			};

			// Hide elo tooltips
			if (this.options.hideTooltip) {
				const battleScene = room.battle.scene;
				for (const fn of ["updateLeftSidebar", "updateRightSidebar"]) {
					const original = battleScene[fn];
					battleScene[fn] = (...args) => {
						const result = original.apply(battleScene, args);
						$(room.$el).find(".trainersprite").attr("title", "Rating: [hidden by Pikachu's Elo Hider]");
						return result;
					};
				}
			}
		});
	}
}

export default subtool;
