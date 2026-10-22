import { useEffect, useState, type JSX } from 'react';

interface VersionInfo {
  name: string;
  version: string;
  environment: string;
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; info: VersionInfo }
  | { status: 'error'; code: string };

/**
 * Step 02's client is deliberately unstyled. The visual language is chosen in
 * step 09 (three directions, one of them picked) and implemented as tokens in
 * step 10; anything decorative written now would have to be thrown away, and
 * would quietly become the design by default.
 *
 * What it does prove is that the client can reach the API through the reverse
 * proxy and render its answer.
 */
export function App(): JSX.Element {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/version', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`http_${String(response.status)}`);
        const info = (await response.json()) as VersionInfo;
        setState({ status: 'ready', info });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({ status: 'error', code: error instanceof Error ? error.message : 'unknown' });
      });

    return () => {
      controller.abort();
    };
  }, []);

  return (
    <main>
      <h1>C.S.A.S</h1>
      <p>Customer Service Automation System</p>
      {state.status === 'loading' && <p role="status">Checking the API…</p>}
      {state.status === 'ready' && (
        <dl>
          <dt>API</dt>
          <dd>{state.info.name}</dd>
          <dt>Version</dt>
          <dd>{state.info.version}</dd>
          <dt>Environment</dt>
          <dd>{state.info.environment}</dd>
        </dl>
      )}
      {state.status === 'error' && <p role="alert">The API is not reachable ({state.code}).</p>}
    </main>
  );
}
