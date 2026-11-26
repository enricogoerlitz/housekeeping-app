// The parts of the Deno runtime these functions use, so tsc can check them under Node.
declare namespace Deno {
  function serve(handler: (request: Request) => Response | Promise<Response>): unknown;
  const env: { get(name: string): string | undefined };
  function resolveDns(query: string, recordType: 'A' | 'AAAA'): Promise<string[]>;
}
