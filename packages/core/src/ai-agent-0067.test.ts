import { describe, expect, it } from 'vitest';

import {
  AGENT_ATTACHMENT_REJECTED,
  AGENT_LIMITS,
  AgentRequestSchema,
  attachmentKind,
  contextBlock,
  messagesFromItems,
  type AgentPlace,
} from './ai-agent';

// Spec 0067 "Housekeeping-Agent", step A: badges and the household's day in the context block,
// attachments in the request.

const HOUSEHOLD = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-11-27T17:45:00Z');
const here: AgentPlace = {
  source: 'device',
  label: 'Aktueller Standort',
  location: { lat: 52.510612, lng: 13.459487 },
  radius: 'walk',
};
const base = {
  action: 'send',
  householdId: HOUSEHOLD,
  message: 'Was steht am Wochenende an?',
  place: here,
  timeZone: 'Europe/Berlin',
};

const JPEG = `data:image/jpeg;base64,${'A'.repeat(400)}`;
const PDF = `data:application/pdf;base64,${'A'.repeat(400)}`;

describe('context block of the household agent', () => {
  it('AC-008: both badges go into the context as hints, not as a lock', () => {
    const block = contextBlock({
      place: here,
      now: NOW,
      timeZone: 'Europe/Berlin',
      badges: ['rezepte', 'ausgehen'],
    });
    expect(block).toContain(
      'Hinweise der Person: Rezepte, Ausgehen (nur Hinweise – passt die Frage nicht dazu, folge der Frage)',
    );
  });

  it('without badges there is no hint line', () => {
    const block = contextBlock({ place: here, now: NOW, timeZone: 'Europe/Berlin', badges: [] });
    expect(block).not.toContain('Hinweise');
  });

  it("AC-025: the household's day is Berlin's, also when UTC is still on the day before", () => {
    const lateEvening = contextBlock({
      place: here,
      now: new Date('2026-11-27T22:30:00Z'),
      timeZone: 'Europe/Berlin',
      householdTimeZone: 'Europe/Berlin',
    });
    expect(lateEvening).toContain('Heute im Haushalt: Freitag, 2026-11-27 (Europe/Berlin)');
    const afterMidnight = contextBlock({
      place: here,
      now: new Date('2026-11-27T23:30:00Z'),
      timeZone: 'UTC',
      householdTimeZone: 'Europe/Berlin',
    });
    expect(afterMidnight).toContain('Heute im Haushalt: Samstag, 2026-11-28 (Europe/Berlin)');
  });

  it('an unknown household zone falls back to Europe/Berlin', () => {
    const block = contextBlock({
      place: here,
      now: NOW,
      timeZone: 'Europe/Berlin',
      householdTimeZone: 'Mars/Olympus',
    });
    expect(block).toContain('Heute im Haushalt: Freitag, 2026-11-27 (Europe/Berlin)');
  });

  it('the device without a location says that no place is known', () => {
    const block = contextBlock({
      place: { source: 'device', label: 'Aktueller Standort', radius: 'walk' },
      now: NOW,
      timeZone: 'Europe/Berlin',
    });
    expect(block).toContain('Ort: unbekannt (kein Standort mitgeschickt)');
    expect(block).not.toContain('Koordinaten');
  });
});

describe('request with badges and attachments', () => {
  it('AC-008: takes several badges; missing badges are none', () => {
    const parsed = AgentRequestSchema.parse({ ...base, badges: ['rezepte', 'ausgehen'] });
    expect(parsed.action === 'send' && parsed.badges).toEqual(['rezepte', 'ausgehen']);
    const plain = AgentRequestSchema.parse(base);
    expect(plain.action === 'send' && plain.badges).toEqual([]);
    expect(plain.action === 'send' && plain.attachments).toEqual([]);
  });

  it('refuses an unknown badge, a badge twice and more than five', () => {
    expect(AgentRequestSchema.safeParse({ ...base, badges: ['admin'] }).success).toBe(false);
    expect(AgentRequestSchema.safeParse({ ...base, badges: ['rezepte', 'rezepte'] }).success).toBe(
      false,
    );
  });

  it('takes JPEG photos and PDF files as data URLs, at most four', () => {
    const parsed = AgentRequestSchema.parse({
      ...base,
      attachments: [
        { kind: 'image', dataUrl: JPEG },
        { kind: 'pdf', name: 'Rezept.pdf', dataUrl: PDF },
      ],
    });
    expect(parsed.action === 'send' && parsed.attachments.length).toBe(2);
    expect(
      AgentRequestSchema.safeParse({
        ...base,
        attachments: Array.from({ length: AGENT_LIMITS.attachments + 1 }, () => ({
          kind: 'image',
          dataUrl: JPEG,
        })),
      }).success,
    ).toBe(false);
  });

  it('AC-010: refuses any other format and a photo that is not a JPEG', () => {
    const docx = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,AAAA`;
    expect(
      AgentRequestSchema.safeParse({
        ...base,
        attachments: [{ kind: 'pdf', name: 'a.docx', dataUrl: docx }],
      }).success,
    ).toBe(false);
    expect(
      AgentRequestSchema.safeParse({
        ...base,
        attachments: [{ kind: 'image', dataUrl: 'data:image/png;base64,AAAA' }],
      }).success,
    ).toBe(false);
    expect(
      AgentRequestSchema.safeParse({
        ...base,
        attachments: [{ kind: 'image', dataUrl: 'data:image/jpeg;base64,<script>' }],
      }).success,
    ).toBe(false);
  });

  it('a message of only a photo is fine', () => {
    expect(
      AgentRequestSchema.safeParse({
        ...base,
        message: '',
        attachments: [{ kind: 'image', dataUrl: JPEG }],
      }).success,
    ).toBe(true);
    expect(AgentRequestSchema.safeParse({ ...base, message: '' }).success).toBe(false);
  });
});

describe('attachment kind in the app (AC-010)', () => {
  it('photos (HEIC from the iPhone too) and PDF are taken, the rest is refused', () => {
    expect(attachmentKind({ type: 'image/heic', name: 'IMG_1.HEIC' })).toBe('image');
    expect(attachmentKind({ type: 'image/png', name: 'a.png' })).toBe('image');
    expect(attachmentKind({ type: 'application/pdf', name: 'Rezept.pdf' })).toBe('pdf');
    expect(attachmentKind({ type: '', name: 'Rezept.PDF' })).toBe('pdf');
    expect(
      attachmentKind({
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        name: 'Rezept.docx',
      }),
    ).toBeUndefined();
    expect(AGENT_ATTACHMENT_REJECTED).toBe('Dieses Format geht nicht – Fotos und PDF schon');
  });
});

describe('stored messages with attachments', () => {
  it('counts the photos and files of a user message, never shows their data', () => {
    const messages = messagesFromItems([
      {
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: '[KONTEXT]\nOrt: x\n[/KONTEXT]' },
          { type: 'input_text', text: 'Was ist das?' },
          { type: 'input_image', image_url: JPEG },
          { type: 'input_file', filename: 'a.pdf', file_data: PDF },
        ],
      },
    ]);
    expect(messages).toEqual([
      expect.objectContaining({ role: 'user', text: 'Was ist das?', attachments: 2 }),
    ]);
    expect(JSON.stringify(messages)).not.toContain('base64');
  });

  it('AC-016: two tool calls of a stored answer are two step rows above its text', () => {
    const messages = messagesFromItems(
      [
        { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Wochenende?' }] },
        { type: 'function_call', name: 'calendar', call_id: 'c1', arguments: '{}' },
        { type: 'function_call', name: 'list_chores', call_id: 'c2', arguments: '{}' },
        { type: 'function_call_output', call_id: 'c1', output: '{"total":4}' },
        { type: 'function_call_output', call_id: 'c2', output: '{"total":1}' },
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Am Samstag …' }],
        },
      ],
      {
        toolStep: (name, _args, output, id) => ({
          id,
          kind: 'tool',
          label: name,
          details: [],
          count: (JSON.parse(output) as { total: number }).total,
          status: 'done',
        }),
      },
    );
    expect(messages[1]?.steps.map((step) => [step.label, step.count])).toEqual([
      ['calendar', 4],
      ['list_chores', 1],
    ]);
    expect(messages[1]?.text).toBe('Am Samstag …');
  });
});
