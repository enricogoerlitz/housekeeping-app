// Zod probes `new Function` to compile faster parsers. The web app's Content Security Policy has
// no 'unsafe-eval', so the probe would only log a CSP violation; parsing works the same without it.
import { z } from 'zod';

z.config({ jitless: true });
