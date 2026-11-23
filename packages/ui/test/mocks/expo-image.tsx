// expo-image in the component tests: the image of react-native-web, with the same source.
import { Image as RNImage, type ImageProps } from 'react-native';

export type ImageSource = { uri?: string } | number;

export function Image(props: Omit<ImageProps, 'source'> & { source?: ImageSource | null }) {
  const { source, ...rest } = props;
  return <RNImage {...rest} source={source ?? undefined} />;
}
