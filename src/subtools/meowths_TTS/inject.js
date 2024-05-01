const subtool = {
	init: function () {
		if (!window.battle) return;

		const pokemonNameOriginal = window.battle.scene.log.battleParser.pokemonName;
		const pokemonNameModified = (...args) => {
			const [baseName] = args;
			for (const side of window.battle.sides) {
				for (const pokemon of side.pokemon) {
					if (pokemon.getIdent() === baseName) {
						return pokemon.speciesForme;
					}
				}
			}
			return pokemonNameOriginal.apply(window.battle.scene.log.battleParser, args);
		}

		// When a new message is logged in the battle log, speak it.
		// parseArgs is called for turns and for general battle log messages, which is what we want to read out
		const battleParser = window.battle.scene.log.battleParser;
		const parseArgs = battleParser.parseArgs;
		battleParser.parseArgs = (...args) => {
			// First get rid of nicknames and speak the message
			battleParser.pokemonName = pokemonNameModified;
			let line = parseArgs.apply(battleParser, args);
			line = stripHTML(line); // First we strip any HTML in the original text (since parseLogMessage would escape it)
			[line] = window.battle.scene.log.parseLogMessage(line);
			line = stripHTML(line).trim(); // Then we strip any HTML added by parseLogMessage, like <strong> for bold
			if (args[0][0] == 'turn') line = line.replaceAll("==", "").trim(); // For turns, remove the equals signs that form the header
			if (line) {
				this.log.info("speaking:", line);
				speak(line);
			}
			// Then restore nicknames and perform the regular function
			battleParser.pokemonName = pokemonNameOriginal;
			return parseArgs.apply(battleParser, args);
		};
	}
}

async function speak(text) {
	const audio = new SpeechSynthesisUtterance(text);
	window.speechSynthesis.speak(audio);
	return new Promise(resolve => { audio.onend = resolve; });
}

function stripHTML(html) {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	return doc.body.textContent || "";
}

export default subtool;
