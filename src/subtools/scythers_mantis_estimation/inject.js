import { FunctionListenerProxy } from "@guzztool/util/ListenerProxy";

const MIN_ROLL_SUFFIX = "m";

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

  shouldShowPowerInSearch: function () {
    return this.options?.show_power_in_search !== false;
  },

  shouldShowBulkInSearch: function () {
    return this.options?.show_bulk_in_search !== false;
  },

  getRollMultiplier: function () {
    return this.options?.min_roll ? 0.714 : 0.84;
  },

  isMinRoll: function () {
    return this.options?.min_roll === true;
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
    const rollMultiplier = this.getRollMultiplier();
    const suffix = this.isMinRoll() ? MIN_ROLL_SUFFIX : "";
    const minRollExplanation = this.isMinRoll()
      ? `<p class="mantis-tooltip-explanation">"${MIN_ROLL_SUFFIX}" means this power represents the min roll.</p>`
      : "";
    return `
      <img src="${this.iconUrl}" class="mantis-tooltip-icon">
      <h4 class="mantis-tooltip-title">${typeDisplay} Power</h4>
      <p class="mantis-tooltip-content">(${powerData.attackStat} ${attackStatName} * ${powerData.basePower} BP${stabMultiplier}) * ${rollMultiplier} / 10000 ≈ ${powerData.value}${suffix}</p>
      ${minRollExplanation}
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

    // Proxy for BattleSearch.updateScroll to add power displays to move search and bulk displays to pokemon search
    const updateScrollProxy = new FunctionListenerProxy(
      BattleSearch.prototype.updateScroll,
      (originalFn, ...args) => {
        this.log.debug("BattleSearch.updateScroll called");
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

              const powerData1 = this.calculateMovePower(
                room.curSet,
                move1,
                species,
                room.curTeam.dex
              );
              const powerData2 = this.calculateMovePower(
                room.curSet,
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
        // Handle physical bulk sorting
        if (sortCol === "mantispbulk") {
          this.log.debug("Sorting by mantis physical bulk");
          const sortOrder = reverseSort ? -1 : 1;
          return results.sort(([rowType1, id1], [rowType2, id2]) => {
            if (rowType1 === "pokemon" && rowType2 === "pokemon") {
              if (!room.curSet) return 0;

              const species1 = room.curTeam.dex.species.get(id1);
              const species2 = room.curTeam.dex.species.get(id2);

              if (!species1 || !species2) return 0;

              // Create temporary sets for bulk calculation
              const tempSet1 = { species: id1, moves: [] };
              const tempSet2 = { species: id2, moves: [] };

              const bulkData1 = this.calculateBulkValues(
                tempSet1,
                species1,
                room.curTeam.dex
              );
              const bulkData2 = this.calculateBulkValues(
                tempSet2,
                species2,
                room.curTeam.dex
              );

              const bulk1 = parseFloat(bulkData1.physical.value);
              const bulk2 = parseFloat(bulkData2.physical.value);

              // Handle NaN values (shouldn't happen but just in case)
              if (isNaN(bulk1) && isNaN(bulk2)) return 0;
              if (isNaN(bulk1)) return sortOrder;
              if (isNaN(bulk2)) return -sortOrder;

              return (bulk2 - bulk1) * sortOrder;
            }
            return 0;
          });
        }

        // Handle special bulk sorting
        if (sortCol === "mantissbulk") {
          this.log.debug("Sorting by mantis special bulk");
          const sortOrder = reverseSort ? -1 : 1;
          return results.sort(([rowType1, id1], [rowType2, id2]) => {
            if (rowType1 === "pokemon" && rowType2 === "pokemon") {
              if (!room.curSet) return 0;

              const species1 = room.curTeam.dex.species.get(id1);
              const species2 = room.curTeam.dex.species.get(id2);

              if (!species1 || !species2) return 0;

              // Create temporary sets for bulk calculation
              const tempSet1 = { species: id1, moves: [] };
              const tempSet2 = { species: id2, moves: [] };

              const bulkData1 = this.calculateBulkValues(
                tempSet1,
                species1,
                room.curTeam.dex
              );
              const bulkData2 = this.calculateBulkValues(
                tempSet2,
                species2,
                room.curTeam.dex
              );

              const bulk1 = parseFloat(bulkData1.special.value);
              const bulk2 = parseFloat(bulkData2.special.value);

              // Handle NaN values (shouldn't happen but just in case)
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

  updateMoveSearchDisplays: function (room) {
    if (!this.shouldShowPowerInSearch()) return;
    if (!room.curSet) return;

    this.log.debug("Updating move search displays");

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
        const powerData = this.calculateMovePower(
          room.curSet,
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

          estCol.appendChild(document.createElement("em"));
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
    if (!this.shouldShowBulkInSearch()) return;

    this.log.debug("Updating pokemon search displays");

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

      const bulkValues = this.calculateBulkValues(
        {
          species: species.id,
          moves: [],
        },
        species,
        room.curTeam.dex
      );

      // Create Physical Bulk column
      const pBulkCol = document.createElement("span");
      pBulkCol.className = "col bstcol mantis-pbulkcol";

      const pBulkDisplay = document.createElement("span");
      pBulkDisplay.textContent = bulkValues.physical.value;
      pBulkDisplay.style.color = this.getColors().PHYSICAL;
      pBulkDisplay.classList.add("pokemon-search-bulk");

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
      sBulkDisplay.style.color = this.getColors().SPECIAL;
      sBulkDisplay.classList.add("pokemon-search-bulk");

      // Add tooltip handlers for special bulk
      this.addTooltipToElement(sBulkDisplay, "special-bulk", bulkValues.special);

      const sbEm = document.createElement("em");
      sbEm.textContent = "SB";
      sbEm.appendChild(document.createElement("br"));
      sbEm.appendChild(sBulkDisplay);
      sBulkCol.appendChild(sbEm);

      // Insert the columns after .bstcol
      const bstCol = entry.querySelector(".bstcol");
      bstCol.insertAdjacentElement("afterend", pBulkCol);
      pBulkCol.insertAdjacentElement("afterend", sBulkCol);
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
    this.addTooltipToElement(display, type, powerData, isTeamList);

    parentCell.appendChild(display);
  },

  addTooltipHandlers: function (bulkElement, bulkValues, isTeamList) {
    const physBulkSpan = bulkElement.querySelector(
      '[data-bulk-type="physical"]'
    );
    this.addTooltipToElement(physBulkSpan, "physical-bulk", bulkValues.physical, isTeamList);

    const specBulkSpan = bulkElement.querySelector(
      '[data-bulk-type="special"]'
    );
    this.addTooltipToElement(specBulkSpan, "special-bulk", bulkValues.special, isTeamList);
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

    // Add suffix for min-roll values, but not for "?"
    const suffix =
      this.isMinRoll() && powerData.value !== "?" ? MIN_ROLL_SUFFIX : "";
    display.textContent = powerData.value + suffix;
    display.style.color =
      powerData.category === "Physical" ? colors.PHYSICAL : colors.SPECIAL;

    return display;
  },

  calculateBulkValues: function (pokemon, species, dex) {
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
        } else if (item.id === "eviolite" && species.nfe) {
          def = Math.floor(def * 1.5);
          spd = Math.floor(spd * 1.5);
        }
      }
    }

    const physicalBulk = this.formatValue(hp * def);
    const specialBulk = this.formatValue(hp * spd);

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
    const rollMultiplier = this.getRollMultiplier();

    let powerData = {
      category: move.category,
      attackStat: attackStat,
      basePower: move.basePower,
      hasSTAB: hasSTAB,
    };

    let power = attackStat * move.basePower * rollMultiplier;
    if (hasSTAB) {
      power *= 1.5;
    }
    powerData.value = this.formatValue(power, move.basePower);

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
    const rollMultiplier = this.getRollMultiplier();

    let powerData = {
      category: move.category,
      attackStat: attackStat,
      basePower: actualBasePower,
      hasSTAB: hasSTAB,
    };

    let power = attackStat * actualBasePower * rollMultiplier;
    if (hasSTAB) {
      power *= 1.5;
    }
    powerData.value = this.formatValue(power, actualBasePower);

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
      const type = powerData.category === "Physical" ? "physical-power" : "special-power";
      this.addTooltipToElement(powerDisplay, type, powerData);

      $button.addClass("mantis-container");
      $button.append(powerDisplay);
    });
  },

  modifyTooltipContent: function (room) {
    if (!this.shouldShowPower() && !this.shouldShowBulk()) return;

    this.log.debug("Modifying Pokemon tooltip content");

    const tooltipWrapper = document.getElementById("tooltipwrapper");
    const args = document
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
        powerDisplay.textContent = ` (${powerDisplay.textContent})`;

        // Add tooltip handlers for battle tooltips
        const type = powerData.category === "Physical" ? "physical-power" : "special-power";
        this.addTooltipToElement(powerDisplay, type, powerData);

        br.parentNode.insertBefore(powerDisplay, br);
      });
    }
  },

  // Unified helper for formatting values with consistent decimal places
  formatValue: function (value, basePower = null) {
    // Handle variable power moves (basePower === 0)
    if (basePower === 0) {
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
};

export default subtool;
