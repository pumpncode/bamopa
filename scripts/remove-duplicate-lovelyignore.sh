#!/bin/bash

# Script to remove duplicate .lovelyignore entries from .gitignore files in all submodules

# Get the root directory of the project
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Change to the mods-old directory
cd "$ROOT_DIR/mods-old" || { echo "Could not change to mods-old directory"; exit 1; }

# Print summary of what we're about to do
echo "Searching for git repositories in: $(pwd)"
echo "-------------------------------------------"

# Find all directories that are git repositories (submodules)
# Look for both .git directories and .git files (which might point to a git dir)
SUBMODULES=$(find . -maxdepth 2 -type d -name ".git" -o -type f -name ".git" | sed 's/\/\.git$//' | sed 's/^\.\///')

if [ -z "$SUBMODULES" ]; then
  echo "No git repositories (submodules) found in mods-old directory."
  echo "Check if the submodules are initialized with 'git submodule status'"
  exit 1
fi

echo "Found $(echo "$SUBMODULES" | wc -l | tr -d ' ') git repositories"
echo "-------------------------------------------"

for submodule in $SUBMODULES; do
  echo "Processing submodule: $submodule"
  
  # Change to the submodule directory
  cd "$ROOT_DIR/mods-old/$submodule" || { echo "  Could not change to $submodule"; continue; }
  
  # Check if .gitignore exists
  if [ -f .gitignore ]; then
    # Count occurrences of .lovelyignore
    occurrences=$(grep -c "^\.lovelyignore$" .gitignore)
    
    if [ "$occurrences" -gt 1 ]; then
      echo "  Found $occurrences occurrences of .lovelyignore - removing duplicates"
      
      # Create a temporary file without duplicate .lovelyignore entries
      awk '
        BEGIN { count = 0 }
        /^\.lovelyignore$/ { 
          count++ 
          if (count == 1) print $0
          next
        }
        { print $0 }
      ' .gitignore > .gitignore.tmp
      
      # Replace original .gitignore with deduplicated version
      mv .gitignore.tmp .gitignore
      echo "  Cleaned up .gitignore, keeping only one .lovelyignore entry"
    else
      echo "  No duplicate entries found in .gitignore"
    fi
  else
    echo "  No .gitignore file found"
  fi
  
  # Return to mods-old directory for the next iteration
  cd "$ROOT_DIR/mods-old" || { echo "Could not return to mods-old directory"; exit 1; }
done

echo "Done! Duplicate .lovelyignore entries have been removed from all .gitignore files."
