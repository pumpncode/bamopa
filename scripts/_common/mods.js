/* eslint-disable complexity -- This directive is necessary to allow for the complexity of the mod parsing logic, which cannot be simplified further without losing functionality. */
import { walk } from "@std/fs";
import {
	basename, dirname, join
} from "@std/path";

import {
	camel, mapKeys, shake
} from "@radashi-org/radashi";
import * as v from "@valibot/valibot";

const {
	cwd,
	lstat,
	readTextFile
} = Deno;

/**
 * @typedef {object} DependencyInfo
 * @property {string} id - The ID of the dependency or conflicting mod
 * @property {string} [minVersion] - The minimum version required
 * @property {string} [maxVersion] - The maximum version allowed
 */

/**
 * @typedef {object} Mod
 * @property {string} id - The unique identifier of the mod
 * @property {string[]} author - The authors of the mod
 * @property {string} name - The name of the mod
 * @property {string} displayName - The display name of the mod
 * @property {string} description - The description of the mod
 * @property {string} mainFile - The main file of the mod
 * @property {string} path - The path to the mod directory
 * @property {string} prefix - The prefix used for mod objects
 * @property {boolean} enabled - Whether the mod is enabled (true) or disabled (false)
 * @property {string} [version] - Optional version of the mod
 * @property {number} [priority] - Optional priority for loading
 * @property {string} [badgeColour] - Optional badge background color
 * @property {string} [badgeTextColour] - Optional badge text color
 * @property {Array<string|DependencyInfo>} [conflicts] - Optional list of conflicting mods
 * @property {Array<string|DependencyInfo>} [dependencies] - Optional list of dependencies
 * @property {string[]} [provides] - Optional list of provided mod capabilities
 */

const modsFolderPath = join(cwd(), "Mods");

const walkOptions = {
	exts: [".lua", ".json"],
	includeDirs: false
};

/**
 * Length of the comment marker "--- "
 */
const COMMENT_MARKER_LENGTH = 4;
const hexColorLength = 6;
const hexColorWithAlphaLength = 8;

/**
 * Length of prefix to extract from mod ID
 */
const PREFIX_LENGTH = 4;

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
 * Parses a JSON file containing mod metadata and validates it against the schema.
 *
 * @param {object} content - The mod content object
 * @param {string} content.content - The content of the mod file as a string
 * @param {string} content.path - The file system path of the mod file
 * @returns {Mod} The parsed and validated mod object
 * @example
 * const modData = parseModJson({
 *   content: '{"id": "MyMod", "name": "My Mod", "description": "A cool mod"}',
 *   path: "/path/to/mod/metadata.json"
 * });
 */
const parseModJson = ({ content, path }) => {
	const rawMod = JSON.parse(content);

	return v.parse(modSchema, {
		...rawMod,
		path
	});
};

/**
 * Parses a Lua file containing mod header information and validates it against the schema.
 *
 * @param {object} options0 - The options object containing mod header information
 * @param {string} options0.content - The content of the Lua file containing the mod header
 * @param {string} options0.path - The file system path of the mod header file
 * @returns {Mod} The parsed and validated mod object
 * @throws {Error} Throws an error if the header is invalid or cannot be parsed
 * @example
 * const modData = parseModHeader({
 *   content: '--- STEAMODDED HEADER\n--- MOD_ID: MyMod\n--- MOD_NAME: My Mod\n--- MOD_DESCRIPTION: A cool mod',
 *   path: "/path/to/mod/main.lua"
 * });
 */
const parseModHeader = ({ content, path }) => {
	const [header] = content.replaceAll("\r\n", "\n").match(/^---.+?(?=^(?!--- ))/msv) ?? [];

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
		PREFIX: prefix = id.slice(0, PREFIX_LENGTH).toLowerCase(),

		DEPENDENCIES: dependenciesString = dependsString
	} = shake(
		Object.fromEntries(
			header
				.trim()
				.split("\n")
				.map((line) => (
					line
						.trim()
						.slice(COMMENT_MARKER_LENGTH)
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
				?.map(

					/**
					 * Transforms author names by trimming whitespace.
					 *
					 * @param {string} author - The author of the mod
					 * @returns {string} The trimmed author name
					 * @example
					 * // Returns "John Doe"
					 * trimAuthor(" John Doe ");
					 */
					(author) => author.trim()
				) ?? [],
			badgeColour,
			badgeTextColour,
			conflicts: conflictsString
				?.slice(1, -1)
				?.split(",")
				?.map(

					/**
					 * Transforms conflict mod IDs by trimming whitespace.
					 *
					 * @param {string} conflict - The conflicting mod ID
					 * @returns {string} The trimmed conflict mod ID
					 * @example
					 * // Returns "ConflictingMod"
					 * trimConflict(" ConflictingMod ");
					 */
					(conflict) => conflict.trim()
				) ?? [],
			dependencies: dependenciesString
				?.slice(1, -1)
				?.split(",")
				?.map(

					/**
					 * Transforms dependency mod IDs by trimming whitespace.
					 *
					 * @param {string} dependency - The dependency mod ID
					 * @returns {string} The trimmed dependency mod ID
					 * @example
					 * // Returns "RequiredMod"
					 * trimDependency(" RequiredMod ");
					 */
					(dependency) => dependency.trim()
				) ?? [],
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

/**
 * Checks if a mod is enabled by looking for a .lovelyignore file in the mod's directory.
 * If the file exists, the mod is considered disabled.
 *
 * @param {string} modPath - Path to the mod file
 * @returns {boolean} Whether the mod is enabled
 * @example
 */
const isModEnabled = async (modPath) => {
	const modDir = dirname(modPath);
	const lovelyIgnorePath = `${modDir}/.lovelyignore`;

	try {
		await lstat(lovelyIgnorePath);

		// If we reach here, the file exists, so the mod is disabled
		return false;
	}
	catch {
		// File doesn't exist, mod is enabled
		return true;
	}
};

/** @type {Mod[]} */
const mods = [];

for await (const { path } of walk(modsFolderPath, walkOptions)) {
	const content = await readTextFile(path);

	if (path.endsWith(".json")) {
		try {
			const modObject = parseModJson({
				content,
				path
			});

			// Check if the mod is enabled
			modObject.enabled = await isModEnabled(path);
			mods.push(modObject);
		}
		catch {
			// ignore
		}
	}
	else if (path.endsWith(".lua") && content.startsWith("--- STEAMODDED HEADER")) {
		try {
			const modObject = parseModHeader({
				content,
				path
			});

			// Check if the mod is enabled
			modObject.enabled = await isModEnabled(path);
			mods.push(modObject);
		}
		catch {
			// ignore
		}
	}
}

const sortedMods = mods.toSorted(({ name: nameA }, { name: nameB }) => nameA.localeCompare(nameB));

export default sortedMods;
