#!/bin/bash

# Script to add .lovelyignore to .gitignore in all submodules

# Get the root directory of the project
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Change to the mods directory
cd "$ROOT_DIR/mods" || { echo "Could not change to mods directory"; exit 1; }

# Print summary of what we're about to do
echo "Searching for git repositories in: $(pwd)"
echo "-------------------------------------------"

# Find all directories that are git repositories (submodules)
# Look for both .git directories and .git files (which might point to a git dir)
SUBMODULES=$(find . -maxdepth 2 -type d -name ".git" -o -type f -name ".git" | sed 's/\/\.git$//' | sed 's/^\.\///')

if [ -z "$SUBMODULES" ]; then
  echo "No git repositories (submodules) found in mods directory."
  echo "Check if the submodules are initialized with 'git submodule status'"
  exit 1
fi

echo "Found $(echo "$SUBMODULES" | wc -l | tr -d ' ') git repositories"
echo "-------------------------------------------"

for submodule in $SUBMODULES; do
  echo "Processing submodule: $submodule"
  
  # Change to the submodule directory
  cd "$ROOT_DIR/mods/$submodule" || { echo "  Could not change to $submodule"; continue; }
  
  # Check if .gitignore already contains .lovelyignore
  if [ -f .gitignore ]; then
    if grep -q "^\.lovelyignore$" .gitignore; then
      echo "  .lovelyignore already in .gitignore"
    else
      echo "  Adding .lovelyignore to existing .gitignore"
      echo "" >> .gitignore
      echo "# Binary search temporary files" >> .gitignore
      echo ".lovelyignore" >> .gitignore
    fi
  else
    # Create a new .gitignore file with .lovelyignore
    echo "  Creating new .gitignore file"
    cat > .gitignore << EOF
.lovelyignore
EOF
  fi
  
  # Return to mods directory for the next iteration
  cd "$ROOT_DIR/mods" || { echo "Could not return to mods directory"; exit 1; }
done

echo "Done! .lovelyignore has been added to .gitignore in all submodules."
