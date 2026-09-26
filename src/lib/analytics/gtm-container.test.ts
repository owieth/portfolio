import { describe, expect, it } from 'vitest';

import { CLIENT_EVENT_NAMES } from '@/lib/analytics/events';

import container from '../../../gtm/container.json';

/**
 * GTM ignores a `dataLayer` event no trigger matches, so a client event missing
 * from the export is dropped without any error. These checks tie the exported
 * container to the `AnalyticsEvent` union: a new event without its trigger and
 * tag fails here instead of vanishing from GA4.
 */
type Parameter = { key?: string; value?: string };

const {
  tag: tags,
  trigger: triggers,
  variable: variables,
} = container.containerVersion;

const parameterValue = (parameters: Parameter[], key: string) =>
  parameters.find(parameter => parameter.key === key)?.value;

const triggerFor = (eventName: string) =>
  triggers.find(
    trigger =>
      trigger.type === 'CUSTOM_EVENT' &&
      trigger.customEventFilter.some(
        filter => parameterValue(filter.parameter, 'arg1') === eventName,
      ),
  );

describe('GTM container', () => {
  it('has a Custom Event trigger for every client event', () => {
    const missing = CLIENT_EVENT_NAMES.filter(name => !triggerFor(name));

    expect(missing).toEqual([]);
  });

  it('has a GA4 event tag for every client event, firing on its trigger', () => {
    for (const name of CLIENT_EVENT_NAMES) {
      const tag = tags.find(
        candidate =>
          candidate.type === 'gaawe' &&
          parameterValue(candidate.parameter, 'eventName') === name,
      );

      expect(tag, name).toBeDefined();
      expect(tag?.firingTriggerId, name).toContain(triggerFor(name)?.triggerId);
    }
  });

  it('routes no *_server event through GTM', () => {
    const serverEvents = tags
      .map(tag => parameterValue(tag.parameter, 'eventName'))
      .filter(eventName => eventName?.endsWith('_server'));

    expect(serverEvents).toEqual([]);
  });

  it('references only variables that exist', () => {
    const variableNames = new Set(variables.map(variable => variable.name));
    const references = JSON.stringify(tags).match(/{{DLV - [^}]+}}/g) ?? [];
    const unknown = references
      .map(reference => reference.slice(2, -2))
      .filter(name => !variableNames.has(name));

    expect(references.length).toBeGreaterThan(0);
    expect(unknown).toEqual([]);
  });

  it('requires analytics_storage on every tag', () => {
    for (const tag of tags) {
      expect(tag.consentSettings.consentStatus, tag.name).toBe('NEEDED');
      expect(
        tag.consentSettings.consentType.list.map(consent => consent.value),
        tag.name,
      ).toContain('analytics_storage');
    }
  });
});
