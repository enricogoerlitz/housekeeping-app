// Spec 0034: settings of the app configuration and the web manifest that the phone relies on.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appJson = JSON.parse(readFileSync(path.join(appDir, 'app.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(path.join(appDir, 'public/manifest.webmanifest'), 'utf8'));

function routerPluginOptions() {
  const plugin = appJson.expo.plugins.find(
    (entry) => entry === 'expo-router' || (Array.isArray(entry) && entry[0] === 'expo-router'),
  );
  return Array.isArray(plugin) ? (plugin[1] ?? {}) : {};
}

test('AC-001: route code is part of the bundle, not loaded on the first visit of a page', () => {
  // expo-router splits every route into its own chunk on the web unless asyncRoutes is off; the
  // first visit of a page then showed an empty frame until its chunk arrived.
  assert.equal(routerPluginOptions().asyncRoutes, false);
});

test('AC-020: the installed app stays in portrait on Android', () => {
  assert.equal(manifest.orientation, 'portrait');
});
