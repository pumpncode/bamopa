// filepath: /Users/nnmrts/projects/pumpncode/bamopa/scripts/add-lovelyignore-to-gitignore.js
import { join } from "@std/path";

const {
	cwd,
	errors,
	readDir,
	readTextFile,
	stat,
	writeTextFile
} = Deno;

// Get the project root directory
const ROOT_DIR = cwd();
const MODS_DIR = join(ROOT_DIR, "Mods");

console.info(`Searching for git repositories in: ${MODS_DIR}`);
console.info("-------------------------------------------");

/**
 * Checks if a directory is a git repository
 *
 * @param {string} directoryPath - Path to the directory
 * @returns {Promise<boolean>} - Whether the directory is a git repository
 * @example
 * // Check if current directory is a git repo
 * const isRepo = await isGitRepo(Deno.cwd());
 */
const isGitRepo = async (directoryPath) => {
	try {
		const gitPath = join(directoryPath, ".git");
		const gitStat = await stat(gitPath);

		return gitStat.isDirectory || gitStat.isFile;
	}
	catch (error) {
		if (error instanceof errors.NotFound) {
			return false;
		}
		throw error;
	}
};

/**
 * Finds all submodule directories in the Mods directory
 *
 * @returns {Promise<string[]>} - Array of submodule names
 * @example
 * // Get all submodules
 * const modules = await findSubmodules();
 * console.log(`Found ${modules.length} submodules`);
 */
const findSubmodules = async () => {
	const submodules = [];

	try {
		for await (const entry of readDir(MODS_DIR)) {
			if (entry.isDirectory) {
				const directoryPath = join(MODS_DIR, entry.name);

				if (await isGitRepo(directoryPath)) {
					submodules.push(entry.name);
				}
			}
		}
	}
	catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);

		console.error(`Error finding submodules: ${errorMessage}`);
		Deno.exit(1);
	}

	return submodules;
};

/**
 * Updates an existing .gitignore file to include .lovelyignore if needed
 *
 * @param {string} gitignorePath - Path to the .gitignore file
 * @param {string} gitignoreContent - Current content of the .gitignore file
 * @returns {Promise<void>}
 * @example
 * // Update a specific .gitignore file
 * await updateExistingGitignore("/path/to/.gitignore", "existing content");
 */
const updateExistingGitignore = async (gitignorePath, gitignoreContent) => {
	// Check if .lovelyignore already exists in the file
	if (gitignoreContent.split("\n").some((line) => line.trim() === ".lovelyignore")) {
		console.info("  .lovelyignore already in .gitignore");

		return;
	}

	// Add .lovelyignore to the existing file
	console.info("  Adding .lovelyignore to existing .gitignore");
	const updatedContent = `${gitignoreContent.trim()}\n\n# Binary search temporary files\n.lovelyignore\n`;

	await writeTextFile(gitignorePath, updatedContent);
};

/**
 * Adds .lovelyignore to .gitignore file in the specified submodule
 *
 * @param {string} submodule - Name of the submodule
 * @example
 * // Add .lovelyignore to a specific submodule
 * await addLovelyignoreToGitignore("ExampleMod");
 */
const addLovelyignoreToGitignore = async (submodule) => {
	console.info(`Processing submodule: ${submodule}`);

	const submodulePath = join(MODS_DIR, submodule);
	const gitignorePath = join(submodulePath, ".gitignore");

	try {
		let gitignoreContent = "";
		let exists = true;

		try {
			gitignoreContent = await readTextFile(gitignorePath);
		}
		catch (error) {
			if (error instanceof errors.NotFound) {
				exists = false;
			}
			else {
				throw error;
			}
		}

		if (exists) {
			await updateExistingGitignore(gitignorePath, gitignoreContent);
		}
		else {
			// Create a new .gitignore file
			console.info("  Creating new .gitignore file");
			await writeTextFile(gitignorePath, ".lovelyignore\n");
		}
	}
	catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);

		console.error(`  Error processing ${submodule}: ${errorMessage}`);
	}
};

/**
 * Main execution function that processes all submodules and adds .lovelyignore
 * to their .gitignore files
 *
 * @returns {Promise<void>} - Promise that resolves when all operations are complete
 * @example
 * // Run the script
 * await main();
 */
const main = async () => {
	const submodules = await findSubmodules();

	if (submodules.length === 0) {
		console.error("No git repositories (submodules) found in Mods directory.");
		console.error("Check if the submodules are initialized with 'git submodule status'");
		Deno.exit(1);
	}

	console.info(`Found ${submodules.length} git repositories`);
	console.info("-------------------------------------------");

	for (const submodule of submodules) {
		await addLovelyignoreToGitignore(submodule);
	}

	console.info("Done! .lovelyignore has been added to .gitignore in all submodules.");
};

await main();
