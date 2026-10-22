import { Router } from 'express';

export interface VersionInfo {
  readonly name: string;
  readonly version: string;
  readonly environment: string;
}

/**
 * The one endpoint step 02 ships: proof that the stack boots and that routing,
 * JSON serialisation and the error handler are wired. Health, readiness and
 * metrics arrive in step 03, where they can report on real dependencies.
 */
export function versionRouter(info: VersionInfo): Router {
  const router = Router();
  router.get('/version', (_req, res) => {
    res.json(info);
  });
  return router;
}
