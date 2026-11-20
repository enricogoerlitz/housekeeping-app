import { useRouter, type Href } from 'expo-router';

/**
 * Opens a page under "Verwalten". Each lives in its own tab that the tab bar does not show, so
 * no tab is highlighted and "Zurück" returns to the page it was opened from (AC-054).
 */
export function useOpenManageEntry(): (href: Href) => void {
  const router = useRouter();
  return (href) => router.navigate(href);
}

/**
 * "Zurück" on a page under "Verwalten": to the page it was opened from, or to "Verwalten" when it
 * was opened directly (deep link, reload), so the arrow never leads out of the app (AC-004).
 */
export function useBackToManage(): () => void {
  const router = useRouter();
  return () => {
    if (router.canGoBack()) router.back();
    else router.replace('/verwalten');
  };
}
