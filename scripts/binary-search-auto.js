/* eslint-disable max-statements -- ignore */
/* eslint-disable max-lines-per-function -- ignore */

import { exists } from "@std/fs";
import { dirname, join } from "@std/path";
import { mods } from "./_common/_exports.js";
import { spawn } from "node:child_process";
import { sleep } from "@radashi-org/radashi";

const {
	errors: { NotFound },
	makeTempFile,
	readTextFile,
	remove,
	writeTextFile,
	cwd
} = Deno;

// Configuration

const millisecondsInSecond = 1_000;
const secondsInMinute = 60;
const maximumRuntimeMinutes = 5;
// For smaller wait times
const tenSecondsInMilliseconds = 10 * millisecondsInSecond;
const twoSecondsInMilliseconds = 2 * millisecondsInSecond;

/**
 * 5 minutes per test run
 */
const maximumRuntimeMilliseconds = maximumRuntimeMinutes * secondsInMinute * millisecondsInSecond;

/**
 * How many rounds to test each configuration
 */
const testRoundsPerConfig = 3;

/**
 * Exit code that indicates a crash
 */
const crashExitCode = 42;

/**
 * Port for the bot to communicate with Balatro
 */
const defaultBotPort = 12_348;

/**
 * Default deck type for testing
 */
const deckType = "Blue Deck";

// Mods that are always considered fine (won't be tested)
let ALWAYS_FINE_MODS = ["Talisman", "ExtraCredit", "Balatrobot"];

// Mods that are always considered problematic (will always be disabled)
const ALWAYS_DISABLED_MODS = [
	"Betmma Abilities",
	"Betmma Spells",
	"Mika's Mod Collection",
	"Reverie",
	"Pokermon"
];

// File to store fine mods
const FINE_MODS_FILE = "fine_mods.json";

/**
 * Load fine mods from file
 *
 * @returns {Promise<Array<string>>} - List of mod names considered fine
 * @example
 */
const loadFineMods = async () => {
	try {
		const data = await readTextFile(FINE_MODS_FILE);

		return JSON.parse(data);
	}
	catch (error) {
		if (error instanceof NotFound) {
			return [];
		}
		console.error("Error loading fine mods:", error);

		return [];
	}
};

/**
 * Save fine mods to file
 *
 * @param {Set<string>} fineMods - Set of fine mod names
 * @returns {Promise<void>}
 * @example
 */
const saveFineMods = async (fineMods) => {
	try {
		await writeTextFile(FINE_MODS_FILE, JSON.stringify([...fineMods]));
	}
	catch (error) {
		console.error("Error saving fine mods:", error);
	}
};

/**
 * Shuffle an array in-place using Fisher-Yates algorithm
 *
 * @template T
 * @param {Array<T>} array - Array to shuffle
 * @returns {Array<T>} The same array, now shuffled
 * @example
 */
const shuffleArray = (array) => {
	for (let index = array.length - 1; index > 0; index--) {
		const randomIndex = Math.floor(Math.random() * (index + 1));

		[array[index], array[randomIndex]] = [array[randomIndex], array[index]];
	}

	return array;
};

/**
 * Helper function to write .lovelyignore file to disable mods
 *
 * @param {typeof mods} modList - Array of mod objects
 * @returns {Promise<void>}
 * @example
 */
const writeLovelyIgnore = async (modList) => {
	for (const mod of modList) {
		const modDirectory = dirname(mod.path);
		const filePath = `${modDirectory}/.lovelyignore`;

		await writeTextFile(filePath, "# Ignored by binary search");
	}
};

/**
 * Helper function to remove .lovelyignore file to enable mods
 *
 * @param {typeof mods} modList - Array of mod objects
 * @returns {Promise<void>}
 * @example
 */
const removeLovelyIgnore = async (modList) => {
	for (const mod of modList) {
		const modDirectory = dirname(mod.path);
		const filePath = `${modDirectory}/.lovelyignore`;

		try {
			await remove(filePath);
		}
		catch (error) {
			if (!(error instanceof NotFound)) {
				console.error(`Error removing ${filePath}:`, error);
			}
		}
	}
};

/**
 * Check if a mod is currently disabled by looking for .lovelyignore file
 *
 * @param {typeof mods[number]} mod - The mod object to check
 * @returns {Promise<boolean>} True if the mod is disabled, false otherwise
 * @example
 */
const isModDisabled = async (mod) => {
	const modDirectory = dirname(mod.path);
	const ignorePath = `${modDirectory}/.lovelyignore`;

	return await exists(ignorePath);
};

/**
 * Initialize the sets of enabled and fine mods
 *
 * @param {typeof mods} allMods - Array of all mod objects
 * @returns {Promise<{enabledMods: Set<string>, fineMods: Set<string>}>}
 * @example
 */
const initializeMods = async (allMods) => {
	// Initialize with always-fine mods
	const fineMods = new Set(ALWAYS_FINE_MODS);
	const enabledMods = new Set();

	// Check which mods are actually enabled when starting
	for (const mod of allMods) {
		// Only add to enabled if it's not disabled and not in the always-disabled list
		if ((!(await isModDisabled(mod)) || ALWAYS_FINE_MODS.includes(mod.name)) &&
			!ALWAYS_DISABLED_MODS.includes(mod.name)) {
			enabledMods.add(mod.name);
		}
	}

	// Force enable the always-fine mods
	for (const modName of ALWAYS_FINE_MODS) {
		enabledMods.add(modName);

		// Also remove any .lovelyignore files for always-fine mods
		const mod = allMods.find((currentMod) => currentMod.name === modName);

		if (mod) {
			await removeLovelyIgnore([mod]);
		}
	}

	// Force disable the always-disabled mods
	for (const modName of ALWAYS_DISABLED_MODS) {
		enabledMods.delete(modName);

		// Also add .lovelyignore files for always-disabled mods
		const mod = allMods.find((currentMod) => currentMod.name === modName);

		if (mod) {
			await writeLovelyIgnore([mod]);
		}
	}

	return {
		enabledMods,
		fineMods
	};
};

/**
 * Apply the current mod configuration by updating .lovelyignore files
 *
 * @param {typeof mods} allMods - Array of all mod objects
 * @param {Set<string>} enabledMods - Set of enabled mod names
 * @returns {Promise<void>}
 * @example
 */
const applyModConfiguration = async (allMods, enabledMods) => {
	const modsToEnable = allMods.filter((mod) => enabledMods.has(mod.name));
	const modsToDisable = allMods.filter((mod) => !enabledMods.has(mod.name));

	await removeLovelyIgnore(modsToEnable);
	await writeLovelyIgnore(modsToDisable);
};

/**
 * Display the current status of mods
 *
 * @param {typeof mods} allMods - Array of all mod objects
 * @param {Set<string>} enabledMods - Set of enabled mod names
 * @param {Set<string>} fineMods - Set of mod names confirmed to be fine
 * @returns {{disabledMods: Array<{name: string}>, enabledNonFineMods: Array<{name: string}>}}
 * @example
 */
const displayModStatus = (allMods, enabledMods, fineMods) => {
	// Get all enabled mods that aren't marked as "fine"
	const enabledNonFineMods = allMods.filter(
		(mod) => enabledMods.has(mod.name) && !fineMods.has(mod.name)
	);

	// Get all disabled mods (excluding always-disabled mods)
	const disabledMods = allMods.filter(
		(mod) => !enabledMods.has(mod.name) && !ALWAYS_DISABLED_MODS.includes(mod.name)
	);

	// Display mod status
	console.info("TESTING STATUS:");
	console.info(`- Fine mods (confirmed good): ${[...fineMods].join(", ") || "None"}`);
	console.info(
		`- Enabled mods that need testing: ${
			enabledNonFineMods.map((mod) => mod.name).join(", ") || "None"
		}`
	);
	console.info(
		`- Disabled mods: ${disabledMods.map((mod) => mod.name).join(", ") || "None"}`
	);

	if (ALWAYS_DISABLED_MODS.length > 0) {
		console.info(`- Always disabled mods: ${ALWAYS_DISABLED_MODS.join(", ")}`);
	}

	return {
		disabledMods,
		enabledNonFineMods
	};
};

/**
 * Handle the situation where the game ran fine (no crashes)
 *
 * @param {typeof mods} allMods - Array of all mod objects
 * @param {Set<string>} enabledMods - Set of enabled mod names
 * @param {Set<string>} fineMods - Set of mod names confirmed to be fine
 * @param {Array<{name: string}>} enabledNonFineMods - Array of enabled mods that aren't in fineMods
 * @param {Array<{name: string}>} disabledMods - Array of disabled mods
 * @returns {{enabledMods: Set<string>, fineMods: Set<string>}}
 * @example
 */
const handleGameRanFine = (allMods, enabledMods, fineMods, enabledNonFineMods, disabledMods) => {
	// Clone the sets to avoid modifying the originals
	const updatedFineMods = new Set(fineMods);
	const updatedEnabledMods = new Set(enabledMods);

	// 1. Mark all enabled non-fine mods as "fine"
	for (const mod of enabledNonFineMods) {
		updatedFineMods.add(mod.name);
	}

	// 2. Enable half of the disabled mods (if any) - now randomly selected
	if (disabledMods.length > 0) {
		const halfCount = Math.ceil(disabledMods.length / 2);
		const modsToEnable = shuffleArray([...disabledMods]).slice(0, halfCount);

		for (const mod of modsToEnable) {
			// Don't enable always-disabled mods
			if (!ALWAYS_DISABLED_MODS.includes(mod.name)) {
				updatedEnabledMods.add(mod.name);
			}
		}
	}

	// Save fine mods to file
	saveFineMods(updatedFineMods);

	return {
		enabledMods: updatedEnabledMods,
		fineMods: updatedFineMods
	};
};

/**
 * Handle the situation where the game had problems (crashed)
 *
 * @param {typeof mods} allMods - Array of all mod objects
 * @param {Set<string>} enabledMods - Set of enabled mod names
 * @param {Set<string>} fineMods - Set of mod names confirmed to be fine
 * @param {Array<{name: string}>} enabledNonFineMods - Array of enabled non-fine mods to consider disabling
 * @returns {{enabledMods: Set<string>, fineMods: Set<string>}}
 * @example
 */
const handleGameHadProblems = (allMods, enabledMods, fineMods, enabledNonFineMods) => {
	// Clone the sets to avoid modifying the originals
	const updatedEnabledMods = new Set(enabledMods);

	// Disable half of the enabled non-fine mods (except always-fine mods)
	if (enabledNonFineMods.length > 0) {
		const halfCount = Math.ceil(enabledNonFineMods.length / 2);
		const modsToDisable = shuffleArray([...enabledNonFineMods]).slice(0, halfCount);

		for (const mod of modsToDisable) {
			if (!ALWAYS_FINE_MODS.includes(mod.name)) {
				updatedEnabledMods.delete(mod.name);
			}
		}
	}

	return {
		enabledMods: updatedEnabledMods,
		fineMods: new Set(fineMods)
	};
};

/**
 * Check if we've found the problematic mod
 *
 * @param {Array<{name: string}>} enabledNonFineMods - List of active mods that need testing
 * @param {Array<{name: string}>} disabledMods - Mods that are currently turned off
 * @returns {boolean} True if search is complete, false otherwise
 * @example
 */
const isSearchComplete = (enabledNonFineMods, disabledMods) => {
	// If there's only 1 or 0 non-fine mod enabled, we've found our culprit
	if (enabledNonFineMods.length <= 1 && disabledMods.length === 0) {
		if (enabledNonFineMods.length === 1) {
			console.info(`\n✓ FOUND PROBLEMATIC MOD: ${enabledNonFineMods[0].name}`);
		}
		else {
			console.info("\n✓ No problematic mods identified.");
		}

		return true;
	}

	return false;
};

/**
 * Ensure correct mod state after updates
 *
 * @param {Set<string>} enabledMods - Set of enabled mod names
 * @returns {Set<string>} Updated set of enabled mod names with all rules enforced
 * @example
 */
const enforceModRules = (enabledMods) => {
	const updatedEnabledMods = new Set(enabledMods);

	// Always ensure the always-fine mods are in the enabled list
	// and always-disabled mods are not in the enabled list
	for (const modName of ALWAYS_FINE_MODS) {
		if (!ALWAYS_DISABLED_MODS.includes(modName)) {
			updatedEnabledMods.add(modName);
		}
	}

	for (const modName of ALWAYS_DISABLED_MODS) {
		updatedEnabledMods.delete(modName);
	}

	return updatedEnabledMods;
};

const modsFolderPath = join(cwd(), "Mods");
const balatrobotPath = join(modsFolderPath, "csc470-balatrobot");
const balatrobotConfigLuaPath = join(balatrobotPath, "config.lua");



/**
 * Run the crash test bot and wait for results
 * Uses the csc470-balatrobot Lua API to run random actions until crash
 *
 * @param {number} roundNumber - Current test round number
 * @returns {Promise<boolean>} True if the game crashed, false if it ran fine
 * @example
 */
const runCrashTest = async (roundNumber) => {
	console.info(`Starting crash test round ${roundNumber}...`);

	

	// Backup the original config file
	const originalConfig = await readTextFile(balatrobotConfigLuaPath);

	// Create a custom crash test config
	// Using a different port to avoid conflicts with any running bot
	const botPort = defaultBotPort;
	const crashTestConfig = `
		-- Crash Test Bot Configuration
		BALATRO_BOT_CONFIG = {
		    enabled = true,
		    port = '${botPort}',
		    dt = 10.0/60.0,
		    uncap_fps = true,
		    instant_move = true,
		    disable_vsync = true,
		    disable_card_eval_status_text = true,
		    frame_ratio = 50,
		    crash_test_mode = true, -- Enable crash testing mode
		}

		return BALATRO_BOT_CONFIG
	`;

	// Write our custom config to the file
	try {
		await writeTextFile(balatrobotConfigLuaPath, crashTestConfig);
		console.info("Updated Balatrobot config for crash testing");
	}
	catch (error) {
		console.error("Failed to update Balatrobot config:", error);
		// Restore original config on error
		try {
			await writeTextFile(balatrobotConfigLuaPath, originalConfig);
		}
		catch {
			// Ignore errors when restoring
		}

		return false;
	}

	// Create a temporary Lua script for controlling the bot
	const temporaryLuaFile = await makeTempFile({ suffix: ".lua" });
	const crashTestLuaScript = `
		-- Crash Test Lua Script
		local socket = require("socket")
		local host, port = "localhost", ${botPort}

		-- Connect to the Balatro bot API
		local client = socket.connect(host, port)
		if not client then
		    print("Failed to connect to Balatro bot API")
		    os.exit(1)
		end

		-- Helper function to send a command
		local function send_command(cmd, params)
		    local msg = {command = cmd, params = params or {}}
		    local json_msg = require("json").encode(msg)
		    client:send(json_msg .. "\\n")
		    local response = client:receive("*l")
		    return response and require("json").decode(response) or nil
		end

		-- Start a new game
		print("Starting new game with ${deckType}")
		send_command("start_game", {deck = "${deckType}", stake = 1})

		-- Take random actions until crash
		local action_count = 0
		local last_state = nil
		local actions = {"select_blind", "play_hand", "end_shop", "select_booster", 
		                "select_tarot", "select_planet", "stake_increase", "sell_joker",
		                "use_consumable"}

		while true do
		    action_count = action_count + 1
		    -- Get current game state
		    local state = send_command("get_state")
		    if not state then
		        print("Connection lost or game crashed!")
		        os.exit(${crashExitCode})
		    end
 
		    last_state = state
 
		    -- Take a random action based on the current state
		    local action = actions[math.random(#actions)]
		    print("Action #" .. action_count .. ": " .. action)
 
		    if action == "select_blind" then
		        send_command("select_blind")
		    elseif action == "play_hand" and state.hand and #state.hand > 0 then
		        -- Select random number of cards
		        local num_cards = math.min(math.random(1, 5), #state.hand)
		        local cards = {}
		        for i = 1, num_cards do
		            table.insert(cards, math.random(0, #state.hand - 1))
		        end
		        send_command("play_hand", {cards = cards})
		    elseif action == "end_shop" then
		        send_command("end_shop")
		    elseif action == "select_booster" then
		        if math.random() < 0.8 then
		            send_command("select_booster_pack")
		        else
		            send_command("skip_booster_pack")
		        end
		    elseif action == "select_tarot" and state.tarot_cards and #state.tarot_cards > 0 then
		        local card_idx = math.random(0, #state.tarot_cards - 1)
		        send_command("select_tarot_card", {card = card_idx})
		    elseif action == "select_planet" and state.planet_cards and #state.planet_cards > 0 then
		        local card_idx = math.random(0, #state.planet_cards - 1)
		        send_command("select_planet_card", {card = card_idx})
		    elseif action == "stake_increase" then
		        if math.random() < 0.6 then
		            send_command("stake_increase")
		        else
		            send_command("stake_stay")
		        end
		    elseif action == "sell_joker" and state.jokers and #state.jokers > 0 then
		        if math.random() < 0.1 then
		            local joker_idx = math.random(0, #state.jokers - 1)
		            send_command("sell_joker", {jokers = {joker_idx}})
		        else
		            send_command("sell_joker", {jokers = {}})
		        end
		    elseif action == "use_consumable" and state.consumables and #state.consumables > 0 then
		        if math.random() < 0.7 then
		            local consumable_idx = math.random(0, #state.consumables - 1)
		            send_command("use_consumable", {consumables = {consumable_idx}})
		        else
		            send_command("use_consumable", {consumables = {}})
		        end
		    end
 
		    -- Small delay to avoid overwhelming the game
		    socket.sleep(0.1)
		end
	`;

	// Write our Lua script
	await writeTextFile(temporaryLuaFile, crashTestLuaScript);

	// Start Balatro with our mod enabled
	console.info("Starting Balatro with crash test configuration...");

	// Use the specific launch script for macOS
	const balatroCommand = "'/Users/nnmrts/Library/Application Support/Steam/steamapps/common/Balatro/run_lovely_macos.sh'";

	// Start Balatro
	spawn(balatroCommand, []);

	// Wait a bit for Balatro to start
	console.info("Waiting for Balatro to launch...");
	await sleep(tenSecondsInMilliseconds);
	// Now run our Lua script using the Lua socket client
	console.info("Starting crash test Lua script...");
	const luaProcess = spawn("lua", [temporaryLuaFile]);

	// Process stdout/stderr directly without collecting
	luaProcess.stdout.on("data", (data) => {
		const text = new TextDecoder().decode(data);

		console.info(text.trim());
	});

	luaProcess.stderr.on("data", (data) => {
		const text = new TextDecoder().decode(data);

		console.error(text.trim());
	});

	const didCrash = await new Promise(

		/**
		 *
		 * @param resolve
		 * @example
		 */
		(resolve) => {
		// Handle completion
			luaProcess.on("exit", async (code) => {
				// Clean up the temporary file
				try {
					await remove(temporaryLuaFile);
				}
				catch (error) {
					console.warn("Failed to delete temporary Lua file:", error);
				}

				// Attempt to close Balatro (macOS specific)
				spawn("killall", ["Balatro"]);

				// Restore original config
				try {
					await writeTextFile(balatrobotConfigLuaPath, originalConfig);
					console.info("Restored original Balatrobot config");
				}
				catch (error) {
					console.warn("Failed to restore original config:", error);
				}

				// Process exit code
				const crashed = code === crashExitCode;

				console.info(crashed
					? `Round ${roundNumber}: CRASH DETECTED (exit code ${code})`
					: `Round ${roundNumber}: Completed without crashes (exit code ${code})`);

				resolve(crashed);
			});
		}
	);

	if (didCrash) {
		return true;
	}

	await sleep(maximumRuntimeMilliseconds);

	console.info(`Timeout reached after ${maximumRuntimeMilliseconds}ms - terminating bot`);
	luaProcess.kill();

	// Wait a bit before restoring config and killing Balatro

	await sleep(twoSecondsInMilliseconds);

	// Attempt to close Balatro (macOS specific)
	spawn("killall", ["Balatro"]);

	// Restore original config
	try {
		await writeTextFile(balatrobotConfigLuaPath, originalConfig);
	}
	catch {
		// Ignore errors when restoring
	}

	// No crash detected if we had to time out
	return false;
};

/**
 * Run multiple test rounds to verify if a mod configuration crashes
 *
 * @returns {Promise<boolean>} True if any test round crashed, false if all ran fine
 * @example
 */
const runTestRounds = async () => {
	for (let round = 1; round <= testRoundsPerConfig; round++) {
		const crashed = await runCrashTest(round);

		if (crashed) {
			// If we detect a crash in any round, return true
			console.info(`Crash detected in round ${round}/${testRoundsPerConfig}`);

			return true;
		}
		console.info(`Round ${round}/${testRoundsPerConfig} completed without crashes`);
	}

	// All rounds completed without crashes
	console.info(`All ${testRoundsPerConfig} rounds completed without crashes`);

	return false;
};

/**
 * Automated binary search to find problematic mods
 * This eliminates the need for user input by automating the crash testing
 *
 * @example
 */
const automatedBinarySearchMods = async () => {
	// Get all mods
	const allMods = [...mods];

	// Load fine mods from file
	const loadedFineMods = await loadFineMods();

	ALWAYS_FINE_MODS = [...new Set([...ALWAYS_FINE_MODS, ...loadedFineMods])];

	// Initialize enabled and fine mods
	let { enabledMods, fineMods } = await initializeMods(allMods);

	console.info("Starting automated binary search with crash testing...");

	while (true) {
		// Apply the current configuration
		await applyModConfiguration(allMods, enabledMods);

		// Display mod status and get categorized mod lists
		const { disabledMods, enabledNonFineMods } = displayModStatus(
			allMods,
			enabledMods,
			fineMods
		);

		// Check if search is complete
		if (isSearchComplete(enabledNonFineMods, disabledMods)) {
			return;
		}

		// Run crash test rounds
		console.info("Running crash test rounds...");
		const crashed = await runTestRounds();

		// Process results (similar to processing user response)
		let updatedSets;

		if (crashed) {
			console.info("Game crashed! Adjusting mod configuration...");
			updatedSets = handleGameHadProblems(
				allMods,
				enabledMods,
				fineMods,
				enabledNonFineMods
			);
		}
		else {
			console.info("Game ran fine! Marking mods as safe and enabling more mods...");
			updatedSets = handleGameRanFine(
				allMods,
				enabledMods,
				fineMods,
				enabledNonFineMods,
				disabledMods
			);
		}

		// Update our sets with the results
		({ enabledMods, fineMods } = updatedSets);

		// Enforce mod rules
		enabledMods = enforceModRules(enabledMods);

		// Show current progress
		console.info("\n--- BINARY SEARCH PROGRESS ---");
		console.info(`Fine mods: ${[...fineMods].length}`);
		console.info(`Enabled mods: ${[...enabledMods].length}`);

		// Get a safe copy of the fineMods to use in the filter function
		const fineModsCopy = new Set(fineMods);
		const remainingCount = allMods.filter(
			(mod) => !fineModsCopy.has(mod.name) && !ALWAYS_DISABLED_MODS.includes(mod.name)
		).length;

		console.info(`Remaining mods to test: ${remainingCount}`);
		console.info("-----------------------------\n");
	}
};

console.info("=== AUTOMATED CRASH TESTING FOR BALATRO MODS ===");
console.info(`Testing ${testRoundsPerConfig} rounds per configuration`);
console.info(`Maximum runtime per test: ${maximumRuntimeMilliseconds / millisecondsInSecond} seconds`);
console.info("");

// Start the automated binary search
await automatedBinarySearchMods();
