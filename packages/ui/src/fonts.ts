// Font files bundled with the app (self-hosted: nothing is fetched from a font service).
// Each weight is its own family name, which behaves the same on web, iOS and Android.

export const fontAssets: Record<string, number> = {
  Fraunces_600SemiBold: require('@expo-google-fonts/fraunces/600SemiBold/Fraunces_600SemiBold.ttf'),
  Fraunces_500Medium_Italic: require('@expo-google-fonts/fraunces/500Medium_Italic/Fraunces_500Medium_Italic.ttf'),
  InstrumentSans_400Regular: require('@expo-google-fonts/instrument-sans/400Regular/InstrumentSans_400Regular.ttf'),
  InstrumentSans_500Medium: require('@expo-google-fonts/instrument-sans/500Medium/InstrumentSans_500Medium.ttf'),
  InstrumentSans_600SemiBold: require('@expo-google-fonts/instrument-sans/600SemiBold/InstrumentSans_600SemiBold.ttf'),
  BricolageGrotesque_700Bold: require('@expo-google-fonts/bricolage-grotesque/700Bold/BricolageGrotesque_700Bold.ttf'),
  BricolageGrotesque_800ExtraBold: require('@expo-google-fonts/bricolage-grotesque/800ExtraBold/BricolageGrotesque_800ExtraBold.ttf'),
  DMSans_400Regular: require('@expo-google-fonts/dm-sans/400Regular/DMSans_400Regular.ttf'),
  DMSans_500Medium: require('@expo-google-fonts/dm-sans/500Medium/DMSans_500Medium.ttf'),
  DMSans_600SemiBold: require('@expo-google-fonts/dm-sans/600SemiBold/DMSans_600SemiBold.ttf'),
};
