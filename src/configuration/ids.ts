import { z } from 'zod';

/** Shared identifier boundary for definitions, references and untrusted commands. */
export const idSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
  .refine(value => value !== 'prototype' && !Object.hasOwn(Object.prototype, value), 'Reserved ID');
