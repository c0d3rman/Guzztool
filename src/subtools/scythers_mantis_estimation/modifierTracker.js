import { FunctionListenerProxy } from "@guzztool/util/ListenerProxy";
import * as calc from '@smogon/calc';

export class ModifierTracker {
  constructor() {
    this.currentMods = [];
    this.lastCalculation = null;
  }
  
  startTracking() {
    this.currentMods = [];
  }
  
  addModifier(mod, type, reasons) {
    this.currentMods.push({ mod, type, reasons });
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

// Create a local instance of the modifier tracker
const modifierTracker = new ModifierTracker();

// Proxy the calculate function to track modifiers
const calculateProxy = new FunctionListenerProxy(
  calc.calculate,
  (originalFn, ...args) => {
    // Clear the global damageCalcModLog before calculation
    window.damageCalcModLog = [];
    modifierTracker.startTracking();
    
    // Run the original calculation
    const result = originalFn(...args);
    
    // Transfer damageCalcModLog to our tracker
    window.damageCalcModLog.forEach(entry => {
      modifierTracker.addModifier(entry.mod, entry.type, entry.reasons);
    });
    
    // Store the modifiers on the result object
    result.allModifiers = modifierTracker.finishTracking();
    
    return result;
  }
);
calc.calculate = calculateProxy.proxy;

// Re-export the proxied calc
export { calc };