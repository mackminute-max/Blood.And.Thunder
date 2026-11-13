import { fieldMetadata } from '../../configuration/field-metadata.ts';
/** Only edits the pre-race JSON draft. Engine validation remains authoritative. */
export function mountNumericEditor(container: HTMLElement, value: unknown, apply: (value: unknown) => void, prefix: string[] = [], defaults?: unknown): void {
  container.replaceChildren();
  const draft = JSON.parse(JSON.stringify(value)) as unknown;
  const walk = (node: unknown, path: string[], parent?: Record<string, unknown> | unknown[], key?: string) => {
    if (typeof node === 'number' && parent && key !== undefined) {
      const label = document.createElement('label');
      const input = document.createElement('input'); input.type = 'number'; input.step = 'any'; input.value = String(node);
      input.dataset.field = path.join('.');
      const property = path.at(-1) ?? '';
      let units = 'coefficient';
      if (/speed|power|agility|endurance|discipline|toughness|driving|beastHandling|combat|awareness|nerve|aggression|riskTolerance|patience|competitiveness|stability|durability|protection|rollingEfficiency|maneuverability/i.test(property) && !path.includes('stats')) { input.min = '0'; input.max = '100'; units = 'points'; }
      if (/Health$/.test(property)) { input.min = '0'; units = 'HP'; }
      if (/Kg$/.test(property)) { input.min = '0'; units = 'kg'; }
      if (/Percent$/.test(property)) units = '%';
      if (/Chance$/.test(property)) units = 'probability';
      if (/Seconds$/.test(property)) units = 'seconds';
      if (/Ticks|Slots|Transitions/.test(property)) { input.min = '0'; input.step = '1'; units = 'count'; }
      const metadata = fieldMetadata([...prefix, ...path]);
      const range = `${metadata.exclusiveMin !== undefined ? '>' + metadata.exclusiveMin : metadata.min !== undefined ? '≥' + metadata.min : 'finite'}${metadata.max !== undefined ? ', ≤' + metadata.max : ''}${metadata.integer ? ', integer' : ''}`;
      if (metadata.min !== undefined) input.min = String(metadata.min);
      if (metadata.max !== undefined) input.max = String(metadata.max);
      if (metadata.integer) input.step = '1';
      input.setAttribute('aria-label', path.join('.'));
      label.append(`${path.join('.')} (${units}; ${range})`, input);
      input.addEventListener('change', () => {
        const number = input.valueAsNumber;
        if (!Number.isFinite(number)) { input.setCustomValidity('Enter a finite number'); return; }
        input.setCustomValidity('');
        (parent as Record<string, unknown>)[key] = number;
        apply(draft);
      });
      let reference = defaults;
      for (const part of path) reference = reference !== null && typeof reference === 'object' ? (reference as Record<string, unknown>)[part] : undefined;
      if (typeof reference === 'number') {
        const defaultValue = reference;
        const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = 'Reset value'; reset.setAttribute('aria-label', `Reset ${path.join('.')}`);
        reset.addEventListener('click', () => { input.value = String(defaultValue); input.setCustomValidity(''); (parent as Record<string, unknown>)[key] = defaultValue; apply(draft); });
        label.append(reset);
      }
      container.append(label);
    } else if (node !== null && typeof node === 'object') {
      for (const [childKey, child] of Object.entries(node)) walk(child, [...path, childKey], node as Record<string, unknown>, childKey);
    }
  };
  walk(draft, []);
}
