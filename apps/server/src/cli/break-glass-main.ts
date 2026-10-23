import { runBreakGlass } from './break-glass.js';

/* A separate entry point so the logic can be imported by tests without a
   module-level side effect running a real break-glass against their database. */
runBreakGlass(process.argv.slice(2))
  .then((code) => {
    process.exit(code);
  })
  .catch((error: unknown) => {
    process.stderr.write(`break-glass failed: ${error instanceof Error ? error.message : '?'}\n`);
    process.exit(1);
  });
