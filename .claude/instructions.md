1. Limit Access to Current Folder Only
  Create .claude/settings.json in your project:
{
    "permissions": {
		"allow": [
			"Read(<cwd>/**)",
			"Edit(<cwd>/**)"
		],
		"deny": [
			"Read(~/**)",
			"Read(../**)",
			"Edit(//etc/**)"
		]
	}
}

  Or use sandboxing for stronger OS-level isolation:
  /sandbox

You have several options (in precedence order):
  ┌───────────────────────────┬───────────────────┬──────────────┐
  │           File            │       Scope       │ Git tracked? │
  ├───────────────────────────┼───────────────────┼──────────────┤
  │ ./CLAUDE.md               │ Project-wide      │ Yes          │
  ├───────────────────────────┼───────────────────┼──────────────┤
  │ ./.claude/CLAUDE.md       │ Project-wide      │ Yes          │
  ├───────────────────────────┼───────────────────┼──────────────┤
  │ ./.claude/rules/*.md      │ Modular rules     │ Yes          │
  ├───────────────────────────┼───────────────────┼──────────────┤
  │ ./.claude/CLAUDE.local.md │ Personal/local    │ No           │
  ├───────────────────────────┼───────────────────┼──────────────┤
  │ ~/.claude/CLAUDE.md       │ All your projects │ No           │
  └───────────────────────────┴───────────────────┴──────────────┘
