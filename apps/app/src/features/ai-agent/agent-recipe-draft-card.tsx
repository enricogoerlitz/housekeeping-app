import { useAgentProposalData } from '@housekeeping/api';
import { newRecipe, normalizeText, type RecipeDraftReply } from '@housekeeping/core';
import { Badge, Button, Icon, Photo, Surface, Text, useTheme } from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { draftPhoto, handOverNewRecipe } from '@/features/recipes/ai-draft';
import { toastUnreadLinks, useDraftInput } from '@/features/recipes/ai-fill';
import { useOpenRecipe } from '@/features/recipes/navigation';

import { useDraftPhoto } from './agent-draft-photo';
import { AgentEntities } from './agent-entities';
import { useAgentOpen } from './agent-open';

// Spec 0067, REQ-010: a recipe draft of the agent in the chat — title, portions, time and the
// ingredients, each marked "neu" when the household's catalogue does not have it (the same
// matching as "Mit KI ausfüllen"). "Prüfen und anlegen" opens the known recipe editor in draft
// mode; nothing is saved before "Anlegen" there. A photo taken in the chat goes along, otherwise
// the photo of the page, as "Mit KI ausfüllen" does without "Foto generieren".

const MAX_SHOWN = 12;

/** The recipe each draft became with "Prüfen und anlegen", while the page is open. */
const handedRecipes = new WeakMap<RecipeDraftReply, string>();
const sameTitle = (a: string, b: string) => normalizeText(a) === normalizeText(b);

export function AgentRecipeDraftCard(props: { reply: RecipeDraftReply; testID: string }) {
  const { reply, testID } = props;
  const theme = useTheme();
  const toInput = useDraftInput();
  const openRecipe = useOpenRecipe();
  const openEntry = useAgentOpen();
  const chatPhoto = useDraftPhoto();
  const [opening, setOpening] = useState(false);
  const data = useAgentProposalData();
  // Preview 28.11.: once the draft is a recipe (saved here, or one of that title when the chat
  // is opened later) the card opens it instead of drafting again.
  const handedId = handedRecipes.get(props.reply);
  const saved =
    (handedId ? data?.recipes.find((recipe) => recipe.id === handedId) : undefined) ??
    (data
      ? data.recipes.find((recipe) => sameTitle(recipe.title, props.reply.draft.title))
      : undefined);
  // The rows as the editor will show them (catalogue matching).
  const input = toInput(reply);
  const { draft } = reply;
  const rows = input.ingredients ?? [];
  const fresh = rows.filter((row) => row.article?.kind !== 'article').length;
  const meta = [
    `${draft.servings} ${draft.servings === 1 ? 'Portion' : 'Portionen'}`,
    draft.totalMinutes ? `${draft.totalMinutes} Min.` : '',
    fresh > 0 ? `${fresh} neu im Katalog` : 'alles im Katalog',
  ]
    .filter(Boolean)
    .join(' · ');

  const check = async () => {
    if (opening) return;
    setOpening(true);
    const handed = toInput(reply);
    if (chatPhoto?.sourceUrl)
      handed.links = [...(handed.links ?? []), { url: chatPhoto.sourceUrl, label: 'Fotoquelle' }];
    const recipe = newRecipe({
      id: crypto.randomUUID(),
      kind: 'recipe',
      title: handed.title ?? draft.title,
      servings: draft.servings,
      createdAt: new Date().toISOString(),
    });
    const photo =
      chatPhoto?.photo ?? (await draftPhoto(reply, { generatePhoto: false })).photo ?? undefined;
    handOverNewRecipe(recipe, handed, photo);
    handedRecipes.set(reply, recipe.id);
    setOpening(false);
    openRecipe(recipe.id);
    toastUnreadLinks(reply.sources);
  };

  return (
    <Surface testID={testID} style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        {chatPhoto ? (
          <Photo
            source={{ uri: chatPhoto.uri }}
            width={56}
            height={56}
            radius={theme.shape.radius.control}
            alt="Foto zum Entwurf"
          />
        ) : (
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: theme.shape.radius.control,
              backgroundColor: theme.colors.surfaceSunken,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="chef-hat" color="muted" />
          </View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="caption" color="muted">
            Rezeptentwurf
          </Text>
          <Text variant="bodyStrong" testID={`${testID}-title`}>
            {draft.title}
          </Text>
          <Text variant="small" color="muted" testID={`${testID}-meta`}>
            {meta}
          </Text>
        </View>
      </View>
      <View style={{ gap: 4 }} testID={`${testID}-ingredients`}>
        {rows.slice(0, MAX_SHOWN).map((row, index) => (
          <View
            key={row.key}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            testID={`${testID}-ingredient-${index}`}
          >
            <Text variant="small" color="muted" style={{ minWidth: 64 }}>
              {row.amountText}
            </Text>
            <Text variant="small" style={{ flexShrink: 1 }}>
              {row.name}
            </Text>
            {row.article?.kind !== 'article' ? (
              <Badge label="neu" tone="accent" testID={`${testID}-new-${index}`} />
            ) : null}
          </View>
        ))}
        {rows.length > MAX_SHOWN ? (
          <Text variant="small" color="muted">
            und {rows.length - MAX_SHOWN} weitere
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {saved ? (
          <Button
            label="Öffnen"
            icon="arrow-right"
            variant="secondary"
            size="sm"
            onPress={() => openEntry({ kind: 'recipe', id: saved.id })}
            accessibilityLabel={`${saved.title} öffnen`}
            testID={`${testID}-open`}
          />
        ) : (
          <Button
            label="Prüfen und anlegen"
            icon="pencil"
            size="sm"
            disabled={opening}
            onPress={() => void check()}
            testID={`${testID}-check`}
          />
        )}
      </View>
      {saved ? (
        <AgentEntities
          extra={{
            kind: 'entities',
            id: `${testID}-saved`,
            items: [{ kind: 'recipe', id: saved.id }],
          }}
          testID={`${testID}-saved`}
        />
      ) : null}
    </Surface>
  );
}
