import { submodules } from "./_common/_exports.js";

const {
	Command,
	cwd
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
 * Main entry point for the script. Retrieves all submodules and processes them
 * by fetching updates and displaying the date of the latest commit on upstream,
 * sorted from oldest to latest.
 *
 * @returns {Promise<void>}
 * @example
 * // Run the main function
 * await main();
 */
const main = async function () {
	console.info("Fetching latest commit dates from upstream branches...\n");

	/** @type {Array<{path: string, date: string, timestamp: Temporal.PlainDate}>} */
	const submoduleCommits = [];

	for (const { path: submodulePath } of submodules) {
		// Fetch latest updates from upstream first
		await runCommand("git", ["fetch", "upstream"], submodulePath);

		console.log(submodulePath);

		// Get the current branch name
		const branchResult = await runCommand("git", [
			"rev-parse",
			"--abbrev-ref",
			"HEAD"
		], submodulePath);
		const branch = branchResult.stdout.trim();

		// Get the date of the latest commit on upstream branch
		const latestCommitResult = await runCommand(
			"git",
			[
				"--no-pager",
				"log",
				"-1",
				"--format=%cd",
				"--date=format:%Y-%m-%dT%H:%M:%S",
				`upstream/${branch}`
			],
			submodulePath
		);

		if (latestCommitResult.success) {
			const commitDate = latestCommitResult.stdout.trim();
			const timestamp = Temporal.PlainDate.from(commitDate);

			submoduleCommits.push({
				date: commitDate,
				path: submodulePath,
				timestamp
			});
		}
		else {
			console.error(`Failed to get latest commit date for ${submodulePath}:\n${latestCommitResult.stderr}`);
		}
	}

	// Sort commits from oldest to latest
	submoduleCommits.sort((a, b) => Temporal.PlainDate.compare(a.timestamp, b.timestamp));

	// Print sorted results
	console.info("Submodule commit dates from oldest to latest:\n");
	for (const { date, path } of submoduleCommits) {
		console.info(`${path}: ${date}`);
	}
};

if (import.meta.main) {
	await main();
}
