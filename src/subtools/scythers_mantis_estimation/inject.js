import { FunctionListenerProxy } from "@guzztool/util/ListenerProxy";

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

  getColors: function () {
    return {
      PHYSICAL: this.options?.physical_color || "#d32f2f",
      SPECIAL: this.options?.special_color || "#1976d2",
    };
  },

  shouldShowBulk: function () {
    return this.options?.show_bulk !== false;
  },

  shouldShowPower: function () {
    return this.options?.show_power !== false;
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
  },

  getBulkTooltipHTML: function (type, bulkData) {
    const statName = type === "physical" ? "Def" : "SpD";
    const statValue = type === "physical" ? bulkData.def : bulkData.spd;
    return `
      <img src="${this.iconUrl}" class="mantis-tooltip-icon">
      <h4 class="mantis-tooltip-title">${
        type === "physical" ? "Physical" : "Special"
      } Bulk</h4>
      <p class="mantis-tooltip-content">(${
        bulkData.hp
      } HP * ${statValue} ${statName}) / 10000 ≈ ${bulkData.value}</p>
    `;
  },

  getPowerTooltipHTML: function (type, powerData) {
    const typeDisplay = type === "Physical" ? "Physical" : "Special";

    if (powerData.value === "?") {
      return `
        <img src="${this.iconUrl}" class="mantis-tooltip-icon">
        <h4 class="mantis-tooltip-title">${typeDisplay} Power</h4>
        <p class="mantis-tooltip-content">Variable Power</p>
      `;
    }

    const attackStatName = type === "Physical" ? "Atk" : "SpA";
    const stabMultiplier = powerData.hasSTAB ? " * 1.5" : "";
    return `
      <img src="${this.iconUrl}" class="mantis-tooltip-icon">
      <h4 class="mantis-tooltip-title">${typeDisplay} Power</h4>
      <p class="mantis-tooltip-content">(${powerData.attackStat} ${attackStatName} * ${powerData.basePower} BP${stabMultiplier}) * 0.714 / 10000 ≈ ${powerData.value}</p>
    `;
  },

  showTooltip: function (event, type, dataId) {
    const data = this.tooltipData[dataId];
    if (!data) return;

    const tooltip = document.getElementById("mantis-tooltip");
    let html = "";

    if (type === "physical-bulk") {
      html = this.getBulkTooltipHTML("physical", data);
    } else if (type === "special-bulk") {
      html = this.getBulkTooltipHTML("special", data);
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
    this.log.debug("Initializing Mantis Estimation for teambuilder");

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
          this.log.debug(`${funcName} called`);
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
        this.log.debug("updateTeamView called");
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
        this.log.debug("updateSetView called");
        const result = originalFn(...args);
        this.updateDisplays(room);
        return result;
      }
    );
    room.updateSetView = updateSetViewProxy.proxy;
  },

  initBattle: function (room) {
    this.log.debug("Initializing Mantis Estimation for battle");

    // Proxy updateMoveControls to add power displays to move buttons
    const updateMoveControlsProxy = new FunctionListenerProxy(
      room.updateMoveControls,
      (originalFn, ...args) => {
        this.log.debug("updateMoveControls called");
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

  addDisplaysToElement: function (container, set, species, dex, isTeamList) {
    if (!species) return;

    if (this.shouldShowBulk()) {
      this.addBulkDisplay(container, set, species, dex, isTeamList);
    }
    if (this.shouldShowPower()) {
      this.addPowerDisplays(container, set, species, dex, isTeamList);
    }
  },

  addBulkDisplay: function (container, set, species, dex, isTeamList) {
    const statsButton = container.querySelector("button.setstats");
    if (!statsButton) return;

    statsButton.classList.add("mantis-container");
    let existingBulk = statsButton.querySelector(".mantis-bulk-display");
    if (existingBulk) existingBulk.remove();

    const bulkValues = this.calculateBulkValues(set, species, dex);
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

      const powerData = this.calculateMovePower(set, move, species, dex);
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
    const powerDataId = this.generateDataId();
    this.tooltipData[powerDataId] = powerData;

    if (isTeamList) {
      display.setAttribute(
        "onmouseover",
        `event.stopPropagation(); window.GuzztoolMantis.showTooltip(event, '${type}', '${powerDataId}')`
      );
      display.setAttribute(
        "onmouseout",
        `event.stopPropagation(); window.GuzztoolMantis.hideTooltip()`
      );
    } else {
      display.onmouseover = (event) => {
        event.stopPropagation();
        window.GuzztoolMantis.showTooltip(event, type, powerDataId);
      };
      display.onmouseout = (event) => {
        event.stopPropagation();
        window.GuzztoolMantis.hideTooltip();
      };
    }

    parentCell.appendChild(display);
  },

  addTooltipHandlers: function (bulkElement, bulkValues, isTeamList) {
    const physBulkSpan = bulkElement.querySelector(
      '[data-bulk-type="physical"]'
    );
    const physDataId = this.generateDataId();
    this.tooltipData[physDataId] = bulkValues.physical;

    if (isTeamList) {
      physBulkSpan.setAttribute(
        "onmouseover",
        `event.stopPropagation(); window.GuzztoolMantis.showTooltip(event, 'physical-bulk', '${physDataId}')`
      );
      physBulkSpan.setAttribute(
        "onmouseout",
        `event.stopPropagation(); window.GuzztoolMantis.hideTooltip()`
      );
    } else {
      physBulkSpan.onmouseover = (event) => {
        event.stopPropagation();
        window.GuzztoolMantis.showTooltip(event, "physical-bulk", physDataId);
      };
      physBulkSpan.onmouseout = (event) => {
        event.stopPropagation();
        window.GuzztoolMantis.hideTooltip();
      };
    }

    const specBulkSpan = bulkElement.querySelector(
      '[data-bulk-type="special"]'
    );
    const specDataId = this.generateDataId();
    this.tooltipData[specDataId] = bulkValues.special;

    if (isTeamList) {
      specBulkSpan.setAttribute(
        "onmouseover",
        `event.stopPropagation(); window.GuzztoolMantis.showTooltip(event, 'special-bulk', '${specDataId}')`
      );
      specBulkSpan.setAttribute(
        "onmouseout",
        `event.stopPropagation(); window.GuzztoolMantis.hideTooltip()`
      );
    } else {
      specBulkSpan.onmouseover = (event) => {
        event.stopPropagation();
        window.GuzztoolMantis.showTooltip(event, "special-bulk", specDataId);
      };
      specBulkSpan.onmouseout = (event) => {
        event.stopPropagation();
        window.GuzztoolMantis.hideTooltip();
      };
    }
  },

  createBulkDisplayElement: function (bulkValues) {
    const colors = this.getColors();
    const bulkDisplay = document.createElement("div");
    bulkDisplay.className = "mantis-bulk-display";

    const physBulk = document.createElement("span");
    physBulk.textContent = `${bulkValues.physical.value}`;
    physBulk.style.color = colors.PHYSICAL;
    physBulk.dataset.bulkType = "physical";

    const separator = document.createTextNode(" / ");

    const specBulk = document.createElement("span");
    specBulk.textContent = `${bulkValues.special.value}`;
    specBulk.style.color = colors.SPECIAL;
    specBulk.dataset.bulkType = "special";

    bulkDisplay.appendChild(physBulk);
    bulkDisplay.appendChild(separator);
    bulkDisplay.appendChild(specBulk);

    return bulkDisplay;
  },

  createPowerDisplayElement: function (powerData) {
    const colors = this.getColors();
    const display = document.createElement("span");
    display.className = "mantis-power-display";
    display.textContent = powerData.value;
    display.style.color =
      powerData.category === "Physical" ? colors.PHYSICAL : colors.SPECIAL;

    return display;
  },

  calculateBulkValues: function (pokemon, species, dex) {
    this.log.debug(`Calculating bulk for ${pokemon.name || pokemon.species}`);

    // Get stats - use actual stats from Pokemon object in battle rooms
    let hp, def, spd;
    if (pokemon.stats) {
      // Battle room - use actual stats
      hp = pokemon.maxhp || pokemon.stats.hp;
      def = pokemon.stats.def;
      spd = pokemon.stats.spd;
    } else {
      // Teambuilder room - use room.getStat
      hp = room.getStat("hp", pokemon);
      def = room.getStat("def", pokemon);
      spd = room.getStat("spd", pokemon);
    }

    // Apply item effects
    if (pokemon.item) {
      const item = dex.items.get(pokemon.item);
      if (item) {
        if (item.id === "assaultvest") {
          spd = Math.floor(spd * 1.5);
          this.log.debug(`Assault Vest applied: SpD increased to ${spd}`);
        } else if (item.id === "eviolite" && species.nfe) {
          def = Math.floor(def * 1.5);
          spd = Math.floor(spd * 1.5);
          this.log.debug(
            `Eviolite applied to NFE Pokemon: Def increased to ${def}, SpD increased to ${spd}`
          );
        }
      }
    }

    this.log.debug(`Calculated stats - HP: ${hp}, Def: ${def}, SpD: ${spd}`);

    const physicalBulk = Math.round((hp * def) / 1000) / 10;
    const specialBulk = Math.round((hp * spd) / 1000) / 10;

    this.log.debug(
      `Bulk values - Physical: ${physicalBulk}, Special: ${specialBulk}`
    );

    return {
      physical: {
        value: physicalBulk,
        hp: hp,
        def: def,
      },
      special: {
        value: specialBulk,
        hp: hp,
        spd: spd,
      },
    };
  },

  calculateMovePower: function (pokemon, move, species, dex) {
    if (move.category === "Status") {
      return null;
    }

    const isPhysical = move.category === "Physical";

    // In battle rooms, use actual stats from the Pokemon object
    let attackStat;
    if (pokemon.stats) {
      // Battle room - use actual stats
      attackStat = pokemon.stats[isPhysical ? "atk" : "spa"];
    } else {
      // Teambuilder room - use room.getStat
      attackStat = room.getStat(isPhysical ? "atk" : "spa", pokemon);
    }

    const hasSTAB = species.types.includes(move.type);

    let powerData = {
      category: move.category,
      attackStat: attackStat,
      basePower: move.basePower,
      hasSTAB: hasSTAB,
    };

    if (move.basePower === 0) {
      powerData.value = "?";
    } else {
      let power = attackStat * move.basePower * 0.714;
      if (hasSTAB) {
        power *= 1.5;
      }
      powerData.value = Math.round(power / 1000) / 10;
    }

    return powerData;
  },

  calculateMovePowerWithBasePower: function (
    pokemon,
    move,
    species,
    actualBasePower
  ) {
    if (move.category === "Status") {
      return null;
    }

    const isPhysical = move.category === "Physical";

    // In battle rooms, use actual stats from the Pokemon object
    let attackStat;
    if (pokemon.stats) {
      // Battle room - use actual stats
      attackStat = pokemon.stats[isPhysical ? "atk" : "spa"];
    } else {
      // Teambuilder room - use room.getStat
      attackStat = room.getStat(isPhysical ? "atk" : "spa", pokemon);
    }

    const hasSTAB = species.types.includes(move.type);

    let powerData = {
      category: move.category,
      attackStat: attackStat,
      basePower: actualBasePower,
      hasSTAB: hasSTAB,
    };

    if (actualBasePower === 0) {
      powerData.value = "?";
    } else {
      let power = attackStat * actualBasePower * 0.714;
      if (hasSTAB) {
        power *= 1.5;
      }
      powerData.value = Math.round(power / 1000) / 10;
    }

    return powerData;
  },

  updateBattleMoveDisplays: function (room) {
    if (!this.shouldShowPower()) return;

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

      // Use the battle's tooltip system to get the actual base power
      const tooltipText = battle.scene.tooltips.showMoveTooltip(
        move,
        "",
        pokemon,
        activePokemon
      );

      // Parse the tooltip text to extract base power
      const basePowerMatch = tooltipText.match(/Base power: (\d+)/);
      if (!basePowerMatch) return;

      const actualBasePower = parseInt(basePowerMatch[1]);

      // Calculate power using the actual base power
      const powerData = this.calculateMovePowerWithBasePower(
        activePokemon,
        move,
        species,
        actualBasePower
      );
      if (!powerData) return;

      // Create and add power display
      const powerDisplay = this.createPowerDisplayElement(powerData);

      // Add positioning classes
      powerDisplay.classList.add("battle-power");

      // Add tooltip handlers for battle displays
      const powerDataId = this.generateDataId();
      this.tooltipData[powerDataId] = powerData;

      powerDisplay.onmouseover = (event) => {
        event.stopPropagation();
        window.GuzztoolMantis.showTooltip(
          event,
          powerData.category === "Physical"
            ? "physical-power"
            : "special-power",
          powerDataId
        );
      };
      powerDisplay.onmouseout = (event) => {
        event.stopPropagation();
        window.GuzztoolMantis.hideTooltip();
      };

      $button.addClass("mantis-container");
      $button.append(powerDisplay);
    });
  },

  modifyTooltipContent: function (room) {
    if (!this.shouldShowPower() && !this.shouldShowBulk()) return;

    this.log.debug("Modifying Pokemon tooltip content");

    const tooltipWrapper = document.getElementById("tooltipwrapper");
    const args = tooltipWrapper
      .querySelector("[data-tooltip]:hover")
      .dataset.tooltip.split("|");
    const type = args[0];
    let serverPokemon = null;
    const battle = room.battle;

    if (type === "switchpokemon") {
      // switchpokemon|POKEMON
      const pokemonIndex = parseInt(args[1], 10);
      serverPokemon = battle.myPokemon[pokemonIndex];
    } else if (type === "activepokemon") {
      // activepokemon|SIDE|ACTIVE
      const sideIndex = parseInt(args[1], 10);
      const activeIndex = parseInt(args[2], 10);
      let pokemonIndex = activeIndex;

      if (activeIndex >= 1 && battle.sides.length > 2) {
        pokemonIndex -= 1;
      }

      const side = battle.sides[+battle.viewpointSwitched ^ sideIndex];
      if (side === battle.mySide && battle.myPokemon) {
        serverPokemon = battle.myPokemon[pokemonIndex];
      }
    } else if (type === "pokemon") {
      // pokemon|SIDE|POKEMON
      const sideIndex = parseInt(args[1], 10);
      const pokemonIndex = parseInt(args[2], 10);
      const side = battle.sides[sideIndex];

      if (side === battle.mySide && battle.myPokemon) {
        serverPokemon = battle.myPokemon[pokemonIndex];
      }
    } else {
      return;
    }

    this.log.debug(`Pokemon data for tooltip type: ${type}`, serverPokemon);

    // Get species data
    const species = battle.dex.species.get(serverPokemon.speciesForme);

    // Add bulk display to top right of tooltip
    if (this.shouldShowBulk()) {
      const bulkValues = this.calculateBulkValues(
        serverPokemon,
        species,
        battle.dex
      );
      const bulkElement = this.createBulkDisplayElement(bulkValues);
      bulkElement.classList.add("battle-bulk");

      this.addTooltipHandlers(bulkElement, bulkValues, false);

      tooltipWrapper
        .querySelector(".tooltipinner .tooltip")
        .appendChild(bulkElement);
    }

    // Add power values to moves
    if (this.shouldShowPower()) {
      const moveElements = tooltipWrapper.querySelectorAll(
        ".tooltipinner .tooltip br"
      );
      moveElements.forEach((br) => {
        const textNode = br.previousSibling;
        if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;

        const moveText = textNode.textContent.trim();
        if (!moveText.startsWith("• ")) return;

        const move = battle.dex.moves.get(moveText.substring(2));
        if (!move || move.category === "Status") return;

        const powerData = this.calculateMovePowerWithBasePower(
          serverPokemon,
          move,
          species,
          move.basePower
        );
        if (!powerData) return;

        const powerDisplay = this.createPowerDisplayElement(powerData);
        powerDisplay.textContent = ` (${powerData.value})`;

        // Add tooltip handlers for battle tooltips
        const powerDataId = this.generateDataId();
        this.tooltipData[powerDataId] = powerData;

        powerDisplay.onmouseover = (event) => {
          event.stopPropagation();
          this.showTooltip(
            event,
            powerData.category === "Physical"
              ? "physical-power"
              : "special-power",
            powerDataId
          );
        };
        powerDisplay.onmouseout = (event) => {
          event.stopPropagation();
          this.hideTooltip();
        };

        br.parentNode.insertBefore(powerDisplay, br);
      });
    }
  },
};

export default subtool;
