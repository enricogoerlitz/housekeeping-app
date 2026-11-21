import { AreaStack } from '@/features/shell/area-stack';

// "Aktivitäten" and one activity open in the calendar's stack, so they keep the tab bar and the
// sidebar, and the calendar underneath keeps its view and period (spec 0010, AC-025).
export const unstable_settings = { anchor: 'index' };

export default AreaStack;
