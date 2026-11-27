// The household tools of the agent (spec 0067, REQ-007, decision 4): every read runs as the
// caller (her JWT, RLS) and is filtered by the chat's household, which comes from our row and was
// checked by requireMember — never from the model. The model's arguments only reach core
// agent-tools.ts, which checks them against allow-lists and compares in code (AC-015); the tables,
// columns and filter values of a read are fixed there.
import {
  parseToolCall,
  runTool,
  toolReads,
  type ToolData,
  type ToolRead,
  type ToolRow,
  type ToolStep,
} from '../_shared/agent-tools.gen.ts';
import type { UserClient } from '../_shared/deps.ts';

/** PostgREST answers at most this many rows (max_rows); larger tables come in pages. */
const PAGE = 1000;
const MAX_PAGES = 5;

/** The household's day, members and meal slots: read once per answer, for every tool call. */
export interface ToolBase {
  today: string;
  timeZone: string;
  members: ToolData['members'];
  mealSlots: ToolData['mealSlots'];
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** "2026-11-27" in the zone, Europe/Berlin when the zone is unknown (AC-025). */
function dayIn(now: Date, timeZone: string): string {
  const format = (zone: string) =>
    new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: zone,
    }).format(now);
  try {
    return format(timeZone);
  } catch {
    return format('Europe/Berlin');
  }
}

export async function loadToolBase(
  client: UserClient,
  householdId: string,
  now: Date,
): Promise<ToolBase> {
  const [household, members] = await Promise.all([
    client.from('households').select('id,timezone,meal_slots').eq('id', householdId).limit(1),
    client
      .from('household_members')
      .select('household_id,profile_id')
      .eq('household_id', householdId)
      .limit(PAGE),
  ]);
  if (household.error || members.error) throw new Error('tool_base_failed');
  const row = record(Array.isArray(household.data) ? household.data[0] : undefined);
  const timeZone =
    typeof row.timezone === 'string' && row.timezone ? row.timezone : 'Europe/Berlin';
  const ids = (Array.isArray(members.data) ? members.data : []).flatMap((member) => {
    const id = record(member).profile_id;
    return typeof id === 'string' ? [id] : [];
  });
  // Only the names of this household's members: profiles of other households she shares stay out.
  const profiles =
    ids.length > 0
      ? await client.from('profiles').select('id,name').in('id', ids).limit(PAGE)
      : { data: [], error: null };
  if (profiles.error) throw new Error('tool_base_failed');
  const slots = Array.isArray(row.meal_slots) ? row.meal_slots : [];
  return {
    timeZone,
    today: dayIn(now, timeZone),
    members: (Array.isArray(profiles.data) ? profiles.data : []).flatMap((entry) => {
      const profile = record(entry);
      return typeof profile.id === 'string' && ids.includes(profile.id)
        ? [{ id: profile.id, name: typeof profile.name === 'string' ? profile.name : '' }]
        : [];
    }),
    mealSlots: slots.flatMap((entry) => {
      const slot = record(entry);
      return typeof slot.id === 'string'
        ? [
            {
              id: slot.id,
              name: typeof slot.name === 'string' ? slot.name : '',
              sort: typeof slot.sort === 'number' ? slot.sort : 99,
            },
          ]
        : [];
    }),
  };
}

/** One fixed read of the household, in stable pages (ratings and favourites by their key). */
async function readRows(
  client: UserClient,
  householdId: string,
  read: ToolRead,
): Promise<ToolRow[]> {
  const columns = read.columns.split(',');
  const order = columns.includes('id') ? ['id'] : columns.slice(0, 2);
  const rows: ToolRow[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    let query = client.from(read.table).select(read.columns).eq('household_id', householdId);
    for (const filter of read.filters) query = query[filter.op](filter.column, filter.value);
    for (const column of order) query = query.order(column);
    const { data, error } = await query.range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error('tool_read_failed');
    const chunk = (Array.isArray(data) ? data : []).map(record);
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return rows;
}

/**
 * Runs one function call of the model. Never throws: a failed read is an error for the model and
 * a step that says so, so the answer goes on.
 */
export async function runHouseholdTool(
  call: { name: string; args: string },
  context: { client: UserClient; householdId: string; base: ToolBase; stepId: string },
): Promise<{ output: string; step: ToolStep }> {
  const parsed = parseToolCall(call.name, call.args);
  const empty: ToolData = {
    rows: {},
    today: context.base.today,
    members: context.base.members,
    mealSlots: context.base.mealSlots,
  };
  if (!parsed.ok) return runTool(parsed, empty, context.stepId);
  try {
    const reads = toolReads(parsed, context.base.today);
    const tables = await Promise.all(
      reads.map((read) => readRows(context.client, context.householdId, read)),
    );
    const rows: ToolData['rows'] = {};
    reads.forEach((read, index) => {
      rows[read.table] = [...(rows[read.table] ?? []), ...(tables[index] ?? [])];
    });
    return runTool(parsed, { ...empty, rows }, context.stepId);
  } catch {
    console.error('ai_agent_tool_failed', { tool: parsed.name });
    const failed = runTool(parsed, empty, context.stepId);
    return {
      output: JSON.stringify({ error: 'tool_failed' }),
      step: {
        ...failed.step,
        detail: 'konnte nicht lesen',
        details: [],
        count: undefined,
        countLabel: undefined,
      },
    };
  }
}
