title: "Instructions for Agents: Contributing via command line"
steps:
  - step: 1
    title: "Setup git repo"
    instructions:
      - "Verify that the GitHub CLI is installed and authenticated:"
      - cmd: "gh --version"
      - cmd: "gh auth status"
      - note: "If gh is not installed, follow the installation guide. If not authenticated, run: `gh auth login`"
      - "Check to see if you are inside the registry repository:"
      - cmd: "git status"
      - note: "If you see an error message like fatal: not a git repository, then use GitHub CLI to fork the repository:"
      - cmd: "gh repo fork open-audio-stack/open-audio-stack-registry --clone"
      - cmd: "cd open-audio-stack-registry"
      - "Ensure you are on the main branch and up-to-date with changes:"
      - cmd: "git checkout main"
      - cmd: "gh repo sync"
      - cmd: "npm install"
      - warning: "gh repo sync will refuse to run if there are uncommitted or untracked local changes. If that happens, use `git pull` instead, then continue to step 2."

  - step: 2
    title: "Contributing changes"
    instructions:
      - "You can contribute either functional changes to the codebase or add new packages (apps, plugins, presets, projects) to the registry. Infer the type of change from the user prompt. If unclear ask them to clarify."
      - "For functional changes continue to step 2a."
      - "For adding new packages continue to step 2b."

  - step: 2a
    title: "Contributing functional changes"
    instructions:
      - "Create a new branch for your contribution. Use descriptive branch names following these conventions:"
      - convention: "feature/feature-name for new features"
      - convention: "fix/fix-name for bug fixes"
      - "Edit TypeScript/JavaScript files in the codebase using your tools. Ensure changes follow the project's coding standards, enforced by Prettier (.prettierrc.json) for code formatting, ESLint (eslint.config.js) for linting, and Vitest (vitest.config.ts) for the test suite."
      - "Then proceed to step 3."

  - step: 2b
    title: "Contributing a package"
    substeps:
      - substep: 1
        title: "Obtain URLs"
        instructions:
          - "Extract the URL(s) to be added from the user's prompt. URLs may be provided directly in the message, or linked from a GitHub issue."
          - batch_note: "For batch uploads, the user may provide multiple URLs, a mixture of GitHub/website URLs, multiple issue numbers, or a text file containing a list of URLs."
          - "If the user gives an issue number, read it first:"
          - cmd: "gh issue view NUMBER --repo open-audio-stack/open-audio-stack-registry"
          - "The issue body will contain a `url:` field with the package homepage. Extract all URLs before continuing."
          - "If no URL was provided or found, ask the user to supply one before proceeding."

      - substep: 2
        title: "Route each URL"
        instructions:
          - "For each URL, determine how to proceed:"
          - route: "GitHub URL → validate it (Step 3), then use the fetch script (see below)."
          - route: "Other website URL → scrape the page manually and construct the index.yaml by hand. Refer to the specification for required fields."
          - route: "URL that does not load or has no relevant content → inform the user and ask them to clarify."
          - batch_note: "Non-GitHub URLs in a batch should also be handled individually (manual YAML construction) and will receive their own branch/PR if successful."

      - substep: 3
        title: "Validate each GitHub URL"
        instructions:
          - "Before running any scripts, confirm the repository meets all requirements. Run all checks below."
          - single_rule: "If processing a SINGLE package and any check fails, **stop**."
          - batch_rule: "If processing a BATCH of packages and a check fails, mark that specific package as 'Failed' with the reason, and **continue** validating the remaining packages. Do not abort the entire batch."
          - checks:
              - id: 3a
                name: "Valid GitHub repository"
                cmd: "gh repo view <org>/<repo>"
                fail_condition: "Returns an error (repo does not exist or is private)."
              - id: 3b
                name: "Valid content type"
                fail_condition: "Repository is a library, framework, DAW, or unrelated tool."
              - id: 3c
                name: "No existing entry or open PR"
                cmd: "ls src/<type>/<org-name>/<package-name>/"
                fail_condition: "Directory already exists."
              - id: 3d
                name: "Free open-source license"
                cmd: "gh repo view <org>/<repo> --json licenseInfo --jq '.licenseInfo'"
                fail_condition: "No license or proprietary/commercial license."
              - id: 3e
                name: "Has releases with binary builds"
                cmd: "gh release list --repo <org>/<repo>"
                fail_condition: "No releases with downloadable binaries (Exception: SFZ libraries with committed binaries)."
          - batch_output: "If processing a batch, after checking all URLs, present a validation table to the user:\nPackage | Status | Reason\n---|---|---\nwolf-shaper | ✅ Ready | \ncool-plugin | ❌ Failed | Missing license"

      - substep: 4
        title: "Branching & Fetching"
        instructions:
          - "Once all checks pass (for single) or for all passing packages (for batch), prepare to generate files."
          - batch_exception: "If processing a BATCH: Do NOT create branches yet. Stay on the `main` branch to generate all YAMLs and assets together. Defer branch creation to Step 4."
          - single_instruction: "If processing a SINGLE package: Create a new branch for your contribution now using conventions: `app/app-name`, `plugin/plugin-name`, `preset/preset-name`, `project/project-name`."
          - batch_note: "After generation and validation of a batch, ensure you are still on the `main` branch before proceeding to per-package branching in Step 4."
          
          - title: "Running GitHub repo fetch script"
            instructions:
              - "For GitHub repos, run the fetch script with the repository url and an optional version tag:"
              - cmd: "npm run dev:fetch -- https://github.com/wolf-plugins/wolf-shaper"
              - cmd: "npm run dev:fetch -- https://github.com/wolf-plugins/wolf-shaper v1.0.2"
              - note: "The script automatically derives metadata, downloads images/audio, fetches release assets with SHA256 hashes, infers systems/architectures, and writes the index.yaml files."
              - manual_note: "For non-GitHub URLs, manually construct the YAML using the reference files in the repository root and the Open Audio Registry Specification."

      - substep: 5
        title: "Review and correct YAML outputs"
        instructions:
          - "The script is deterministic — it reads only what GitHub's API and the README provide. It cannot make editorial judgments. Review every generated YAML independently. Do not assume corrections apply across packages in a batch."
          - fields_to_check:
              - "`name`: Match actual display name, not just repo slug."
              - "`author`: Use brand/developer name, not just raw GitHub login."
              - "`description`: Expand/rewrite if GitHub 'About' is too short (≤255 chars)."
              - "`type`: Confirm instrument / effect / sampler / generator / tool."
              - "`tags`: MUST be Title Case. Replace technical GitHub topics with semantic registry tags. Run `npm run dev:fix-tags` if needed."
              - "`changes`: Clean up markdown, trim to 255 characters."
              - "`audio`/`image`: If missing/blocked, source manually and convert via ffmpeg."
              - "`architectures`: Check release notes if filename doesn't specify (e.g. universal Mac)."
              - "`contains`: Check release notes/CI for installers bundling multiple formats."
              - "File list: Include EVERY binary variant. Exclude source archives/checksums."
          - special_rules:
              - "Guitar/amp/pedal plugins: Tag NAM, AIDA-X, or Proteus if supported."
              - "Synths: Tag 'Audio Input' if it supports audio input for oscillators."
              - "Successors: Tag with the original plugin's name."
              - "Formats: Be careful with 'vst' (vst2 for Mac) and 'vst3' (vst3 for all OS)."

      - substep: 6
        title: "Validating file data"
        instructions:
          - "After reviewing and correcting the YAML fields above, run the validate script against the generated file(s):"
          - cmd: "npm run dev:validate -- src/<type>/org-name/package-name/1.0.0/index.yaml"
          - batch_note: "For batches, run the validate script individually against each successfully generated YAML."
          - "The validate script downloads each release asset and recomputes the `sha256` and `size` values. Fix any mismatches by updating YAML values to match the validator's 'expected' output."
          - "Once validation passes with no errors, proceed to step 3."

  - step: 3
    title: "Validate Changes"
    instructions:
      - "Run the check command which will run code formatting, linting, tests and build commands to validate the changes:"
      - cmd: "npm run check"
      - "Verify that all tests pass and there are no linting errors."
      - single_instruction: "Return the generated yaml file to the user for them to read/review."
      - batch_instruction: "Return a summary list of all successfully generated packages and their paths. Do not dump full YAML contents. List any failed packages separately."
      - "Ask user for [Y/N] approval to proceed to Commit Changes, Push Changes and Submit Pull Requests for the successful package(s)."
      - "If the user answers No or N, ask them what changes they would like to make (and whether the changes apply to specific packages or the whole batch), and iterate until they are happy with the result."

  - step: 4
    title: "Commit, push and pr changes"
    instructions:
      - single_instruction: "Stage and commit your changes using the conventions below."
      - batch_instruction: "Process each successful package independently. Even if one package fails during this step, continue with the rest. For EACH successful package, perform the following sequence:"
      - loop_actions:
          - id: branch
            action: "Create a new branch using the existing descriptive conventions:"
            conventions:
              - "app/app-name"
              - "plugin/plugin-name"
              - "preset/preset-name"
              - "project/project-name"
          - id: commit
            action: "Stage and commit ONLY the files for this specific package. Use descriptive commit messages:"
            conventions:
              - "[app] Add App Name"
              - "[plugin] Add Plugin Name"
              - "[preset] Add Preset Name"
              - "[project] Add Project Name"
            warning: "There should never be a commit containing multiple package additions."
            example_cmd: "git add src/plugins/org-name/package-name/\ngit commit -m \"[plugin] Add Package Name\""
          - id: push
            action: "Push the branch to your forked repository:"
            cmd: "git push origin <branch-name>"
          - id: pr
            action: "Create a separate pull request using GitHub CLI. Reference ONLY the source issue for this specific package:"
            cmd: "gh pr create --title \"[Type] Add Package Name\" --body \"Adds Package Name\n\nCloses #NUMBER\""
      - batch_note: "If a package fails during branch/commit/PR creation, log the failure with the reason and continue processing the remaining successful packages."

  - step: 5
    title: "Conclusion"
    instructions:
      - single_instruction: "Respond to the user that the contribution has been submitted for review, with the url to the PR for them to view VirusTotal scans and peer review."
      - batch_instruction: "Respond to the user that the batch has been processed. Provide a final summary containing:\n1. Packages successfully submitted, with their individual PR URLs for VirusTotal scans and peer review.\n2. Packages that were skipped or failed, with the reason for each failure."
