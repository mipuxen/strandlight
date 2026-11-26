import { el } from './dom';

let host: HTMLElement | null = null;

export function toast(message: string, kind: 'info' | 'error' = 'info', ms = 2600): void {
  host ??= document.body.appendChild(
    el('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }),
  );
  const node = el('div', { class: `toast toast-${kind}`, text: message });
  host.append(node);
  requestAnimationFrame(() => node.classList.add('show'));
  setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 400);
  }, ms);
}
