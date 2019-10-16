import { Document, Model, Types } from 'mongoose';

export interface IDynamicObject {
  [key: string]: any;
}

export interface IMongoIdentified {
  _id: any;
}

export interface ITimestamped {
  createdAt?: Date;
  createdBy?: any;
  updatedAt?: Date;
  updatedBy?: any;
}

export interface ISoftDeletable {
  deleted?: boolean;
  deletedAt?: Date;
  deletedBy?: any;
}

export interface IModelInstance extends IMongoIdentified, ITimestamped, ISoftDeletable {}

export interface IMongoDocument extends Document, IModelInstance {}

export type SortValue = -1 | 1;

export interface ISortOptions {
  [key: string]: SortValue;
}

export type ModelType<T extends object> = T & IMongoDocument;

export type SubmodelType<T extends object> = T & Types.Subdocument;

export type DynamicObjectKeys<T extends object> = keyof T & string;

export type HintedDynamicObject<T extends object> = { [key in keyof T]: T[key] } | { [key: string]: any };
