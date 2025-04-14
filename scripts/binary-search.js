import { dirname } from "@std/path";

import { Input } from "@cliffy/prompt";

import { mods } from "./_common/_exports.js";

const {
	errors: { NotFound },
	remove,
	writeTextFile
} = Deno;

/**
 * Helper function to write .lovelyignore file to disable mods
 *
 * @param {typeof mods} modList - Array of mod objects
 * @returns {Promise<void>}
 * @example
 * await writeLovelyIgnore(someModList);
 */
const writeLovelyIgnore = async (modList) => {
	for (const mod of modList) {
		// Get the directory containing the mod
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
 * await removeLovelyIgnore(someModList);
 */
const removeLovelyIgnore = async (modList) => {
	for (const mod of modList) {
		// Get the directory containing the mod
		const modDir = dirname(mod.path);
		const filePath = `${modDir}/.lovelyignore`;

		try {
			await remove(filePath);
		}
		catch (error) {
			if (error instanceof NotFound) {
				// Ignore not found errors
			}
			else {
				console.error(`Error removing ${filePath}:`, error);
			}
		}
	}
};

/**
 * Binary search logic to find problematic mods
 *
 * @returns {Promise<void>}
 * @example
 * await binarySearchMods();
 */
const binarySearchMods = async () => {
	/** @type {typeof mods} */
	let enabledMods = mods.filter((mod) => mod.enabled);

	/** @type {typeof mods} */
	const disabledMods = mods.filter((mod) => !mod.enabled);

	/** @type {typeof mods} */
	const lockedMods = [];

	while (enabledMods.length > 0 || disabledMods.length > 0) {
		const halfIndex = Math.ceil(enabledMods.length / 2);
		const modsToDisable = enabledMods.slice(0, halfIndex);
		const modsToEnable = disabledMods.slice(0, halfIndex);

		// Move mods between arrays to track their current state
		const remainingEnabled = enabledMods.slice(halfIndex);

		// Update tracking arrays
		disabledMods.push(...modsToDisable);
		enabledMods = [...remainingEnabled, ...modsToEnable];

		// Remove the mods we just moved from enabled list
		if (modsToEnable.length > 0) {
			disabledMods.splice(0, modsToEnable.length);
		}

		// Apply changes
		await writeLovelyIgnore(disabledMods);
		await removeLovelyIgnore(enabledMods);

		console.info("Testing with the following mods disabled:", disabledMods.map((mod) => mod.name));
		console.info("Testing with the following mods enabled:", enabledMods.map((mod) => mod.name));

		const userResponse = await Input.prompt({
			default: "y",
			message: "Did the game run fine? (y/n/r - reset)"
		});

		switch (userResponse.toLowerCase()) {
			case "n":
			case "no":
			// Game has problems - the issue is in the currently enabled mods
			// Disable half of them in the next iteration to narrow down the problematic ones
				// Don't lock anything, just continue with the first half of currently enabled mods
				enabledMods = enabledMods.slice(0, halfIndex);
				// Keep the disabled mods as they are
				break;

			case "r":
			// Reset - disable all mods and start over
				console.info("Resetting - disabling all mods");
				// Move all mods to the disabled list
				disabledMods.push(...enabledMods, ...lockedMods);
				// Clear enabled and locked mods
				enabledMods = [];
				lockedMods.length = 0;

				// Apply changes by disabling all mods
				await writeLovelyIgnore(disabledMods);

				console.info("All mods have been disabled. You can restart the binary search with a clean slate.");
				break;
			case "y":

			case "yes":
			// Game runs fine - the currently enabled mods are good, lock them so they're never disabled again
			// and move on to testing the currently disabled mods
				// Lock the currently enabled mods as known good mods
				lockedMods.push(...enabledMods);
				// Make all currently disabled mods the new set to test
				enabledMods = [...disabledMods];
				// Clear the disabled mods list as we've moved them to enabledMods
				disabledMods.length = 0;
				break;

			default:
				console.info("Invalid response. Please answer 'y' or 'n'.");
		}

		console.info("Locked mods:", lockedMods.map((mod) => mod.name));
	}

	console.info("Binary search complete. Locked mods:", lockedMods.map((mod) => mod.name));
};

await binarySearchMods();
