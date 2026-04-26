# Skills shipped with Foley

`skills/foley/` is a Claude Code skill that teaches Claude how to read
and reason about Foley walkthroughs. Install it with:

```sh
mkdir -p ~/.claude/skills
ln -s "$(pwd)/skills/foley" ~/.claude/skills/foley
```

(Symlink keeps the skill in sync as we iterate. `cp -R` works too if
you want a frozen copy.)

After symlinking, restart Claude Code (or run `/skills reload`). The
skill will activate when the user pastes a Foley `/docs/<id>` URL,
asks for a step-by-step product tour that maps to a walkthrough, or
explicitly invokes `/foley`.

The skill complements the `foley-mcp` stdio server in `apps/foley-mcp/`:

- The **MCP server** gives Claude Code (and Cursor / Windsurf / Continue)
  typed tools and resource subscriptions.
- The **skill** gives Claude background context — what walkthroughs
  are, how to discover them, which endpoints to hit, what step ids
  mean — without spending a tool call on discovery.

You can install both — they're complementary, not duplicate.
