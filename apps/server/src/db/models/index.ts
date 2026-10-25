/**
 * Every collection, in one import.
 *
 * Grouped by what they are *about* rather than one file per model: identity and
 * entitlement, the support conversation, the knowledge the assistant may use,
 * and the machinery that runs the system. Twenty-four one-model files would
 * make the relationships between them harder to see, not easier.
 */
export * from './identity.js';
export * from './support.js';
export * from './knowledge.js';
export * from './governance.js';
