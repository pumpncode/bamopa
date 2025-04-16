/* eslint-disable max-statements */
import { Confirm } from "@cliffy/prompt";

const {
	Command,
	cwd,
	readTextFile
} = Deno;

/**
 * Runs a command in an optional working directory and returns its output.
 *
 * @param {string} cmd - The command to run
 * @param {string[]} arguments_ - Command arguments
 * @param {string|URL} [path] - Working directory
 * @returns {Promise<{stderr: string, stdout: string, success: boolean}>} Command execution result
 * @example
 * // Run git status in current directory
 * const result = await runCommand("git", ["status"], ".");
 * console.log(result.stdout);
 */
const runCommand = async function (
	cmd,
	arguments_,
	path = cwd()
) {
	/** @type {Deno.CommandOptions} */
	const commandOptions = {
		args: arguments_,
		stderr: "piped",
		stdout: "piped"
	};

	// Only add cwd if it's defined
	if (path !== undefined) {
		// @ts-ignore - This is safe because we're checking for undefined
		commandOptions.cwd = path;
	}

	const command = new Command(cmd, commandOptions);
	const {
		code, stderr, stdout
	} = await command.output();

	return {
		stderr: new TextDecoder().decode(stderr),
		stdout: new TextDecoder().decode(stdout),
		success: code === 0
	};
};

/**
 * Process a submodule: show its URL, prompt for pulling updates, pull if confirmed,
 * and display new commits.
 *
 * @param {string} submodulePath - Path to the submodule
 * @example
 * // Process the "libs/common" submodule
 * await processSubmodule("libs/common");
 */
const processSubmodule = async function (submodulePath) {
	console.info(submodulePath);
	await runCommand("git", ["fetch", "upstream"], submodulePath);

	// Get the current branch name first without logging
	const branchResult = await runCommand("git", [
		"rev-parse",
		"--abbrev-ref",
		"HEAD"
	], submodulePath);
	const branch = branchResult.stdout.trim();

	// Check if there are any changes from upstream before logging anything
	const changeCheckResult = await runCommand(
		"git",
		[
			"--no-pager",
			"log",
			"--oneline",
			`HEAD..upstream/${branch}`
		],
		submodulePath
	);

	// If there are no changes, silently skip this submodule
	if (!changeCheckResult.stdout.trim()) {
		return;
	}

	// Only log info if there are updates available
	console.info(`\n==== Processing submodule: ${submodulePath} ====`);

	// Get the repo URL from the submodule's "origin" remote.
	const urlResult = await runCommand("git", [
		"config",
		"--get",
		"remote.upstream.url"
	], submodulePath);
	const repoUrl = urlResult.stdout.trim();

	console.info(`Repo URL: ${repoUrl}`);
	console.info(`Updates available for ${submodulePath}:`);
	console.info(changeCheckResult.stdout);

	// Prompt the user whether to pull updates.
	const pullUpdates = await Confirm.prompt(`Pull updates for ${submodulePath}? (y/N)`);

	if (pullUpdates) {
		// Run the pull command from the upstream remote.
		console.info(`Pulling from upstream/${branch} into ${branch} ...`);
		const pullResult = await runCommand("git", [
			"pull",
			"upstream",
			branch,
			"--no-edit"
		], submodulePath);

		if (pullResult.success) {
			console.info(`Pull successful for ${submodulePath}.`);
		}
		else {
			console.error(`Failed to pull updates for ${submodulePath}:\n${pullResult.stderr}`);
		}
	}
	else {
		console.info(`Skipping pull for ${submodulePath}.`);
	}
};

/**
 * Parses the .gitmodules file to extract submodule paths.
 *
 * @returns {Promise<string[]>} List of submodule paths
 * @example
 * // Get all submodule paths from .gitmodules file
 * const paths = await getSubmodulePaths();
 * console.log(paths); // ["lib/module1", "lib/module2"]
 */
const getSubmodulePaths = async function () {
	try {
		const text = await readTextFile(".gitmodules");
		const regex = /path\s*=\s*(?<path>.*)/gv;
		const submodulePaths = [];
		let match;

		while ((match = regex.exec(text)) !== null) {
			if (match.groups?.path) {
				submodulePaths.push(match.groups.path.trim());
			}
		}

		return submodulePaths;
	}
	catch (error) {
		console.error("Error reading .gitmodules:", error);

		return [];
	}
};

/**
 * Main entry point for the script. Retrieves all submodules and processes them
 * by checking for updates and prompting for pulls when updates are available.
 *
 * @returns {Promise<void>}
 * @example
 * // Run the main function
 * await main();
 */
const main = async function () {
	const submodules = await getSubmodulePaths();

	if (submodules.length === 0) {
		console.info("No submodules found in .gitmodules.");

		return;
	}
	for (const submodulePath of submodules) {
		await processSubmodule(submodulePath);
	}
};

if (import.meta.main) {
	await main();
}
