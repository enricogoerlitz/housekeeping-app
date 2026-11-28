import {
  generateImagesAsync,
  loadPhotoFromAddress,
  preparePhoto,
  setActivityPhoto,
  setRecipePhoto,
  setRestaurantPhoto,
  updateActivity,
  updateRecipe,
  updateRestaurant,
  useAgentProposalData,
} from '@housekeeping/api';
import {
  imageTarget,
  type AgentExtra,
  type AgentImageHit,
  type ImageTarget,
} from '@housekeeping/core';
import { Button, Photo, ScrollRow, Surface, Text, toast, useTheme } from '@housekeeping/ui';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { errorMessage } from '@/features/shell/error-message';
import { useOnlineOnly } from '@/features/shell/offline';

import { setDraftPhoto } from './agent-draft-photo';

// Spec 0067, REQ-011: "Mach ein Foto dazu" makes exactly one AI photo (FLUX through ai-image, the
// app's own path) with "Neu generieren" and "Als Foto nehmen"; "Zeig echte Bilder" shows Google
// images (Serper) to tap one. Pictures are only shown until "Als Foto nehmen" saves the chosen one
// through the usual photo path; a Google image keeps its page as the source. A refusal of the
// image model is a friendly hint, never a silent failure.

/** FLUX refuses some subjects; the function does not say which failure it was (ai_unavailable). */
const IMAGE_FAILED =
  'Das Foto ist diesmal nicht gelungen – manche Motive lehnt die Bild-KI ab. Versuch es neu oder beschreib es anders.';

function useBlobUri(blob: Blob | undefined): string | undefined {
  const uri = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob]);
  useEffect(
    () => () => {
      if (uri) URL.revokeObjectURL(uri);
    },
    [uri],
  );
  return uri;
}

/** What an entry has where a photo's source goes. */
interface SourceSlots {
  notes?: string;
  description?: string;
}

const appendLine = (text: string | undefined, line: string) =>
  text?.includes(line) ? text : [text, line].filter(Boolean).join('\n');

/**
 * "Als Foto nehmen": the photo goes to the draft or the entry. A Google image keeps its page: in
 * the draft as the link "Fotoquelle", at a stored entry as a line "Foto: …" in its notes (the
 * recipe's links change only on its page, places have none).
 */
async function takePhoto(
  target: ImageTarget,
  photo: Blob,
  slots: SourceSlots,
  sourceUrl?: string,
): Promise<string> {
  const prepared = await preparePhoto(photo);
  const line = sourceUrl ? `Foto: ${sourceUrl}` : undefined;
  switch (target.kind) {
    case 'draft':
      setDraftPhoto(prepared, sourceUrl);
      return 'Das Foto ist beim Entwurf';
    case 'recipe':
      await setRecipePhoto(target.id, prepared);
      if (line) updateRecipe(target.id, { notes: appendLine(slots.notes, line) });
      return `Foto von ${target.title} gespeichert`;
    case 'restaurant':
      await setRestaurantPhoto(target.id, prepared);
      if (line) updateRestaurant(target.id, { notes: appendLine(slots.notes, line) });
      return `Foto von ${target.title} gespeichert`;
    case 'activity':
      await setActivityPhoto(target.id, prepared);
      if (line) updateActivity(target.id, { description: appendLine(slots.description, line) });
      return `Foto von ${target.title} gespeichert`;
  }
}

function useTarget(extra: { for: ImageTarget['kind']; name?: string }): {
  target?: ImageTarget;
  slots: SourceSlots;
} {
  const data = useAgentProposalData();
  const target = data ? imageTarget(extra.for, extra.name, data) : undefined;
  const id = target && target.kind !== 'draft' ? target.id : undefined;
  return {
    target,
    slots: {
      notes:
        data?.restaurants.find((row) => row.id === id)?.notes ??
        data?.recipes.find((row) => row.id === id)?.notes,
      description: data?.activities.find((row) => row.id === id)?.description,
    },
  };
}

function TakeButton(props: {
  target: ImageTarget | undefined;
  slots: SourceSlots;
  name?: string;
  photo: () => Promise<Blob>;
  sourceUrl?: string;
  disabled: boolean;
  testID: string;
}) {
  const online = useOnlineOnly();
  const [saving, setSaving] = useState(false);
  const [taken, setTaken] = useState(false);
  const missing = !props.target;
  const take = async () => {
    if (!props.target || saving) return;
    setSaving(true);
    try {
      const message = await takePhoto(
        props.target,
        await props.photo(),
        props.slots,
        props.sourceUrl,
      );
      setTaken(true);
      toast.show({ message, duration: 2500 });
    } catch (error) {
      toast.show({ message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Button
      label={taken ? 'Übernommen' : 'Als Foto nehmen'}
      icon={taken ? 'check' : 'image'}
      size="sm"
      disabled={props.disabled || saving || missing || taken || online.disabled}
      hint={
        missing
          ? `„${props.name ?? 'Das'}“ finde ich nicht in euren Daten`
          : online.disabled
            ? online.hint
            : undefined
      }
      onPress={() => void take()}
      testID={props.testID}
    />
  );
}

export function AgentImageCard(props: {
  extra: Extract<AgentExtra, { kind: 'image' }>;
  loaded: boolean;
  testID: string;
}) {
  const { extra, testID } = props;
  const online = useOnlineOnly();
  const { target, slots } = useTarget(extra);
  const [state, setState] = useState<
    { status: 'idle' | 'loading' | 'failed' } | { status: 'done'; photo: Blob }
  >({ status: props.loaded ? 'idle' : 'loading' });
  const uri = useBlobUri(state.status === 'done' ? state.photo : undefined);
  const round = useRef(0);

  // Only the answer sets the state, so a new answer can start it from an effect.
  const request = () => {
    round.current += 1;
    const mine = round.current;
    generateImagesAsync({ prompt: extra.prompt, styles: [], count: 1 }).then(
      ({ images }) => {
        if (mine !== round.current) return;
        const [photo] = images;
        setState(photo ? { status: 'done', photo } : { status: 'failed' });
      },
      () => {
        if (mine === round.current) setState({ status: 'failed' });
      },
    );
  };
  const requestOnce = useEffectEvent(request);
  const generate = () => {
    setState({ status: 'loading' });
    request();
  };
  // A new answer makes its one photo at once; one from "Verlauf" waits for the tap (cost).
  const loaded = props.loaded;
  useEffect(() => {
    if (!loaded) requestOnce();
  }, [loaded]);

  return (
    <Surface testID={testID} style={{ gap: 10, maxWidth: 420 }}>
      <Photo
        source={uri ? { uri } : undefined}
        generating={state.status === 'loading' ? 'Foto wird erzeugt' : undefined}
        placeholderIcon="image"
        aspectRatio={4 / 3}
        alt={uri ? 'KI-Foto' : undefined}
        testID={`${testID}-photo`}
      />
      {state.status === 'failed' ? (
        <Text variant="small" color="warn" testID={`${testID}-failed`}>
          {IMAGE_FAILED}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <Button
          label={state.status === 'idle' ? 'Foto erzeugen' : 'Neu generieren'}
          icon="refresh-cw"
          variant="link"
          size="sm"
          disabled={state.status === 'loading' || online.disabled}
          hint={online.disabled ? online.hint : undefined}
          onPress={generate}
          testID={`${testID}-again`}
        />
        <TakeButton
          target={target}
          slots={slots}
          name={extra.name}
          photo={async () => {
            if (state.status !== 'done') throw new Error('Noch kein Foto');
            return state.photo;
          }}
          disabled={state.status !== 'done'}
          testID={`${testID}-take`}
        />
      </View>
    </Surface>
  );
}

const THUMB = 112;

function Thumb(props: {
  hit: AgentImageHit;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  const theme = useTheme();
  const [uri, setUri] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    let made: string | undefined;
    loadPhotoFromAddress(props.hit.thumbnailUrl ?? props.hit.imageUrl).then(
      (blob) => {
        if (!live) return;
        made = URL.createObjectURL(blob);
        setUri(made);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [props.hit]);
  if (failed) return null;
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected }}
      accessibilityLabel={`Bild von ${props.hit.host}${props.hit.title ? `: ${props.hit.title}` : ''}`}
      testID={props.testID}
      style={{ width: THUMB, gap: 4 }}
    >
      <View
        style={{
          borderRadius: theme.shape.radius.control,
          borderWidth: 2,
          borderColor: props.selected ? theme.colors.accent : 'transparent',
          overflow: 'hidden',
        }}
      >
        <Photo
          source={uri ? { uri } : undefined}
          loading={!uri}
          placeholderIcon="image"
          width={THUMB - 4}
          height={THUMB - 4}
          radius={0}
        />
      </View>
      <Text variant="caption" color="muted" numberOfLines={1}>
        {props.hit.host}
      </Text>
    </Pressable>
  );
}

export function AgentImagesRow(props: {
  extra: Extract<AgentExtra, { kind: 'images' }>;
  testID: string;
}) {
  const { extra, testID } = props;
  const { target, slots } = useTarget(extra);
  const [chosen, setChosen] = useState<number | undefined>();
  const hit = chosen === undefined ? undefined : extra.images[chosen];
  return (
    <Surface testID={testID} style={{ gap: 10 }}>
      <Text variant="small" color="muted">
        Echte Bilder zu „{extra.query}“ – tipp eins an
      </Text>
      <ScrollRow gap={10} testID={`${testID}-row`}>
        {extra.images.map((image, index) => (
          <Thumb
            key={image.imageUrl}
            hit={image}
            selected={chosen === index}
            onPress={() => setChosen(index)}
            testID={`${testID}-image-${index}`}
          />
        ))}
      </ScrollRow>
      {hit ? (
        <Text variant="small" color="muted" testID={`${testID}-source`}>
          Quelle: {hit.host}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row' }}>
        <TakeButton
          target={target}
          slots={slots}
          name={extra.name}
          photo={() =>
            hit
              ? loadPhotoFromAddress(hit.imageUrl)
              : Promise.reject(new Error('Tipp erst ein Bild an'))
          }
          sourceUrl={hit?.pageUrl}
          disabled={!hit}
          testID={`${testID}-take`}
        />
      </View>
    </Surface>
  );
}
