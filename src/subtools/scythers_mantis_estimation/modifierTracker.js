import { FunctionListenerProxy } from "@guzztool/util/ListenerProxy";
import * as calc from '@smogon/calc';

class ModifierTracker {
  constructor() {
    this.startTracking(); // Technically not needed
  }
  
  startTracking() {
    this.currentAttackerMods = [];
    this.currentDefenderMods = [];
  }
  
  addAttackerModifier(modData) {
    this.currentAttackerMods.push(modData);
  }
  
  addDefenderModifier(modData) {
    this.currentDefenderMods.push(modData);
  }
  
  finishTracking() {
    const uniqueAttackerMods = new Set(this.currentAttackerMods.map(mod => JSON.stringify(mod)));
    const uniqueDefenderMods = new Set(this.currentDefenderMods.map(mod => JSON.stringify(mod)));
    
    const attackerResult = Array.from(uniqueAttackerMods).map(modString => JSON.parse(modString));
    const defenderResult = Array.from(uniqueDefenderMods).map(modString => JSON.parse(modString));
    
    this.currentAttackerMods = [];
    this.currentDefenderMods = [];

    return { attacker: attackerResult, defender: defenderResult };
  }
}

// Create a global instance of the modifier tracker
window.modifierTracker = new ModifierTracker();

// Proxy the calculate function to track modifiers
const calculateProxy = new FunctionListenerProxy(
  calc.calculate,
  (originalFn, ...args) => {
    window.modifierTracker.startTracking();
    const result = originalFn(...args);
    const modifiers = window.modifierTracker.finishTracking();
    result.attackModifiers = modifiers.attacker;
    result.defenseModifiers = modifiers.defender;
    return result;
  }
);
calc.calculate = calculateProxy.proxy;

// Re-export the proxied calc
export { calc };