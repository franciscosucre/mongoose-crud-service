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

export interface IWithId {
  _id: string | ObjectId;
}

export interface IWithPagination {
  limit?: number;
  skip?: number;
}

export interface IWithHintedUpdate<T extends object = object> {
  update: HintedDynamicObject<T>;
}

export interface IWithUpdateOptions {
  options?: UpdateOptions;
}

export interface IWithCreateData<T> {
  data: T;
}

export interface IWithProjection<T extends object = object> {
  projection?: ProjectionOptions<T> | string;
}

export interface IWithSort<T extends object = object> {
  sort?: SortOptions<T>;
}

export interface IWithParentId {
  parentId: string | ObjectId;
}

export interface IWithSubdocumentId {
  subdocumentId: string | ObjectId;
}

export interface IWithFilter<T extends object = object> {
  filter?: HintedFilter<T>;
}

export interface IWithSubdocumentField<T extends object = object> {
  subdocumentField: ArrayTypeKeys<T>;
}

export interface IWithUser<T = any> {
  user?: T;
}

import { ClientSession, ObjectId } from 'mongodb';
import { Document, QueryFindOneAndUpdateOptions, SaveOptions, Types } from 'mongoose';

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

export interface ITransactionable {
  session: ClientSession;
}

export type UpdateOptions = Partial<QueryFindOneAndUpdateOptions & ITransactionable>;
