import { Icon, openExternalLink, Photo, PhotoViewer, Text, useTheme } from '@housekeeping/ui';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import type { AttachmentPreview } from './agent-attachments';

// Spec 0067 (preview feedback 28.11.): a photo or PDF of a message, from its local copy. A tap on
// a photo shows it on the whole screen (the app's photo viewer), a PDF opens in the browser's own
// viewer (on the iPhone its in-app view over the app).

export function useAttachmentPreview(): {
  open: (preview: AttachmentPreview) => void;
  viewer: ReactNode;
} {
  const [shown, setShown] = useState<AttachmentPreview | undefined>();
  const open = (preview: AttachmentPreview) => {
    if (preview.kind === 'pdf') openExternalLink(preview.uri);
    else setShown(preview);
  };
  return {
    open,
    viewer: shown ? (
      <PhotoViewer
        sources={[{ uri: shown.uri }]}
        alt={shown.name}
        closeLabel="Schließen"
        onClose={() => setShown(undefined)}
        testID="agent-attachment-viewer"
      />
    ) : null,
  };
}

const THUMB = 64;

/** The files above the person's sent message: photo thumbnails, a PDF as its icon and name. */
export function SentAttachments(props: {
  previews: readonly AttachmentPreview[];
  onOpen: (preview: AttachmentPreview) => void;
  testID: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 }}
      testID={props.testID}
    >
      {props.previews.map((preview, index) => (
        <Pressable
          key={preview.uri}
          accessibilityRole="button"
          accessibilityLabel={`${preview.name} ansehen`}
          onPress={() => props.onOpen(preview)}
          testID={`${props.testID}-${index}`}
          style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
        >
          {preview.kind === 'image' ? (
            <Photo
              source={{ uri: preview.uri }}
              width={THUMB}
              height={THUMB}
              radius={theme.shape.radius.control}
              alt={preview.name}
            />
          ) : (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                height: THUMB,
                maxWidth: 220,
                paddingHorizontal: 12,
                borderRadius: theme.shape.radius.control,
                backgroundColor: theme.colors.surfaceSunken,
              }}
            >
              <Icon name="file-text" color="muted" />
              <Text variant="small" numberOfLines={2} style={{ flexShrink: 1 }}>
                {preview.name}
              </Text>
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}
