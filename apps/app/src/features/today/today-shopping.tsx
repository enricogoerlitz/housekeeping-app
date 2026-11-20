import {
  splitItems,
  useArticlesById,
  useHousehold,
  useShoppingItems,
  useShoppingLists,
} from '@housekeeping/api';
import { summarizeItem } from '@housekeeping/core';
import { Button, Icon, List, ListRow, Row, Section, Text, useTheme } from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

const PREVIEW_ITEMS = 4;

/** "Einkauf": open items of the default list and the way into store mode. */
export function TodayShopping(props: { preview: boolean }) {
  const router = useRouter();
  const theme = useTheme();
  const household = useHousehold();
  const lists = useShoppingLists();
  const items = useShoppingItems();
  const articlesById = useArticlesById();
  const list = lists.find((candidate) => candidate.id === household.defaultListId);
  const { open } = splitItems(items, household.defaultListId);
  const preview = props.preview ? open.slice(0, PREVIEW_ITEMS) : [];

  return (
    <Section
      title="Einkauf"
      tone="liste"
      testID="today-shopping"
      action={
        <Text variant="small" color="muted" testID="today-shopping-count">
          {open.length} offen
        </Text>
      }
    >
      <Pressable
        testID="today-shopping-open"
        accessibilityRole="button"
        accessibilityLabel={`${list?.name ?? 'Liste'} öffnen, ${open.length} offen`}
        onPress={() => router.push('/liste')}
        style={(state) => ({
          opacity: state.pressed ? 0.7 : 1,
          borderRadius: theme.shape.radius.card,
        })}
      >
        {preview.length > 0 ? (
          <List>
            {preview.map((item) => {
              const summary = summarizeItem(item);
              return (
                <ListRow
                  key={item.id}
                  title={articlesById[item.articleId]?.name ?? 'Artikel'}
                  note={summary.notes[0]}
                  trailing={
                    summary.amount ? (
                      <Text variant="body" color="muted">
                        {summary.amount}
                      </Text>
                    ) : undefined
                  }
                />
              );
            })}
          </List>
        ) : null}
        <Row gap={6} style={{ marginTop: preview.length > 0 ? 8 : 0, minHeight: 36 }}>
          <Icon name="shopping-basket" size={17} color="muted" />
          <Text variant="small" color="muted" style={{ flex: 1 }}>
            {open.length === 0
              ? `${list?.name ?? 'Standardliste'} ist leer`
              : open.length > preview.length && preview.length > 0
                ? `und ${open.length - preview.length} weitere auf der ${list?.name ?? 'Standardliste'}`
                : (list?.name ?? 'Standardliste')}
          </Text>
          <Icon name="chevron-right" size={17} color="muted" />
        </Row>
      </Pressable>
      {open.length > 0 ? (
        <View style={{ marginTop: 10 }}>
          <Button
            label="Einkaufen"
            icon="shopping-basket"
            full={props.preview}
            onPress={() => router.push('/einkaufen')}
            testID="today-shop"
          />
        </View>
      ) : null}
    </Section>
  );
}
