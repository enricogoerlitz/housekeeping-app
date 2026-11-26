// Review 0003, feedback 1: on the iPhone "Einkaufen" could not be scrolled. The phone's area stack
// is the JS stack of Expo Router (spec 0034, REQ-003). Where it fills the whole window (no tab
// bar: "Einkaufen", "Kochen") its card turned into a growing page (`minHeight: 100%`) unless the
// header mode is 'float', and the app's body never scrolls. This pins both halves: our options,
// and the rule in the router that they rely on.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const babel = require('@babel/core');

function loadStackTransition() {
  const file = path.join(appDir, 'src/features/shell/stack-transition.ts');
  const { code } = babel.transformSync(readFileSync(file, 'utf8'), {
    filename: file,
    babelrc: false,
    configFile: false,
    presets: [[require.resolve('@babel/preset-typescript'), { allExtensions: true }]],
    plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
  });
  const stubs = {
    '@housekeeping/ui': {
      EDGE_SWIPE_START: {},
      nextEdgeSwipe: (state) => state,
      systemSwipeNavigation: () => false,
    },
    'expo-router/js-stack': {
      CardStyleInterpolators: { forFadeFromCenter: 'fade', forHorizontalIOS: 'slide' },
    },
    'expo-router/tabs': { SceneStyleInterpolators: { forFade: 'fade' } },
    'react-native': { Easing: { bezier: () => (t) => t }, Platform: { OS: 'ios' } },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => stubs[name], module, module.exports);
  return module.exports;
}

test('the phone stack keeps its card a bounded box, so the page scrolls inside it', () => {
  const { phoneStackOptions } = loadStackTransition();
  for (const reducedMotion of [false, true]) {
    const options = phoneStackOptions(reducedMotion);
    assert.equal(options.headerShown, false);
    assert.equal(options.headerMode, 'float');
  }
});

test("the router grows a card with the page only when the header mode is not 'float'", () => {
  const container = require.resolve(
    'expo-router/build/react-navigation/stack/views/Stack/CardContainer.js',
    { paths: [appDir] },
  );
  assert.match(
    readFileSync(container, 'utf8'),
    /pageOverflowEnabled: headerMode !== 'float' && presentation !== 'modal'/,
  );
});
