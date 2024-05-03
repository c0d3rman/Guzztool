// Polyfill to make things work on both Chrome and Firefox
export let browser;
try { // When importing other things from util.js in an injected script, these being undefined causes an error, so guard
    browser = chrome || browser;
} catch { }

// Adapted from https://stackoverflow.com/a/55671924/2674563
export function weighted_random(choiceDict) {
    let i;
    let choices = Object.keys(choiceDict);
    let cumulativeWeights = [choiceDict[choices[0]]];

    for (i = 1; i < choices.length; i++)
        cumulativeWeights[i] = choiceDict[choices[i]] + cumulativeWeights[i - 1];

    let random = Math.random() * cumulativeWeights[cumulativeWeights.length - 1];

    for (i = 0; i < cumulativeWeights.length; i++)
        if (cumulativeWeights[i] > random)
            break;

    return choices[i];
}

export async function sendMessageFromInjectedScript(id, message) {
    const extensionId = document.getElementById(id).getAttribute('data-ext-id');
    return await browser.runtime.sendMessage(extensionId, message);
}
