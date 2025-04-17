import { join } from "@std/path";

import { submodules } from "./_common/_exports.js";

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

	// Process each submodule
	for (
		const {
			branch,
			name,
			path,
			url
		} of submodules
	) {
		console.info("-----------------------------");
		console.info(`Submodule: ${name}`);
		console.info(`Path: ${path}`);
		console.info(`URL: ${url}`);

		let defaultBranch = branch;

		// If no branch is specified, determine it
		if (!defaultBranch) {
			defaultBranch = await determineDefaultBranch(path, url);

			// If still unable to determine, skip this submodule
			if (!defaultBranch) {
				console.info(`Could not determine default branch for ${name} (URL: ${url}). Skipping...`);
				continue;
			}

			console.info(`Default branch for ${name} determined dynamically is: ${defaultBranch}`);

			// Update .gitmodules and sync the submodule
			await updateSubmoduleConfig(name, path, defaultBranch);
		}

		// Now checkout the branch in the submodule
		await checkoutSubmoduleBranch(path, defaultBranch, name);
	}
};

// Run the main function
await updateSubmoduleBranches();
