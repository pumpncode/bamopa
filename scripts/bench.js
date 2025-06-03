import { exists } from "@std/fs";
import { dirname } from "@std/path";

import { Input } from "@cliffy/prompt";
import { fork } from "@radashi-org/radashi";

import { mods } from "./_common/_exports.js";

const {
	Command,
	errors: { NotFound },
	readTextFile,
	remove,
	writeTextFile
} = Deno;

const benchJsonFilePath = "bench.json";

const benchJsonFileContent = await readTextFile(benchJsonFilePath);

const bench = JSON.parse(benchJsonFileContent);

const gameFilePath = "/Users/nnmrts/Library/Application Support/Steam/steamapps/common/Balatro/Balatro.app/Contents/MacOS/love";
const resourcePath = "/Users/nnmrts/Library/Application Support/Steam/steamapps/common/Balatro/Balatro.app/Contents/Resources/Balatro/";

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

		await writeTextFile(filePath, "");
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
 *
 * @param mod
 * @example
 */
const isModDisabled = async (mod) => {
	const modDirectory = dirname(mod.path);
	const ignorePath = `${modDirectory}/.lovelyignore`;

	return await exists(ignorePath);
};

const decoder = new TextDecoder();

for (const subset of bench.slice(0, 10)) {
	const [modsToEnable, modsToDisable] = fork(
		mods,
		({ name }) => subset.includes(name) || [
			"Balabench",
			"Balatest",
			"DebugPlus"
		].includes(name)
	);

	for (const mod of modsToDisable) {
		if (await isModDisabled(mod)) {
			continue;
		}

		await writeLovelyIgnore([mod]);
	}

	for (const mod of modsToEnable) {
		if (!(await isModDisabled(mod))) {
			continue;
		}

		await removeLovelyIgnore([mod]);
	}

	const gameCommand = new Command(
		gameFilePath,
		{
			args: [resourcePath],
			env: {
				DYLD_INSERT_LIBRARIES: "liblovely.dylib"
			},
			stderr: "piped",
			stdout: "piped"
		}
	);

	const gameProcess = await gameCommand.spawn();

	const { stdout } = gameProcess;

	let rolling = "";

	try {
		for await (const chunk of stdout) {
			const text = decoder.decode(chunk, { stream: true });
			const combined = rolling + text;

			const match = combined.match(/BENCH:FPS:(?<fps>\d+(?:\.\d+)?)/v);

			if (match !== null) {
				const {
					groups: { fps: fpsString } = {}
				} = match;

				const fps = Number(fpsString);

				console.info(`${subset.join(", ")} - FPS: ${fps}`);

				gameProcess.kill();
				break;
			}

			const KEEP = 20;

			rolling = combined.length > KEEP
				? combined.slice(-KEEP)
				: combined;
		}
	}
	catch {
		// do nothing
	}

	try {
		await gameProcess.status;
	}
	catch (error) {
		console.error("Failed to get exit status:", error);
	}
}
