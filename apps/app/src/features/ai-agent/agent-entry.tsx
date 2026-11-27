import { IconButton } from '@housekeeping/ui';
import { useRouter } from 'expo-router';

import { features } from '@/lib/features';

/**
 * ✨ "KI-Agent" in the head of "Restaurants" and "Aktivitäten", next to "+" (spec 0066, REQ-001,
 * Einstieg B). Online or not, it opens the page; offline the page shows "Verlauf" only.
 */
export function AgentEntryButton(props: { from: 'restaurants' | 'aktivitaeten' }) {
  const router = useRouter();
  if (!features.aiAgent) return null;
  return (
    <IconButton
      icon="sparkles"
      label="KI-Agent"
      variant="plain"
      onPress={() =>
        router.push({
          pathname: '/ki-agent',
          params: props.from === 'restaurants' ? { von: 'essen' } : {},
        })
      }
      testID="agent-open"
    />
  );
}
