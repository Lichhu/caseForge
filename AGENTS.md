## Command Output

Any command with unknown or potentially large output must be byte-capped. Use: `COMMAND 2>&1 | head -c 4000`
