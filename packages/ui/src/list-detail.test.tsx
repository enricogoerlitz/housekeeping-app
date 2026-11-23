import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ListDetail } from './list-detail';
import { Text } from './primitives';

function setWindowWidth(width: number) {
  Object.defineProperty(document.documentElement, 'clientWidth', {
    configurable: true,
    value: width,
  });
  window.dispatchEvent(new Event('resize'));
}

afterEach(() => setWindowWidth(0));

const placeholder = { icon: 'check' as const, title: 'Wähl eine Aufgabe aus', text: 'Links' };

describe('ListDetail (spec 0005, concept 2.11)', () => {
  it('phone: only the list shows, never the detail or the placeholder', () => {
    setWindowWidth(390);
    render(
      <ListDetail
        testID="ld"
        list={<Text>Liste</Text>}
        detail={<Text>Detail</Text>}
        placeholder={placeholder}
      />,
    );
    expect(screen.getByText('Liste')).toBeTruthy();
    expect(screen.queryByText('Detail')).toBeNull();
    expect(screen.queryByTestId('ld-detail')).toBeNull();
    expect(screen.queryByText('Wähl eine Aufgabe aus')).toBeNull();
  });

  it('tablet: list and the chosen detail side by side', () => {
    setWindowWidth(900);
    render(
      <ListDetail
        testID="ld"
        list={<Text>Liste</Text>}
        detail={<Text>Detail</Text>}
        placeholder={placeholder}
        listWidth={320}
      />,
    );
    expect(screen.getByTestId('ld-list').textContent).toBe('Liste');
    expect(screen.getByTestId('ld-detail').textContent).toBe('Detail');
    expect(screen.queryByTestId('ld-placeholder')).toBeNull();
  });

  it('desktop: nothing chosen shows the placeholder as a heading with its text', () => {
    setWindowWidth(1280);
    render(<ListDetail testID="ld" list={<Text>Liste</Text>} placeholder={placeholder} />);
    const empty = screen.getByTestId('ld-placeholder');
    expect(screen.getByRole('heading', { name: 'Wähl eine Aufgabe aus' })).toBeTruthy();
    expect(empty.textContent).toBe('Wähl eine Aufgabe ausLinks');
  });

  it('without testID the parts have no test ids', () => {
    setWindowWidth(1280);
    const { container } = render(
      <ListDetail list={<Text>Liste</Text>} placeholder={{ icon: 'check', title: 'Leer' }} />,
    );
    expect(container.querySelector('[data-testid]')).toBeNull();
    expect(container.textContent).toBe('ListeLeer');
  });
});
