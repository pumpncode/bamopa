import { join } from "@std/path";

import { parse } from "@pumpn/gicopast";

const {
	cwd,
	readTextFile,
	stat
} = Deno;

const gitmodulesFilePath = join(cwd(), ".gitmodules");

await stat(gitmodulesFilePath);

const gitmodulesContent = await readTextFile(gitmodulesFilePath);

const submodules = parse(gitmodulesContent)
	.filter(({ name: [prefix, name], values: { path, url } }) => (
		prefix === "submodule" &&
		![
			name,
			path,
			url
		]
			.some((value) => value === "" || value === null || value === undefined)
	))
	.map(({ name: [prefix, name], values }) => ({
		...values,
		name
	}));

export default submodules;
