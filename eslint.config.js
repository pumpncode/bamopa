import pumpnEslintConfig from "@pumpn/eslint-config";

const eslintConfig = [
	...pumpnEslintConfig,
	{
		rules: {
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
