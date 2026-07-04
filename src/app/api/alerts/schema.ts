import { z } from 'zod';
import { isSafeWebhookUrl } from '@/lib/notify';

export const alertTypeParam = z.enum(['threshold', 'change', 'new-agent', 'digest']);

export const alertChannelSchema = z
  .object({
    type: z.enum(['slack', 'discord', 'webhook']),
    url: z.string().max(500),
  })
  .refine(channel => isSafeWebhookUrl(channel.url), {
    message: 'Channel URL must be a public http(s) address',
  });

const thresholdParamsSchema = z.object({
  metric: z.string().min(1).max(100),
  operator: z.enum(['gt', 'lt']),
  value: z.number(),
  windowMinutes: z.number().int().min(1).max(10080),
});

const changeParamsSchema = z.object({
  metric: z.string().min(1).max(100),
  windowMinutes: z.number().int().min(1).max(10080),
  pctChange: z.number().positive(),
  direction: z.enum(['up', 'down', 'both']),
});

/**
 * Pragmatic per-type parameter validation; 'new-agent' and 'digest' take
 * no parameters.
 */
export function validateAlertParameters(
  type: z.infer<typeof alertTypeParam>,
  parameters: Record<string, any>,
): string | null {
  if (type === 'threshold') {
    const result = thresholdParamsSchema.safeParse(parameters);
    return result.success ? null : 'Invalid threshold parameters';
  }

  if (type === 'change') {
    const result = changeParamsSchema.safeParse(parameters);
    return result.success ? null : 'Invalid change parameters';
  }

  return null;
}

export const alertSchema = z.object({
  websiteId: z.uuid(),
  name: z.string().min(1).max(200),
  type: alertTypeParam,
  parameters: z.record(z.string(), z.any()).default({}),
  channels: z.array(alertChannelSchema).min(1),
  enabled: z.boolean().default(true),
  intervalMinutes: z.number().int().min(5).max(10080).default(60),
});

export const alertUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: alertTypeParam.optional(),
  parameters: z.record(z.string(), z.any()).optional(),
  channels: z.array(alertChannelSchema).min(1).optional(),
  enabled: z.boolean().optional(),
  intervalMinutes: z.number().int().min(5).max(10080).optional(),
});
