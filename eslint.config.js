import pumpnEslintConfig from "@pumpn/eslint-config";

const minIdentifierLength = 2;
const maxIdentifierLength = 30;

const eslintConfig = [
	...pumpnEslintConfig,
	{
		rules: {
			"id-length": [
				"error",
				{
					min: minIdentifierLength,
					max: maxIdentifierLength,
					exceptions: [
						"v",
						"x",
						"y",
						"z"
					],
					properties: "never"
				}
			],
			"unicorn/prevent-abbreviations": [
				"error",
				{
					allowList: {
						mod: true,
						Mod: true
					}
				}
			]
		}
	}

];

export default eslintConfig;
