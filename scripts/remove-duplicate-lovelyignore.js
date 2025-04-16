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
 * isGitRepo("/path/to/repo");
 */
const isGitRepo = async (directoryPath) => {
	try {
		const gitPath = join(directoryPath, ".git");
		const gitStat = await stat(gitPath);

		return gitStat.isDirectory || gitStat.isFile;
	}
	catch (error) {
		if (!(error instanceof Error)) {
			throw error;
		}
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
 * findSubmodules().then(console.log);
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
		if (!(error instanceof Error)) {
			throw error;
		}
		console.error(`Error finding submodules: ${error.message}`);
		Deno.exit(1);
	}

	return submodules;
};

/**
 * Reads a .gitignore file and returns its lines or null if the file is not found.
 *
 * @param {string} gitignorePath - Path to the .gitignore file
 * @returns {Promise<string[]|null>} A promise that resolves with an array of lines from the .gitignore file, or null if the file is not found.
 * @example
 * const lines = await getGitignoreLines("/path/to/.gitignore");
 * if (lines !== null) {
 *     console.log("File lines:", lines);
 * }
 */
const getGitignoreLines = async (gitignorePath) => {
	try {
		await stat(gitignorePath);
	}
	catch (error) {
		if (!(error instanceof Error)) {
			throw error;
		}
		if (error instanceof errors.NotFound) {
			console.info("  No .gitignore file found");

			return null;
		}
		throw error;
	}
	const content = await readTextFile(gitignorePath);

	return content.split("\n");
};

/**
 * Removes duplicate .lovelyignore entries from .gitignore in the specified submodule
 *
 * @param {string} submodule - Name of the submodule
 * @example
 * removeDuplicateLovelyignore("example-mod");
 */
const removeDuplicateLovelyignore = async (submodule) => {
	console.info(`Processing submodule: ${submodule}`);

	const submodulePath = join(MODS_DIR, submodule);
	const gitignorePath = join(submodulePath, ".gitignore");

	const lines = await getGitignoreLines(gitignorePath);

	if (!lines) {
		return;
	}

	let count = 0;
	const cleanedLines = lines.filter((line) => {
		if (line.trim() === ".lovelyignore") {
			count += 1;

			// Keep only the first occurrence
			return count === 1;
		}

		return true;
	});

	if (count > 1) {
		console.info(`  Found ${count} occurrences of .lovelyignore - removing duplicates`);
		await writeTextFile(gitignorePath, cleanedLines.join("\n"));
		console.info("  Cleaned up .gitignore, keeping only one .lovelyignore entry");
	}
	else {
		console.info("  No duplicate entries found in .gitignore");
	}
};

/**
 * Main execution
 *
 * @example
 * main();
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
		await removeDuplicateLovelyignore(submodule);
	}

	console.info("Done! Duplicate .lovelyignore entries have been removed from all .gitignore files.");
};

await main();
