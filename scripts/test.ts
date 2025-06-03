const TAG_PATTERNS = [/tag/iv, /tags/i];
const DAYS = 2;

/**
 *
 * @param days
 * @example
 */
function getSinceDate(days: number): string {
	const now = new Date();

	now.setDate(now.getDate() - days);

	return now.toISOString().slice(0, 10);
}

/**
 *
 * @example
 */
async function getSubmodulePaths(): Promise<string[]> {
	const proc = Deno.run({
		cmd: [
			"git",
			"submodule",
			"--quiet",
			"foreach",
			"echo $sm_path"
		],
		stderr: "null",
		stdout: "piped"
	});
	const output = await proc.output();

	proc.close();

	return new TextDecoder().decode(output).split("\n")
		.map((s) => s.trim())
		.filter(Boolean);
}

/**
 *
 * @param repoPath
 * @param since
 * @example
 */
async function getRecentCommits(repoPath: string, since: string): Promise<string[]> {
	const proc = Deno.run({
		cmd: [
			"git",
			"-C",
			repoPath,
			"log",
			`--since=${since}`,
			"--pretty=format:%H"
		],
		stderr: "null",
		stdout: "piped"
	});
	const output = await proc.output();

	proc.close();

	return new TextDecoder().decode(output).split("\n")
		.map((s) => s.trim())
		.filter(Boolean);
}

/**
 *
 * @param repoPath
 * @param commit
 * @example
 */
async function getCommitFiles(repoPath: string, commit: string): Promise<string[]> {
	const proc = Deno.run({
		cmd: [
			"git",
			"-C",
			repoPath,
			"show",
			"--pretty=",
			"--name-only",
			commit
		],
		stderr: "null",
		stdout: "piped"
	});
	const output = await proc.output();

	proc.close();

	return new TextDecoder().decode(output).split("\n")
		.map((s) => s.trim())
		.filter(Boolean);
}

/**
 *
 * @param files
 * @param message
 * @param changedLines
 * @example
 */
function affectsTag(files: string[], message: string, changedLines: string[]): boolean {
	return (
		files.some((f) => TAG_PATTERNS.some((pat) => pat.test(f))) ||
		TAG_PATTERNS.some((pat) => pat.test(message)) ||
		changedLines.some((line) => TAG_PATTERNS.some((pat) => pat.test(line)))
	);
}

/**
 *
 * @example
 */

/**
 *
 * @param repoPath
 * @param commit
 * @example
 */
async function getCommitMessage(repoPath: string, commit: string): Promise<string> {
	const proc = Deno.run({
		cmd: [
			"git",
			"-C",
			repoPath,
			"log",
			"-1",
			"--pretty=%B",
			commit
		],
		stderr: "null",
		stdout: "piped"
	});
	const output = await proc.output();

	proc.close();

	return new TextDecoder().decode(output).trim();
}

/**
 *
 * @param repoPath
 * @param commit
 * @returns {Promise<string[]>}
 * @example
 */
async function getChangedLines(repoPath: string, commit: string): Promise<string[]> {
	const proc = Deno.run({
		cmd: [
			"git",
			"-C",
			repoPath,
			"show",
			commit,
			"--unified=0",
			"--no-color"
		],
		stderr: "null",
		stdout: "piped"
	});
	const output = await proc.output();

	proc.close();
	const diff = new TextDecoder().decode(output);

	return diff.split("\n").filter((line) => (/^[+-]/u.test(line) && !/^[+-]{3}/u.test(line)));
}

/**
 *
 * @example
 */
async function main() {
	const since = getSinceDate(DAYS);
	const submodules = await getSubmodulePaths();

	if (submodules.length === 0) {
		console.log("No submodules found.");

		return;
	}
	for (const sub of submodules) {
		const commits = await getRecentCommits(sub, since);
		let found = false;

		for (const commit of commits) {
			const files = await getCommitFiles(sub, commit);
			const message = await getCommitMessage(sub, commit);
			const changedLines = await getChangedLines(sub, commit);

			if (affectsTag(files, message, changedLines)) {
				if (!found) {
					console.log(`\n[${sub}]`);
					found = true;
				}
				console.log(`Commit: ${commit}`);
				if (TAG_PATTERNS.some((pat) => pat.test(message))) {
					console.log(`  * Commit message: ${message.replaceAll("\n", " ")}`);
				}
				for (const f of files) {
					if (TAG_PATTERNS.some((pat) => pat.test(f))) {
						console.log(`  - ${f}`);
					}
				}
				for (const line of changedLines) {
					if (TAG_PATTERNS.some((pat) => pat.test(line))) {
						console.log(`  > ${line}`);
					}
				}
			}
		}
	}
}

if (import.meta.main) {
	main();
}
