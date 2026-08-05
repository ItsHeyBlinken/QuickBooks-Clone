import { spawn, ChildProcess } from 'child_process';
import { createInterface } from 'readline';

export class LedgerClient {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pending = new Map<number | string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private ledgerPath: string;
  private isDev: boolean;

  constructor(ledgerPath: string, isDev = false) {
    this.ledgerPath = ledgerPath;
    this.isDev = isDev;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      this.process = spawn(pythonCmd, [this.ledgerPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          ...(this.isDev ? { LEDGERLOCAL_DEV: '1' } : {}),
        },
      });

      const rl = createInterface({ input: this.process.stdout! });
      rl.on('line', (line) => {
        try {
          const response = JSON.parse(line);
          const pending = this.pending.get(response.id);
          if (pending) {
            this.pending.delete(response.id);
            if (response.error) {
              pending.reject(new Error(response.error.message));
            } else {
              pending.resolve(response.result);
            }
          }
        } catch {
          // ignore parse errors on stderr lines
        }
      });

      this.process.stderr?.on('data', (data) => {
        console.error('[ledger]', data.toString());
      });

      this.process.on('error', reject);
      this.process.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          console.error(`Ledger process exited with code ${code}`);
        }
      });

      this.call('health.check', {}).then(() => resolve()).catch(reject);
    });
  }

  stop(): void {
    this.process?.kill();
    this.process = null;
  }

  call(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error('Ledger process not running'));
        return;
      }
      const id = ++this.requestId;
      this.pending.set(id, { resolve, reject });
      const request = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      this.process.stdin.write(request + '\n');

      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 30000);
    });
  }
}
