import { join } from "@std/path";

const { cwd, env } = Deno;

// Define constants for repeated values
const GIT_COMMAND = "git";
const CONFIG_FLAG = "config";
const GITMODULES_PATH = ".gitmodules";

/**
 * Executes a command and returns its output as a string.
 *
 * @param {string[]} cmd - The command to run as an array of strings.
 * @param {object} [options] - Additional options for the command.
 * @returns {Promise<string>} - The output of the command.
 * @example
 * const output = await runCommand(['ls', '-la']);
 * console.log('Command output:', output);
 */
const runCommand = async (cmd, options = {}) => {
	const command = new Deno.Command(cmd[0], {
		args: cmd.slice(1),
		stderr: "piped",
		stdout: "piped",
		...options
	});

	const { stdout } = await command.output();

	return new TextDecoder().decode(stdout).trim();
};

/**
 * Executes a command in a specific directory and returns its output.
 *
 * @param {string[]} cmd - The command to run as an array of strings.
 * @param {string} directory - The directory to run the command in.
 * @returns {Promise<string>} - The output of the command.
 * @example
 * const output = await runCommandInDirectory(['git', 'status'], '/path/to/repo');
 * console.log('Git status output:', output);
 */
const runCommandInDirectory = async (cmd, directory) => {
	const currentDirectory = cwd();

	try {
		Deno.chdir(directory);

		return await runCommand(cmd);
	}
	finally {
		Deno.chdir(currentDirectory);
	}
};

/**
 * Gets the default branch for a GitHub repository using the GitHub API.
 *
 * @param {string} owner - The repository owner.
 * @param {string} repo - The repository name.
 * @returns {Promise<string|null>} - The default branch name or null if not found.
 * @example
 * const defaultBranch = await getGitHubDefaultBranch('octocat', 'Hello-World');
 * console.log('Default branch:', defaultBranch);
 */
const getGitHubDefaultBranch = async (owner, repo) => {
	console.info(`Querying GitHub API for default branch of ${owner}/${repo}...`);

	// Fix headers type issue
	const headers = new Headers();
	const githubToken = env.get("GITHUB_TOKEN");

	if (githubToken) {
		headers.set("Authorization", `token ${githubToken}`);
	}

	try {
		const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });

		if (!response.ok) {
			console.error(`Error: API request to GitHub for repository ${owner}/${repo} failed.`);

			return null;
		}
		const data = await response.json();

		return data.default_branch;
	}
	catch (error) {
		const errorObject = error instanceof Error ? error : new Error(String(error));

		console.error(`Error fetching GitHub API: ${errorObject.message}`);

		return null;
	}
};

/**
 * Get list of submodules from .gitmodules file
 *
 * @returns {Promise<string[]>} - Array of submodule names
 * @example
 * const submodules = await getSubmodulesList();
 * console.log('Submodules:', submodules);
 */
const getSubmodulesList = async () => {
	let submodules = [];

	try {
		const result = await runCommand([
			GIT_COMMAND,
			CONFIG_FLAG,
			"-f",
			GITMODULES_PATH,
			"--get-regexp",
			String.raw`submodule\..*\.path`
		]);

		// Parse the output into submodule names
		submodules = result.split("\n").map((line) => {
			const [, submodule] = line.split(".");

			return submodule;
		}).filter(Boolean);
	}
	catch (error) {
		const errorObject = error instanceof Error ? error : new Error(String(error));

		console.error(`Failed to get submodules: ${errorObject.message}`);

		return [];
	}

	return submodules;
};

/**
 * Get submodule path and URL
 *
 * @param {string} submodule - The submodule name
 * @returns {Promise<{path: string, url: string}>} - Path and URL for the submodule
 * @example
 * const info = await getSubmoduleInfo('my-submodule');
 * console.log('Submodule info:', info);
 */
const getSubmoduleInfo = async (submodule) => {
	const path = await runCommand([
		GIT_COMMAND,
		CONFIG_FLAG,
		"-f",
		GITMODULES_PATH,
		"--get",
		`submodule.${submodule}.path`
	]);

	const url = await runCommand([
		GIT_COMMAND,
		CONFIG_FLAG,
		"-f",
		GITMODULES_PATH,
		"--get",
		`submodule.${submodule}.url`
	]);

	return {
		path,
		url
	};
};

/**
 * Checks if a branch is specified in .gitmodules
 *
 * @param {string} submodule - The submodule name
 * @returns {Promise<string>} - The branch name or empty string
 * @example
 * const branch = await getConfiguredBranch('my-submodule');
 * console.log('Configured branch:', branch);
 */
const getConfiguredBranch = async (submodule) => {
	try {
		const branch = await runCommand([
			GIT_COMMAND,
			CONFIG_FLAG,
			"-f",
			GITMODULES_PATH,
			"--get",
			`submodule.${submodule}.branch`
		]);

		if (branch) {
			console.info(`Using branch from gitmodules: ${branch}`);
		}

		return branch;
	}
	catch {
		return "";
	}
};

/**
 * Determines the branch locally using git commands.
 *
 * @param {string} path - Path to the local repository.
 * @returns {Promise<string>} - The determined branch name or an empty string.
 * @example
 * const branch = await determineBranchLocally('/path/to/repo');
 * console.log('Local branch:', branch);
 */
const determineBranchLocally = async (path) => {
	try {
		const gitPath = join(path, ".git");
		const gitExists = await Deno.stat(gitPath).catch(() => false);

		if (gitExists) {
			const output = await runCommandInDirectory(
				[
					GIT_COMMAND,
					"remote",
					"show",
					"origin"
				],
				path
			);
			const match = output.match(/HEAD branch: (?<branch>.+)/v);

			if (match?.groups?.branch) {
				const branch = match.groups.branch.trim();

				console.info(`Determined default branch using 'git remote show origin': ${branch}`);

				return branch;
			}
		}
	}
	catch {
		// Silently fail, we'll try other methods
	}

	return "";
};

/**
 * Determines the branch using git ls-remote.
 *
 * @param {string} url - Repository URL.
 * @returns {Promise<string>} - The determined branch name or an empty string.
 * @example
 * const branch = await determineBranchWithLsRemote('https://github.com/user/repo.git');
 */
const determineBranchWithLsRemote = async (url) => {
	try {
		const output = await runCommand([
			GIT_COMMAND,
			"ls-remote",
			"--symref",
			url,
			"HEAD"
		]);
		const match = output.match(/ref: refs\/heads\/(?<branch>\S+)\s+HEAD/v);

		if (match?.groups?.branch) {
			const branch = match.groups.branch.trim();

			console.info(`Determined default branch using git ls-remote: ${branch}`);

			return branch;
		}
	}
	catch {
		// Continue to next method if ls-remote fails
	}

	return "";
};

/**
 * Matches GitHub repository URLs to extract the owner and repository name.
 * Uses named groups for clarity.
 *
 * @param {string} url - The GitHub repository URL.
 * @returns {Promise<string>} - The default branch name or an empty string.
 * @example
 * const branch = await determineBranchFromGitHubAPI('https://github.com/user/repo.git');
 * console.log(branch); // Outputs the default branch name
 */
const determineBranchFromGitHubAPI = async (url) => {
	// Match GitHub repository URLs to extract the owner and repository name
	const githubMatch = url.match(/github\.com[\/:](?<owner>[^\/]+)\/(?<repo>[^.\/]+)(?:\.git)?$/v);

	if (githubMatch?.groups) {
		const { owner, repo } = githubMatch.groups;

		const branch = await getGitHubDefaultBranch(owner, repo) || "";

		if (branch) {
			console.info(`Determined default branch from GitHub API: ${branch}`);

			return branch;
		}
	}

	return "";
};

/**
 * Determines the default branch for a repository.
 *
 * @param {string} path - Path to the local repository.
 * @param {string} url - Repository URL.
 * @returns {Promise<string>} - The determined default branch or an empty string.
 * @example
 * const branch = await determineDefaultBranch('/path/to/repo', 'https://github.com/user/repo.git');
 */
const determineDefaultBranch = async (path, url) => {
	let defaultBranch = await determineBranchLocally(path);

	if (!defaultBranch) {
		defaultBranch = await determineBranchWithLsRemote(url);
	}

	if (!defaultBranch) {
		defaultBranch = await determineBranchFromGitHubAPI(url);
	}

	return defaultBranch;
};

/**
 * Updates .gitmodules with the discovered branch and syncs the submodule
 *
 * @param {string} submodule - Submodule name
 * @param {string} path - Path to the submodule
 * @param {string} branch - Branch name
 * @returns {Promise<void>}
 * @example
 * await updateSubmoduleConfig('my-submodule', '/path/to/submodule', 'main');
 * console.log('Submodule config updated.');
 */
const updateSubmoduleConfig = async (submodule, path, branch) => {
	// Update .gitmodules with the discovered branch
	await runCommand([
		GIT_COMMAND,
		CONFIG_FLAG,
		"-f",
		GITMODULES_PATH,
		`submodule.${submodule}.branch`,
		branch
	]);

	// Sync and update the submodule
	await runCommand([
		GIT_COMMAND,
		"submodule",
		"sync",
		path
	]);

	await runCommand([
		GIT_COMMAND,
		"submodule",
		"update",
		"--remote",
		path
	]);
};

/**
 * Checks out the branch in the submodule
 *
 * @param {string} path - Path to the submodule
 * @param {string} defaultBranch - Branch to checkout
 * @param {string} submodule - Submodule name (for error reporting)
 * @returns {Promise<void>}
 * @example
 * await checkoutSubmoduleBranch('/path/to/submodule', 'main', 'my-submodule');
 * console.log('Checked out branch in submodule.');
 */
const checkoutSubmoduleBranch = async (path, defaultBranch, submodule) => {
	try {
		// Check if branch exists locally
		const branchExists = await runCommandInDirectory(
			[
				GIT_COMMAND,
				"show-ref",
				"--verify",
				"--quiet",
				`refs/heads/${defaultBranch}`
			],
			path
		).then(() => true).catch(() => false);

		if (branchExists) {
			// Branch exists, check it out and set upstream
			await runCommandInDirectory([
				GIT_COMMAND,
				"checkout",
				defaultBranch
			], path);

			await runCommandInDirectory(
				[
					GIT_COMMAND,
					"branch",
					"--set-upstream-to",
					`origin/${defaultBranch}`,
					defaultBranch
				],
				path
			);
		}
		else {
			// Branch doesn't exist, create it tracking the remote branch
			await runCommandInDirectory(
				[
					GIT_COMMAND,
					"checkout",
					"-b",
					defaultBranch,
					"--track",
					`origin/${defaultBranch}`
				],
				path
			);
		}
	}
	catch (error) {
		const errorObject = error instanceof Error ? error : new Error(String(error));

		console.error(`Error checking out branch for ${submodule}: ${errorObject.message}`);
	}
};

/**
 * Updates submodules to track their default branches.
 *
 * @example
 * await updateSubmoduleBranches();
 * console.log('Submodules updated successfully.');
 */
const updateSubmoduleBranches = async () => {
	console.info("Processing submodules...");

	// Get submodules from .gitmodules file
	const submodules = await getSubmodulesList();

	if (submodules.length === 0) {
		return;
	}

	// Process each submodule
	for (const sub of submodules) {
		// Get path and URL for this submodule
		const { path, url } = await getSubmoduleInfo(sub);

		console.info("-----------------------------");
		console.info(`Submodule: ${sub}`);
		console.info(`Path: ${path}`);
		console.info(`URL: ${url}`);

		// Check if a branch is already specified
		let defaultBranch = await getConfiguredBranch(sub);

		// If no branch is specified, determine it
		if (!defaultBranch) {
			defaultBranch = await determineDefaultBranch(path, url);

			// If still unable to determine, skip this submodule
			if (!defaultBranch) {
				console.info(`Could not determine default branch for ${sub} (URL: ${url}). Skipping...`);
				continue;
			}

			console.info(`Default branch for ${sub} determined dynamically is: ${defaultBranch}`);

			// Update .gitmodules and sync the submodule
			await updateSubmoduleConfig(sub, path, defaultBranch);
		}

		// Now checkout the branch in the submodule
		await checkoutSubmoduleBranch(path, defaultBranch, sub);
	}
};

// Run the main function
await updateSubmoduleBranches();
