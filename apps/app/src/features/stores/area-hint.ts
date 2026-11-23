import { useStores } from '@housekeeping/api';
import { toast } from '@housekeeping/ui';
import { useRouter } from 'expo-router';

import { originFor } from '@/lib/url-state';

/**
 * The hint after a new area, wherever it was created (spec 0025, AC-049): with stores it says
 * where it lands, "Backzutaten steht in jedem Markt am Ende" with "Märkte ›"; without a store only
 * "„Backzutaten“ angelegt".
 */
export function useNewAreaHint(): (name: string) => void {
  const stores = useStores();
  const router = useRouter();
  return (name) => {
    const trimmed = name.trim().replace(/\s+/g, ' ');
    toast.show(
      stores.length > 0
        ? {
            message: `${trimmed} steht in jedem Markt am Ende`,
            actionLabel: 'Märkte ›',
            onAction: () => {
              // From another section "Zurück" leads there again (spec 0031, REQ-036).
              const von = originFor('verwalten');
              router.navigate({ pathname: '/maerkte', params: von ? { von } : {} });
            },
          }
        : { message: `„${trimmed}“ angelegt` },
    );
  };
}
