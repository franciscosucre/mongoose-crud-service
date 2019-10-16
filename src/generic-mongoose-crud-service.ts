import { ResourceNotFoundException } from '@aluxion-nestjs/exceptions';
import { EventEmitter } from 'events';
import * as moment from 'moment';
import { ObjectId } from 'mongodb';
import { Model, mongo, Types } from 'mongoose';

import {
  ArrayTypeKeys,
  HintedDynamicObject,
  HintedFilter,
  IDynamicObject,
  ModelType,
  ProjectionOptions,
  SortOptions,
  SubmodelType,
} from './generic-mongoose-crud-service.interfaces';

export class GenericMongooseCrudService<
  DataType extends object = object,
  DocumentType extends ModelType<DataType> = ModelType<DataType>,
  UserType extends object = object
> {
  public readonly events: EventEmitter = new EventEmitter();
  protected readonly eventsCreate: string = 'CREATED';
  protected readonly eventsDelete: string = 'DELETED';
  protected readonly eventsPatch: string = 'PATCH';
  protected readonly model: Model<DocumentType>;

  constructor(model?: Model<DocumentType>) {
    if (model) {
      this.model = model;
    }
  }

  async addSubdocument<DataModel extends object>(
    parentId: string | ObjectId,
    subdocumentField: ArrayTypeKeys<DataType>,
    subdocument: DataModel,
    user?: UserType,
  ) {
    const instance = await this.updateById(
      parentId,
      { $push: { [subdocumentField]: { ...subdocument, createdAt: moment.utc().toDate(), createdBy: user } as DataModel } },
      user,
    );
    return instance[subdocumentField as string].pop() as SubmodelType<DataModel>;
  }

  count(filter: HintedFilter<DataType> = {}): Promise<number> {
    filter.deleted = filter.deleted ? filter.deleted : { $ne: true };
    return this.model.countDocuments(filter).exec();
  }

  async countSubdocuments<DataModel extends object>(
    parentId: string | ObjectId,
    subdocumentField: ArrayTypeKeys<DataType>,
    filter: HintedFilter<DataModel> = {},
  ) {
    const matches = await this.model.countDocuments({ _id: parentId, deleted: this.deletedDefaultFilter() }).exec();
    if (matches <= 0) {
      throw new ResourceNotFoundException(this.model.modelName, parentId.toString());
    }
    if (filter.deleted === undefined) {
      filter.deleted = this.deletedDefaultFilter();
    }
    const transformedFilter = this.formatQueryForAggregation(filter, subdocumentField as string);
    const aggregration: { _id: string | ObjectId; count: number }[] = await this.model
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

  create(data: DataType, user?: UserType): Promise<DocumentType> {
    const instance = this.model.create({ ...data, createdAt: moment.utc().toDate(), createdBy: user });
    this.events.emit(this.eventsCreate, instance);
    return instance;
  }

  async get(filter: HintedFilter<DataType>, projection?: ProjectionOptions<DataType> | string): Promise<DocumentType> {
    const conditions = Object.assign({ deleted: this.deletedDefaultFilter() }, filter);
    const instance = await this.model.findOne(conditions, projection).exec();
    if (!instance) {
      throw new ResourceNotFoundException(this.model.modelName, JSON.stringify(conditions));
    }
    return instance;
  }

  async getById(_id: string | ObjectId, projection?: ProjectionOptions<DataType> | string): Promise<DocumentType> {
    return this.get({ _id: new ObjectId(_id) }, projection);
  }

  async getSubdocument<DataModel extends object>(
    parentId: string | ObjectId,
    subdocumentField: ArrayTypeKeys<DataType>,
    filter: HintedFilter<DataModel>,
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
      throw new ResourceNotFoundException(this.model.modelName, parentId.toString());
    }
    return instance[subdocumentField as string].pop() as SubmodelType<DataModel>;
  }

  async getSubdocumentById<DataModel extends object>(
    parentId: string | ObjectId,
    subdocumentField: ArrayTypeKeys<DataType>,
    subdocumentId: string | ObjectId,
  ): Promise<SubmodelType<DataModel>> {
    return this.getSubdocument<DataModel>(parentId, subdocumentField, { _id: new ObjectId(subdocumentId) });
  }

  async hardDelete(_id: string | ObjectId): Promise<DocumentType> {
    const instance = await this.model.findByIdAndDelete(_id).exec();
    this.events.emit(this.eventsDelete, instance);
    return instance;
  }

  hardDeleteSubdocument(parentId: string | ObjectId, subdocumentField: ArrayTypeKeys<DataType>, subdocumentId: string | ObjectId, user?: UserType) {
    return this.patchById(parentId, { $pull: { [subdocumentField]: { _id: subdocumentId } } }, user);
  }

  list(
    filter: HintedFilter<DataType> = {},
    limit?: number,
    skip?: number,
    projection?: ProjectionOptions<DataType> | string,
    sort?: SortOptions<DataType>,
  ): Promise<Array<DocumentType>> {
    filter.deleted = filter.deleted !== undefined ? filter.deleted : this.deletedDefaultFilter();
    return this.model.find(filter, projection, { sort, skip, limit }).exec();
  }

  async listSubdocuments<DataModel extends object>(
    parentId: string | ObjectId,
    subdocumentField: ArrayTypeKeys<DataType>,
    filter: HintedFilter<DataModel> = {},
    limit: number = 9999,
    skip: number = 0,
    sort: SortOptions<DataModel> = { _id: 1 },
  ): Promise<Array<SubmodelType<DataModel>>> {
    if (filter.deleted === undefined) {
      filter.deleted = this.deletedDefaultFilter();
    }
    const transformedSort = this.formatQueryForAggregation(sort, subdocumentField as string);
    const transformedFilter = this.formatQueryForAggregation(filter, subdocumentField as string);
    const matches = await this.model.countDocuments({ _id: parentId, deleted: this.deletedDefaultFilter() }).exec();
    if (matches <= 0) {
      throw new ResourceNotFoundException(this.model.modelName, parentId.toString());
    }
    const expression = `$${subdocumentField}`;
    const aggregration: DataType[] = await this.model
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

  async patch(filter: HintedFilter<DataType> = {}, update: HintedDynamicObject<DataType> = {}, user?: UserType): Promise<DocumentType> {
    return this.update(filter, { $set: update }, user);
  }

  async patchById(_id: string | ObjectId, update: HintedDynamicObject<DataType>, user?: UserType): Promise<DocumentType> {
    return this.patch({ _id: new ObjectId(_id) }, update, user);
  }

  async patchSubdocument<DataModel extends object>(
    parentId: string | ObjectId,
    subdocumentField: ArrayTypeKeys<DataType>,
    filter: HintedFilter<DataModel> = {},
    update: HintedDynamicObject<DataModel>,
    user?: UserType,
  ): Promise<SubmodelType<DataModel>> {
    const subdocument = await this.getSubdocument(parentId, subdocumentField, filter);
    if (!subdocument) {
      throw new ResourceNotFoundException(subdocumentField as string, JSON.stringify(filter));
    }
    const finalConditions = { _id: new ObjectId(parentId), [`${subdocumentField}._id`]: subdocument._id };
    const document = await this.patch(finalConditions, this.formatUpdateForSubdocuments(update, subdocumentField as string), user);
    const subList: unknown = document[subdocumentField];
    return (subList as Types.DocumentArray<SubmodelType<DataModel>>).id(subdocument._id);
  }

  async patchSubdocumentById<DataModel extends object>(
    parentId: string | ObjectId,
    subdocumentField: ArrayTypeKeys<DataType>,
    subdocumentId: string | ObjectId,
    update: HintedDynamicObject<DataModel>,
    user?: UserType,
  ) {
    return this.patchSubdocument<DataModel>(parentId, subdocumentField, { _id: new ObjectId(subdocumentId) }, update, user);
  }

  async softDelete(_id: string | ObjectId, user?: UserType): Promise<DocumentType> {
    return this.patchById(_id, { deleted: true, deletedAt: this.now(), deletedBy: user }, user);
  }

  async softDeleteSubdocument<DataModel extends object>(
    parentId: string | ObjectId,
    subdocumentField: ArrayTypeKeys<DataType>,
    subdocumentId: string | ObjectId,
    user?: UserType,
  ) {
    return this.patchSubdocumentById<DataModel>(
      parentId,
      subdocumentField,
      subdocumentId,
      { deleted: true, deletedAt: this.now(), deletedBy: user },
      user,
    );
  }

  async update(
    filter: HintedFilter<DataType> = {},
    update: HintedDynamicObject<DataType> & { $set?: any } = {},
    user?: UserType,
  ): Promise<DocumentType> {
    update.$set = update.$set ? Object.assign(this.getDefaultUpdate(user), update.$set) : this.getDefaultUpdate(user);
    const conditions = Object.assign({ deleted: this.deletedDefaultFilter() }, filter);
    const instance = await this.model.findOneAndUpdate(conditions, update, { new: true }).exec();
    if (!instance) {
      throw new ResourceNotFoundException(this.model.modelName, JSON.stringify(conditions));
    }
    this.events.emit(this.eventsPatch, instance);
    return instance;
  }

  async updateById(_id: string | ObjectId, update: HintedDynamicObject<DataType> = {}, user?: UserType): Promise<DocumentType> {
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

  protected formatQueryForSubdocuments(input: IDynamicObject, field: string): IDynamicObject {
    return Object.keys(input).reduce((result, key) => {
      result[`${field}.${key}`] = input[key];
      return result;
    }, {});
  }

  protected formatUpdateForSubdocuments(input: IDynamicObject, field: string): IDynamicObject {
    const finalUpdate = {};
    for (const key in input) {
      if (input.hasOwnProperty(key)) {
        finalUpdate[`${field}.$.${key}`] = input[key];
      }
    }
    return finalUpdate;
  }

  protected getDefaultUpdate(user?: UserType): IDynamicObject {
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
