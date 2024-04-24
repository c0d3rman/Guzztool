import { sendMessageFromInjectedScript, weighted_random } from "./util.js";
import urlJoin from "url-join";


// Fetch data using the service worker (to bypass CORS issues)
export async function fetchData(url, mode = 'text') {
    const { fetched } = await sendMessageFromInjectedScript('guzztool-script-main', {
        type: 'fetch',
        target: 'service-worker',
        data: { url: url, mode: mode }
    });
    return fetched;
}

// Fetch and parse the stats page to find the newest folder
export async function getNewestDataURL() {
    const baseURL = 'https://www.smogon.com/stats/';
    const html = await fetchData(baseURL);
    const { path } = await sendMessageFromInjectedScript('guzztool-script-main', {
        type: 'get-newest-smogon-stats-folder',
        target: 'offscreen',
        data: { html: html }
    });
    return urlJoin(baseURL, path);
}

// Get the "chaos" data for a given format (and optionally elo)
export async function getChaosDataForFormat(format, elo = 0) {
    const dataURL = await getNewestDataURL();
    const url = urlJoin(dataURL, `chaos/${format}-${elo}.json`);
    return await fetchData(url, 'json');
}

// Generate a random typical set for a given mon using usage data
export function generateRandomSet(species, monData) {
    // Choose random moveset
    let moves = monData.Moves;
    moves = Object.fromEntries(Object.entries(moves).map(([move, count]) => [move, count / monData["Raw count"]])); // Normalize the moves so they sum to 400% (4 move slots)
    const moveset = [];
    for (let i = 0; i < 4; i++) {
        const randomMove = weighted_random(moves);
        if (randomMove != '') moveset.push(randomMove); // Leave off blanks
        moves[randomMove] = Math.max(0, moves[randomMove] - 1); // Take 100% off the move's weight, which accounts for moves chosen more than once (e.g. blank is chosen 300% of the time in metronome battles)
    }
    while (moveset.length < 4) moveset.push(""); // If blank moveslots were chosen, fill up the remaining moveslots with blanks. We do this so blanks end up at the end

    // Choose random spread
    const statKeys = ["hp", "atk", "def", "spa", "spd", "spe"];
    const spread = weighted_random(monData.Spreads);
    const [nature, evsRaw] = spread.split(":");
    const evs = Object.fromEntries(evsRaw.split("/").map((ev, i) => [statKeys[i], Number(ev)]));

    return {
        "name": species,
        "species": species,
        "item": weighted_random(monData.Items),
        "ability": weighted_random(monData.Abilities),
        "moves": moveset,
        "nature": nature,
        "evs": evs,
        "ivs": { "hp": 31, "atk": 31, "def": 31, "spa": 31, "spd": 31, "spe": 31 }, // There's no usage data for IVs
        "happiness": weighted_random(monData.Happiness),
        "hpType": "",
        "pokeball": "",
        "gigantamax": false,
        "dynamaxLevel": 10,
        "teraType": "Stellar", // There's no usage data for Tera types
        "level": 100 // TODO level should be format based (there's no usage data for it)
    }
}




// /**
//  * Formats containing any of these keywords will forcibly prevent fetching from the "master list," e.g., `/gen9.json`.
//  * In other words, these formats are probably specialized & don't exist in the standard meta formats, so they wouldn't
//  * be in the aforementioned "master list."
//  */
// const FormatOnlyKeywords = [
//   'random', // e.g., 'gen9randomdoublesbattle'
//   'bdsp', // e.g., 'gen8bdspou'
//   'letsgo', // e.g., 'gen7letsgoou'
// ];

// /**
//  * Following keywords (`RegExp` string notation allowed) will be removed when assembling the API endpoint value.
//  */
// const IgnoredFormatKeywords = [
//   'blitz', // e.g., 'gen9randombattleblitz' -> 'gen9randombattle'
//   'mayhem', // e.g., 'gen9randombattlemayhem' -> 'gen9randombattle'
//   'monotype', // e.g., 'gen9monotyperandombattle' -> 'gen9randombattle'
//   'nodmax', // e.g., 'gen8randombattlenodmax' -> 'gen8randombattle'
//   'regulation[a-z]$', // e.g., 'gen9battlestadiumsinglesregulationd' -> 'gen9battlestadiumsingles'
//   'series\\d+$', // e.g., 'gen9vgc2023series1' -> 'gen9vgc2023'
//   'unrated', // e.g., 'gen9unratedrandombattle' -> 'gen9randombattle'
// ];

// /**
//  * Following expressions will be `replace()`'d when assembling the API endpoint value.
//  *
//  * * Each element must be a tuple in the following order:
//  *   - First element is the `RegExp` test condition,
//  *   - Second element is the replacement `RegExp` when the test passes, &
//  *   - Third element is the replacement `string` (substring matching allowed, e.g., `'foo-$1-bar'`).
//  * * Specify `null` for the second argument to use the `RegExp` in the first element.
//  */
// const FormatReplacements = [
//   // only here in order to prevent yeeting 'monotype' in other monotyped formats
//   // (not sure atm if they fall under this case as well, but just to play it safe)
//   // e.g., 'gen9monotyperandombattle' -> 'gen9randombattle'
//   [/monotyperandom/i, null, 'random'],

//   // note: this format requires special handling cause the gen number changes, I think
//   // e.g., 'gen9randomroulette' -> 'gen9randombattle'
//   [/randomroulette/i, /roulette/i, 'battle'],

//   // FFA Randoms uses Randoms Doubles presets
//   // e.g., 'gen9freeforallrandombattle' -> 'gen9randomdoublesbattle'
//   [/freeforallrandom/i, null, 'randomdoubles'],

//   // does anybody play this ??? o_O
//   // e.g., 'gen9multirandombattle' -> 'gen9randomdoublesbattle'
//   [/multirandom/i, null, 'randomdoubles'],

//   // Randomized Format Spotlight as of 2023/11/14, requested by Pulse_kS
//   // e.g., 'gen9partnersincrimerandombattle' -> 'gen9randomdoublesbattle'
//   [/partnersincrimerandom/i, null, 'randomdoubles'],

//   // Randomized Format Spotlight as of 2024/01/10
//   // e.g., 'gen6firstbloodrandombattle' -> 'gen6randombattle'
//   [/firstblood/i, null, ''],
// ];

// // 10/10 function name
// const formatEndpointFormat = format => {
//   if (!format?.length) return format;

//   const removalExp = new RegExp(IgnoredFormatKeywords.join('|'), 'i');
//   const removed = format.replace(removalExp, '');

//   const replacements = FormatReplacements
//     .filter(([test]) => test?.test?.(removed))
//     .reduce((prev, [test, search, replace]) => prev.replace(search || test, replace), removed);

//   return replacements;
// };


// /**
//  * RTK Query factory for fetching `CalcdexPokemonPreset`'s, or if available & still fresh,
//  * use the cached `CalcdexPokemonPreset`'s from `LocalStorage`.
//  *
//  * * now that I look at it again, this function looks like the final boss of TypeScript lmao
//  *
//  * @since 1.1.6
//  */
// export const buildPresetQuery = <
//   TResponse,
//   TMeta = unknown,
// >(
//   source: CalcdexPokemonPresetSource,
//   path: string,
//   transformer: (
//     args: PkmnApiSmogonPresetRequest,
//   ) => (
//     data: TResponse,
//     meta: TMeta,
//     args: PkmnApiSmogonPresetRequest,
//   ) => CalcdexPokemonPreset[],
// ): (
//   args: PkmnApiSmogonPresetRequest,
// ) => Promise<{
//   data: CalcdexPokemonPreset[];
// }> => {
//   if (!source || !path || typeof transformer !== 'function') {
//     l.error(
//       'did you forget the factory args?',
//       '\n', 'source', '(type)', typeof source, '(value)', source,
//       '\n', 'path', '(type)', typeof path, '(value)', path,
//       '\n', 'transformer', '(type)', typeof transformer,
//     );

//     throw new Error('buildPresetQuery() received invalid factory arguments :o');
//   }

//   return async (args) => {
//     const endTimer = runtimer(l.scope, l);

//     const {
//       gen,
//       format,
//       formatOnly,
//       maxAge,
//     } = args || {};

//     let output: CalcdexPokemonPreset[] = [];

//     // if this is false, then we'll fetch ALL presets for the detected gen
//     const filterByFormat = !!format && (
//       source === 'usage'
//       || formatOnly
//       || FormatOnlyKeywords.some((f) => format.includes(f))
//     );

//     // attempt to guess the endpoint from the args
//     const endpoint = (filterByFormat && formatEndpointFormat(format)) || `gen${gen}`;
//     const cacheEnabled = nonEmptyObject(maxAge);

//     if (cacheEnabled) {
//       // const [presets, stale] = getCachedPresets(
//       //   endpoint,
//       //   source,
//       //   maxAge,
//       // );

//       const presets = await readPresetsDb(format, {
//         formatOnly,
//         source,
//         maxAge,
//       });

//       /*
//       if (presets?.length) {
//         output = presets;

//         if (!stale) {
//           endTimer('(cache hit)', 'endpoint', endpoint);

//           return { data: output };
//         }
//       }
//       */

//       if (presets.length) {
//         endTimer('(cache hit)', 'endpoint', endpoint);

//         return { data: presets };
//       }
//     }

//     // build the preset API URL to fetch from
//     const url = env('pkmn-presets-base-url')
//       // remove any potential double-slashes (or more) in the URL path
//       // e.g., '/smogon/data/sets//gen9ou' -> '/smogon/data/sets/gen9ou'
//       + `${path}/${endpoint}`.replace(/\/{2,}/g, '/')
//       + env('pkmn-presets-endpoint-suffix');

//     try {
//       // fetch the presets
//       const response = await runtimeFetch < TResponse > (url, {
//         method: HttpMethod.GET,
//         headers: { Accept: 'application/json' },
//       });

//       // btw, json() here is not async cause it's from runtimeFetch() lmao
//       const data = response.json();

//       // build a transform function from the `transformer` factory
//       const transform = transformer(args);

//       if (typeof transform === 'function') {
//         output = transform(data, { resHeaders: response.headers } as TMeta, args);
//       }
//     } catch (error) {
//       // use the cache if we have to lol
//       if (output.length) {
//         endTimer('(cache fallback)', 'endpoint', endpoint);

//         return { data: output };
//       }

//       throw error;
//     }

//     // update the cache if enabled
//     if (cacheEnabled && output.length) {
//       // cachePresets(output, endpoint, source);
//       void writePresetsDb(output);
//     }

//     endTimer('(cache miss)', 'endpoint', endpoint);

//     return { data: output };
//   };
// };
