// "Haushalt & Mitglieder" (spec 0018, REQ-004): removing a member and leaving a household ask
// first. Only the question; the server still decides who may remove whom (RLS).

export interface MemberRemovalPrompt {
  title: string;
  message?: string;
  confirmLabel: string;
}

/**
 * "Nadja aus „Enrico & Nadja“ entfernen?" (AC-010); for myself "„Enrico & Nadja“ verlassen?"
 * with the way back (AC-011), and a word when it is my only household (AC-012).
 */
export function memberRemovalPrompt(input: {
  memberName: string;
  householdName: string;
  self: boolean;
  householdCount: number;
}): MemberRemovalPrompt {
  if (!input.self) {
    return {
      title: `${input.memberName} aus „${input.householdName}“ entfernen?`,
      confirmLabel: 'Entfernen',
    };
  }
  const wayBack = 'Zurück kommst du nur mit einer neuen Einladung.';
  return {
    title: `„${input.householdName}“ verlassen?`,
    message: input.householdCount <= 1 ? `Das ist dein einziger Haushalt. ${wayBack}` : wayBack,
    confirmLabel: 'Verlassen',
  };
}
