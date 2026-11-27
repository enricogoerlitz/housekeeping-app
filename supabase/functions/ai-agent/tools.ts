// The household tools of the agent (spec 0066, decision 14: step 2). Each runs as the caller
// (her JWT, RLS) and answers the model with a JSON string; none exist in step 1, so an unknown
// function call is closed with an error and the answer ends.
import type { UserClient } from '../_shared/deps.ts';

export interface DataTool {
  run(args: string, context: { client: UserClient; householdId: string }): Promise<string>;
}

export const DATA_TOOLS: Readonly<Record<string, DataTool>> = {};
