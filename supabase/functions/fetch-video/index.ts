import { liveDeps } from '../_shared/live.ts';
import { handler } from './handler.ts';

const deps = liveDeps();
Deno.serve((request) => handler(request, deps));
