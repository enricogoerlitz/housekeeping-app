import {
  addLink,
  LINK_LIMIT_HINT,
  linkDisplay,
  MAX_LINKS,
  offersVideo,
  validateLink,
  type LinksDraft,
  type Recipe,
  type RecipeLink,
} from '@housekeeping/core';
import {
  Button,
  Icon,
  List,
  ListRow,
  Menu,
  Sheet,
  Stack,
  Text,
  TextField,
  openKeyboardNow,
  toast,
} from '@housekeeping/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { RecipeSection } from './common';
import type { PageEditor } from './use-page-editor';
import { discardFirst } from '@/features/shell/confirm-dialog';
import { errorMessage } from '@/features/shell/error-message';
import { useOnlineOnly } from '@/features/shell/offline';
import { openLink } from '@/lib/open-link';

import { SaveVideoButton, useSaveVideo } from '../recipe-video';

type LinkAction = 'edit' | 'up' | 'down' | 'remove';

/**
 * "Links" under "Notizen" of a recipe or a collection (spec 0023, REQ-009): at most 10, each row
 * the label over the host (or the host alone) with the symbol "öffnet extern"; a tap opens the page
 * in a new tab and the app stays. The app never loads the page. A link that fails the check on the
 * device is plain text. Read and open offline; editing online only. A TikTok link of a recipe
 * whose video is not saved yet has the save button at its right end (spec 0046, REQ-002). "+ Link"
 * in the read view opens the window "Link" and saves at once (spec 0056, REQ-001; replaces spec
 * 0047, AC-011).
 */
export function LinksSection(props: { recipe: Recipe; editor: PageEditor }) {
  const { recipe, editor } = props;
  const draft = editor.draft?.links;
  const video = useSaveVideo(recipe);
  const online = useOnlineOnly();
  const full = recipe.links.length >= MAX_LINKS;
  // "+ Link" saves at once (spec 0056, REQ-001): the window works on the links as stored.
  const [adding, setAdding] = useState<LinksDraft | undefined>();
  const saveAdded = (base: LinksDraft, links: RecipeLink[]) => {
    const hint = editor.saveNow({ ...base, links });
    if (hint) toast.show({ message: hint });
    else setAdding(undefined);
  };
  const add = (
    <View style={{ flexDirection: 'row' }}>
      <Button
        label="Link"
        icon="plus"
        variant="link"
        disabled={online.disabled || full}
        hint={online.hint ?? (full ? LINK_LIMIT_HINT : undefined)}
        onPress={() => {
          openKeyboardNow();
          setAdding(editor.stored().links);
        }}
        testID="recipe-read-add-link"
      />
      {adding ? (
        <LinkSheet
          links={adding.links}
          onApply={(links) => saveAdded(adding, links)}
          onClose={() => setAdding(undefined)}
        />
      ) : null}
    </View>
  );
  return (
    <RecipeSection title="Links" testID="recipe-links">
      {draft ? (
        <LinksFields draft={draft} editor={editor} />
      ) : recipe.links.length === 0 ? (
        <Stack gap={8}>
          <Text color="muted">Noch keine Links.</Text>
          {add}
        </Stack>
      ) : (
        <Stack gap={8}>
          <List>
            {recipe.links.map((link, index) => (
              <LinkRow
                key={link.url}
                link={link}
                testID={`recipe-link-${index}`}
                controls={
                  offersVideo(recipe, link.url) ? (
                    <SaveVideoButton
                      link={link}
                      video={video}
                      testID={`recipe-link-video-${index}`}
                    />
                  ) : undefined
                }
              />
            ))}
          </List>
          {video.error ? (
            <Text variant="small" color="warn" testID="recipe-link-video-error">
              {video.error}
            </Text>
          ) : null}
          {add}
        </Stack>
      )}
    </RecipeSection>
  );
}

function LinkRow(props: {
  link: RecipeLink;
  testID: string;
  trailing?: ReactNode;
  /** Buttons of their own beside the row (spec 0046: the save button of a TikTok link). */
  controls?: ReactNode;
}) {
  const shown = linkDisplay(props.link);
  const href = shown.href;
  return (
    <ListRow
      title={shown.title}
      subtitle={shown.subtitle}
      accessibilityLabel={
        href
          ? `${shown.title}${shown.subtitle ? `, ${shown.subtitle}` : ''}, öffnet extern`
          : undefined
      }
      onPress={href && !props.trailing ? () => openLink(href) : undefined}
      trailing={
        props.trailing ?? (href ? <Icon name="external-link" size={18} color="muted" /> : undefined)
      }
      controls={props.controls}
      testID={props.testID}
    />
  );
}

function LinksFields(props: { draft: LinksDraft; editor: PageEditor }) {
  const { draft, editor } = props;
  // "+ Link" in the read view opened the edit mode with the window (spec 0047, AC-011).
  const [editing, setEditing] = useState<{ index?: number } | undefined>(() =>
    editor.intent?.kind === 'link' ? {} : undefined,
  );
  const { intent, clearIntent } = editor;
  useEffect(() => {
    if (intent?.kind === 'link') clearIntent();
  }, [intent, clearIntent]);
  const set = (links: RecipeLink[]) => editor.change({ ...draft, links });
  const full = draft.links.length >= MAX_LINKS;
  const move = (index: number, to: number) => {
    const links = [...draft.links];
    const [link] = links.splice(index, 1);
    if (link) links.splice(to, 0, link);
    set(links);
  };
  return (
    <Stack gap={12}>
      {draft.links.length === 0 ? <Text color="muted">Noch keine Links.</Text> : null}
      {draft.links.length > 0 ? (
        <List>
          {draft.links.map((link, index) => (
            <LinkRow
              key={link.url}
              link={link}
              testID={`recipe-link-${index}`}
              trailing={
                <Menu<LinkAction>
                  trigger="icon"
                  icon="ellipsis"
                  label="Mehr"
                  accessibilityLabel={`Mehr zu ${linkDisplay(link).title}`}
                  onChange={(action) => {
                    if (action === 'edit') {
                      openKeyboardNow();
                      setEditing({ index });
                    } else if (action === 'remove')
                      set(draft.links.filter((_, at) => at !== index));
                    else move(index, index + (action === 'up' ? -1 : 1));
                  }}
                  options={[
                    { value: 'edit', label: 'Bearbeiten' },
                    { value: 'up', label: 'Nach oben', disabled: index === 0 },
                    {
                      value: 'down',
                      label: 'Nach unten',
                      disabled: index === draft.links.length - 1,
                    },
                    { value: 'remove', label: 'Entfernen' },
                  ]}
                  testID={`recipe-link-menu-${index}`}
                />
              }
            />
          ))}
        </List>
      ) : null}
      {editor.problem('links') ? (
        <Text variant="small" color="warn">
          {editor.problem('links')}
        </Text>
      ) : null}
      <Button
        label="Link"
        icon="plus"
        variant="link"
        disabled={full}
        hint={full ? LINK_LIMIT_HINT : undefined}
        onPress={() => {
          openKeyboardNow();
          setEditing({});
        }}
        testID="recipe-links-add"
      />
      {full ? (
        <Text variant="small" color="muted" testID="recipe-links-full">
          {LINK_LIMIT_HINT}
        </Text>
      ) : null}
      {editing ? (
        <LinkSheet
          links={draft.links}
          index={editing.index}
          onApply={(links) => {
            set(links);
            setEditing(undefined);
          }}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
    </Stack>
  );
}

/**
 * The window "Link": "Adresse" (required) and "Bezeichnung (freiwillig)", checked like the
 * database checks (core validateLink). "Übernehmen" changes the draft of the edit mode, or in the
 * read view saves at once (spec 0056).
 */
function LinkSheet(props: {
  links: RecipeLink[];
  /** The link edited; undefined = "+ Link". */
  index?: number;
  onApply: (links: RecipeLink[]) => void;
  onClose: () => void;
}) {
  const current = props.index === undefined ? undefined : props.links[props.index];
  const [url, setUrl] = useState(current?.url ?? '');
  const [label, setLabel] = useState(current?.label ?? '');
  const [problem, setProblem] = useState<{ field: 'url' | 'label'; text: string } | undefined>();
  const apply = () => {
    const result = validateLink({ url, label }, props.links, props.index);
    if ('problem' in result) {
      setProblem({ field: result.field, text: result.problem });
      return;
    }
    if (props.index === undefined) {
      try {
        props.onApply(addLink(props.links, result.link));
      } catch (error) {
        setProblem({
          field: 'url',
          text: errorMessage(error, LINK_LIMIT_HINT),
        });
      }
      return;
    }
    props.onApply(props.links.map((link, at) => (at === props.index ? result.link : link)));
  };
  return (
    <Sheet
      visible
      size="s"
      title="Link"
      onClose={() =>
        discardFirst(
          url.trim() !== (current?.url ?? '').trim() ||
            label.trim() !== (current?.label ?? '').trim(),
          props.onClose,
        )
      }
      testID="recipe-link-sheet"
      actions={{
        primary: {
          label: 'Übernehmen',
          icon: 'check',
          onPress: apply,
          testID: 'recipe-link-sheet-apply',
        },
      }}
    >
      <Stack gap={16}>
        <TextField
          label="Adresse"
          placeholder="z. B. chefkoch.de/rezepte/…"
          value={url}
          onChangeText={(value) => {
            setUrl(value);
            setProblem(undefined);
          }}
          keyboardType="url"
          autoFocus
          error={problem?.field === 'url' ? problem.text : undefined}
          testID="recipe-link-url"
        />
        <TextField
          label="Bezeichnung (freiwillig)"
          placeholder="z. B. Omas Variante"
          value={label}
          onChangeText={(value) => {
            setLabel(value);
            setProblem(undefined);
          }}
          onSubmitEditing={apply}
          error={problem?.field === 'label' ? problem.text : undefined}
          testID="recipe-link-label"
        />
      </Stack>
    </Sheet>
  );
}
