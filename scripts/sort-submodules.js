import { join } from "@std/path";

import { parse, stringify } from "@pumpn/gicopast";

const {
	cwd,
	readTextFile,
	writeTextFile
} = Deno;

const gitmodulesFilePath = join(cwd(), ".gitmodules");
const gitmodulesFileContent = await readTextFile(gitmodulesFilePath);

const gitmodulesFileSortedContent = stringify(
	parse(gitmodulesFileContent)
		.toSorted(({ name: [prefixA, nameA] }, { name: [prefixB, nameB] }) => nameA.localeCompare(nameB, "en", { numeric: true }))
);

await writeTextFile(gitmodulesFilePath, gitmodulesFileSortedContent);
