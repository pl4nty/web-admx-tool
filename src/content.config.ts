import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { admxPolicyLoader } from './loaders/admxPolicyLoader';

const policies = defineCollection({
  loader: admxPolicyLoader(),
  schema: z.object({
    name: z.string(),
    displayName: z.string(),
    explainText: z.string(),
    class: z.string(),
    key: z.string(),
    valueName: z.string(),
    supportedOn: z.string(),
    parentCategory: z.string(),
    categoryPath: z.array(z.string()),
    namespace: z.string(),
    fileSlug: z.string(),
    lang: z.string(),
    availableLangs: z.array(z.string()),
  }).passthrough(),
});

export const collections = { policies };
