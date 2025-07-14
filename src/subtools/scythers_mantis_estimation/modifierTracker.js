import { FunctionListenerProxy } from "@guzztool/util/ListenerProxy";
import * as calc from '@smogon/calc';

class ModifierTracker {
  constructor() {
    this.currentMods = [];
    this.lastCalculation = null;
    this.lastDefense = null;
  }
  
  startTracking() {
    this.currentMods = [];
    this.lastDefense = null;
  }
  
  addModifier(modData) {
    // Accept the format: { mod, type, reasons }
    this.currentMods.push(modData);
  }
  
  finishTracking() {
    // Remove duplicates, which occur from multihit moves
    const uniqueModsSet = new Set(this.currentMods.map(mod => JSON.stringify(mod)));
    const result = Array.from(uniqueModsSet).map(modString => JSON.parse(modString));
    
    this.lastCalculation = result;
    this.currentMods = [];
    return result;
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
    result.allModifiers = window.modifierTracker.finishTracking();
    return result;
  }
);
calc.calculate = calculateProxy.proxy;

// Re-export the proxied calc
export { calc };