import { Document, Types } from 'mongoose';

export interface IDynamicObject {
  [key: string]: any;
}

export interface IMongoIdentified {
  _id: any;
}

export interface ITimestamped {
  createdAt?: Date;
  createdBy?: object;
  updatedAt?: Date;
  updatedBy?: object;
}

export interface ISoftDeletable {
  deleted?: boolean;
  deletedAt?: Date;
  deletedBy?: object;
}

export interface IModelInstance extends IMongoIdentified, ITimestamped, ISoftDeletable {}

export interface IMongoDocument extends Document, IModelInstance {}

export type SortValue = -1 | 1;

export type ProjectionOptions<T extends object = object> = { [key in keyof T]: SortValue } | { [key: string]: SortValue };

export type SortOptions<T extends object = object> = { [key in keyof T]: SortValue } | { [key: string]: SortValue };

export type ModelType<T extends object> = T & IMongoDocument;

export type SubmodelType<T extends object> = T & Types.Subdocument;

export type ArrayTypeKeys<T extends object> = { [K in keyof T]: T[K] extends object[] ? K : never }[keyof T];

export type DynamicObjectKeys<T extends object> = keyof T & string;

export type HintedDynamicObject<T extends object> = { [key in keyof T]: T[key] } | { [key: string]: any };

export type HintedFilter<T extends object> = { [key in keyof ISoftDeletable]: any } &
  { [key in keyof ITimestamped]: any } &
  { [key in keyof Partial<IMongoIdentified>]: any } &
  HintedDynamicObject<T>;
