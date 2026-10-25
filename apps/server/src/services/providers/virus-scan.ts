import { createHash } from 'node:crypto';
import type { Logger } from 'pino';

/**
 * Scanning an uploaded file.
 *
 * The real implementation is ClamAV, behind the `scan` Compose profile,
 * because a 1.5 GB signature database is not something the default stack
 * should pull. The mock is the default — and the mock still *works*, in the
 * sense that matters: it detects the EICAR test file.
 *
 * That detail is the whole point. A mock that always answers "clean" makes the
 * infected branch unreachable and untested, so nobody discovers until
 * production that the quarantine path throws. EICAR exists precisely so an
 * anti-virus path can be exercised without a real virus, and it is safe to
 * commit: it is a 68-byte printable string, not malware.
 */

export type ScanVerdict =
  | { readonly status: 'clean' }
  | { readonly status: 'infected'; readonly signature: string }
  | { readonly status: 'error'; readonly reason: string };

export interface FileScanner {
  readonly name: string;
  scan(bytes: Buffer): Promise<ScanVerdict>;
}

/**
 * The EICAR anti-malware test string, by hash rather than by content.
 *
 * Storing the literal would mean this repository contains a string every
 * anti-virus product on earth flags — which would make the repository itself
 * un-clonable on a managed laptop. The SHA-256 identifies it exactly and is
 * inert.
 */
const EICAR_SHA256 = '275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f';

export class MockFileScanner implements FileScanner {
  readonly name = 'mock';

  constructor(private readonly logger?: Logger) {}

  scan(bytes: Buffer): Promise<ScanVerdict> {
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest === EICAR_SHA256) {
      this.logger?.warn({ scanner: this.name }, 'eicar test file detected');
      return Promise.resolve({ status: 'infected', signature: 'Eicar-Test-Signature' });
    }
    return Promise.resolve({ status: 'clean' });
  }
}

/**
 * ClamAV over its native socket protocol.
 *
 * `INSTREAM` rather than a path, because the file never touches a filesystem
 * clamd can read — the two containers share no volume, and giving the scanner
 * read access to the attachment store would widen what a compromised scanner
 * can reach.
 */
export class ClamAvScanner implements FileScanner {
  readonly name = 'clamav';

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly logger?: Logger,
    private readonly timeoutMs = 30_000,
  ) {}

  async scan(bytes: Buffer): Promise<ScanVerdict> {
    const { connect } = await import('node:net');

    return new Promise<ScanVerdict>((resolve) => {
      const socket = connect({ host: this.host, port: this.port });
      let response = '';
      /* A scanner that is slow, wedged or gone must not hold an upload open.
         The caller treats `error` as "not yet clean", so the file stays
         undownloadable rather than being waved through. */
      const settle = (verdict: ScanVerdict) => {
        socket.destroy();
        resolve(verdict);
      };

      socket.setTimeout(this.timeoutMs, () => {
        settle({ status: 'error', reason: 'timeout' });
      });
      socket.on('error', (error: Error) => {
        this.logger?.error({ err: error }, 'clamav connection failed');
        settle({ status: 'error', reason: 'unreachable' });
      });
      socket.on('data', (chunk: Buffer) => {
        response += chunk.toString('utf8');
      });
      socket.on('end', () => {
        if (response.includes('OK') && !response.includes('FOUND')) {
          resolve({ status: 'clean' });
          return;
        }
        const found = /: (.+) FOUND/.exec(response);
        if (found?.[1]) {
          resolve({ status: 'infected', signature: found[1] });
          return;
        }
        resolve({ status: 'error', reason: response.trim() || 'unexpected response' });
      });

      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        /* INSTREAM is a sequence of length-prefixed chunks ended by a zero
           length. One chunk is fine for files this size. */
        const length = Buffer.alloc(4);
        length.writeUInt32BE(bytes.byteLength);
        socket.write(length);
        socket.write(bytes);
        socket.write(Buffer.from([0, 0, 0, 0]));
      });
    });
  }
}

export function createScanner(
  provider: 'mock' | 'clamav',
  options: { readonly host: string; readonly port: number; readonly logger?: Logger },
): FileScanner {
  return provider === 'clamav'
    ? new ClamAvScanner(options.host, options.port, options.logger)
    : new MockFileScanner(options.logger);
}
