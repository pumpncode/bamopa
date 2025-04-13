/* eslint-disable complexity */
import { walk } from "@std/fs";
import {
	basename, join, relative
} from "@std/path";

import {
	camel, mapKeys, shake
} from "@radashi-org/radashi";
import * as v from "@valibot/valibot";

const {
	cwd,
	readTextFile
} = Deno;

const modsFolderPath = join(cwd(), "mods");

const walkOptions = {
	exts: [".lua", ".json"],
	includeDirs: false
};

const hexColorLength = 6;
const hexColorWithAlphaLength = 8;

const modSchema = v.pipe(
	v.record(v.string(), v.any()),
	v.transform((rawMod) => shake(mapKeys(rawMod, camel), (value) => value === "")),
	v.object({
		id: v.pipe(
			v.string(),
			v.notValues([
				"Steamodded",
				"Lovely",
				"Balatro"
			]),
			v.nonEmpty(),
			v.description(
				"Must be unique. \"Steamodded\", \"Lovely\" and \"Balatro\" are disallowed."
			)
		),
		author: v.pipe(
			v.array(
				v.pipe(
					v.string(),
					v.nonEmpty()
				)
			)
		),
		badgeColour: v.pipe(
			v.exactOptional(
				v.union([
					v.pipe(
						v.string(),
						v.hexadecimal(),
						v.length(hexColorLength)
					),
					v.pipe(
						v.string(),
						v.hexadecimal(),
						v.length(hexColorWithAlphaLength)
					)
				]),
				"666665"
			),
			v.description("Background colour for your mod badge. Must be a valid hex color with 6 or 8 digits (RRGGBB or RRGGBBAA).")
		),
		badgeTextColour: v.pipe(
			v.exactOptional(
				v.union([
					v.pipe(
						v.string(),
						v.hexadecimal(),
						v.length(hexColorLength)
					),
					v.pipe(
						v.string(),
						v.hexadecimal(),
						v.length(hexColorWithAlphaLength)
					)
				]),
				"FFFFFF"
			),
			v.description("Text colour for your mod badge. Must be a valid hex color with 6 or 8 digits (RRGGBB or RRGGBBAA).")
		),
		conflicts: v.pipe(
			v.exactOptional(
				v.pipe(
					v.array(
						v.union([
							v.pipe(
								v.string(),
								v.nonEmpty()
							),
							v.pipe(
								v.record(v.string(), v.any()),
								v.transform((rawDependency) => shake(mapKeys(rawDependency, camel), (value) => value === "")),
								v.strictObject({
									id: v.pipe(
										v.string(),
										v.nonEmpty()
									),
									minVersion: v.exactOptional(
										v.pipe(
											v.string(),
											v.nonEmpty()
										)
									),
									maxVersion: v.exactOptional(
										v.pipe(
											v.string(),
											v.nonEmpty()
										)
									)
								})
							)
						])
					)
				),
				[]
			),
			v.description("No mods in the list (that fulfill version restrictions) may be installed, else this mod will not load.")
		),
		dependencies: v.pipe(
			v.exactOptional(
				v.pipe(
					v.array(
						v.union([
							v.pipe(
								v.string(),
								v.nonEmpty()
							),
							v.pipe(
								v.record(v.string(), v.any()),
								v.transform((rawDependency) => shake(mapKeys(rawDependency, camel), (value) => value === "")),
								v.strictObject({
									id: v.pipe(
										v.string(),
										v.nonEmpty()
									),
									minVersion: v.exactOptional(
										v.pipe(
											v.string(),
											v.nonEmpty()
										)
									),
									maxVersion: v.exactOptional(
										v.pipe(
											v.string(),
											v.nonEmpty()
										)
									)
								})
							)
						])
					)
				),
				[]
			),
			v.description("All mods in the list must be installed and loaded (and must fulfill version requirements), else this mod will not load.")
		),
		description: v.pipe(
			v.string(),
			v.nonEmpty(),
			v.description("A description of your mod. To use more advanced typesetting, specify your description as a localization entry at G.localization.descriptions.Mod[id].")
		),
		displayName: v.pipe(
			v.exactOptional(
				v.pipe(
					v.string(),
					v.nonEmpty()
				)
			),
			v.description("Displayed text on your mod badge.")
		),
		dumpLoc: v.pipe(
			v.exactOptional(
				v.boolean(),
				false
			),
			v.description("!! Not for use in distributions. Writes all localization changes made on startup to a file, for conversion from a legacy system.")
		),
		mainFile: v.pipe(
			v.string(),
			v.nonEmpty(),
			v.endsWith(".lua"),
			v.description("This is the entry point of your mod. The specified file (including .lua extension) will be executed when your mod is loaded.")
		),
		name: v.pipe(
			v.string(),
			v.nonEmpty(),
			v.description("Name of your mod.")
		),
		path: v.pipe(
			v.string(),
			v.nonEmpty(),
			v.description("Path to the folder of the mod.")
		),
		prefix: v.pipe(
			v.string(),
			v.nonEmpty(),
			v.description("Must be unique. This prefix is added to the keys of all objects your mod registers. UNLIKE LEGACY HEADERS, THERE IS NO DEFAULT VALUE.")
		),
		priority: v.pipe(
			v.exactOptional(
				v.pipe(
					v.number(),
					v.integer(),
					v.finite()
				),
				0
			),
			v.description("Mods are loaded in order from lowest to highest priority value.")
		),
		provides: v.pipe(
			v.exactOptional(
				v.pipe(
					v.array(
						v.pipe(
							v.string(),
							v.nonEmpty()
						)
					)
				),
				[]
			),
			v.description("Use this if your mod is able to stand in for a different mod and fulfill dependencies on it. This allows the usage of a different ID so both mods can coexist. If you don't specify a valid version, your mod's version is used instead.")
		),
		version: v.pipe(
			v.exactOptional(
				v.pipe(
					v.string(),
					v.nonEmpty()
				)
			),
			v.description("Must follow a version format of (major).(minor).(patch)(rev). rev starting with ~ indicates a beta/pre-release version.")
		)
	}),
	v.transform(({
		name,

		displayName = name,
		...rest
	}) => ({
		...rest,
		displayName,
		name
	}))
);

/**
 *
 * @param content.content
 * @param content - The root object
 * @param content.path - The root object
 * @example
 */
const parseModJson = ({ content, path }) => {
	const rawMod = JSON.parse(content);

	return v.parse(modSchema, {
		...rawMod,
		path
	});
};

/**
 *
 * @param options0 - The root object
 * @param options0.content - The root object
 * @param options0.path - The root object
 * @example
 */
const parseModHeader = ({ content, path }) => {
	const [header] = content.replaceAll("\r\n", "\n").match(/^---.*?(?=^(?!--- ))/msv) ?? [];

	if (!header) {
		throw new Error("Invalid mod header");
	}

	const {
		BADGE_COLOR: badgeColor,
		BADGE_TEXT_COLOR: badgeTextColor,
		CONFLICTS: conflictsString,
		DEPS: depsString,
		DISPLAY_NAME: displayName,
		MOD_AUTHOR: authorString,
		MOD_DESCRIPTION: description,
		MOD_ID: id,
		MOD_NAME: name,
		PRIORITY: priorityString = "0",
		VERSION: version,

		BADGE_COLOUR: badgeColour = badgeColor,
		BADGE_TEXT_COLOUR: badgeTextColour = badgeTextColor,
		DEPENDS: dependsString = depsString,
		PREFIX: prefix = id.slice(0, 4).toLowerCase(),

		DEPENDENCIES: dependenciesString = dependsString
	} = shake(
		Object.fromEntries(
			header
				.trim()
				.split("\n")
				.map((line) => (
					line
						.trim()
						.slice(4)
						.split(":")
						.map((value) => value.trim())
				))
		),
		(value) => value === ""
	);

	return v.parse(
		modSchema,
		shake({
			id,
			author: authorString
				?.slice(1, -1)
				?.split(",")
				?.map((author) => author.trim()) ?? [],
			badgeColour,
			badgeTextColour,
			conflicts: conflictsString
				?.slice(1, -1)
				?.split(",")
				?.map((conflict) => conflict.trim()) ?? [],
			dependencies: dependenciesString
				?.slice(1, -1)
				?.split(",")
				?.map((dependency) => dependency.trim()) ?? [],
			description,
			displayName,
			mainFile: basename(path),
			name,
			path,
			prefix,
			priority: Number(priorityString),
			version
		})
	);
};

let mods = [];

for await (const { path } of walk(modsFolderPath, walkOptions)) {
	const content = await readTextFile(path);

	if (path.endsWith(".json")) {
		try {
			mods.push(
				parseModJson({
					content,
					path
				})
			);
		}
		catch {
			// ignore
		}
	}
	else if (path.endsWith(".lua") && content.startsWith("--- STEAMODDED HEADER")) {
		try {
			mods.push(
				parseModHeader({
					content,
					path
				})
			);
		}
		catch {
			// ignore
		}
	}
}

mods = mods.toSorted(({ name: nameA }, { name: nameB }) => nameA.localeCompare(nameB));

console.log(mods.map(({ name }) => name).join("\n"));
