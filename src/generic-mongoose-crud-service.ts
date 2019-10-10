import { ResourceNotFoundException } from '@aluxion-nestjs/exceptions';
import { ObjectId } from 'bson';
import { EventEmitter } from 'events';
import * as moment from 'moment';
import { Model, mongo } from 'mongoose';

import { DynamicObjectKeys, IDynamicObject, ISortOptions, ModelType, SubmodelType } from './generic-mongoose-crud-service.interfaces';

export class GenericMongooseCrudService<T extends object, M extends ModelType<T>> {
  public readonly events: EventEmitter = new EventEmitter();
  protected readonly eventsCreate: string = 'CREATED';
  protected readonly eventsDelete: string = 'DELETED';
  protected readonly eventsPatch: string = 'PATCH';
  protected readonly model: Model<M>;

  constructor(model?: Model<M>) {
    if (model) {
      this.model = model;
    }
  }

  async addSubdocument<DataModel extends object>(parentId: string, subdocumentField: DynamicObjectKeys<T>, subdocument: DataModel, user?: any) {
    subdocument.createdAt = moment.utc().toDate();
    subdocument.createdBy = user;
    const instance = await this.updateById(parentId, { $push: { [subdocumentField]: subdocument } }, user);
    return instance[subdocumentField as string].pop() as SubmodelType<DataModel>;
  }

  count(filter: IDynamicObject = {}): Promise<number> {
    filter.deleted = filter.deleted ? filter.deleted : { $ne: true };
    return this.model.countDocuments(filter).exec();
  }

  async countSubdocuments(parentId: string, subdocumentField: DynamicObjectKeys<T>, filter: IDynamicObject = {}) {
    const matches = await this.model.countDocuments({ _id: parentId, deleted: this.deletedDefaultFilter() }).exec();
    if (matches <= 0) {
      throw new ResourceNotFoundException(this.model.modelName, parentId);
    }
    if (filter.deleted === undefined) {
      filter.deleted = this.deletedDefaultFilter();
    }
    const transformedFilter = this.formatQueryForAggregation(filter, subdocumentField as string);
    const aggregration: { _id: string; count: number }[] = await this.model
      .aggregate([
        { $match: { _id: new mongo.ObjectId(parentId) } },
        { $limit: 1 },
        { $unwind: `$${subdocumentField}` },
        { $match: transformedFilter },
        { $group: { _id: '$_id', [subdocumentField]: { $push: `$${subdocumentField}` } } },
        {
          $project: {
            count: { $size: `$${subdocumentField}` },
          },
        },
      ])
      .exec();
    return aggregration.length > 0 ? aggregration.pop().count : 0;
  }

  create(data: T, user?: any): Promise<M> {
    const instance = this.model.create({ ...data, createdAt: moment.utc().toDate(), createdBy: user });
    this.events.emit(this.eventsCreate, instance);
    return instance;
  }

  async get(filter: IDynamicObject, projection?: string): Promise<M> {
    const conditions = Object.assign({ deleted: this.deletedDefaultFilter() }, filter);
    const instance = await this.model.findOne(conditions, projection).exec();
    if (!instance) {
      throw new ResourceNotFoundException(this.model.modelName, JSON.stringify(conditions));
    }
    return instance;
  }

  async getById(_id: string, projection?: string): Promise<M> {
    return this.get({ _id: new ObjectId(_id) }, projection);
  }

  async getSubdocument<DataModel extends object>(
    parentId: string,
    subdocumentField: DynamicObjectKeys<T>,
    filter: IDynamicObject = {},
  ): Promise<SubmodelType<DataModel>> {
    const conditions = Object.assign({ deleted: this.deletedDefaultFilter() }, filter);
    const instance = await this.model
      .findOne(
        {
          _id: new mongo.ObjectId(parentId),
          [subdocumentField]: {
            $elemMatch: conditions,
          },
        },
        `${subdocumentField}.$`,
      )
      .exec();
    if (!instance) {
      throw new ResourceNotFoundException(this.model.modelName, parentId);
    }
    return instance[subdocumentField as string].pop() as SubmodelType<DataModel>;
  }

  async getSubdocumentById<DataModel extends object>(
    parentId: string,
    subdocumentField: DynamicObjectKeys<T>,
    subdocumentId: string,
  ): Promise<SubmodelType<DataModel>> {
    return this.getSubdocument<DataModel>(parentId, subdocumentField, { _id: new ObjectId(subdocumentId) });
  }

  async hardDelete(_id: string): Promise<M> {
    const instance = await this.model.findByIdAndDelete(_id).exec();
    this.events.emit(this.eventsDelete, instance);
    return instance;
  }

  hardDeleteSubdocument(parentId: string, subdocumentField: DynamicObjectKeys<T>, subdocumentId: string, user?: any) {
    return this.patchById(parentId, { $pull: { [subdocumentField]: { _id: subdocumentId } } }, user);
  }

  list(filter: IDynamicObject = {}, limit?: number, skip?: number, projection?: string, sort?: ISortOptions): Promise<Array<M>> {
    filter.deleted = filter.deleted !== undefined ? filter.deleted : this.deletedDefaultFilter();
    return this.model.find(filter, projection, { sort, skip, limit }).exec();
  }

  async listSubdocuments<DataModel extends object>(
    parentId: string,
    subdocumentField: DynamicObjectKeys<T>,
    filter: IDynamicObject = {},
    limit: number = 9999,
    skip: number = 0,
    sort: ISortOptions = { _id: 1 },
  ): Promise<Array<SubmodelType<DataModel>>> {
    if (filter.deleted === undefined) {
      filter.deleted = this.deletedDefaultFilter();
    }
    const transformedSort = this.formatQueryForAggregation(sort, subdocumentField as string);
    const transformedFilter = this.formatQueryForAggregation(filter, subdocumentField as string);
    const matches = await this.model.countDocuments({ _id: parentId, deleted: this.deletedDefaultFilter() }).exec();
    if (matches <= 0) {
      throw new ResourceNotFoundException(this.model.modelName, parentId);
    }
    const expression = `$${subdocumentField}`;
    const aggregration: T[] = await this.model
      .aggregate([
        { $match: { _id: parentId } },
        { $limit: 1 },
        { $unwind: expression },
        { $match: transformedFilter },
        { $group: { _id: '$_id', [subdocumentField]: { $push: expression } } },
        {
          $project: {
            [subdocumentField]: {
              $slice: [expression, skip, limit],
            },
          },
        },
        { $sort: transformedSort },
      ])
      .exec();
    return aggregration.length > 0 ? (aggregration.pop()[subdocumentField as string] as Array<SubmodelType<DataModel>>) : [];
  }

  async patch(filter: IDynamicObject = {}, update: IDynamicObject = {}, user?: any): Promise<M> {
    return this.update(filter, { $set: update }, user);
  }

  async patchById(_id: string, update: Partial<T> | IDynamicObject, user?: any): Promise<M> {
    return this.patch({ _id: new ObjectId(_id) }, update, user);
  }

  async patchSubdocument<DataModel extends object>(
    parentId: string,
    subdocumentField: DynamicObjectKeys<T>,
    filter: IDynamicObject = {},
    update: keyof DataModel,
    user?: any,
  ): Promise<SubmodelType<DataModel>> {
    const conditions = Object.keys(filter).reduce(
      (result, key) => {
        result[`${subdocumentField}.${key}`] = filter[key];
        return result;
      },
      { _id: new ObjectId(parentId), deleted: this.deletedDefaultFilter(), [`${subdocumentField}.deleted`]: this.deletedDefaultFilter() },
    );
    const subdocument = await this.getSubdocument(parentId, subdocumentField, filter);
    const document = await this.getById(parentId);
    if (!subdocument) {
      throw new ResourceNotFoundException(subdocumentField as string, JSON.stringify(conditions));
    }
    const subdocumentToUpdate: SubmodelType<DataModel> = document[subdocumentField as string].find(
      (sd: SubmodelType<DataModel>) => sd._id.toString() === subdocument._id.toString(),
    );
    this.merge(subdocumentToUpdate, Object.assign(this.getDefaultUpdate(user), update));
    await document.save();
    await this.patch({ _id: new ObjectId(parentId) }, this.getDefaultUpdate(user), user);
    return subdocumentToUpdate;
  }

  async patchSubdocumentById<DataModel extends object>(
    parentId: string,
    subdocumentField: DynamicObjectKeys<T>,
    subdocumentId: string,
    update: any,
    user?: any,
  ) {
    return this.patchSubdocument<DataModel>(parentId, subdocumentField, { _id: new ObjectId(subdocumentId) }, update, user);
  }

  async softDelete(_id: string, user?: any): Promise<M> {
    return this.patchById(_id, { deleted: true, deletedAt: this.now(), deletedBy: user }, user);
  }

  async softDeleteSubdocument<DataModel extends object>(parentId: string, subdocumentField: DynamicObjectKeys<T>, subdocumentId: string, user?: any) {
    return this.patchSubdocumentById<DataModel>(
      parentId,
      subdocumentField,
      subdocumentId,
      { deleted: true, deletedAt: this.now(), deletedBy: user },
      user,
    );
  }

  async update(filter: IDynamicObject = {}, update: IDynamicObject = {}, user?: any): Promise<M> {
    update.$set = update.$set ? Object.assign(this.getDefaultUpdate(user), update.$set) : this.getDefaultUpdate(user);
    const conditions = Object.assign({ deleted: this.deletedDefaultFilter() }, filter);
    const instance = await this.model.findOneAndUpdate(conditions, update, { new: true }).exec();
    if (!instance) {
      throw new ResourceNotFoundException(this.model.modelName, JSON.stringify(conditions));
    }
    this.events.emit(this.eventsPatch, instance);
    return instance;
  }

  async updateById(_id: string, update: IDynamicObject = {}, user?: any): Promise<M> {
    return this.update({ _id: new ObjectId(_id) }, update, user);
  }

  protected deletedDefaultFilter() {
    return { $ne: true };
  }

  protected formatQueryForAggregation(input: IDynamicObject, field: string): IDynamicObject {
    const result = {};
    for (const key in input) {
      if (input.hasOwnProperty(key)) {
        result[`${field}.${key}`] = input[key];
      }
    }
    return result;
  }

  protected getDefaultUpdate(user?: any): IDynamicObject {
    return {
      updatedAt: this.now(),
      updatedBy: user,
    };
  }

  protected merge<Input = object>(doc: Input, newDoc: Partial<Input>): Input {
    for (const key of Object.keys(newDoc)) {
      doc[key] = newDoc[key];
    }
    return doc;
  }

  protected now(): Date {
    return moment.utc().toDate();
  }
}
