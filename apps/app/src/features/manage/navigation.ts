import { useRouter, type Href } from 'expo-router';

/**
 * Opens a page under "Verwalten". Each lives in its own tab that the tab bar does not show, so
 * no tab is highlighted and "Zurück" returns to the page it was opened from (AC-054).
 */
export function useOpenManageEntry(): (href: Href) => void {
  const router = useRouter();
  return (href) => router.navigate(href);
}
