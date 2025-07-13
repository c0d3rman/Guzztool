/**
 * Webpack loader that instruments damage calculator files to log modifier information
 */

module.exports = function (source) {
  let modified = false;
  let result = source;

  // Helper function to extract desc assignments
  function extractDescAssignments(descBlock) {
    const descAssignments = [];
    const descRegex = /desc\.(\w+)\s*=\s*([^;]+);/g;
    let descMatch;
    
    while ((descMatch = descRegex.exec(descBlock)) !== null) {
      const propName = descMatch[1];
      const propValue = descMatch[2].trim();
      descAssignments.push(`"${propName}": ${propValue}`);
    }
    
    return descAssignments;
  }
  
  // Helper function to generate logging code
  function generateLoggingCode(modValue, modType, descAssignments) {
      return `
window.damageCalcModLog.push({
  mod: ${modValue},
  type: "${modType}",
  reasons: {${descAssignments.join(', ')}}
});`;
  }

  // Special case: -ate abilities (Aerilate, Pixilate, etc.)
  const ateAbilityPattern = /(if\s*\(\s*.*hasAteAbilityTypeChange.*\)\s*\{\s*)(bpMods\.push\(([^)]+)\);)/g;
  result = result.replace(ateAbilityPattern, (match, ifStart, pushStatement, modValue) => {
    modified = true;
      const loggingCode = `
window.damageCalcModLog.push({
  mod: ${modValue},
  type: "bp",
  reasons: {"attackerAbility": attacker.ability}
});`;
    return ifStart + pushStatement + loggingCode;
  });
    
  // Special case: Primordial Sea and Desolate Land cancelling a move
  const weatherCancelPattern = /(if\s*\(\(field\.hasWeather\('Harsh Sunshine'\)\s*&&\s*move\.hasType\('Water'\)\)\s*\|\|\s*\(field\.hasWeather\('Heavy Rain'\)\s*&&\s*move\.hasType\('Fire'\)\)\)\s*\{\s*)([\s\S]*?)(return result;)(\s*\})/g;
  result = result.replace(weatherCancelPattern, (match, ifStart, content, returnStatement, closing) => {
    modified = true;
    const loggingCode = `
window.damageCalcModLog.push({
  mod: 0,
  type: "bp",
  reasons: {"weather": field.weather}
});
`;
    return ifStart + content + loggingCode + returnStatement + closing;
  });

  // Pattern to match atMods.push or bpMods.push followed by desc assignments
  const modPattern = /((at|bp)Mods\.push\((\d+|[a-zA-Z_$][a-zA-Z0-9_$]*)\);)((?:\s*desc\.\w+\s*=\s*[^;]+;)*)((?:\s*window\.damageCalcModLog\.push\()?)/g;
  result = result.replace(modPattern, (match, pushStatement, modType, modValue, descBlock, existingLog) => {
    if (existingLog) return match; // Skip if already has logging
    modified = true;
    const descAssignments = extractDescAssignments(descBlock);
    const loggingCode = generateLoggingCode(modValue, modType, descAssignments);
    return pushStatement + descBlock + loggingCode;
  });

  // Pattern to match finalMods.push followed by desc assignments
  const finalModPattern = /(finalMods\.push\((\d+|[a-zA-Z_$][a-zA-Z0-9_$]*)\);)((?:\s*desc\.\w+\s*=\s*[^;]+;)*)((?:\s*window\.damageCalcModLog\.push\()?)/g;
  result = result.replace(finalModPattern, (match, pushStatement, modValue, descBlock, existingLog) => {
    if (existingLog) return match; // Skip if already has logging
    modified = true;
    const descAssignments = extractDescAssignments(descBlock);
    const loggingCode = generateLoggingCode(modValue, "final", descAssignments);
    return pushStatement + descBlock + loggingCode;
  });

  // Pattern for baseDamage modifications with pokeRound
  const baseDamagePattern = /(baseDamage\s*=\s*\(0,\s*util_2\.pokeRound\)\(\(0,\s*util_2\.OF32\)\(baseDamage\s*\*\s*(\d+)\)\s*\/\s*4096\);)((?:\s*desc\.\w+\s*=\s*[^;]+;)*)((?:\s*window\.damageCalcModLog\.push\()?)/g;
  result = result.replace(baseDamagePattern, (match, calculation, modValue, descBlock, existingLog) => {
    if (existingLog) return match; // Skip if already has logging
    modified = true;
    const descAssignments = extractDescAssignments(descBlock);
    const loggingCode = generateLoggingCode(modValue, "bd", descAssignments);
    return calculation + descBlock + loggingCode;
  });

  // Pattern for baseDamage modifications with Math.floor (note no division by 4096)
  const mathFloorPattern = /(baseDamage\s*=\s*Math\.floor\(\(0,\s*util_2\.OF32\)\(baseDamage\s*\*\s*([0-9.]+)\)\);)((?:\s*desc\.\w+\s*=\s*[^;]+;)*)/g;
  result = result.replace(mathFloorPattern, (match, calculation, modValue, descBlock) => {
    modified = true;
    const descAssignments = extractDescAssignments(descBlock);
    const loggingCode = generateLoggingCode(modValue * 4096, "bd", descAssignments);
    return calculation + descBlock + loggingCode;
  });

  if (modified) {
    console.log('DamageCalcModLoggerLoader: Instrumented file');
  }
  
  return result;
}; 