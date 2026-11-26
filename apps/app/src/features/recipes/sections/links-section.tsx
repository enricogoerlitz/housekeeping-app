import {
  addLink,
  LINK_LIMIT_HINT,
  linkDisplay,
  MAX_LINKS,
  validateLink,
  type LinksDraft,
  type Recipe,
  type RecipeLink,
} from '@housekeeping/core';
import {
  Button,
  EditableSection,
  Icon,
  List,
  ListRow,
  Menu,
  Sheet,
  Stack,
  Text,
  TextField,
} from '@housekeeping/ui';
import { useState, type ReactNode } from 'react';

import { SectionError, useSectionFrame } from './common';
import type { SectionEditor } from './use-section-editor';
import { errorMessage } from '@/features/shell/error-message';
import { openLink } from '@/lib/open-link';

type LinkAction = 'edit' | 'up' | 'down' | 'remove';

/**
 * "Links" under "Notizen" of a recipe or a collection (spec 0023, REQ-009): at most 10, each row
 * the label over the host (or the host alone) with the symbol "öffnet extern"; a tap opens the page
 * in a new tab and the app stays. The app never loads the page. A link that fails the check on the
 * device is plain text. Read and open offline; editing online only.
 */
export function LinksSection(props: { recipe: Recipe; editor: SectionEditor }) {
  const { recipe, editor } = props;
  const frame = useSectionFrame(editor, 'links', 'Links');
  const draft = editor.draft?.section === 'links' ? editor.draft : undefined;
  return (
    <EditableSection {...frame} testID="recipe-links">
      {draft ? (
        <LinksFields draft={draft} editor={editor} />
      ) : recipe.links.length === 0 ? (
        <Text color="muted">Noch keine Links.</Text>
      ) : (
        <List>
          {recipe.links.map((link, index) => (
            <LinkRow key={link.url} link={link} testID={`recipe-link-${index}`} />
          ))}
        </List>
      )}
    </EditableSection>
  );
}

function LinkRow(props: { link: RecipeLink; testID: string; trailing?: ReactNode }) {
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
      testID={props.testID}
    />
  );
}

function LinksFields(props: { draft: LinksDraft; editor: SectionEditor }) {
  const { draft, editor } = props;
  const [editing, setEditing] = useState<{ index?: number } | undefined>();
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
                    if (action === 'edit') setEditing({ index });
                    else if (action === 'remove') set(draft.links.filter((_, at) => at !== index));
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
        onPress={() => setEditing({})}
        testID="recipe-links-add"
      />
      {full ? (
        <Text variant="small" color="muted" testID="recipe-links-full">
          {LINK_LIMIT_HINT}
        </Text>
      ) : null}
      <SectionError editor={editor} testID="recipe-links-error" />
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
 * database checks (core validateLink). "Übernehmen" only changes the draft.
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
      onClose={props.onClose}
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
