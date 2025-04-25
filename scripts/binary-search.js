import { exists } from "@std/fs";
import { dirname } from "@std/path";

import { Input } from "@cliffy/prompt";

import { mods } from "./_common/_exports.js";

// Mods that are always considered fine (won't be tested)
let ALWAYS_FINE_MODS = ["ExtraCredit"];

// Mods that are always considered problematic (will always be disabled)
const ALWAYS_DISABLED_MODS = [
	"Betmma Abilities",
	"Betmma Spells",
	"Mika's Mod Collection",
	"Reverie",
	"Pokermon",
	"Balatrobot",
	"Talisman",
	"balaum",
	"Perk-O-lating",
	"Familiar",
	"Gemstones",
	"Ceres",
	"Pampa Joker Pack",
	"Maximus",
	"D6 Jokers",
	"Ortalab",
	"Aikoyori's Shenanigans",
	"Balatro Jokers PLUS",
	"Faster Stakes Unlock",
	"no laughing matter",
	"Tetrapak",
	"Item Remover",
	"Fusion Jokers",
	"Balatro+",
	"Tesseract",
	"Drafting",
	"JankJonklersMod",
	"Mossed",
	"High Card Mod",
	"Emporium",
	"Seals On Everything",
	"JokerHub"
];

// Mods that are always considered fine (won't be tested)
const {
	errors: { NotFound },
	readTextFile,
	remove,
	writeTextFile
} = Deno;

const FINE_MODS_FILE = "fine_mods.json";

/**
 * Load fine mods from file
 *
 * @returns {Promise<Array<string>>} - A promise that resolves to an array of fine mod names.
 * @example
 * const fineMods = await loadFineMods();
 * console.log(fineMods);
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
 * await saveFineMods(new Set(["Mod1", "Mod2"]));
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
 * const cards = [1, 2, 3, 4, 5];
 * shuffleArray(cards);
 * // cards is now randomly reordered, e.g. [3, 1, 5, 2, 4]
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
 * @returns {Promise<void>} A promise that resolves when all files are written
 * @example
 * // Disable a list of mods by creating .lovelyignore files
 * await writeLovelyIgnore(modsToDisable);
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
 * @returns {Promise<void>} A promise that resolves when all files are removed
 * @example
 * // Enable a list of mods by removing their .lovelyignore files
 * await removeLovelyIgnore(modsToEnable);
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
 * // Check if a specific mod is disabled
 * const isDisabled = await isModDisabled(someMod);
 * console.log(isDisabled ? "Mod is disabled" : "Mod is enabled");
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
 * @returns {Promise<{enabledMods: Set<string>, fineMods: Set<string>}>} Sets of enabled and fine mod names
 * @example
 * // Initialize the enabled and fine mods sets
 * const { enabledMods, fineMods } = await initializeMods(allMods);
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
 * Display the current status of mods
 *
 * @param {typeof mods} allMods - Array of all mod objects
 * @param {Set<string>} enabledMods - Set of enabled mod names
 * @param {Set<string>} fineMods - Set of mod names confirmed to be fine
 * @returns {{disabledMods: Array<{name: string}>, enabledNonFineMods: Array<{name: string}>}} Lists of disabled and enabled non-fine mods
 * @example
 * // Show status and get lists of mods
 * const { disabledMods, enabledNonFineMods } = displayModStatus(allMods, enabledMods, fineMods);
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
 * Apply the current mod configuration by updating .lovelyignore files
 *
 * @param {typeof mods} allMods - Array of all mod objects
 * @param {Set<string>} enabledMods - Set of enabled mod names
 * @returns {Promise<void>} A promise that resolves when configuration is applied
 * @example
 * // Apply the current configuration to enable/disable mods
 * await applyModConfiguration(allMods, enabledMods);
 */
const applyModConfiguration = async (allMods, enabledMods) => {
	const modsToEnable = allMods.filter((mod) => enabledMods.has(mod.name));
	const modsToDisable = allMods.filter((mod) => !enabledMods.has(mod.name));

	await removeLovelyIgnore(modsToEnable);
	await writeLovelyIgnore(modsToDisable);
};

/**
 * Handle the user saying the game ran without problems
 *
 * @param {typeof mods} allMods - Array of all mod objects
 * @param {Set<string>} enabledMods - Set of enabled mod names
 * @param {Set<string>} fineMods - Set of mod names confirmed to be fine
 * @param {Array<{name: string}>} enabledNonFineMods - Array of enabled mods that aren't in fineMods
 * @param {Array<{name: string}>} disabledMods - Array of disabled mods
 * @returns {{enabledMods: Set<string>, fineMods: Set<string>}} - Updated sets
 * @example
 * // Handle the case when the game runs fine with the current mods
 * const updatedSets = handleGameRanFine(allMods, enabledMods, fineMods, enabledNonFineMods, disabledMods);
 * // Apply the updated sets and continue testing
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
 * Handle the user saying the game had problems
 *
 * @param {typeof mods} allMods - Array of all mod objects
 * @param {Set<string>} enabledMods - Set of enabled mod names
 * @param {Set<string>} fineMods - Set of mod names confirmed to be fine
 * @param {Array<{name: string}>} enabledNonFineMods - Array of enabled non-fine mods to consider disabling
 * @returns {{enabledMods: Set<string>, fineMods: Set<string>}} Updated sets with half of non-fine mods disabled
 * @example
 * // Process when user reports the game had issues with current mods
 * const updatedSets = handleGameHadProblems(allMods, enabledMods, fineMods, enabledNonFineMods);
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
 * Handle the user choosing to reset the search
 *
 * @param {typeof mods} allMods - Array of all mod objects
 * @returns {Promise<{enabledMods: Set<string>, fineMods: Set<string>}>} - Reset sets
 * @example
 * // Reset the search by disabling most mods and clearing fine mods list
 * const { enabledMods, fineMods } = await handleReset(allMods);
 * // Apply the reset configuration and continue testing
 */
const handleReset = async (allMods) => {
	console.info("Resetting - disabling mods and clearing fine mods list (except always-fine mods)");

	const fineMods = new Set(ALWAYS_FINE_MODS);
	const enabledMods = new Set(ALWAYS_FINE_MODS);

	// Disable all mods except always-fine mods
	const modsToDisable = allMods.filter(
		(mod) => !ALWAYS_FINE_MODS.includes(mod.name) || ALWAYS_DISABLED_MODS.includes(mod.name)
	);

	await writeLovelyIgnore(modsToDisable);

	// Make sure always-fine mods are enabled (and always-disabled mods stay disabled)
	const modsToEnable = allMods.filter(
		(mod) => ALWAYS_FINE_MODS.includes(mod.name) && !ALWAYS_DISABLED_MODS.includes(mod.name)
	);

	await removeLovelyIgnore(modsToEnable);

	return {
		enabledMods,
		fineMods
	};
};

/**
 * Check if we've found the problematic mod
 *
 * @param {Array<{name: string}>} enabledNonFineMods - List of active mods that need testing because they haven't been confirmed as problem-free
 * @param {Array<{name: string}>} disabledMods - Mods that are currently turned off and may need to be tested in future iterations
 * @returns {boolean} True if search is complete, false otherwise
 * @example
 * // Check if we've isolated the problematic mod
 * if (isSearchComplete(enabledNonFineMods, disabledMods)) {
 *   console.log("Search is complete!");
 *   return;
 * }
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
 * Handle user response and update mod sets accordingly
 *
 * @param {string} userResponse - User's response (y/n/r)
 * @param {typeof mods} allMods - Complete collection of mod objects available in the system
 * @param {Set<string>} enabledMods - Currently enabled mods
 * @param {Set<string>} fineMods - Collection of mod names that have been verified to not cause any problems
 * @param {Array<{name: string}>} enabledNonFineMods - Active mods that still need testing because they haven't been confirmed as working properly
 * @param {Array<{name: string}>} disabledMods - List of mods currently excluded from the game that may be re-enabled in subsequent testing iterations
 * @returns {Promise<{shouldContinue: boolean, updatedSets: {enabledMods: Set<string>, fineMods: Set<string>}}>} Object containing whether to continue and updated mod sets
 * @example
 * // Process user's response and get updated mod settings
 * const { shouldContinue, updatedSets } = await processUserResponse(
 *   userResponse, allMods, enabledMods, fineMods, enabledNonFineMods, disabledMods
 * );
 */
const processUserResponse = async (
	userResponse,
	allMods,
	enabledMods,
	fineMods,
	enabledNonFineMods,
	disabledMods
) => {
	let updatedSets;
	let shouldContinue = true;

	switch (userResponse.toLowerCase()) {
		case "n":
		case "no":
			updatedSets = handleGameHadProblems(
				allMods,
				enabledMods,
				fineMods,
				enabledNonFineMods
			);
			break;

		case "r":
			updatedSets = await handleReset(allMods);
			break;

		case "y":
		case "yes":
			updatedSets = handleGameRanFine(
				allMods,
				enabledMods,
				fineMods,
				enabledNonFineMods,
				disabledMods
			);
			break;

		default:
			console.info("Invalid response. Please answer 'y', 'n', or 'r'.");
			shouldContinue = false;
			updatedSets = {
				enabledMods,
				fineMods
			};
	}

	return {
		shouldContinue,
		updatedSets
	};
};

/**
 * Ensure correct mod state after updates
 *
 * @param {Set<string>} enabledMods - Set of enabled mod names
 * @returns {Set<string>} Updated set of enabled mod names with all rules enforced
 * @example
 * // Always enforce mod rules after updating the enabled mods set
 * enabledMods = enforceModRules(enabledMods);
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

/**
 * Simplified binary search to find problematic mods
 *
 * @example
 * // Run the binary search algorithm to find problematic mods
 * await binarySearchMods();
 */
const binarySearchMods = async () => {
	// Get all mods
	const allMods = [...mods];

	// Load fine mods from file
	const loadedFineMods = await loadFineMods();

	ALWAYS_FINE_MODS = [...new Set([...ALWAYS_FINE_MODS, ...loadedFineMods])];

	// Initialize enabled and fine mods
	let { enabledMods, fineMods } = await initializeMods(allMods);

	console.info("Starting binary search - detected current mod state...");

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

		// Get user response
		const userResponse = await Input.prompt({
			default: "y",
			message: "Did the game run fine? (y/n/r - reset)"
		});

		// Process the response
		const { shouldContinue, updatedSets } = await processUserResponse(
			userResponse,
			allMods,
			enabledMods,
			fineMods,
			enabledNonFineMods,
			disabledMods
		);

		if (!shouldContinue) {
			continue;
		}

		// Update our sets with the results
		({ enabledMods, fineMods } = updatedSets);

		// Enforce mod rules
		enabledMods = enforceModRules(enabledMods);
	}
};

await binarySearchMods();
