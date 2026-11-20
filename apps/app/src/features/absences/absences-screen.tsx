import { Screen, ScreenHeader } from '@housekeeping/ui';

import { useBackToManage } from '@/features/manage/navigation';

import { AbsenceSection } from './absence-section';

/** "Verwalten" → "Abwesenheiten" (spec 0005, AC-058), with the content the settings had. */
export function AbsencesScreen() {
  const back = useBackToManage();
  return (
    <Screen testID="absences-screen" maxWidth={760} clearFab={false}>
      <ScreenHeader title="Abwesenheiten" onBack={back} />
      <AbsenceSection />
    </Screen>
  );
}
