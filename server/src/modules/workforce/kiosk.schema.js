import { z } from 'zod';
import { text, updateSchema } from '../../utils/crud/schema.js';

const fields = { name: text(60), active: z.boolean() };

export const createKioskDeviceSchema = z.object(fields).partial({ active: true });
export const updateKioskDeviceSchema = updateSchema(fields);
