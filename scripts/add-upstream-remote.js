import { join } from "@std/path";

const {
	Command,
	cwd,
	errors,
	readTextFile,
	stat
} = Deno;

const gitmodulesFilePath = join(cwd(), ".gitmodules");

try {
	await stat(gitmodulesFilePath);
}
catch (error) {
	if (error instanceof errors.NotFound) {
		console.error(`Error: The .gitmodules file does not exist at ${gitmodulesFilePath}`);
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

/**
 * Fetches the original repository owner using the GitHub CLI.
 *
 * @param {string} repoUrl - The URL of the repository.
 * @returns {Promise<string|null>} - The original repository owner or null if not found.
 * @example
 */
const getOriginalRepoOwner = async (repoUrl) => {
	try {
		return await runCommand([
			"gh",
			"repo",
			"view",
			repoUrl,
			"--json",
			"parent",
			"--jq",
			".parent.owner.login"
		]);
	}
	catch (error) {
		console.error(`Failed to fetch original repo owner for ${repoUrl}:`, error);

		return null;
	}
};

const gitmodulesContent = await readTextFile(gitmodulesFilePath);
const submoduleRegex = /\[submodule "(?<name>.+?)"\]\n\s+path = (?<path>.+)\n\s+url = (?<url>.+)\n/gv;

let match;

while ((match = submoduleRegex.exec(gitmodulesContent)) !== null) {
	const { groups } = match;

	if (!groups) {
		console.warn("Skipping invalid submodule entry.");
		continue;
	}

	const {
		name, path, url
	} = groups;

	console.info(`Processing submodule: ${name}`);

	try {
		const originalOwner = await getOriginalRepoOwner(url);

		if (!originalOwner) {
			console.warn(`Skipping ${name} as original owner could not be determined.`);
			continue;
		}

		const urlParts = url.split("/");
		const repoName = urlParts.at(-1);

		const baseUrl = url.slice(0, Math.max(0, url.lastIndexOf("/")));
		const upstreamUrl = repoName ? `${baseUrl.slice(0, Math.max(0, baseUrl.lastIndexOf("/")))}/${originalOwner}/${repoName}` : url;
		const existingRemotes = await runCommand([
			"git",
			"-C",
			path,
			"remote"
		]);

		if (existingRemotes.includes("upstream")) {
			console.info(`Upstream remote already exists for ${name}`);
		}
		else {
			await runCommand([
				"git",
				"-C",
				path,
				"remote",
				"add",
				"upstream",
				upstreamUrl
			]);
			console.info(`Added upstream remote for ${name}: ${upstreamUrl}`);
		}
	}
	catch (error) {
		console.error(`Failed to process submodule ${name}:`, error);
	}
}

console.info("=== Finished adding upstream remotes ===");
