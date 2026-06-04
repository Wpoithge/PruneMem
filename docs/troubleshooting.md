# PruneMem Troubleshooting

## Hook write path under default preset

The PruneMem `update_working_state` tool writes to
`<workspace>/examples/working-memory/` under the default preset. This is
counter-intuitive because `examples/` typically suggests sample/demo data,
not live runtime state. Consequences:

- Projects that already have an `examples/` directory will see PruneMem create
  a `working-memory/` subdirectory inside it
- These generated files appear in `git status` unless explicitly ignored
- Workaround: add `examples/working-memory/` to your `.gitignore`, or set
  `PRUNEMEM_PRESET=isolated` to redirect writes (with caveats — see plugin
  README)

This is PruneMem v0.3.0 behavior, tracked as design feedback for v0.4.
