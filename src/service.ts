import { EventEmitter } from 'events';
import { Db, ObjectId, SessionOptions, WithTransactionCallback } from 'mongodb';
import { ClientSession, Model, mongo, Types } from 'mongoose';

import { DocumentNotFoundException, DuplicateKeyException } from './exceptions';
import {
  HintedFilter,
  IAddSubdocumentParams,
  ICountSubdocumentsParams,
  ICreateParams,
  IDynamicObject,
  IGetByIdParams,
  IGetParams,
  IGetSubDocumentByIdParams,
  IGetSubDocumentParams,
  IHardDeleteParams,
  IHardDeleteSubdocumentByIdParams,
  IHardDeleteSubdocumentParams,
  IListParams,
  IListSubdocuments,
  IPatchByIdParams,
  IPatchParams,
  IPatchSubdocumentByIdParams,
  IPatchSubdocumentParams,
  ISoftDeleteParams,
  ISoftDeleteSubdocumentParams,
  IUpdateByIdParams,
  IUpdateParams,
  ModelType as MongoosModel,
  SubmodelType,
} from './interfaces';

export class GenericMongooseCrudService<
  ModelType extends object = object,
  DocumentType extends MongoosModel<ModelType> = MongoosModel<ModelType>,
  UserType extends object = object
> {
  get db(): Db {
    return this.db;
  }
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

  async addSubdocument<SubdocumentType extends object>(
    params: IAddSubdocumentParams<ModelType, SubdocumentType, UserType>,
  ): Promise<SubmodelType<SubdocumentType>> {
    const { options = {}, parentId, data = {}, subdocumentField, user } = params;
    const instance = await this.updateById({
      _id: parentId,
      update: { $push: { [subdocumentField]: { ...data, createdAt: this.now(), createdBy: user } as SubdocumentType } },
      user,
      options,
    });
    return instance[subdocumentField as string].pop() as SubmodelType<SubdocumentType>;
  }

  count(filter: HintedFilter<ModelType> = {}): Promise<number> {
    filter.deleted = filter.deleted ? filter.deleted : { $ne: true };
    return this.model.countDocuments(filter).exec();
  }

  async countSubdocuments<SubdocumentType extends object>(params: ICountSubdocumentsParams<ModelType, SubdocumentType>): Promise<number> {
    const { filter = {}, parentId, subdocumentField } = params;
    const matches = await this.model.countDocuments({ _id: parentId, deleted: this.getDeletedDefaultFilter() }).exec();
    if (matches <= 0) {
      throw new DocumentNotFoundException(this.model.modelName, parentId.toString());
    }
    if (filter.deleted === undefined) {
      filter.deleted = this.getDeletedDefaultFilter();
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

  async create(params: ICreateParams<ModelType, UserType>): Promise<DocumentType> {
    const { data = {}, options, user } = params;
    const instance = new this.model({ ...data, createdAt: this.now(), createdBy: user });
    await this.handleMongoError(() => instance.save(options));
    this.events.emit(this.eventsCreate, instance);
    return instance;
  }

  async get(params: IGetParams<ModelType>): Promise<DocumentType> {
    const { filter = {}, projection } = params;
    const conditions = Object.assign({ deleted: this.getDeletedDefaultFilter() }, filter);
    const instance = await this.model.findOne(conditions, projection).exec();
    if (!instance) {
      throw new DocumentNotFoundException(this.model.modelName, JSON.stringify(conditions));
    }
    return instance;
  }

  async getById(params: IGetByIdParams<ModelType>): Promise<DocumentType> {
    const { _id, projection } = params;
    return this.get({ filter: { _id: new ObjectId(_id) }, projection });
  }

  async getSubdocument<SubdocumentType extends object>(
    params: IGetSubDocumentParams<ModelType, SubdocumentType>,
  ): Promise<SubmodelType<SubdocumentType>> {
    const { parentId, subdocumentField, filter = {} } = params;
    const conditions = Object.assign({ deleted: this.getDeletedDefaultFilter() }, filter);
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
      throw new DocumentNotFoundException(this.model.modelName, parentId.toString());
    }
    return instance[subdocumentField as string].pop() as SubmodelType<SubdocumentType>;
  }

  async getSubdocumentById<SubdocumentType extends object>(params: IGetSubDocumentByIdParams<ModelType>): Promise<SubmodelType<SubdocumentType>> {
    const { parentId, subdocumentField, subdocumentId } = params;
    return this.getSubdocument<SubdocumentType>({ parentId, subdocumentField, filter: { _id: new ObjectId(subdocumentId) } });
  }

  async hardDelete(params: IHardDeleteParams): Promise<DocumentType> {
    const { _id, session } = params;
    const instance = await this.model
      .findByIdAndDelete(_id)
      .session(session)
      .exec();
    this.events.emit(this.eventsDelete, instance);
    return instance;
  }

  async hardDeleteSubdocument<SubdocumentType extends object>(
    params: IHardDeleteSubdocumentParams<ModelType, SubdocumentType, UserType>,
  ): Promise<SubmodelType<SubdocumentType>> {
    const { filter = {}, options, parentId, subdocumentField, user } = params;
    const subdocument = await this.getSubdocument<SubdocumentType>({ parentId, subdocumentField, filter });
    await this.patchById({ _id: parentId, update: { $pull: { [subdocumentField]: { _id: subdocument._id } } }, user, options });
    return subdocument;
  }

  hardDeleteSubdocumentById<SubdocumentType extends object>(
    params: IHardDeleteSubdocumentByIdParams<ModelType, UserType>,
  ): Promise<SubmodelType<SubdocumentType>> {
    const { options, parentId, subdocumentField, subdocumentId, user } = params;
    return this.hardDeleteSubdocument<SubdocumentType>({ parentId, subdocumentField, filter: { _id: subdocumentId }, user, options });
  }

  list(params: IListParams<ModelType> = {}): Promise<Array<DocumentType>> {
    const { filter = {}, limit, projection, skip, sort = {} } = params;
    filter.deleted = filter.deleted !== undefined ? filter.deleted : this.getDeletedDefaultFilter();
    return this.model.find(filter, projection, { sort, skip, limit }).exec();
  }

  async listAndCount(params: IListParams<ModelType> = {}): Promise<{ count: number; data: Array<DocumentType> }> {
    const { filter = {} } = params;
    const [data, count] = await Promise.all([this.list(params), this.count(filter)]);
    return { data, count };
  }

  async listSubdocuments<SubdocumentType extends object>(
    params: IListSubdocuments<ModelType, SubdocumentType>,
  ): Promise<Array<SubmodelType<SubdocumentType>>> {
    const { filter = {}, limit = this.getDefaultLimit(), parentId, skip = 0, sort = { _id: 1 }, subdocumentField } = params;
    if (filter.deleted === undefined) {
      filter.deleted = this.getDeletedDefaultFilter();
    }
    const transformedSort = this.formatQueryForAggregation(sort, subdocumentField as string);
    const transformedFilter = this.formatQueryForAggregation(filter, subdocumentField as string);
    const matches = await this.model.countDocuments({ _id: parentId, deleted: this.getDeletedDefaultFilter() }).exec();
    if (matches <= 0) {
      throw new DocumentNotFoundException(this.model.modelName, parentId.toString());
    }
    const expression = `$${subdocumentField}`;
    const aggregration: ModelType[] = await this.model
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
    return aggregration.length > 0 ? (aggregration.pop()[subdocumentField as string] as Array<SubmodelType<SubdocumentType>>) : [];
  }

  async patch(params: IPatchParams<ModelType, UserType>): Promise<DocumentType> {
    const { filter = {}, options, update, user } = params;
    return this.update({ filter, update: { $set: update }, user, options });
  }

  async patchById(params: IPatchByIdParams<ModelType, UserType>): Promise<DocumentType> {
    const { _id, options, update, user } = params;
    return this.patch({ filter: { _id: new ObjectId(_id) }, update, user, options });
  }

  async patchSubdocument<SubdocumentType extends object>(
    params: IPatchSubdocumentParams<ModelType, SubdocumentType, UserType>,
  ): Promise<SubmodelType<SubdocumentType>> {
    const { filter = {}, options, parentId, subdocumentField, update, user } = params;
    const subdocument = await this.getSubdocument({ parentId, subdocumentField, filter });
    if (!subdocument) {
      throw new DocumentNotFoundException(subdocumentField as string, JSON.stringify(filter));
    }
    const finalConditions = { _id: new ObjectId(parentId), [`${subdocumentField}._id`]: subdocument._id };
    const document = await this.patch({
      filter: finalConditions,
      update: this.formatUpdateForSubdocuments(update, subdocumentField as string),
      user,
      options,
    });
    const subList: unknown = document[subdocumentField];
    return (subList as Types.DocumentArray<SubmodelType<SubdocumentType>>).id(subdocument._id);
  }

  async patchSubdocumentById<SubdocumentType extends object>(
    params: IPatchSubdocumentByIdParams<ModelType, SubdocumentType, UserType>,
  ): Promise<SubmodelType<SubdocumentType>> {
    const { options, parentId, subdocumentField, subdocumentId, update, user } = params;
    return this.patchSubdocument<SubdocumentType>({
      parentId,
      subdocumentField,
      filter: { _id: new ObjectId(subdocumentId) },
      update,
      user,
      options,
    });
  }

  async softDelete(params: ISoftDeleteParams<UserType>): Promise<DocumentType> {
    const { _id, options, user } = params;
    return this.patchById({ _id, update: { deleted: true, deletedAt: this.now(), deletedBy: user }, user, options });
  }

  async softDeleteSubdocument<SubdocumentType extends object>(params: ISoftDeleteSubdocumentParams): Promise<SubmodelType<SubdocumentType>> {
    const { parentId, subdocumentField, subdocumentId, user } = params;
    return this.patchSubdocumentById<SubdocumentType>({
      parentId,
      subdocumentField,
      subdocumentId,
      update: { deleted: true, deletedAt: this.now(), deletedBy: user },
      user,
    });
  }

  startSession(options?: SessionOptions): Promise<ClientSession> {
    return this.model.db.startSession(options);
  }

  async update(params: IUpdateParams<ModelType, UserType>): Promise<DocumentType> {
    const { filter = {}, options = {}, update, user } = params;
    update.$set = update.$set ? Object.assign(this.getDefaultUpdate(user), update.$set) : this.getDefaultUpdate(user);
    const conditions = Object.assign({ deleted: this.getDeletedDefaultFilter() }, filter);
    const instance = await this.handleMongoError(async () =>
      this.model
        .findOneAndUpdate(conditions, update, Object.assign({ new: true }, options))
        .session(options.session)
        .exec(),
    );
    if (!instance) {
      throw new DocumentNotFoundException(this.model.modelName, JSON.stringify(conditions));
    }
    this.events.emit(this.eventsPatch, instance);
    return instance;
  }

  async updateById(params: IUpdateByIdParams<ModelType, UserType>): Promise<DocumentType> {
    const { _id, options, update, user } = params;
    return this.update({ filter: { _id: new ObjectId(_id) }, update, user, options });
  }

  async withTransaction<T = any>(fn: WithTransactionCallback<T>, sessionOptions?: SessionOptions): Promise<T> {
    const session = await this.startSession(sessionOptions);
    let result: T;
    await session.withTransaction(async _session => {
      result = await fn(_session);
      return result;
    });
    return result;
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

  protected getDefaultLimit() {
    return 2147483647;
  }

  protected getDefaultUpdate(user?: UserType): IDynamicObject {
    return {
      updatedAt: this.now(),
      updatedBy: user,
    };
  }

  protected getDeletedDefaultFilter(): { $ne: true } {
    return { $ne: true };
  }

  protected handleMongoError(callback: Function) {
    try {
      return callback();
    } catch (error) {
      if (error.code === 11000) {
        throw new DuplicateKeyException(error);
      }
      throw error;
    }
  }

  protected merge<Input = object>(doc: Input, newDoc: Partial<Input>): Input {
    for (const key of Object.keys(newDoc)) {
      doc[key] = newDoc[key];
    }
    return doc;
  }

  protected now(): Date {
    return new Date();
  }
}
