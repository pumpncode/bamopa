// Get the root directory of the project
const {
	Command,
	cwd,
	errors,
	readDir,
	stat
} = Deno;
const ROOT_DIR = cwd();
const SUBMODULES_DIR = `${ROOT_DIR}/Mods`;

// Check if the mods directory exists
try {
	await stat(SUBMODULES_DIR);
}
catch (error) {
	if (error instanceof errors.NotFound) {
		console.error(`Error: The mods directory does not exist at ${SUBMODULES_DIR}`);
		Deno.exit(1);
	}
	else {
		throw error;
	}
}

/**
 * Executes a command and returns its output as a string.
 *
 * @param {string[]} cmd - The command to run as an array of strings.
 * @param {object} [options] - Additional options for the command.
 * @returns {Promise<string>} - The output of the command.
 * @example
 * await runCommand(["git", "-C", "/path/to/repo", "status"]);
 */
const runCommand = async (cmd, options = {}) => {
	const command = new Command(cmd[0], {
		args: cmd.slice(1),
		stdout: "piped",
		...options
	});
	const { stdout } = await command.output();

	return new TextDecoder().decode(stdout).trim();
};

// Loop through all directories in the mods folder
for await (const directoryEntry of readDir(SUBMODULES_DIR)) {
	if (directoryEntry.isDirectory) {
		const modDirectory = `${SUBMODULES_DIR}/${directoryEntry.name}`;
		const gitDirectory = `${modDirectory}/.git`;

		try {
			await stat(gitDirectory);
			try {
				const allBranchesOutput = await runCommand([
					"git",
					"-C",
					modDirectory,
					"branch",
					"-a"
				]);

				const branches = allBranchesOutput
					.split("\n")
					.map((branch) => branch.trim())
					.filter((branch) => branch && !branch.startsWith("*") && !branch.includes("HEAD"));

				if (branches.length > 0) {
					console.info(`${directoryEntry.name}:`);
					for (const branch of branches) {
						console.info(`  ${branch}`);
					}
				}
			}
			catch (error) {
				console.error(`Error reading branches for ${directoryEntry.name}:`, error);
			}
		}
		catch (error) {
			if (error instanceof errors.NotFound) {
				// Not a git repository, skip
			}
			else {
				throw error;
			}
		}
	}
}

console.info("=== Finished listing all submodule branches ===");
