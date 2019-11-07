import { SchemaDefinition } from 'mongoose';

export const timestampedSchemaDefinition: SchemaDefinition = {
  createdAt: Date,
  createdBy: Object,
  updatedAt: Date,
  updatedBy: Object,
  deleted: { type: Boolean, default: false },
  deletedAt: Date,
  deletedBy: Object,
};
