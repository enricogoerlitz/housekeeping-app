import { useMembersById, usePackingBagItems, usePackingBags } from '@housekeeping/api';
import { bagSummary, orderedBags, type Id } from '@housekeeping/core';
import {
  Avatar,
  Button,
  EmptyState,
  Icon,
  List,
  ListDetail,
  ListRow,
  Screen,
  ScreenHeader,
  Text,
  useBreakpoint,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useBackToManage } from '@/features/manage/navigation';
import { useOnlineOnly } from '@/features/shell/offline';
import { ScrollColumn } from '@/features/shell/scroll-column';
import { usePageParams } from '@/lib/url-state';

import { TripWindowHost } from '@/features/trips/trip-window';

import { UpcomingPackingLists } from './bag-trips';
import { PackingBagPanel } from './packing-bag-detail';
import { BagNameSheet } from './packing-bag-sheets';

/**
 * The household's Reisetaschen (AC-001, AC-002): "+ Neue Reisetasche" on top, then each bag with
 * "12 Packstücke" and the avatar of the person it is for. A bag opens as a page on phones and in
 * the right column on wide screens.
 */
function BagsList(props: { selectedId?: Id; onSelect: (bagId: Id) => void }) {
  const bags = orderedBags(usePackingBags());
  const items = usePackingBagItems();
  const membersById = useMembersById();
  const online = useOnlineOnly();
  const { isPhone } = useBreakpoint();
  const [creating, setCreating] = useState(false);

  const countOf = (bagId: Id) => items.filter((item) => item.bagId === bagId).length;
  const newButton = (primary: boolean, label: string) => (
    <Button
      label={label}
      icon="plus"
      variant={primary ? 'primary' : 'secondary'}
      disabled={online.disabled}
      hint={online.hint}
      onPress={() => setCreating(true)}
      testID="bag-new"
    />
  );

  return (
    <View testID="bags-list">
      {online.hint ? (
        <Text variant="small" color="warn" style={{ marginBottom: 10 }} testID="bags-hint">
          {online.hint}
        </Text>
      ) : null}
      <UpcomingPackingLists />
      {bags.length === 0 ? (
        <EmptyState
          icon="luggage"
          title="Noch keine Reisetaschen"
          text="Pack einmal zusammen, was in eine Tasche gehört, z. B. „Strand“ oder „Kulturbeutel“. Beim Eintragen einer Reise wird daraus die Packliste."
          testID="bags-empty"
        >
          {newButton(true, 'Reisetasche anlegen')}
        </EmptyState>
      ) : (
        <>
          <View style={{ marginBottom: 16, alignItems: 'flex-start' }}>
            {newButton(false, 'Neue Reisetasche')}
          </View>
          <List>
            {bags.map((bag) => {
              const member = bag.memberId ? membersById[bag.memberId] : undefined;
              const summary = bagSummary(countOf(bag.id));
              return (
                <ListRow
                  key={bag.id}
                  title={bag.name}
                  subtitle={summary}
                  accessibilityLabel={[bag.name, summary, member ? `für ${member.name}` : '']
                    .filter(Boolean)
                    .join(', ')}
                  leading={<Icon name="luggage" color="muted" />}
                  trailing={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {member ? (
                        <Avatar
                          name={member.name}
                          color={member.color}
                          testID={`bag-${bag.id}-member`}
                        />
                      ) : null}
                      {isPhone ? <Icon name="chevron-right" color="muted" /> : null}
                    </View>
                  }
                  selected={!isPhone && bag.id === props.selectedId}
                  onPress={() => props.onSelect(bag.id)}
                  testID={`bag-${bag.id}`}
                />
              );
            })}
          </List>
        </>
      )}
      {creating ? (
        <BagNameSheet
          onSaved={(bagId) => {
            setCreating(false);
            props.onSelect(bagId);
          }}
          onOpenExisting={(bagId) => {
            setCreating(false);
            props.onSelect(bagId);
          }}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </View>
  );
}

/**
 * "Verwalten" → "Reisetaschen" (spec 0012, REQ-001): the list, on wide screens list and detail
 * side by side. Reading works offline; every change needs the network.
 */
export function PackingBagsScreen() {
  const bags = orderedBags(usePackingBags());
  const router = useRouter();
  const back = useBackToManage();
  const { isPhone } = useBreakpoint();
  // The chosen bag stands in the address (spec 0019, REQ-014); on phones the same `tasche`
  // opens the bag's page.
  const address = usePageParams('reisetaschen');
  const chosenId = address.params.tasche;
  const replace = address.replace;
  useEffect(() => {
    if (!isPhone || !chosenId) return;
    replace({ tasche: undefined });
    router.push({ pathname: '/reisetasche/[id]', params: { id: chosenId } });
  }, [isPhone, chosenId, replace, router]);

  // On wide screens a bag is always shown: the chosen one, else the first.
  const selected = bags.find((bag) => bag.id === chosenId) ?? bags[0];
  const select = (bagId: Id) => {
    if (isPhone) router.push({ pathname: '/reisetasche/[id]', params: { id: bagId } });
    else replace({ tasche: bagId });
  };

  return (
    <Screen
      testID="bags-screen"
      clearFab={false}
      header={<ScreenHeader title="Reisetaschen" onBack={back} testID="bags-title" />}
      scroll={isPhone}
      style={isPhone ? undefined : { flex: 1, paddingBottom: 0 }}
    >
      {isPhone ? (
        <BagsList onSelect={select} />
      ) : (
        <ListDetail
          list={
            <ScrollColumn>
              <BagsList selectedId={selected?.id} onSelect={select} />
            </ScrollColumn>
          }
          detail={
            selected ? (
              <PackingBagPanel
                key={selected.id}
                bagId={selected.id}
                showTitle
                onOpen={(bagId) => replace({ tasche: bagId })}
                onDeleted={() => replace({ tasche: undefined })}
              />
            ) : undefined
          }
          placeholder={{
            icon: 'luggage',
            title: 'Noch keine Reisetasche',
            text: 'Leg links eine Reisetasche an. Dann trägst du hier ihre Packstücke ein.',
          }}
          testID="bags-split"
        />
      )}
      <TripWindowHost page="reisetaschen" />
    </Screen>
  );
}
