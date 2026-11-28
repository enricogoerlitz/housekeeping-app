import type { Id } from '@housekeeping/core';
import { useBreakpoint, useTheme } from '@housekeeping/ui';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Modal, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActivityDetail, type ActivityWindow } from '@/features/activities/activity-detail';
import { useOpenActivity } from '@/features/activities/navigation';
import { RecipeDetail } from '@/features/recipes/recipe-detail';
import { useOpenRecipe } from '@/features/recipes/navigation';
import { RestaurantDetail, type RestaurantWindow } from '@/features/restaurants/restaurant-detail';
import { useOpenRestaurant } from '@/features/restaurants/navigation';

// Spec 0067, decision 29 (preview 28.11.): the household's own entries opened from the chat stay
// beside it — on the phone a window over the whole chat (closing it returns to the same place of
// the chat, like the Maps link), on wider screens a panel to the right of the chat; another card
// replaces the panel. Outside the agent page the entries open as usual.

export interface OpenTarget {
  kind: 'recipe' | 'collection' | 'restaurant' | 'activity';
  id: Id;
  /**
   * Opens the entry anew even when it is shown already: "Änderung ansehen" of a second change
   * card for the recipe beside the chat must start "Mit KI ändern" again (review D, 28.11.).
   */
  again?: number;
}

const OpenContext = createContext<((target: OpenTarget) => void) | undefined>(undefined);

/** Opens an entry: beside the chat on the agent page, otherwise its own page. */
export function useAgentOpen(): (target: OpenTarget) => void {
  const inChat = useContext(OpenContext);
  const openRecipe = useOpenRecipe();
  const openRestaurant = useOpenRestaurant();
  const openActivity = useOpenActivity();
  return (target) => {
    if (inChat) inChat(target);
    else if (target.kind === 'restaurant') openRestaurant(target.id);
    else if (target.kind === 'activity') openActivity(target.id);
    else openRecipe(target.id);
  };
}

/** The width of the panel beside the chat on wide screens. */
const PANEL_WIDTH = 560;

function Detail(props: {
  target: OpenTarget;
  onClose: () => void;
  onOpen: (target: OpenTarget) => void;
}) {
  const [placeWindow, setPlaceWindow] = useState<RestaurantWindow | ActivityWindow | undefined>();
  const { target } = props;
  if (target.kind === 'restaurant')
    return (
      <RestaurantDetail
        restaurantId={target.id}
        onClose={props.onClose}
        window={placeWindow}
        onWindow={setPlaceWindow}
        onDeleted={props.onClose}
        onOpen={(id) => props.onOpen({ kind: 'restaurant', id })}
      />
    );
  if (target.kind === 'activity')
    return (
      <ActivityDetail
        activityId={target.id}
        onClose={props.onClose}
        window={placeWindow}
        onWindow={setPlaceWindow}
        onDeleted={props.onClose}
        onOpen={(id) => props.onOpen({ kind: 'activity', id })}
      />
    );
  return <RecipeDetail recipeId={target.id} onBack={props.onClose} backLabel="AI Agent" quick />;
}

/**
 * The chat with its entry viewer: `children` is the chat page; an opened entry shows as a window
 * (phone) or a panel beside it.
 */
export function AgentOpenHost(props: { children: ReactNode }) {
  const { isPhone } = useBreakpoint();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [opened, setOpened] = useState<OpenTarget | undefined>();
  const close = () => setOpened(undefined);
  const detail = opened ? (
    <Detail
      key={`${opened.kind}-${opened.id}-${opened.again ?? 0}`}
      target={opened}
      onClose={close}
      onOpen={setOpened}
    />
  ) : null;
  return (
    <OpenContext.Provider value={setOpened}>
      {isPhone ? (
        <>
          {props.children}
          <Modal
            visible={opened !== undefined}
            animationType="slide"
            onRequestClose={close}
            transparent={false}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: theme.colors.bg,
                paddingTop: insets.top,
                paddingHorizontal: theme.shape.gutter,
              }}
              testID="agent-open-window"
            >
              {detail}
            </View>
          </Modal>
        </>
      ) : (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={{ flex: 1 }}>{props.children}</View>
          {detail ? (
            <View
              testID="agent-open-panel"
              style={{
                width: PANEL_WIDTH,
                paddingHorizontal: 24,
                borderLeftWidth: 1,
                borderLeftColor: theme.colors.border,
                backgroundColor: theme.colors.bg,
              }}
            >
              {detail}
            </View>
          ) : null}
        </View>
      )}
    </OpenContext.Provider>
  );
}
