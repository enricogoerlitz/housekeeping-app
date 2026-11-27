import {
  loadRecipeVideo,
  OfflineError,
  removeRecipeVideo,
  saveRecipeVideo,
  saveVideoPoster,
  usePhoto,
  useRecipeImage,
  useSyncState,
  VIDEO_LOAD_FAILED_MESSAGE,
  VIDEO_SAVE_FAILED_MESSAGE,
} from '@housekeeping/api';
import { videoLabel, type Recipe, type RecipeLink, type RecipeVideo } from '@housekeeping/core';
import {
  getTheme,
  Icon,
  IconButton,
  Photo,
  Text,
  ThemeProvider,
  useTheme,
  ViewerPhoto,
} from '@housekeeping/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { confirmFirst } from '@/features/shell/confirm-dialog';
import { errorMessage } from '@/features/shell/error-message';
import { useOnlineOnly } from '@/features/shell/offline';

const PLAY_SIZE = 64;
/** The save button and its spinner take the same room at the end of the link's row. */
const SAVE_SIZE = 44;

/** The save button of a recipe's links: which link is being saved, and why it failed. */
export interface SaveVideo {
  /** The link whose video the server is loading now. */
  saving?: string;
  error?: string;
  /** Asks „Video speichern?“, then saves (AC-005, AC-006). */
  ask: (url: string) => void;
}

/**
 * "Video speichern" at a link (spec 0046, REQ-002): asks first (AC-005); while the server loads
 * the video and its poster the row shows a spinner (AC-006); why it failed stays under the links
 * (AC-007). The video then shows in the gallery once the pull has brought it. Online only (AC-008).
 */
export function useSaveVideo(recipe: Recipe): SaveVideo {
  const [saving, setSaving] = useState<string>();
  const [error, setError] = useState<string>();
  const save = async (url: string) => {
    setSaving(url);
    setError(undefined);
    try {
      const saved = await saveRecipeVideo(recipe.id, url);
      // The poster comes with it, so the gallery shows it at once (AC-012); without it the
      // gallery shows the recipe's photo.
      if (saved?.coverUrl) await saveVideoPoster(recipe.id, saved.videoPath, saved.coverUrl);
    } catch (caught) {
      setError(errorMessage(caught, VIDEO_SAVE_FAILED_MESSAGE));
    } finally {
      setSaving(undefined);
    }
  };
  const ask = (url: string) => {
    if (saving) return;
    confirmFirst({
      title: 'Video speichern?',
      message: 'Das Video wird aus TikTok in den Speicher des Haushalts geladen.',
      confirmLabel: 'Speichern',
      testID: 'recipe-video-save-confirm',
      onConfirm: () => void save(url),
    });
  };
  return { saving, error, ask };
}

/** The button at the right end of a TikTok link's row, or its spinner while it saves. */
export function SaveVideoButton(props: { link: RecipeLink; video: SaveVideo; testID: string }) {
  const online = useOnlineOnly();
  const theme = useTheme();
  if (props.video.saving === props.link.url) {
    return (
      <View
        accessible
        accessibilityLabel="Video wird gespeichert …"
        accessibilityState={{ busy: true }}
        style={{
          width: SAVE_SIZE,
          height: SAVE_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        testID={`${props.testID}-saving`}
      >
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }
  return (
    <IconButton
      icon="download"
      label="Video speichern"
      size={SAVE_SIZE}
      disabled={online.disabled || props.video.saving !== undefined}
      hint={online.hint}
      onPress={() => props.video.ask(props.link.url)}
      testID={props.testID}
    />
  );
}

/**
 * A video's page in the gallery (spec 0046, REQ-003): its poster in the photo's frame with a play
 * button, nothing loads or plays here (AC-009); without a poster the recipe's photo or a calm
 * surface with the film symbol (AC-012); offline "Video braucht Netz" instead of the play button
 * (AC-015). The bin removes the video after asking (AC-017).
 */
export function VideoTile(props: {
  recipe: Recipe;
  video: RecipeVideo;
  index: number;
  aspectRatio: number;
  onPlay: () => void;
  testID: string;
}) {
  const theme = useTheme();
  const online = useOnlineOnly();
  const offline = useSyncState().status === 'offline';
  const poster = usePhoto(props.video.poster);
  const photo = useRecipeImage(props.recipe);
  const source = poster.uri ? { uri: poster.uri } : photo;
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string>();
  const label = videoLabel(props.index, props.recipe.videos.length);

  const remove = () =>
    confirmFirst({
      title: 'Video entfernen?',
      message: 'Das gespeicherte Video wird gelöscht. Der Link bleibt.',
      confirmLabel: 'Entfernen',
      testID: 'recipe-video-remove-confirm',
      onConfirm: () => {
        setRemoving(true);
        setRemoveError(undefined);
        removeRecipeVideo(props.recipe.id, props.video.path)
          .catch((caught: unknown) =>
            setRemoveError(errorMessage(caught, VIDEO_SAVE_FAILED_MESSAGE)),
          )
          .finally(() => setRemoving(false));
      },
    });

  return (
    <View
      style={{
        width: '100%',
        aspectRatio: props.aspectRatio,
        borderRadius: theme.shape.radius.photo,
        overflow: 'hidden',
        backgroundColor: theme.colors.surfaceSunken,
      }}
      testID={props.testID}
    >
      <Pressable
        onPress={offline ? undefined : props.onPlay}
        disabled={offline}
        accessibilityRole="button"
        accessibilityLabel={`${label} zu ${props.recipe.title} abspielen`}
        accessibilityState={{ disabled: offline }}
        style={(state) => ({ flex: 1, opacity: state.pressed ? 0.85 : 1 })}
        testID={`${props.testID}-play`}
      >
        {source || poster.loading ? (
          <Photo
            source={source}
            loading={poster.loading}
            aspectRatio={props.aspectRatio}
            radius={0}
            alt=""
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="film" size={40} color="muted" />
          </View>
        )}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}
        >
          {offline ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: theme.shape.radius.chip,
                backgroundColor: theme.colors.surface,
              }}
              testID={`${props.testID}-offline`}
            >
              <Icon name="wifi-off" size={18} color="muted" />
              <Text color="muted">Video braucht Netz</Text>
            </View>
          ) : (
            <View
              style={{
                width: PLAY_SIZE,
                height: PLAY_SIZE,
                borderRadius: PLAY_SIZE / 2,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.accent,
              }}
            >
              <Icon name="play" size={30} color="onAccent" />
            </View>
          )}
        </View>
      </Pressable>
      <View style={{ position: 'absolute', top: 8, right: 8 }}>
        {removing ? (
          <View
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
            accessibilityLabel="Video wird entfernt …"
          >
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : (
          <IconButton
            icon="trash"
            label={`${label} entfernen`}
            variant="soft"
            disabled={online.disabled}
            hint={online.hint}
            onPress={remove}
            testID={`${props.testID}-remove`}
          />
        )}
      </View>
      {removeError ? (
        <View
          style={{
            position: 'absolute',
            left: 8,
            right: 56,
            top: 8,
            padding: 8,
            borderRadius: theme.shape.radius.chip,
            backgroundColor: theme.colors.warnBg,
          }}
        >
          <Text variant="small" color="warn" testID={`${props.testID}-remove-error`}>
            {removeError}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

type Playback =
  { state: 'loading' } | { state: 'ready'; uri: string } | { state: 'failed'; message: string };

/** iOS Safari's own full-screen player (webkitEnterFullscreen) ends with this event. */
const IOS_FULLSCREEN_END = 'webkitendfullscreen';

/**
 * A video playing on a dark stage (spec 0046, REQ-004): downloads the file with the session into
 * a blob: URL (never kept on the device) and plays it with sound (AC-013). Without `playsinline`
 * the iPhone plays it in its own full-screen player; its "Fertig" calls `onEnd` (AC-014).
 * Offline "Video braucht Netz".
 */
function VideoStage(props: { video: RecipeVideo; title: string; onEnd: () => void }) {
  const { id } = useTheme();
  const stage = getTheme(id, 'dark');
  const [playback, setPlayback] = useState<Playback>({ state: 'loading' });
  const videoRef = useRef<HTMLVideoElement>(null);
  const { onEnd } = props;
  const path = props.video.path;

  useEffect(() => {
    let live = true;
    let uri: string | undefined;
    loadRecipeVideo(path)
      .then((blob) => {
        if (!live) return;
        uri = URL.createObjectURL(blob);
        setPlayback({ state: 'ready', uri });
      })
      .catch((caught: unknown) => {
        if (!live) return;
        setPlayback({
          state: 'failed',
          message:
            caught instanceof OfflineError
              ? 'Video braucht Netz'
              : errorMessage(caught, VIDEO_LOAD_FAILED_MESSAGE),
        });
      });
    return () => {
      live = false;
      if (uri) URL.revokeObjectURL(uri);
    };
  }, [path]);

  // The tap that opened the player asked to play: start once the element has the file. Safari may
  // refuse after the download (the gesture is used up); its play control then starts it.
  const ready = playback.state === 'ready' ? playback.uri : undefined;
  useEffect(() => {
    const element = videoRef.current;
    if (!ready || !element) return;
    element.addEventListener(IOS_FULLSCREEN_END, onEnd);
    void element.play().catch(() => undefined);
    return () => element.removeEventListener(IOS_FULLSCREEN_END, onEnd);
  }, [ready, onEnd]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' }}>
      {playback.state === 'ready' ? (
        <video
          ref={videoRef}
          src={playback.uri}
          controls
          preload="auto"
          aria-label={`Video zu ${props.title}`}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          data-testid="recipe-video-player-video"
        />
      ) : playback.state === 'loading' ? (
        <View style={{ alignItems: 'center', gap: 12 }} testID="recipe-video-player-loading">
          <ActivityIndicator color={stage.colors.text} size="large" />
          <Text style={{ color: stage.colors.text }}>Video wird geladen …</Text>
        </View>
      ) : (
        <View
          style={{ alignItems: 'center', gap: 8, paddingHorizontal: 24 }}
          testID="recipe-video-player-error"
        >
          <Icon name="wifi-off" size={28} color="muted" />
          <Text style={{ color: stage.colors.text, textAlign: 'center' }}>{playback.message}</Text>
        </View>
      )}
    </View>
  );
}

/**
 * The video on the whole screen over the cooking mode (spec 0046, AC-016): a dark layer over
 * everything with the video stage; ✕, Escape and the iPhone player's "Fertig" close it.
 */
export function VideoPlayer(props: { video: RecipeVideo; title: string; onClose: () => void }) {
  const { id } = useTheme();
  const stage = getTheme(id, 'dark');
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={props.onClose}
      statusBarTranslucent
    >
      <ThemeProvider themeId={id} mode="dark">
        <View
          testID="recipe-video-player"
          accessibilityViewIsModal
          style={{
            flex: 1,
            backgroundColor: stage.colors.bg,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          }}
        >
          <VideoStage video={props.video} title={props.title} onEnd={props.onClose} />
          <View style={{ position: 'absolute', top: insets.top + 8, right: insets.right + 8 }}>
            <IconButton
              icon="x"
              label="Schließen"
              variant="soft"
              size={44}
              onPress={props.onClose}
              testID="recipe-video-player-close"
            />
          </View>
        </View>
      </ThemeProvider>
    </Modal>
  );
}

/**
 * A video's page in the full-screen viewer of the recipe's gallery (spec 0056, REQ-003): its
 * poster with the play button, nothing loads until the tap (AC-010); `autoplay` when the viewer
 * was opened from the video's tile (AC-013). Swiped away it stops (AC-014); the iPhone player's
 * "Fertig" leads back to this page (Entscheidung 5). Offline "Video braucht Netz".
 */
export function VideoPage(props: {
  recipe: Recipe;
  video: RecipeVideo;
  index: number;
  active: boolean;
  autoplay: boolean;
  testID: string;
}) {
  const { id } = useTheme();
  const stage = getTheme(id, 'dark');
  const offline = useSyncState().status === 'offline';
  const poster = usePhoto(props.video.poster);
  const photo = useRecipeImage(props.recipe);
  const source = poster.uri ? { uri: poster.uri } : photo;
  const [playing, setPlaying] = useState(props.autoplay && !offline);
  const { active } = props;
  if (!active && playing) setPlaying(false);
  const label = videoLabel(props.index, props.recipe.videos.length);
  const stop = useCallback(() => setPlaying(false), []);

  if (playing) {
    return (
      <View style={{ flex: 1 }} testID={props.testID}>
        <VideoStage video={props.video} title={props.recipe.title} onEnd={stop} />
      </View>
    );
  }
  return (
    <Pressable
      onPress={offline ? undefined : () => setPlaying(true)}
      disabled={offline}
      accessibilityRole="button"
      accessibilityLabel={`${label} zu ${props.recipe.title} abspielen`}
      accessibilityState={{ disabled: offline }}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      testID={props.testID}
    >
      {source ? (
        <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
          <ViewerPhoto sources={[source]} alt="" />
        </View>
      ) : (
        <Icon name="film" size={48} color="muted" />
      )}
      <View pointerEvents="none" style={{ position: 'absolute', alignItems: 'center' }}>
        {offline ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: stage.shape.radius.chip,
              backgroundColor: stage.colors.surface,
            }}
            testID={`${props.testID}-offline`}
          >
            <Icon name="wifi-off" size={18} color="muted" />
            <Text color="muted">Video braucht Netz</Text>
          </View>
        ) : (
          <View
            style={{
              width: PLAY_SIZE,
              height: PLAY_SIZE,
              borderRadius: PLAY_SIZE / 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: stage.colors.accent,
            }}
          >
            <Icon name="play" size={30} color="onAccent" />
          </View>
        )}
      </View>
    </Pressable>
  );
}
