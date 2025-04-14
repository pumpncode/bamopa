import { exists } from "@std/fs";
import { dirname } from "@std/path";

import { Input } from "@cliffy/prompt";

import { mods } from "./_common/_exports.js";

// Mods that are always considered fine (won't be tested)
const ALWAYS_FINE_MODS = ["Talisman", "ExtraCredit"];

// Mods that are always considered problematic (will always be disabled)
const ALWAYS_DISABLED_MODS = [
	"Betmma Abilities",
	"Betmma Spells",
	"Mika's Mod Collection"
];

// Mods that are always considered fine (won't be tested)
const {
	errors: { NotFound },
	remove,
	writeTextFile
} = Deno;

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
		const index_ = Math.floor(Math.random() * (index + 1));

		[array[index], array[index_]] = [array[index_], array[index]];
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
		const modDir = dirname(mod.path);
		const filePath = `${modDir}/.lovelyignore`;

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
		const modDir = dirname(mod.path);
		const filePath = `${modDir}/.lovelyignore`;

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
 * @param mod
 * @example
 */
const isModDisabled = async (mod) => {
	const modDir = dirname(mod.path);
	const ignorePath = `${modDir}/.lovelyignore`;

	return await exists(ignorePath);
};

/**
 * Simplified binary search to find problematic mods
 *
 * @example
 */
const binarySearchMods = async () => {
	// Get all mods
	const allMods = [...mods];

	// Track which mods are known to be "fine" (not causing problems)
	/** @type {Set<string>} */

	/**
	 * Initialize with always-fine mods
	 */
	let fineMods = new Set(ALWAYS_FINE_MODS);

	// Initialize enabled mods based on current state (not .lovelyignore files)
	/** @type {Set<string>} */
	let enabledMods = new Set();

	// Check which mods are actually enabled when starting
	for (const mod of allMods) {
		if ((!(await isModDisabled(mod)) || ALWAYS_FINE_MODS.includes(mod.name)) && // Only add to enabled if it's not in the always-disabled list
			!ALWAYS_DISABLED_MODS.includes(mod.name)) {
			enabledMods.add(mod.name);
		}
	}

	// Force enable the always-fine mods
	for (const modName of ALWAYS_FINE_MODS) {
		enabledMods.add(modName);

		// Also remove any .lovelyignore files for always-fine mods
		const mod = allMods.find((m) => m.name === modName);

		if (mod) {
			await removeLovelyIgnore([mod]);
		}
	}

	// Force disable the always-disabled mods
	for (const modName of ALWAYS_DISABLED_MODS) {
		enabledMods.delete(modName);

		// Also add .lovelyignore files for always-disabled mods
		const mod = allMods.find((m) => m.name === modName);

		if (mod) {
			await writeLovelyIgnore([mod]);
		}
	}

	console.info("Starting binary search - detected current mod state...");

	while (true) {
		// Get all enabled mods that aren't marked as "fine"
		const enabledNonFineMods = allMods.filter((mod) => enabledMods.has(mod.name) && !fineMods.has(mod.name));

		// Get all disabled mods (excluding always-disabled mods)
		const disabledMods = allMods.filter((mod) => !enabledMods.has(mod.name) && !ALWAYS_DISABLED_MODS.includes(mod.name));

		// Apply the current configuration
		await removeLovelyIgnore(allMods.filter((mod) => enabledMods.has(mod.name)));
		await writeLovelyIgnore(allMods.filter((mod) => !enabledMods.has(mod.name)));

		// Display mod status
		console.info("TESTING STATUS:");
		console.info(`- Fine mods (confirmed good): ${[...fineMods].join(", ") || "None"}`);
		console.info(`- Enabled mods that need testing: ${enabledNonFineMods.map((m) => m.name).join(", ") || "None"}`);
		console.info(`- Disabled mods: ${disabledMods.map((m) => m.name).join(", ") || "None"}`);
		if (ALWAYS_DISABLED_MODS.length > 0) {
			console.info(`- Always disabled mods: ${ALWAYS_DISABLED_MODS.join(", ")}`);
		}

		// If there's only 1 or 0 non-fine mod enabled, we've found our culprit
		if (enabledNonFineMods.length <= 1 && disabledMods.length === 0) {
			if (enabledNonFineMods.length === 1) {
				console.info(`\n✓ FOUND PROBLEMATIC MOD: ${enabledNonFineMods[0].name}`);
			}
			else {
				console.info("\n✓ No problematic mods identified.");
			}

			return;
		}

		// Get user response
		const userResponse = await Input.prompt({
			default: "y",
			message: "Did the game run fine? (y/n/r - reset)"
		});

		switch (userResponse.toLowerCase()) {
			case "n":
			case "no":
				// Disable half of the enabled non-fine mods (except always-fine mods) - now randomly selected
				if (enabledNonFineMods.length > 0) {
					const half = Math.ceil(enabledNonFineMods.length / 2);

					// Shuffle the enabled mods and take the first half to disable
					for (const mod of shuffleArray([...enabledNonFineMods])
						.slice(0, half)) {
						if (!ALWAYS_FINE_MODS.includes(mod.name)) {
							enabledMods.delete(mod.name);
						}
					}
				}
				break;

			case "r":
				// Reset: Disable all mods except always-fine mods, clear fine mods list except always-fine mods
				console.info("Resetting - disabling mods and clearing fine mods list (except always-fine mods)");
				fineMods = new Set(ALWAYS_FINE_MODS);
				enabledMods = new Set(ALWAYS_FINE_MODS);

				// Disable all mods except always-fine mods
				await writeLovelyIgnore(allMods.filter((mod) => !ALWAYS_FINE_MODS.includes(mod.name) || ALWAYS_DISABLED_MODS.includes(mod.name)));

				// Make sure always-fine mods are enabled (and always-disabled mods stay disabled)
				await removeLovelyIgnore(allMods.filter((mod) => ALWAYS_FINE_MODS.includes(mod.name) && !ALWAYS_DISABLED_MODS.includes(mod.name)));
				break;
			case "y":

			case "yes":
				// 1. Mark all enabled non-fine mods as "fine"
				for (const mod of enabledNonFineMods) {
					fineMods.add(mod.name);
				}

				// 2. Enable half of the disabled mods (if any) - now randomly selected
				if (disabledMods.length > 0) {
					const half = Math.ceil(disabledMods.length / 2);

					// Shuffle the disabled mods and take the first half
					for (const mod of shuffleArray([...disabledMods])
						.slice(0, half)) {
						// Don't enable always-disabled mods
						if (!ALWAYS_DISABLED_MODS.includes(mod.name)) {
							enabledMods.add(mod.name);
						}
					}
				}
				break;

			default:
				console.info("Invalid response. Please answer 'y', 'n', or 'r'.");
				continue;
		}

		// Always ensure the always-fine mods are in the enabled list
		// and always-disabled mods are not in the enabled list
		for (const modName of ALWAYS_FINE_MODS) {
			if (!ALWAYS_DISABLED_MODS.includes(modName)) {
				enabledMods.add(modName);
			}
		}

		for (const modName of ALWAYS_DISABLED_MODS) {
			enabledMods.delete(modName);
		}
	}
};

await binarySearchMods();
