// The one GSTIN rule, shared by the mill profile and by contacts.
import { z } from 'zod';

// 15 characters: 2 digit state code, 10 character PAN, entity number, "Z", check character (e.g. 27AAACE1234F1Z5)
export const gstinField = z.string().trim().toUpperCase()
  .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'GSTIN must be 15 characters, e.g. 27AAACE1234F1Z5');
