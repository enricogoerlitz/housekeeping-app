import {
  loadRecipeVideo,
  OfflineError,
  removeRecipeVideo,
  saveRecipeVideo,
  useRecipeImage,
  useSyncState,
  VIDEO_LOAD_FAILED_MESSAGE,
  VIDEO_SAVE_FAILED_MESSAGE,
} from '@housekeeping/api';
import type { Recipe, RecipeLink } from '@housekeeping/core';
import { Button, Icon, Photo, Text, useTheme } from '@housekeeping/ui';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { confirmFirst } from '@/features/shell/confirm-dialog';
import { errorMessage } from '@/features/shell/error-message';
import { useOnlineOnly } from '@/features/shell/offline';

/** Portrait like the TikTok video; never wider than a phone column (REQ-002). */
const FRAME_MAX_WIDTH = 300;
const PLAY_SIZE = 64;

/** "Video speichern" of a recipe's links: which link is being saved, and why it failed. */
export interface SaveVideo {
  /** The link whose video the server is loading now. */
  saving?: string;
  error?: string;
  save: (url: string) => void;
}

/**
 * "Video speichern" (REQ-001): online only (AC-006); while the server loads it the row says
 * "Video wird gespeichert …" (AC-001); why it failed stays under the links (AC-002, AC-003). The
 * video then shows under the photo once the pull has brought it.
 */
export function useSaveVideo(recipe: Recipe): SaveVideo {
  const [saving, setSaving] = useState<string>();
  const [error, setError] = useState<string>();
  const save = (url: string) => {
    if (saving) return;
    setSaving(url);
    setError(undefined);
    saveRecipeVideo(recipe.id, url)
      .catch((caught: unknown) => setError(errorMessage(caught, VIDEO_SAVE_FAILED_MESSAGE)))
      .finally(() => setSaving(undefined));
  };
  return { saving, error, save };
}

/** The button at the right end of a TikTok link's row, or the line while it saves. */
export function SaveVideoButton(props: { link: RecipeLink; video: SaveVideo; testID: string }) {
  const online = useOnlineOnly();
  if (props.video.saving === props.link.url) {
    return (
      <Text variant="small" color="muted" testID={`${props.testID}-saving`}>
        Video wird gespeichert …
      </Text>
    );
  }
  return (
    <Button
      label="Video speichern"
      icon="film"
      variant="link"
      size="sm"
      disabled={online.disabled || props.video.saving !== undefined}
      hint={online.hint}
      onPress={() => props.video.save(props.link.url)}
      testID={props.testID}
    />
  );
}

/** What the frame shows for the video at `path`; another path starts again from the poster. */
type Playback = { path?: string } & (
  | { state: 'poster' }
  | { state: 'loading' }
  | { state: 'ready'; uri: string }
  | { state: 'failed'; message: string }
);

/**
 * The recipe's video under the photo (REQ-002): a portrait frame with the recipe's photo and a play
 * button; nothing loads and nothing plays before the tap. The tap downloads the file with the
 * session into a blob: URL (never kept on the device) and plays it in the page with sound, with
 * the device's own controls for full screen (AC-007). Without network "Video braucht Netz"
 * (AC-008). "Video entfernen" asks first (REQ-003, AC-009).
 */
export function RecipeVideo(props: { recipe: Recipe; testID?: string }) {
  const path = props.recipe.videoPath;
  const testID = props.testID ?? 'recipe-video';
  const theme = useTheme();
  const online = useOnlineOnly();
  const networkOffline = useSyncState().status === 'offline';
  const poster = useRecipeImage(props.recipe);
  const [shown, setPlayback] = useState<Playback>({ state: 'poster' });
  // A new or removed video starts again from its poster.
  const playback: Playback = shown.path === path ? shown : { state: 'poster' };
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string>();
  const videoRef = useRef<HTMLVideoElement>(null);

  // The old blob: URL goes with the playback it belonged to.
  const uri = shown.state === 'ready' ? shown.uri : undefined;
  useEffect(
    () => () => {
      if (uri) URL.revokeObjectURL(uri);
    },
    [uri],
  );
  // The tap that loaded it asked to play: start once the element has the file.
  const playing = playback.state === 'ready' ? playback.uri : undefined;
  useEffect(() => {
    if (playing) void videoRef.current?.play().catch(() => undefined);
  }, [playing]);

  if (!path) return null;

  const play = async () => {
    setPlayback({ path, state: 'loading' });
    try {
      const video = await loadRecipeVideo(path);
      setPlayback({ path, state: 'ready', uri: URL.createObjectURL(video) });
    } catch (caught) {
      setPlayback({
        path,
        state: 'failed',
        message:
          caught instanceof OfflineError
            ? 'Video braucht Netz'
            : errorMessage(caught, VIDEO_LOAD_FAILED_MESSAGE),
      });
    }
  };

  const remove = () =>
    confirmFirst({
      title: 'Video entfernen?',
      message: 'Das gespeicherte Video wird gelöscht. Der Link bleibt.',
      confirmLabel: 'Entfernen',
      testID: 'recipe-video-remove-confirm',
      onConfirm: () => {
        setRemoving(true);
        setRemoveError(undefined);
        removeRecipeVideo(props.recipe.id)
          .catch((caught: unknown) =>
            setRemoveError(errorMessage(caught, VIDEO_SAVE_FAILED_MESSAGE)),
          )
          .finally(() => setRemoving(false));
      },
    });

  const frame = {
    width: '100%' as const,
    maxWidth: FRAME_MAX_WIDTH,
    aspectRatio: 9 / 16,
    alignSelf: 'center' as const,
    overflow: 'hidden' as const,
    borderRadius: theme.shape.radius.photo,
    backgroundColor: theme.colors.surfaceSunken,
  };

  let content;
  if (networkOffline && playback.state !== 'ready') {
    content = (
      <View
        style={[frame, { alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 }]}
        testID={`${testID}-offline`}
      >
        <Icon name="wifi-off" size={28} color="muted" />
        <Text color="muted">Video braucht Netz</Text>
      </View>
    );
  } else if (playback.state === 'ready') {
    content = (
      <View style={frame}>
        <video
          ref={videoRef}
          src={playback.uri}
          controls
          playsInline
          preload="metadata"
          poster={poster && typeof poster === 'object' ? poster.uri : undefined}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          data-testid={`${testID}-player`}
        />
      </View>
    );
  } else {
    const loading = playback.state === 'loading';
    content = (
      <Pressable
        onPress={loading ? undefined : () => void play()}
        accessibilityRole="button"
        accessibilityLabel={`Video zu ${props.recipe.title} abspielen`}
        accessibilityState={{ busy: loading }}
        style={frame}
        testID={`${testID}-play`}
      >
        <Photo source={poster} aspectRatio={9 / 16} alt="" />
        <View
          pointerEvents="none"
          style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}
        >
          <View
            style={{
              width: PLAY_SIZE,
              height: PLAY_SIZE,
              borderRadius: PLAY_SIZE / 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.accent,
              opacity: loading ? 0.6 : 1,
            }}
          >
            <Icon name="play" size={30} color="onAccent" />
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={{ gap: 6 }} testID={testID}>
      {content}
      {playback.state === 'loading' ? (
        <Text
          variant="small"
          color="muted"
          style={{ textAlign: 'center' }}
          testID={`${testID}-loading`}
        >
          Video wird geladen …
        </Text>
      ) : null}
      {playback.state === 'failed' ? (
        <Text variant="small" color="warn" testID={`${testID}-error`}>
          {playback.message}
        </Text>
      ) : null}
      <View style={{ alignSelf: 'center' }}>
        {removing ? (
          <Text variant="small" color="muted">
            Video wird entfernt …
          </Text>
        ) : (
          <Button
            label="Video entfernen"
            icon="trash"
            variant="link"
            size="sm"
            disabled={online.disabled}
            hint={online.hint}
            onPress={remove}
            testID={`${testID}-remove`}
          />
        )}
      </View>
      {removeError ? (
        <Text variant="small" color="warn" testID={`${testID}-remove-error`}>
          {removeError}
        </Text>
      ) : null}
    </View>
  );
}
