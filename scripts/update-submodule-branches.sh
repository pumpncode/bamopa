#!/bin/bash
# This script updates each submodule to track the branch defined in .gitmodules.
# If no branch is set there, it first attempts to determine the default branch using
# "git remote show origin | sed ..." from the local submodule (if it exists).
# Only then does it fall back to remote lookup (ls-remote or GitHub API).
# Finally, it ensures each submodule is checked out on that branch (avoiding a detached HEAD).

echo "Processing submodules..."

# Retrieve list of submodule names from .gitmodules (keys like submodule.<name>.path)
submodules=$(git config -f .gitmodules --get-regexp 'submodule\..*\.path' | awk '{split($1, arr, "."); print arr[2]}')

for sub in $submodules; do
	# Retrieve submodule's path and URL from .gitmodules.
	path=$(git config -f .gitmodules --get submodule."$sub".path)
	url=$(git config -f .gitmodules --get submodule."$sub".url)

	echo "-----------------------------"
	echo "Submodule: $sub"
	echo "Path: $path"
	echo "URL: $url"

	# Check if a branch is already specified in .gitmodules.
	branch=$(git config -f .gitmodules --get submodule."$sub".branch)
	if [ -n "$branch" ]; then
		default_branch="$branch"
		echo "Using branch from gitmodules: $default_branch"
	else
		default_branch=""

		# If the submodule's .git exists (file or folder), try to determine the branch locally.
		if [ -e "$path/.git" ]; then
			pushd "$path" >/dev/null
			default_branch=$(git remote show origin | sed -n '/HEAD branch/s/.*: //p')
			default_branch=$(echo "$default_branch" | tr -d '\r\n')
			popd >/dev/null
			if [ -n "$default_branch" ]; then
				echo "Determined default branch using 'git remote show origin': $default_branch"
			fi
		fi

		# If still not determined, fallback to remote lookup.
		if [ -z "$default_branch" ]; then
			default_branch=$(git ls-remote --symref "$url" HEAD 2>/dev/null |
				sed -n 's/^ref: refs\/heads\/\(.*\) HEAD$/\1/p')
			default_branch=$(echo "$default_branch" | tr -d '\r\n')
		fi

		# If still empty, fall back to GitHub API for GitHub-hosted repos.
		if [ -z "$default_branch" ]; then
			if [[ "$url" =~ github.com[:/](.+)/(.+)\.git ]]; then
				owner="${BASH_REMATCH[1]}"
				repo="${BASH_REMATCH[2]}"
				echo "Querying GitHub API for default branch of $owner/$repo..."
				if [[ -z "$GITHUB_TOKEN" ]]; then
					api_json=$(curl -sS --fail "https://api.github.com/repos/$owner/$repo")
				else
					api_json=$(curl -sS --fail -H "Authorization: token $GITHUB_TOKEN" "https://api.github.com/repos/$owner/$repo")
				fi
				if [ $? -ne 0 ] || [ -z "$api_json" ]; then
					echo "Error: API request to GitHub for repository $owner/$repo failed." >&2
					echo "Skipping submodule $sub due to API failure." >&2
					continue
				fi
				default_branch=$(echo "$api_json" | sed -n 's/.*"default_branch": *"\([^"]*\)".*/\1/p' | head -n 1)
				default_branch=$(echo "$default_branch" | tr -d '\r\n')
			fi
		fi

		# If still unable to determine the branch, skip this submodule.
		if [ -z "$default_branch" ]; then
			echo "Could not determine default branch for $sub (URL: $url). Skipping..."
			continue
		fi

		echo "Default branch for $sub determined dynamically is: $default_branch"
		# Update .gitmodules to record the discovered default branch.
		git config -f .gitmodules submodule."$sub".branch "$default_branch"
		# Synchronize submodule configuration so that the local .git/config is updated.
		git submodule sync "$path"
		# Update the submodule pointer from the remote.
		git submodule update --remote "$path"
	fi

	# Enter the submodule directory.
	pushd "$path" >/dev/null

	# Uncomment the following line if you wish to explicitly fetch the remote branch.
	# git fetch origin "$default_branch"

	# Check out the branch. If it exists locally, switch to it and set upstream;
	# if not, create a new branch tracking the remote branch.
	if git show-ref --verify --quiet "refs/heads/$default_branch"; then
		git checkout "$default_branch"
		git branch --set-upstream-to="origin/$default_branch" "$default_branch"
	else
		git checkout -b "$default_branch" --track "origin/$default_branch"
	fi

	popd >/dev/null
done

echo "Submodules have been updated to track their default branches."
