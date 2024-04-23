const subtool = {
	name: "Meowth's TTS",
	description: "Uses text-to-speech to read out battles and replays.",
	init: function (guzztool) {
		// Only run on replays
		const domainParts = window.location.hostname.split('.');
		if (!(domainParts.length > 2 && domainParts[domainParts.length - 3] === "replay")) return;

		/* eslint-disable no-undef */
		const pokemonNameOriginal = battle.scene.log.battleParser.pokemonName;
		const pokemonNameModified = (...args) => {
			const [baseName] = args;
			for (const side of battle.sides) {
				for (const pokemon of side.pokemon) {
					if (pokemon.getIdent() === baseName) {
						return pokemon.speciesForme;
					}
				}
			}
			return pokemonNameOriginal.apply(battle.scene.log.battleParser, args);
		}
		/* eslint-enable no-undef */

		// When a new message is logged in the battle log, speak it.
		// parseArgs is called for turns and for general battle log messages, which is what we want to read out
		/* eslint-disable no-undef */
		const battleParser = battle.scene.log.battleParser;
		const parseArgs = battleParser.parseArgs;
		battleParser.parseArgs = (...args) => {
			// First get rid of nicknames and speak the message
			battleParser.pokemonName = pokemonNameModified;
			let line = parseArgs.apply(battleParser, args);
			line = stripHTML(line); // First we strip any HTML in the original text (since parseLogMessage would escape it)
			[line] = battle.scene.log.parseLogMessage(line);
			line = stripHTML(line).trim(); // Then we strip any HTML added by parseLogMessage, like <strong> for bold
			if (args[0][0] == 'turn') line = line.replaceAll("==", "").trim(); // For turns, remove the equals signs that form the header
			if (line) {
				guzztool.log("speaking:", line);
				speak(line);
			}
			// Then restore nicknames and perform the regular function
			battleParser.pokemonName = pokemonNameOriginal;
			return parseArgs.apply(battleParser, args);
		};
		/* eslint-enable no-undef */
	}
}

async function speak(text) {
	// window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));

	const audio = new SpeechSynthesisUtterance(text);
	window.speechSynthesis.speak(audio);
	return new Promise(resolve => { audio.onend = resolve; });
}

function stripHTML(html) {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	return doc.body.textContent || "";
}

export default subtool;
