import { FunctionListenerProxy } from "@guzztool/util/ListenerProxy";
import { calc } from './modifierTracker';


const MAX_ROLL_SUFFIX = "M";
const statNameMap = {
  'atk': 'Atk',
  'def': 'Def',
  'spa': 'SpA',
  'spd': 'SpD',
  'spe': 'Spe'
};

const subtool = {
  iconUrl: null,
  tooltipData: {},
  cssUrl: null,

  init: async function () {
    this.iconUrl = await this.messaging.sendMessage(
      "get_file_url",
      { file_path: "icon.png" },
      "content-script"
    );

    this.cssUrl = await this.messaging.sendMessage(
      "get_file_url",
      { file_path: "styles.css" },
      "content-script"
    );


    if (!this.roomListener) return;

    this.initTooltip();
    this.injectStyles();
    this.roomListener.on("new", (roomId, room) => {
      if (roomId == "teambuilder") {
        this.initTeambuilder(room);
      } else if (roomId.startsWith("battle-")) {
        this.initBattle(room);
      }
    });
  },

  injectStyles: function () {
    if (document.getElementById("mantis-styles")) return;

    const link = document.createElement("link");
    link.id = "mantis-styles";
    link.rel = "stylesheet";
    link.type = "text/css";
    link.href = this.cssUrl;
    document.head.appendChild(link);
  },

  getRollMultiplier: function () {
    return this.options?.max_roll ? 0.84 : 0.714;
  },

  getGeneration: function () {
    // Get generation from current context
    if (room.battle) {
      return room.battle.gen;
    }
    if (room.curTeam?.dex?.gen) {
      return room.curTeam.dex.gen;
    }
    if (room.dex?.gen) {
      return room.dex.gen;
    }
    // Use global Dex as fallback
    return window.Dex.gen;
  },

  extractFormatId: function (roomId) {
    // Extract format ID from room ID like "battle-gen9randombattle-2394686319"
    return roomId.match(/battle-([^-]+)-\d+/)?.[1] || null;
  },

  calculateBulkWithOptions: function(species, options = {}) {
    const gen = this.getGeneration();
    const calcGen = calc.Generations.get(gen);
    
    // Create defender Pokemon with specified options
    let defender;
    try {
      defender = this.createCalcPokemon(calcGen, species, options);
    } catch {
      this.log.error('Failed to create defender Pokemon', species);
      return;
    }
    
    // Set up field and status
    const fieldOptions = this.setupFieldAndStatus(defender, gen);
    const field = new calc.Field(fieldOptions);
    
    // Create a neutral attacker
    const attacker = new calc.Pokemon(calcGen, 'Mew', {
      level: 100,
      nature: 'Hardy',
    });
    
    // Use physical and special moves to trigger defense calculations
    const physicalMove = new calc.Move(calcGen, 'Struggle');
    const specialMove = new calc.Move(calcGen, 'Ice Beam');
    const physicalResult = calc.calculate(calcGen, attacker, defender, physicalMove, field);
    const specialResult = calc.calculate(calcGen, attacker, defender, specialMove, field);
    
    // Get base defense values
    const basePhysicalDefense = defender.stats.def;
    const baseSpecialDefense = defender.stats.spd;
    const hp = defender.maxHP();
    
    // Create components for physical bulk
    const physicalComponents = [];
    physicalComponents.push({
      id: 'hp',
      value: hp
    });
    physicalComponents.push({
      id: 'defenseStat',
      value: basePhysicalDefense,
      statName: 'def'
    });
    
    // Apply stat stages for physical defense
    if (physicalResult.rawDesc.defenseBoost) {
      physicalComponents.push({
        id: 'statStage',
        stage: physicalResult.rawDesc.defenseBoost,
        value: physicalResult.rawDesc.defenseBoost > 0 
          ? (2 + physicalResult.rawDesc.defenseBoost) / 2
          : 2 / (2 - physicalResult.rawDesc.defenseBoost),
        stat: 'def',
      });
    }
    
    // Apply physical defense modifiers
    if (physicalResult.defenseModifiers && physicalResult.defenseModifiers.length > 0) {
      physicalResult.defenseModifiers.forEach(modifier => {
        physicalComponents.push({
          id: 'modifier',
          value: modifier.mod / 4096,
          type: modifier.type,
          reasons: modifier.reasons,
        });
      });
    }
    
    // Create components for special bulk
    const specialComponents = [];
    specialComponents.push({
      id: 'hp',
      value: hp
    });
    specialComponents.push({
      id: 'defenseStat',
      value: baseSpecialDefense,
      statName: 'spd'
    });
    
    // Apply stat stages for special defense
    if (specialResult.rawDesc.defenseBoost) {
      specialComponents.push({
        id: 'statStage',
        stage: specialResult.rawDesc.defenseBoost,
        value: specialResult.rawDesc.defenseBoost > 0 
          ? (2 + specialResult.rawDesc.defenseBoost) / 2
          : 2 / (2 - specialResult.rawDesc.defenseBoost),
        stat: 'spd',
      });
    }
    
    // Apply special defense modifiers
    if (specialResult.defenseModifiers && specialResult.defenseModifiers.length > 0) {
      specialResult.defenseModifiers.forEach(modifier => {
        specialComponents.push({
          id: 'modifier',
          value: modifier.mod / 4096,
          type: modifier.type,
          reasons: modifier.reasons,
        });
      });
    }
    
    // Special cases
    if (defender.hasAbility('Tablets of Ruin')) {
      physicalComponents.push({
        id: 'modifier',
        value: 1 / 0.75,
        reasons: { defenderAbility: "Tablets of Ruin" }
      });
    }
    if (defender.hasAbility('Vessel of Ruin')) {
      specialComponents.push({
        id: 'modifier',
        value: 1 / 0.75,
        reasons: { defenderAbility: "Vessel of Ruin" }
      });
    }
    if (defender.hasAbility('Ice Scales')) {
      specialComponents.push({
        id: 'modifier',
        value: 2,
        reasons: { defenderAbility: "Ice Scales" }
      });
    }
    
    // Calculate final values
    const physicalBulk = physicalComponents.reduce((acc, comp) => acc * comp.value, 1);
    const specialBulk = specialComponents.reduce((acc, comp) => acc * comp.value, 1);
    
    return {
      physical: {
        value: this.formatValue(physicalBulk),
        hp: hp,
        def: basePhysicalDefense,
        components: physicalComponents
      },
      special: {
        value: this.formatValue(specialBulk),
        hp: hp,
        spd: baseSpecialDefense,
        components: specialComponents
      },
    };
  },

  calculateBulkRange: function (species, _dex, formatId, level = null) {
    if (!formatId) return null;

    // Determine level to use
    const pokemonLevel = level || 100;

    // Calculate minimum bulk (0 EVs, neutral nature)
    const minBulk = this.calculateBulkWithOptions(species, {
      level: pokemonLevel,
      evs: { hp: 0, def: 0, spd: 0 },
      nature: 'Hardy',
    });
    
    // Calculate maximum physical bulk (252 HP, 252+ Def)
    const maxPhysBulk = this.calculateBulkWithOptions(species, {
      level: pokemonLevel,
      evs: { hp: 252, def: 252 },
      nature: 'Bold', // +Def nature
    });
    
    // Calculate maximum special bulk (252 HP, 252+ SpD)
    const maxSpecBulk = this.calculateBulkWithOptions(species, {
      level: pokemonLevel,
      evs: { hp: 252, spd: 252 },
      nature: 'Calm', // +SpD nature
    });
    
    return {
      physical: {
        min: minBulk.physical.value,
        max: maxPhysBulk.physical.value,
        minHp: minBulk.physical.hp,
        minDef: minBulk.physical.def,
        maxHp: maxPhysBulk.physical.hp,
        maxDef: maxPhysBulk.physical.def
      },
      special: {
        min: minBulk.special.value,
        max: maxSpecBulk.special.value,
        minHp: minBulk.special.hp,
        minSpd: minBulk.special.spd,
        maxHp: maxSpecBulk.special.hp,
        maxSpd: maxSpecBulk.special.spd
      },
      level: pokemonLevel
    };
  },

  initTooltip: function () {
    if (document.getElementById("mantis-tooltip")) return;

    const tooltip = document.createElement("div");
    tooltip.id = "mantis-tooltip";
    document.body.appendChild(tooltip);

    window.GuzztoolMantis = {
      showTooltip: this.showTooltip.bind(this),
      hideTooltip: this.hideTooltip.bind(this),
    };

    // Add global mouse move listener to hide tooltip when mouse leaves the element, even if the element is destroyed
    document.addEventListener("mousemove", (event) => {
      const tooltipElement = document.getElementById("mantis-tooltip");
      if (tooltipElement && tooltipElement.style.display !== "none") {
        const target = event.target;
        const isOverTooltipElement = target.closest("[data-bulk-type]") || target.closest(".mantis-power-display");
        if (!isOverTooltipElement) {
          this.hideTooltip();
        }
      }
    });
  },

  // Common tooltip helper method
  createTooltipHTML: function({ title, content, example, additionalHtml = '' }) {
    return `
      <img src="${this.iconUrl}" class="mantis-tooltip-icon">
      <h4 class="mantis-tooltip-title">${title}</h4>
      <p class="mantis-tooltip-content">${content}</p>
      <p class="mantis-tooltip-example">${example}</p>
      ${additionalHtml}
    `;
  },

  // The calc doesn't know about cosmetic-only formes like Alcremie-Rainbow-Swirl,
  // But does need to know about formes like Palafin-Hero.
  // There's no easy way to tell them apart, so we just try the forme first and then
  // the baseSpecies if it fails.
  createCalcPokemon: function(calcGen, species, options = {}) {
    try {
      return new calc.Pokemon(calcGen, species.id, options);
    } catch {
      try {
        return new calc.Pokemon(calcGen, species.baseSpecies, options);
      } catch {
        return new calc.Pokemon(calcGen, species.otherFormes[0], options); // Aegislash for some reason

        // Can still fail for e.g. CAP, which will just error
      }
    }
  },

  formatComponent: function(component) {
    if (component.id === 'hp') {
      return `${component.value} HP`;
    } else if (component.id === 'attackStat' || component.id === 'defenseStat') {
      const statName = statNameMap[component.statName];
      return `${component.value} ${statName}`;
    } else if (component.id === 'basePower') {
      const basePowerText = component.descBasePower && component.descBasePower !== component.basePower
        ? `${component.descBasePower}<sup>†</sup> BP`
        : `${component.basePower} BP`;
      return basePowerText;
    } else if (component.id === 'multihit') {
      return `${component.value} hits`;
    } else if (component.id === 'stabMultiplier') {
      return `${component.value} (${component.text})`;
    } else if (component.id === 'statStage') {
      return `${component.value} (${component.stage > 0 ? '+' : ''}${component.stage} ${statNameMap[component.stat]})`;
    } else if (component.id === 'modifier') {
      let text = `${Math.round(component.value * 100) / 100}`;
      if (!component.reasons || Object.keys(component.reasons).length === 0) return text;

      text += " (" + Object.entries(component.reasons).map(([key, value]) => { 
        if (key === "isCritical") return "Crit";
        if (key === "terrain") return `${value} Terrain`;
        if (key === "weather") return `${value} Weather`;
        return value;
      }).join(" + ") + ")";
      return text;
    } else if (component.id === 'rollMultiplier') {
      return component.text;
    }
  },

  // Helper to create field options and set status based on abilities/items
  setupFieldAndStatus: function(pokemon, gen) {
    const fieldOptions = {};
    
    // Check for weather-setting or terrain-setting abilities
    switch (pokemon.ability) {
      // Weather
      case 'Drizzle':
        fieldOptions.weather = 'Rain';
        break;
      case 'Drought':
        fieldOptions.weather = 'Sun';
        break;
      case 'Sand Stream':
        fieldOptions.weather = 'Sand';
        break;
      case 'Snow Warning':
        fieldOptions.weather = gen >= 9 ? 'Snow' : 'Hail';
        break;
      case 'Primordial Sea':
        fieldOptions.weather = 'Heavy Rain';
        break;
      case 'Desolate Land':
        fieldOptions.weather = 'Harsh Sunshine';
        break;
      case 'Orichalcum Pulse':
        fieldOptions.weather = 'Sun';
        break;
      
      // Terrain
      case 'Electric Surge':
        fieldOptions.terrain = 'Electric';
        break;
      case 'Grassy Surge':
        fieldOptions.terrain = 'Grassy';
        break;
      case 'Misty Surge':
        fieldOptions.terrain = 'Misty';
        break;
      case 'Psychic Surge':
        fieldOptions.terrain = 'Psychic';
        break;
      case 'Hadron Engine':
        fieldOptions.terrain = 'Electric';
        break;
    }

    // Set status based on item
    switch (pokemon.item) {
      case "Flame Orb":
        pokemon.status = "brn";
        break;
      case "Toxic Orb":
        pokemon.status = "tox";
        break;
    }
    
    return fieldOptions;
  },

  getBulkTooltipHTML: function (type, bulkData) {
    const bulkValue = parseFloat(bulkData.value);
    const powerValue = 4.0;
    const percent = Math.round((powerValue / bulkValue) * 100);
    const color = type === "Physical" ? this.options?.physical_color : this.options?.special_color;
    const rollType = this.options?.max_roll ? "max roll" : "min roll";
    const powerSuffix = this.options?.max_roll ? MAX_ROLL_SUFFIX : "";
    const exampleText = `e.g. <span style="color: ${color}">${powerValue.toFixed(1)}${powerSuffix}</span> power vs. <span style="color: ${color}">${bulkData.value}</span> bulk → ${percent}% ${rollType}`;
    
    // Create a calculation string with all modifiers
    const calculationString = bulkData.components.map(component => this.formatComponent(component)).join(' * ') + " / 10000";
    
    let noteHtml = "";
    if (bulkData.note) {
      noteHtml = `<p class="mantis-tooltip-note">Assuming ${bulkData.note}</p>`;
    }
    
    return this.createTooltipHTML({
      title: `${type} Bulk`,
      content: `${calculationString} ≈ ${bulkData.value}`,
      example: exampleText,
      additionalHtml: noteHtml
    });
  },

  getPowerTooltipHTML: function (type, powerData) {
    const typeDisplay = type === "Physical" ? "Physical" : "Special";

    if (powerData.value === "?") {
      return this.createTooltipHTML({
        title: `${typeDisplay} Power`,
        content: "Variable Power",
        example: ""
      });
    }

    const suffix = this.options?.max_roll ? MAX_ROLL_SUFFIX : "";
    const minRollExplanation = this.options?.max_roll
      ? `<p class="mantis-tooltip-explanation">"${MAX_ROLL_SUFFIX}" means this power represents the max roll.</p>`
      : "";
    
    // Create a calculation string with all modifiers
    const calculationString = powerData.components.map(component => this.formatComponent(component)).join(' * ') + " / 10000";
    
    const powerValue = Math.round(powerData.value * 10) / 10;
    const percent = Math.round((powerValue / 10.0) * 100);
    const color = powerData.category === "Physical" ? this.options?.physical_color : this.options?.special_color;
    const exampleText = `e.g. <span style="color: ${color}">${powerData.value}${suffix}</span> power vs. <span style="color: ${color}">10.0</span> bulk → ${percent}%`;
    
    return this.createTooltipHTML({
      title: `${typeDisplay} Power`,
      content: `${calculationString} ≈ ${powerData.value}${suffix}`,
      example: exampleText,
      additionalHtml: minRollExplanation
    });
  },

  showTooltip: function (event, type, dataId) {
    const data = this.tooltipData[dataId];
    if (!data) return;

    const tooltip = document.getElementById("mantis-tooltip");
    let html = "";

    if (["physical-bulk", "physical-bulk-min", "physical-bulk-max"].includes(type)) {
      html = this.getBulkTooltipHTML("Physical", data);
    } else if (["special-bulk", "special-bulk-min", "special-bulk-max"].includes(type)) {
      html = this.getBulkTooltipHTML("Special", data);
    } else if (type === "physical-power") {
      html = this.getPowerTooltipHTML("Physical", data);
    } else if (type === "special-power") {
      html = this.getPowerTooltipHTML("Special", data);
    }

    tooltip.innerHTML = html;
    tooltip.style.left = `${event.pageX + 15}px`;
    tooltip.style.top = `${event.pageY + 15}px`;
    tooltip.style.display = "block";
  },

  hideTooltip: function () {
    const tooltip = document.getElementById("mantis-tooltip");
    tooltip.style.display = "none";
  },

  generateDataId: function () {
    return "mantis_" + Math.random().toString(36).substring(2, 11);
  },

  initTeambuilder: function (room) {
    // Proxy functions that update the UI
    const functionsToProxy = [
      "updateStatForm",
      "updateStatGraph",
      "chartSet",
      "updateTeamView",
      "updateSetView",
    ];

    functionsToProxy.forEach((funcName) => {
      const proxy = new FunctionListenerProxy(
        room[funcName],
        (originalFn, ...args) => {
          const result = originalFn(...args);
          this.updateDisplays(room);
          return result;
        }
      );
      room[funcName] = proxy.proxy;
    });

    // Proxy for updateTeamView (team list view)
    const updateTeamViewProxy = new FunctionListenerProxy(
      room.updateTeamView,
      (originalFn, ...args) => {
        const result = originalFn(...args);
        this.updateTeamDisplays(room);
        return result;
      }
    );
    room.updateTeamView = updateTeamViewProxy.proxy;

    // Proxy for updateSetView (individual set view)
    const updateSetViewProxy = new FunctionListenerProxy(
      room.updateSetView,
      (originalFn, ...args) => {
        const result = originalFn(...args);
        this.updateDisplays(room);
        return result;
      }
    );
    room.updateSetView = updateSetViewProxy.proxy;

    // Proxy for BattleSearch.updateScroll to add power displays to move search and bulk displays to pokemon search
    const updateScrollProxy = new FunctionListenerProxy(
      BattleSearch.prototype.updateScroll,
      (originalFn, ...args) => {
        const result = originalFn(...args);
        if (room.curChartType === "move") {
          this.updateMoveSearchDisplays(room);
        } else if (room.curChartType === "pokemon") {
          this.updatePokemonSearchDisplays(room);
        }
        return result;
      }
    );
    BattleSearch.prototype.updateScroll = updateScrollProxy.proxy;

    // Proxy for BattleSearch.sort to add support for sorting by power values
    const sortProxy = new FunctionListenerProxy(
      BattleMoveSearch.prototype.sort,
      (originalFn, results, sortCol, reverseSort) => {
        // Handle power sorting
        if (sortCol === "mantispow") {
          this.log.debug("Sorting by mantis power");

          const sortOrder = reverseSort ? -1 : 1;
          return results.sort(([rowType1, id1], [rowType2, id2]) => {
            // For moves, calculate power based on current Pokemon set
            if (rowType1 === "move" && rowType2 === "move") {
              if (!room.curSet) return 0;

              const species = room.curTeam.dex.species.get(room.curSet.species);
              if (!species) return 0;

              const move1 = room.curTeam.dex.moves.get(id1);
              const move2 = room.curTeam.dex.moves.get(id2);

              if (!move1 || !move2) return 0;

              // Handle status moves (lowest priority)
              if (move1.category === "Status" && move2.category === "Status")
                return 0;
              if (move1.category === "Status") return sortOrder;
              if (move2.category === "Status") return -sortOrder;

              const powerData1 = this.calculatePowerValues(
                { pokemonSet: room.curSet },
                move1,
                species,
                room.curTeam.dex
              );
              const powerData2 = this.calculatePowerValues(
                { pokemonSet: room.curSet },
                move2,
                species,
                room.curTeam.dex
              );

              // Handle variable power moves (?) - middle priority
              const isVariable1 = !powerData1 || powerData1.value === "?";
              const isVariable2 = !powerData2 || powerData2.value === "?";

              if (isVariable1 && isVariable2) return 0;
              if (isVariable1) return sortOrder;
              if (isVariable2) return -sortOrder;

              // Handle regular power moves (highest priority)
              if (!powerData1) return sortOrder;
              if (!powerData2) return -sortOrder;

              const power1 = parseFloat(powerData1.value);
              const power2 = parseFloat(powerData2.value);

              // Handle NaN values (shouldn't happen but just in case)
              if (isNaN(power1) && isNaN(power2)) return 0;
              if (isNaN(power1)) return sortOrder;
              if (isNaN(power2)) return -sortOrder;

              return (power2 - power1) * sortOrder;
            }

            // For non-move rows, fall back to original sorting
            return 0;
          });
        }

        // Call original function for all other sort columns
        return originalFn(results, sortCol, reverseSort);
      }
    );
    BattleMoveSearch.prototype.sort = sortProxy.proxy;

    // Proxy for BattlePokemonSearch.sort to add support for sorting by bulk values
    const pokemonSortProxy = new FunctionListenerProxy(
      BattlePokemonSearch.prototype.sort,
      (originalFn, results, sortCol, reverseSort) => {
        // Shared cache for this sort call (single stat type per call)
        const bulkCache = {};
        // Helper to get (and cache) bulk value for a species id
        const getBulk = (speciesId, statType, cache = bulkCache) => {
          if (cache[speciesId] !== undefined) return cache[speciesId];
          const species = room.curTeam.dex.species.get(speciesId);
          if (!species) {
            cache[speciesId] = NaN;
            return NaN;
          }
          // Use the current set for all fields except species and ability if setting enabled, otherwise use default
          let baseSet;
          if (this.options?.use_base_set_in_search) {
            const curSet = room.curSet ? { ...room.curSet } : {};
            delete curSet.ability;
            baseSet = curSet;
          } else {
            baseSet = {};
          }
          const bulkData = this.calculateBulkValues(
            { pokemonSet: baseSet },
            species,
            room.curTeam.dex
          );
          if (!bulkData || !bulkData[statType]) {
            cache[speciesId] = NaN;
            return NaN;
          }
          const value = parseFloat(bulkData[statType].value);
          cache[speciesId] = value;
          return value;
        };
        // Physical bulk sorting
        if (sortCol === "mantispbulk") {
          this.log.debug("Sorting by mantis physical bulk");
          const sortOrder = reverseSort ? -1 : 1;
          return results.sort(([rowType1, id1], [rowType2, id2]) => {
            if (rowType1 === "pokemon" && rowType2 === "pokemon") {
              if (!room.curSet) return 0;
              const bulk1 = getBulk(id1, "physical");
              const bulk2 = getBulk(id2, "physical");
              if (isNaN(bulk1) && isNaN(bulk2)) return 0;
              if (isNaN(bulk1)) return sortOrder;
              if (isNaN(bulk2)) return -sortOrder;
              return (bulk2 - bulk1) * sortOrder;
            }
            return 0;
          });
        }
        // Special bulk sorting
        if (sortCol === "mantissbulk") {
          this.log.debug("Sorting by mantis special bulk");
          const sortOrder = reverseSort ? -1 : 1;
          return results.sort(([rowType1, id1], [rowType2, id2]) => {
            if (rowType1 === "pokemon" && rowType2 === "pokemon") {
              if (!room.curSet) return 0;
              const bulk1 = getBulk(id1, "special");
              const bulk2 = getBulk(id2, "special");
              if (isNaN(bulk1) && isNaN(bulk2)) return 0;
              if (isNaN(bulk1)) return sortOrder;
              if (isNaN(bulk2)) return -sortOrder;

              return (bulk2 - bulk1) * sortOrder;
            }
            return 0;
          });
        }

        // Call original function for all other sort columns
        return originalFn(results, sortCol, reverseSort);
      }
    );
    BattlePokemonSearch.prototype.sort = pokemonSortProxy.proxy;
  },

  initBattle: function (room) {
    // Proxy updateMoveControls to add power displays to move buttons
    const updateMoveControlsProxy = new FunctionListenerProxy(
      room.updateMoveControls,
      (originalFn, ...args) => {
        const result = originalFn(...args);
        this.updateBattleMoveDisplays(room);
        return result;
      }
    );
    room.updateMoveControls = updateMoveControlsProxy.proxy;

    // Proxy showTooltip to add power and bulk values to tooltips
    const showTooltipProxy = new FunctionListenerProxy(
      room.battle.scene.tooltips.showTooltip,
      (originalFn, ...args) => {
        const result = originalFn(...args);
        this.modifyTooltipContent(room);
        return result;
      }
    );
    room.battle.scene.tooltips.showTooltip = showTooltipProxy.proxy;
  },

  updateDisplays: function (room) {
    if (!room.curSet) return;

    this.addDisplaysToElement(
      room.el,
      room.curSet,
      room.curTeam.dex.species.get(room.curSet.species),
      room.curTeam.dex,
      false
    );
  },

  updateTeamDisplays: function (room) {
    if (!room.curSetList || !room.curSetList.length) return;

    room.curSetList.forEach((set, index) => {
      if (!set) return;

      const species = room.curTeam.dex.species.get(set.species);
      if (!species) return;

      // Find the specific Pokemon's container in the team view
      const pokemonContainer = room.el.querySelector(`li[value="${index}"]`);
      if (!pokemonContainer) return;

      this.addDisplaysToElement(
        pokemonContainer,
        set,
        species,
        room.curTeam.dex,
        true
      );
    });
  },

  updateMoveSearchDisplays: function (room) {
    if (!this.options?.show_power_in_search) return;
    if (!room.curSet) return;

    const species = room.curTeam.dex.species.get(room.curSet.species);
    if (!species) return;

    // Find all move entries in the search results
    const moveEntries = room.el.querySelectorAll(
      '.teambuilder-results .result a[data-entry^="move|"]'
    );

    // Add header for the new column if not present
    const headerRow = room.el.querySelector(".teambuilder-results .sortrow");
    if (headerRow && !headerRow.querySelector(".mantis-estpowercol")) {
      const powerHeader = headerRow.querySelector(".powersortcol");
      if (powerHeader) {
        const estHeader = document.createElement("button");
        estHeader.className = "sortcol mantis-estpowercol powersortcol";
        estHeader.setAttribute("data-sort", "mantispow");
        estHeader.innerHTML = "MPow";
        powerHeader.insertAdjacentElement("afterend", estHeader);
      }
    }

    moveEntries.forEach((entry) => {
      // Remove any existing power columns
      const existingDisplay = entry.querySelector(".mantis-estpowercol");
      if (existingDisplay) {
        existingDisplay.remove();
      }

      // Always insert a blank col for spacing
      const estCol = document.createElement("span");
      estCol.className = "col labelcol mantis-estpowercol";

      // Extract move name from data-entry attribute
      const dataEntry = entry.getAttribute("data-entry");
      if (!dataEntry) return;

      const moveName = dataEntry.split("|")[1];
      if (!moveName) return;

      const move = room.curTeam.dex.moves.get(moveName);

      if (move && move.category !== "Status") {
        const powerData = this.calculatePowerValues(
          { pokemonSet: room.curSet },
          move,
          species,
          room.curTeam.dex
        );
        if (powerData) {
          const powerDisplay = this.createPowerDisplayElement(powerData);
          powerDisplay.classList.add("move-search-power");

          // Add tooltip handlers
          const type =
            powerData.category === "Physical"
              ? "physical-power"
              : "special-power";
          this.addTooltipToElement(powerDisplay, type, powerData);

          const emElement = document.createElement("em");
          emElement.textContent = "MPow";
          estCol.appendChild(emElement);
          estCol.appendChild(document.createElement("br"));
          estCol.appendChild(powerDisplay);
        }
      }
      // Insert the column after .labelcol
      const labelCol = entry.querySelector(".labelcol");
      if (labelCol) {
        labelCol.insertAdjacentElement("afterend", estCol);
      }
    });
  },

  updatePokemonSearchDisplays: function (room) {
    if (!this.options?.show_bulk_in_search) return;

    // Find all pokemon entries in the search results
    const pokemonEntries = room.el.querySelectorAll(
      '.teambuilder-results .result a[data-entry^="pokemon|"]'
    );

    // Add headers for the new columns if not present
    const headerRow = room.el.querySelector(".teambuilder-results .sortrow");
    if (headerRow && !headerRow.querySelector(".mantis-pbulksortcol")) {
      const lastHeader = headerRow.querySelector(".sortcol:last-child");
      if (lastHeader) {
        // Add Physical Bulk header
        const pBulkHeader = document.createElement("button");
        pBulkHeader.className = "sortcol statsortcol mantis-pbulksortcol";
        pBulkHeader.setAttribute("data-sort", "mantispbulk");
        pBulkHeader.innerHTML = "PB";
        lastHeader.insertAdjacentElement("afterend", pBulkHeader);

        // Add Special Bulk header
        const sBulkHeader = document.createElement("button");
        sBulkHeader.className = "sortcol statsortcol mantis-sbulksortcol";
        sBulkHeader.setAttribute("data-sort", "mantissbulk");
        sBulkHeader.innerHTML = "SB";
        pBulkHeader.insertAdjacentElement("afterend", sBulkHeader);
      }
    }

    pokemonEntries.forEach((entry) => {
      // Remove any existing bulk columns
      entry.querySelector(".mantis-pbulkcol")?.remove();
      entry.querySelector(".mantis-sbulkcol")?.remove();

      // Extract species from data-entry attribute
      const species = room.curTeam.dex.species.get(
        entry.getAttribute("data-entry")?.split("|")[1]
      );

      // Use the current set for all fields except species and ability if setting enabled, otherwise use default
      let baseSet;
      if (this.options?.use_base_set_in_search) {
        const curSet = room.curSet ? { ...room.curSet } : {};
        delete curSet.ability;
        baseSet = curSet;
      } else {
        baseSet = {};
      }
      const bulkValues = this.calculateBulkValues(
        { pokemonSet: baseSet },
        species,
        room.curTeam.dex
      );

      // Create Physical Bulk column
      const pBulkCol = document.createElement("span");
      pBulkCol.className = "col bstcol mantis-pbulkcol";

      const pBulkDisplay = document.createElement("span");
      pBulkDisplay.textContent = bulkValues.physical.value;
      pBulkDisplay.style.color = this.options?.physical_color;
      pBulkDisplay.classList.add("pokemon-search-bulk");
      pBulkDisplay.dataset.bulkType = "Physical";

      // Add tooltip handlers for physical bulk
      this.addTooltipToElement(pBulkDisplay, "physical-bulk", bulkValues.physical);

      const pbEm = document.createElement("em");
      pbEm.textContent = "PB";
      pbEm.appendChild(document.createElement("br"));
      pbEm.appendChild(pBulkDisplay);
      pBulkCol.appendChild(pbEm);

      // Create Special Bulk column
      const sBulkCol = document.createElement("span");
      sBulkCol.className = "col bstcol mantis-sbulkcol";

      const sBulkDisplay = document.createElement("span");
      sBulkDisplay.textContent = bulkValues.special.value;
      sBulkDisplay.style.color = this.options?.special_color;
      sBulkDisplay.classList.add("pokemon-search-bulk");
      sBulkDisplay.dataset.bulkType = "Special";

      // Add tooltip handlers for special bulk
      this.addTooltipToElement(sBulkDisplay, "special-bulk", bulkValues.special);

      const sbEm = document.createElement("em");
      sbEm.textContent = "SB";
      sbEm.appendChild(document.createElement("br"));
      sbEm.appendChild(sBulkDisplay);
      sBulkCol.appendChild(sbEm);

      // Insert the columns after .bstcol
      const bstCol = entry.querySelector(".bstcol");
      if (bstCol) {
        bstCol.insertAdjacentElement("afterend", pBulkCol);
        pBulkCol.insertAdjacentElement("afterend", sBulkCol);
      }
    });
  },

  addDisplaysToElement: function (container, set, species, dex, isTeamList) {
    if (!species) return;

    if (this.options?.show_bulk) {
      this.addBulkDisplay(container, set, species, dex, isTeamList);
    }
    if (this.options?.show_power) {
      this.addPowerDisplays(container, set, species, dex, isTeamList);
    }
  },

  addBulkDisplay: function (container, set, species, dex, isTeamList) {
    const statsButton = container.querySelector("button.setstats");
    if (!statsButton) return;

    statsButton.classList.add("mantis-container");
    let existingBulk = statsButton.querySelector(".mantis-bulk-display");
    if (existingBulk) existingBulk.remove();

    const bulkValues = this.calculateBulkValues({ pokemonSet: set }, species, dex);
    const bulkElement = this.createBulkDisplayElement(bulkValues);
    bulkElement.classList.add("teambuilder-bulk");

    this.addTooltipHandlers(bulkElement, bulkValues, isTeamList);
    statsButton.prepend(bulkElement);
  },

  addPowerDisplays: function (container, set, species, dex, isTeamList) {
    const moveInputs = container.querySelectorAll(".setcol-moves .chartinput");

    moveInputs.forEach((input, index) => {
      const moveName = isTeamList ? set.moves[index] : input.value;
      if (!moveName) return;

      const move = dex.moves.get(moveName);
      if (!move) return;

      const powerData = this.calculatePowerValues({ pokemonSet: set }, move, species, dex);
      if (!powerData) return;

      this.addPowerDisplayToInput(input, powerData, index, isTeamList);
    });
  },

  addPowerDisplayToInput: function (input, powerData, index, isTeamList) {
    const parentCell = input.parentElement;
    if (!parentCell) return;

    let oldDisplay = parentCell.querySelector(".mantis-power-display");
    if (oldDisplay) oldDisplay.remove();

    parentCell.classList.add("mantis-container");
    const display = this.createPowerDisplayElement(powerData);

    // Add positioning classes
    display.classList.add("teambuilder-power");
    if (index === 0) {
      display.classList.add("first-move");
    }

    // Add tooltip handlers
    const type =
      powerData.category === "Physical" ? "physical-power" : "special-power";
    this.addTooltipToElement(display, type, powerData, isTeamList);

    parentCell.appendChild(display);
  },

  addTooltipHandlers: function (bulkElement, bulkValues, isTeamList) {
    const physBulkSpan = bulkElement.querySelector(
      '[data-bulk-type="Physical"]'
    );
    this.addTooltipToElement(physBulkSpan, "physical-bulk", bulkValues.physical, isTeamList);

    const specBulkSpan = bulkElement.querySelector(
      '[data-bulk-type="Special"]'
    );
    this.addTooltipToElement(specBulkSpan, "special-bulk", bulkValues.special, isTeamList);
  },

  createBulkDisplayElement: function (bulkValues) {
    const bulkDisplay = document.createElement("div");
    bulkDisplay.className = "mantis-bulk-display";

    const physBulk = document.createElement("span");
    physBulk.textContent = bulkValues.physical.value;
    physBulk.style.color = this.options?.physical_color;
    physBulk.dataset.bulkType = "Physical";

    const separator = document.createTextNode(" / ");

    const specBulk = document.createElement("span");
    specBulk.textContent = bulkValues.special.value;
    specBulk.style.color = this.options?.special_color;
    specBulk.dataset.bulkType = "Special";

    bulkDisplay.appendChild(physBulk);
    bulkDisplay.appendChild(separator);
    bulkDisplay.appendChild(specBulk);

    return bulkDisplay;
  },

  createBulkRangeDisplayElement: function (bulkRangeValues, species) {
    const bulkDisplay = document.createElement("div");
    bulkDisplay.className = "mantis-bulk-display mantis-bulk-range-display";
    bulkDisplay.style.fontStyle = "italic";

    const physBulkMin = document.createElement("span");
    physBulkMin.textContent = bulkRangeValues.physical.min;
    physBulkMin.style.color = this.options?.physical_color;
    physBulkMin.dataset.bulkType = "physical-min";

    const physBulkMax = document.createElement("span");
    physBulkMax.textContent = bulkRangeValues.physical.max;
    physBulkMax.style.color = this.options?.physical_color;
    physBulkMax.dataset.bulkType = "physical-max";

    const physSeparator = document.createTextNode("-");

    const separator = document.createTextNode(" / ");

    const specBulkMin = document.createElement("span");
    specBulkMin.textContent = bulkRangeValues.special.min;
    specBulkMin.style.color = this.options?.special_color;
    specBulkMin.dataset.bulkType = "special-min";

    const specBulkMax = document.createElement("span");
    specBulkMax.textContent = bulkRangeValues.special.max;
    specBulkMax.style.color = this.options?.special_color;
    specBulkMax.dataset.bulkType = "special-max";

    const specSeparator = document.createTextNode("-");

    [physBulkMin, physSeparator, physBulkMax, separator, specBulkMin, specSeparator, specBulkMax]
      .forEach(el => bulkDisplay.appendChild(el));

    // Get level if available
    const level = bulkRangeValues.level || 100;
    
    // Add tooltip handlers for min values
    const minBulkData = {
      physical: {
        value: bulkRangeValues.physical.min,
        hp: bulkRangeValues.physical.minHp,
        def: bulkRangeValues.physical.minDef,
        note: `0 HP / 0 Def Lv${level} ${species.name} (Base HP: ${species.baseStats.hp} / Base Def: ${species.baseStats.def})`
      },
      special: {
        value: bulkRangeValues.special.min,
        hp: bulkRangeValues.special.minHp,
        spd: bulkRangeValues.special.minSpd,
        note: `0 HP / 0 SpD Lv${level} ${species.name} (Base HP: ${species.baseStats.hp} / Base SpD: ${species.baseStats.spd})`
      }
    };
    this.addTooltipToElement(physBulkMin, "physical-bulk", minBulkData.physical, false);
    this.addTooltipToElement(specBulkMin, "special-bulk", minBulkData.special, false);

    // Add tooltip handlers for max values
    const maxBulkData = {
      physical: {
        value: bulkRangeValues.physical.max,
        hp: bulkRangeValues.physical.maxHp,
        def: bulkRangeValues.physical.maxDef,
        note: `252 HP / 252+ Def Lv${level} ${species.name} (Base HP: ${species.baseStats.hp} / Base Def: ${species.baseStats.def})`
      },
      special: {
        value: bulkRangeValues.special.max,
        hp: bulkRangeValues.special.maxHp,
        spd: bulkRangeValues.special.maxSpd,
        note: `252 HP / 252+ SpD Lv${level} ${species.name} (Base HP: ${species.baseStats.hp} / Base SpD: ${species.baseStats.spd})`
      }
    };
    this.addTooltipToElement(physBulkMax, "physical-bulk", maxBulkData.physical, false);
    this.addTooltipToElement(specBulkMax, "special-bulk", maxBulkData.special, false);

    return bulkDisplay;
  },

  createPowerDisplayElement: function (powerData) {
    const display = document.createElement("span");
    display.className = "mantis-power-display";

    // Add suffix for max-roll values, but not for "?"
    const suffix =
      this.options?.max_roll && powerData.value !== "?" ? MAX_ROLL_SUFFIX : "";
    display.textContent = powerData.value + suffix;
    display.style.color =
      powerData.category === "Physical" ? this.options?.physical_color : this.options?.special_color;

    return display;
  },

  calculateBulkValues: function ({ pokemonSet, serverPokemon, clientPokemon }, species, dex) {
    // Create defender Pokemon options
    const set = pokemonSet || {};
    const stats = this.getStats({ pokemonSet, serverPokemon, clientPokemon });
    if (!stats) return null;
    
    const defenderOptions = {
      level: set.level || serverPokemon?.level || clientPokemon?.level || 100,
      evs: set.evs || {},
      ivs: set.ivs || {},
      nature: set.nature || 'Hardy',
      ability: set.ability || serverPokemon?.ability || clientPokemon?.ability || '',
      item: set.item || serverPokemon?.item || clientPokemon?.item || '',
      boosts: serverPokemon?.boosts || clientPokemon?.boosts || {},
      curHP: serverPokemon?.hp || clientPokemon?.hp || stats.hp,
    };
    
    return this.calculateBulkWithOptions(species, defenderOptions);
  },

  calculatePowerValues: function ({ pokemonSet, serverPokemon, clientPokemon }, move, species, dex) {
    if (move.category === "Status" || move.id == "recharge") {
      return null;
    }

    const gen = this.getGeneration();
    const calcGen = calc.Generations.get(gen);
    
    // Create attacker Pokemon
    const set = pokemonSet || {};
    const stats = this.getStats({ pokemonSet, serverPokemon, clientPokemon });
    if (!stats) return null;
    
    const attackerOptions = {
      level: set.level || serverPokemon?.level || 100,
      evs: set.evs || {},
      ivs: set.ivs || {},
      nature: set.nature || 'Hardy',
      ability: set.ability || serverPokemon?.ability || clientPokemon?.ability || '',
      item: set.item || serverPokemon?.item || clientPokemon?.item || '',
      boosts: serverPokemon?.boosts || clientPokemon?.boosts || {},
      curHP: serverPokemon?.hp || clientPokemon?.hp || stats.hp,
    };
    
    const attacker = this.createCalcPokemon(calcGen, species, attackerOptions);
    
    // Create a neutral defender for power calculation
    const defender = new calc.Pokemon(calcGen, 'Mew', {
      level: 100,
      nature: 'Hardy',
      item: 'Poke Ball', // for Knock Off (we want to show boosted BP)
      overrides: {
        types: ['???'], // Typeless to avoid type interactions
        stats: {
          spe: 0,
        },
      }
    });
    
    // Create move
    const calcMove = new calc.Move(calcGen, move.name);
    
    // Set up field and status
    const fieldOptions = this.setupFieldAndStatus(attacker, gen);
    
    const field = new calc.Field(fieldOptions);
    
    // Run a calc to extract modifiers and other info
    const result = calc.calculate(calcGen, attacker, defender, calcMove, field);

    // Start gathering the components of the final power value
    const components = [];
    
    // Get the attacking stat used by the move (Atk, SpA, or Def for Body Press)
    let attackStat, attackStatName;
    if (result.move.overrideOffensiveStat) {
      attackStat = attacker.stats[result.move.overrideOffensiveStat];
      attackStatName = result.move.overrideOffensiveStat;
    } else if (result.move.category === "Physical") {
      attackStat = attacker.stats.atk;
      attackStatName = 'atk';
    } else {
      attackStat = attacker.stats.spa;
      attackStatName = 'spa';
    }
    components.push({
      id: 'attackStat',
      value: attackStat,
      statName: attackStatName,
    });

    // Add base power
    let basePower = result.move.bp;
    let descBasePower = result.rawDesc.moveBP;
    components.push({
      id: 'basePower',
      value: descBasePower ?? basePower,
      descBasePower: descBasePower,
      basePower: basePower,
    });

    // Add multihit if applicable
    let multihit;
    if (typeof move.multihit === 'number') {
      multihit = move.multihit;
    } else if (Array.isArray(move.multihit)) {
      if (attacker.ability === "Skill Link" || attacker.item === "Loaded Dice") {
        multihit = move.multihit[1];
      } else {
        // We can't handle unknown number of hits
        // So jank it to be variable BP
        basePower = 0;
      }
    }
    // For moves like Triple Axel, we get both a multihit and descBasePower, so we don't want to double count
    // This probably breaks Water Shuriken for Greninja-Ash in like Hackmons or something, but whatever
    if (multihit && !descBasePower) { 
      components.push({
        id: 'multihit',
        value: multihit,
      });
    }

    // Apply STAB
    const hasSTAB = attacker.types.includes(result.move.type);
    let stabMultiplier = 1.0;
    let stabText = "";
    if (attacker.hasAbility('Adaptability') && hasSTAB) {
      stabMultiplier = 2.0;
      stabText = "Adaptability STAB";
    } else if (hasSTAB || attacker.hasAbility('Protean') || attacker.hasAbility('Libero')) {
      stabMultiplier = 1.5;
      stabText = "STAB";
    }
    if (stabMultiplier !== 1.0) {
      components.push({
        id: 'stabMultiplier',
        value: stabMultiplier,
        text: stabText,
      });
    }

    // Apply stat stages
    if (result.rawDesc.attackBoost) {
      components.push({
        id: 'statStage',
        stage: result.rawDesc.attackBoost,
        value: result.rawDesc.attackBoost > 0 
          ? (2 + result.rawDesc.attackBoost) / 2
          : 2 / (2 - result.rawDesc.attackBoost),
        stat: attackStatName,
      });
    }

    // Apply burn
    if (result.rawDesc.isBurned) {
      components.push({
        id: 'modifier',
        value: 0.5,
        reasons: {
          isBurned: "Burned",
        },
      });
    }
    
    // Apply all modifiers from the calculation
    if (result.attackModifiers && result.attackModifiers.length > 0) {
      result.attackModifiers.forEach(modifier => {
        // Special case: some steps (e.g. Facade) both modify BP and set desc.moveBP
        // So instead of double-counting, we skip
        if (Object.keys(modifier.reasons).includes('moveBP')) {
          return;
        }
        components.push({
          id: 'modifier',
          value: modifier.mod / 4096,
          type: modifier.type,
          reasons: modifier.reasons,
        });
      });
    }

    // Special cases (which are handled in the defender's calc so we can't use the tracker)
    if (attacker.hasAbility('Sword of Ruin')) {
      components.push({
        id: 'modifier',
        value: 1 / 0.75, // Defender has 75% of its defense
        reasons: {
          attackerAbility: "Sword of Ruin",
        },
      });
    }
    if (attacker.hasAbility('Beads of Ruin')) {
      components.push({
        id: 'modifier',
        value: 1 / 0.75, // Defender has 75% of its defense
        reasons: {
          attackerAbility: "Beads of Ruin",
        },
      });
    }

    // Finally, add the roll multiplier
    components.push({
      id: 'rollMultiplier',
      value: this.getRollMultiplier(),
      text: `${this.getRollMultiplier()}`,
    });

    const finalPower = components.reduce((acc, component) => acc * component.value, 1);

    return {
      category: result.move.category,
      value: this.formatValue(finalPower, basePower, move.name),
      components: components,
    };
  },

  updateBattleMoveDisplays: function (room) {
    if (!this.options?.show_power) return;

    // Get the active Pokemon from the battle
    const battle = room.battle;
    if (!battle) return;

    // Get the current move request to see what moves are available
    if (!room.request) return;

    if (!room.request.active) return;

    const moveRequest = room.request.active[0];
    if (!moveRequest || !moveRequest.moves) return;

    // Get the active Pokemon from the request side data
    if (!room.request.side || !room.request.side.pokemon) return;

    const activePokemon = room.request.side.pokemon.find(
      (pokemon) => pokemon.active
    );
    if (!activePokemon) return;

    // Find all move buttons in the battle
    const moveButtons = room.$el.find(".movebutton");

    moveButtons.each((index, button) => {
      const $button = $(button);

      // Remove any existing power displays
      $button.find(".mantis-power-display").remove();

      // Get move data from the battle data structure
      if (index >= moveRequest.moves.length) return;

      const moveData = moveRequest.moves[index];
      if (!moveData || !moveData.move) return;

      const moveName = moveData.move;

      // Get move data from the battle's dex
      const move = battle.dex.moves.get(moveName);
      if (!move || move.category === "Status") return;

      // Get species data
      const species = battle.dex.species.get(
        activePokemon.speciesForme || activePokemon.name
      );
      if (!species) return;

      // Get the Pokemon from the battle scene for tooltip calculations
      const teamIndex = room.request.side.pokemon.indexOf(activePokemon);
      const pokemon =
        battle.nearSide.active[
          teamIndex + battle.pokemonControlled * Math.floor(battle.mySide.n / 2)
        ];
      if (!pokemon) return;

      // Calculate power using the actual base power
      const powerData = this.calculatePowerValues(
        { clientPokemon: pokemon, serverPokemon: activePokemon },
        move,
        species,
        battle.dex
      );
      if (!powerData) return;

      // Create and add power display
      const powerDisplay = this.createPowerDisplayElement(powerData);

      // Add positioning classes
      powerDisplay.classList.add("battle-power");

      // Add tooltip handlers for battle displays
      const type = powerData.category === "Physical" ? "physical-power" : "special-power";
      this.addTooltipToElement(powerDisplay, type, powerData);

      $button.addClass("mantis-container");
      $button.append(powerDisplay);
    });
  },

  modifyTooltipContent: function (room) {
    if (!this.options?.show_power && !this.options?.show_bulk) return;

    const tooltipWrapper = document.getElementById("tooltipwrapper");
    const tooltipBody = tooltipWrapper?.querySelector(".tooltipinner .tooltip");
    if (!tooltipBody) return;

    const args = document
      .querySelector("[data-tooltip]:hover")
      .dataset.tooltip.split("|");
    const type = args[0];
    let clientPokemon = null;
    let serverPokemon = null;
    const battle = room.battle;

    if (type === "switchpokemon") {
      // switchpokemon|POKEMON
      // serverPokemon definitely exists, clientPokemon maybe
      const pokemonIndex = parseInt(args[1], 10);
      serverPokemon = battle.myPokemon[pokemonIndex];
      
      // Try to get client Pokemon if available
      if (pokemonIndex < battle.mySide.active.length && pokemonIndex < battle.pokemonControlled) {
        clientPokemon = battle.mySide.active[pokemonIndex];
        if (clientPokemon && clientPokemon.side === battle.mySide.ally) {
          clientPokemon = null;
        }
      }
    } else if (type === "activepokemon") {
      // activepokemon|SIDE|ACTIVE
      // clientPokemon definitely exists, serverPokemon maybe
      const sideIndex = parseInt(args[1], 10);
      const side = battle.sides[+battle.viewpointSwitched ^ sideIndex];
      const activeIndex = parseInt(args[2], 10);
      let pokemonIndex = activeIndex;
      
      if (activeIndex >= 1 && battle.sides.length > 2) {
        pokemonIndex -= 1;
        const newSide = battle.sides[side.n + 2];
        clientPokemon = newSide.active[activeIndex];
      } else {
        clientPokemon = side.active[activeIndex];
      }
      
      // Get serverPokemon if it's our side
      if (side === battle.mySide && battle.myPokemon) {
        serverPokemon = battle.myPokemon[pokemonIndex];
      } else if (side === battle.mySide.ally && battle.myAllyPokemon) {
        serverPokemon = battle.myAllyPokemon[pokemonIndex];
      }
      // If it's the enemy, we don't have stats, so will use bulk ranges
    } else if (type === "pokemon") {
      // pokemon|SIDE|POKEMON
      // clientPokemon definitely exists, serverPokemon always ignored
      const sideIndex = parseInt(args[1], 10);
      const side = battle.sides[sideIndex];
      const pokemonIndex = parseInt(args[2], 10);
      clientPokemon = side.pokemon[pokemonIndex];
      
      // For pokemon tooltips from the team sidebar (on both sides), we don't have stats
      // Will use bulk ranges instead
    } else {
      return;
    }

    // Get species data from clientPokemon if available, otherwise from serverPokemon
    const speciesName = clientPokemon?.speciesForme || serverPokemon?.speciesForme;
    if (!speciesName) return;
    
    const species = battle.dex.species.get(speciesName);
    if (!species) return;

    // Add bulk display to top right of tooltip
    if (this.options?.show_bulk) {
      let bulkElement;
      
      // Try to calculate actual bulk values first
      const bulkValues = this.calculateBulkValues(
        { clientPokemon, serverPokemon },
        species,
        battle.dex
      );
      
      if (bulkValues) {
        bulkElement = this.createBulkDisplayElement(bulkValues);
        this.addTooltipHandlers(bulkElement, bulkValues, false);
      } else if (type === "pokemon" || type === "activepokemon") {
        // If we can't get actual stats, calculate bulk ranges for pokemon and activepokemon tooltips
        const formatId = this.extractFormatId(room.id);
        // Try to get the Pokemon's actual level
        const pokemonLevel = clientPokemon?.level || serverPokemon?.level || null;
        const bulkRangeValues = this.calculateBulkRange(species, battle.dex, formatId, pokemonLevel);
        
        if (bulkRangeValues) {
          bulkElement = this.createBulkRangeDisplayElement(bulkRangeValues, species);
        }
      }
      
      if (bulkElement) {
        bulkElement.classList.add("battle-bulk");
        tooltipBody.querySelector("h2").appendChild(bulkElement);
      }
    }

    // Add power values to moves
    if (this.options?.show_power) {
      const moveElements = tooltipBody.querySelectorAll("br");
      moveElements.forEach((br) => {
        const textNode = br.previousSibling;
        if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;

        const moveText = textNode.textContent.trim();
        if (!moveText.startsWith("• ")) return;

        const move = battle.dex.moves.get(moveText.substring(2));
        if (!move || move.category === "Status") return;

        const powerData = this.calculatePowerValues(
          { clientPokemon, serverPokemon },
          move,
          species,
          battle.dex
        );
        if (!powerData) return;

        const powerDisplay = this.createPowerDisplayElement(powerData);
        powerDisplay.textContent = ` (${powerDisplay.textContent})`;

        // Add tooltip handlers for battle tooltips
        const type = powerData.category === "Physical" ? "physical-power" : "special-power";
        this.addTooltipToElement(powerDisplay, type, powerData);

        br.parentNode.insertBefore(powerDisplay, br);
      });
    }
  },


  // Unified helper for formatting values with consistent decimal places
  formatValue: function (value, basePower = null, moveName = null) {
    // Handle variable power moves (basePower === 0)
    if (basePower === 0 && moveName !== "Fling") {
      return "?";
    }

    // Round to 1 decimal place and ensure consistent formatting
    const rounded = Math.round(value / 1000) / 10;
    return rounded.toFixed(1);
  },

  addTooltipToElement: function (element, type, data, isTeamList = false) {
    const dataId = this.generateDataId();
    this.tooltipData[dataId] = data;

    if (isTeamList) {
      element.setAttribute(
        "onmouseover",
        `event.stopPropagation(); window.GuzztoolMantis.showTooltip(event, '${type}', '${dataId}')`
      );
      element.setAttribute(
        "onmouseout",
        `event.stopPropagation(); window.GuzztoolMantis.hideTooltip()`
      );
    } else {
      element.onmouseover = (event) => {
        event.stopPropagation();
        window.GuzztoolMantis.showTooltip(event, type, dataId);
      };
      element.onmouseout = (event) => {
        event.stopPropagation();
        window.GuzztoolMantis.hideTooltip();
      };
    }
  },

  getStats: function ({ pokemonSet, serverPokemon, clientPokemon }) {
    // If we're in battle and the setting is enabled, use modified stats
    if (this.options?.show_modified_stats_in_battle && room.battle && serverPokemon) {
      const modifiedStats = room.battle.scene.tooltips.calculateModifiedStats(clientPokemon, serverPokemon);
      return {
        hp: serverPokemon.maxhp,
        atk: modifiedStats.atk,
        def: modifiedStats.def,
        spa: modifiedStats.spa,
        spd: modifiedStats.spd,
      };
    }
    
    // Use raw stats from available sources
    if (serverPokemon?.stats) {
      return {
        hp: serverPokemon.maxhp,
        atk: serverPokemon.stats.atk,
        def: serverPokemon.stats.def,
        spa: serverPokemon.stats.spa,
        spd: serverPokemon.stats.spd,
      };
    }
    
    if (clientPokemon?.stats) {
      return {
        hp: clientPokemon.maxhp,
        atk: clientPokemon.stats.atk,
        def: clientPokemon.stats.def,
        spa: clientPokemon.stats.spa,
        spd: clientPokemon.stats.spd,
      };
    }
    
    // In teambuilder, use room.getStat and the PokemonSet
    if (pokemonSet && room.getStat) {
      return {
        hp: room.getStat("hp", pokemonSet),
        atk: room.getStat("atk", pokemonSet),
        def: room.getStat("def", pokemonSet),
        spa: room.getStat("spa", pokemonSet),
        spd: room.getStat("spd", pokemonSet),
      };
    }
    
    return null;
  },
};

export default subtool;
