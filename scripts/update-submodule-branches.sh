#!/bin/bash
# This script updates each submodule to track its remote default branch dynamically.
# For each submodule, it:
# - Determines the default branch via git ls-remote.
# - Falls back to querying the GitHub API if necessary.
# - Strips unwanted characters and ensures only a single branch name is set.
# - Updates the .gitmodules and checks out the branch properly.

echo "Processing submodules..."

# Retrieve list of submodule names from .gitmodules (keys like submodule.<name>.path)
submodules=$(git config -f .gitmodules --get-regexp 'submodule\..*\.path' | awk '{split($1, arr, "."); print arr[2]}')

for sub in $submodules; do
    # Retrieve the submodule path and URL from .gitmodules.
    path=$(git config -f .gitmodules --get submodule."$sub".path)
    url=$(git config -f .gitmodules --get submodule."$sub".url)

    echo "-----------------------------"
    echo "Submodule: $sub"
    echo "Path: $path"
    echo "URL: $url"

    # Try to determine the default branch using git ls-remote.
    default_branch=$(git ls-remote --symref "$url" HEAD 2>/dev/null | sed -n 's/^ref: refs\/heads\/\(.*\) HEAD$/\1/p')
    default_branch=$(echo "$default_branch" | tr -d '\r\n')

    # If ls-remote did not work, fall back to the GitHub API.
    if [ -z "$default_branch" ]; then
        if [[ "$url" =~ github.com[:/](.+)/(.+)\.git ]]; then
            owner="${BASH_REMATCH[1]}"
            repo="${BASH_REMATCH[2]}"
            echo "Querying GitHub API for default branch of $owner/$repo..."
            api_json=$(curl -s "https://api.github.com/repos/$owner/$repo")
            default_branch=$(echo "$api_json" | sed -n 's/.*"default_branch": *"\([^"]*\)".*/\1/p' | head -n 1)
            default_branch=$(echo "$default_branch" | tr -d '\r\n')
        fi
    fi

    # If still unable to determine, skip this submodule.
    if [ -z "$default_branch" ]; then
        echo "Could not determine default branch for $sub (URL: $url). Skipping..."
        continue
    fi

    echo "Default branch for $sub is: $default_branch"

    # Update .gitmodules to record the discovered default branch.
    git config -f .gitmodules submodule."$sub".branch "$default_branch"

    # Synchronize submodule configuration so that the local .git/config is updated.
    git submodule sync "$path"

    # Update the submodule pointer from the remote.
    git submodule update --remote "$path"

    # Enter the submodule directory.
    pushd "$path" > /dev/null

    # Ensure the remote branch is fetched.
    git fetch origin "$default_branch"

    # Check out the branch. If it exists locally, switch to it and set upstream;
    # if not, create it and track the remote branch.
    if git show-ref --verify --quiet "refs/heads/$default_branch"; then
        git checkout "$default_branch"
        git branch --set-upstream-to="origin/$default_branch" "$default_branch"
    else
        git checkout -b "$default_branch" --track "origin/$default_branch"
    fi

    popd > /dev/null
done

echo "Submodules have been updated to track their remote default branches."