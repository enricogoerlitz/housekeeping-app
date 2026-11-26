// Spec 0036, REQ-001 (E-03): "Neu mischen" must mix the list. The app is built with the React
// Compiler (app.json `experiments.reactCompiler`), which memoises what a hook returns by its
// reactive inputs. A list state read from a plain module variable is not one of them, so the
// compiled hook kept the old order. This test runs the real hooks through the same compiler.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });

const React = require('react');
const { renderHook, act } = require('@testing-library/react');

/** Compiles an app source file as Metro does (TypeScript and the React Compiler). */
function load(relative, stubs) {
  const file = path.join(appDir, 'src', relative);
  const { code } = babel.transformSync(readFileSync(file, 'utf8'), {
    filename: file,
    babelrc: false,
    configFile: false,
    presets: [[require.resolve('@babel/preset-typescript'), { isTSX: true, allExtensions: true }]],
    plugins: [
      require.resolve('babel-plugin-react-compiler'),
      require.resolve('@babel/plugin-transform-modules-commonjs'),
    ],
  });
  const module = { exports: {} };
  const local = (name) => {
    if (name in stubs) return stubs[name];
    if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`, stubs);
    return require(name);
  };
  new Function('require', 'module', 'exports', code)(local, module, module.exports);
  return module.exports;
}

const IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

function stubs(sort) {
  // Each draw turns the order by one more place, so every new draw differs from the one before.
  let draws = 0;
  const shuffleOrder = (ids) => {
    draws += 1;
    const turn = draws % ids.length;
    return [...ids.slice(turn), ...ids.slice(0, turn)];
  };
  const params = {};
  const address = { params, replace: () => undefined };
  const state = { query: '', filter: {}, sort };
  const settings = { listSorts: {}, update: () => undefined };
  return {
    react: React,
    '@housekeeping/core': {
      shuffleOrder,
      recipeListFromParams: () => state,
      recipeListToParams: (next) => next,
      restaurantListFromParams: () => state,
      restaurantListToParams: (next) => next,
    },
    '@/lib/url-state': { usePageParams: () => address },
    '@/lib/settings': { useSettings: () => settings },
  };
}

for (const [name, file, hook] of [
  ['recipes', 'features/recipes/recipe-list-state.ts', 'useRecipeListState'],
  ['restaurants', 'features/restaurants/restaurant-list-state.ts', 'useRestaurantListState'],
]) {
  test(`AC-001: "Neu mischen" changes the order of the ${name}`, () => {
    const useListState = load(file, stubs('random'))[hook];
    const { result } = renderHook(() => useListState());
    const first = result.current;
    const before = first.shuffleFor(IDS).slice(0, 10).join('');
    act(() => first.reshuffle(IDS));
    // The screen memoises its list by this object (also compiled), so it must be a new one.
    assert.notEqual(result.current, first);
    assert.equal(result.current.round, first.round + 1);
    assert.notEqual(result.current.shuffleFor(IDS).slice(0, 10).join(''), before);
  });

  test(`AC-003: the chosen sort of the ${name} is kept on the device`, () => {
    const stubbed = stubs('title');
    const saved = [];
    stubbed['@/lib/settings'].useSettings = () => ({
      listSorts: { other: 'x' },
      update: (patch) => saved.push(patch),
    });
    const useListState = load(file, stubbed)[hook];
    const { result } = renderHook(() => useListState());
    act(() => result.current.setSort('rating', IDS));
    assert.deepEqual(saved, [{ listSorts: { other: 'x', [name]: 'rating' } }]);
    act(() => result.current.setFilter({}));
    act(() => result.current.setQuery('Nudeln'));
    assert.equal(saved.length, 1, 'filter and search are not stored');
  });
}
