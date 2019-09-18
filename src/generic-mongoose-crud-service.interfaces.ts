import { Document, Model } from 'mongoose';

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
  deleted: boolean;
  deletedAt?: Date;
  deletedBy?: any;
}

export interface IModelInstance extends IMongoIdentified, ITimestamped, ISoftDeletable {}

export interface IMongoDocument extends Document, IModelInstance {}

export interface ISortOptions {
  [key: string]: -1 | 1;
}
