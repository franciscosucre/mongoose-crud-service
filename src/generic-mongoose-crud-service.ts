import { ResourceNotFoundException } from '@aluxion-nestjs/exceptions';
import { ObjectId } from 'bson';
import { EventEmitter } from 'events';
import * as moment from 'moment';
import { Model, mongo, Types } from 'mongoose';

import { IModelInstance, ISortOptions } from './generic-mongoose-crud-service.interfaces';
import { IDynamicObject, IGenericMongooseCrudServiceOptions, IMongoDocument } from './generic-mongoose-crud-service.interfaces';

export class GenericMongooseCrudService<T extends IModelInstance> {
  public readonly events: EventEmitter = new EventEmitter();
  protected readonly eventsCreate: string;
  protected readonly eventsDelete: string;
  protected readonly eventsPatch: string;
  protected readonly model: Model<T & IMongoDocument>;
  protected readonly modelName: string = 'GENERIC';

  constructor(options: IGenericMongooseCrudServiceOptions<T & IMongoDocument> = {}) {
    this.model = options.model ? options.model : this.model;
    this.modelName = options.modelName ? options.modelName : this.model.modelName;

    if (options.eventsCreate) {
      this.eventsCreate = options.eventsCreate;
    } else {
      if (!this.eventsCreate) {
        this.eventsCreate = `${this.modelName.toUpperCase()}_CREATED`;
      }
    }

    if (options.eventsPatch) {
      this.eventsPatch = options.eventsPatch;
    } else {
      if (!this.eventsPatch) {
        this.eventsPatch = `${this.modelName.toUpperCase()}_UPDATED`;
      }
    }

    if (options.eventsDelete) {
      this.eventsDelete = options.eventsDelete;
    } else {
      if (!this.eventsDelete) {
        this.eventsDelete = `${this.modelName.toUpperCase()}_DELETED`;
      }
    }
  }

  async addSubdocument<Subdocument extends IModelInstance>(parentId: string, subdocumentField: string, subdocument: any, user: any) {
    subdocument.createdAt = moment.utc().toDate();
    subdocument.createdBy = user;
    const instance = await this.updateById(parentId, { $push: { [subdocumentField]: subdocument } }, user);
    return instance[subdocumentField].pop() as Subdocument;
  }

  count(filter: IDynamicObject = {}): Promise<number> {
    filter.deleted = filter.deleted ? filter.deleted : false;
    return this.model.countDocuments(filter).exec();
  }

  async countSubdocuments(parentId: string, subdocumentField: string, filter: IDynamicObject = {}) {
    const matches = await this.model.countDocuments({ _id: parentId, deleted: false }).exec();
    if (matches <= 0) {
      throw new ResourceNotFoundException(this.modelName, parentId);
    }
    if (filter.deleted === undefined) {
      filter.deleted = false;
    }
    const transformedFilter = this.formatQueryForAggregation(filter, subdocumentField);
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

  create(data: Partial<T>, user: any): Promise<T & IMongoDocument> {
    data.createdAt = moment.utc().toDate();
    data.createdBy = user;
    const instance = this.model.create(data);
    this.events.emit(this.eventsCreate, instance);
    return instance;
  }

  async getById(_id: string, projection?: string): Promise<T & IMongoDocument> {
    const instance = await this.model.findOne({ _id, deleted: false }, projection).exec();
    if (!instance) {
      throw new ResourceNotFoundException(this.modelName, _id);
    }
    return instance;
  }

  async getSubdocument<Subdocument extends IModelInstance>(
    parentId: string,
    subdocumentField: string,
    filter: IDynamicObject = {},
  ): Promise<Subdocument & IMongoDocument> {
    const conditions = Object.assign({ deleted: false }, filter);
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
      throw new ResourceNotFoundException(this.modelName, parentId);
    }
    return instance[subdocumentField].pop() as Subdocument & IMongoDocument;
  }

  async getSubdocumentById<Subdocument extends IModelInstance>(
    parentId: string,
    subdocumentField: string,
    subdocumentId: string,
  ): Promise<Subdocument & IMongoDocument> {
    return this.getSubdocument<Subdocument>(parentId, subdocumentField, { _id: new ObjectId(subdocumentId) });
  }

  async hardDelete(_id: string): Promise<T & IMongoDocument> {
    const instance = await this.model.findByIdAndDelete(_id).exec();
    this.events.emit(this.eventsDelete, instance);
    return instance;
  }

  hardDeleteSubdocument(parentId: string, subdocumentField: string, subdocumentId: string, user: any) {
    return this.patchById(parentId, { $pull: { [subdocumentField]: { _id: subdocumentId } } }, user);
  }

  list(filter: IDynamicObject = {}, limit?: number, skip?: number, projection?: string, sort?: ISortOptions): Promise<Array<T & IMongoDocument>> {
    filter.deleted = filter.deleted !== undefined ? filter.deleted : false;
    return this.model.find(filter, projection, { sort, skip, limit }).exec();
  }

  async listSubdocuments<Subdocument extends IModelInstance>(
    parentId: string,
    subdocumentField: string,
    filter: IDynamicObject = {},
    limit: number = 9999,
    skip: number = 0,
    sort: ISortOptions = { _id: 1 },
  ): Promise<Array<Subdocument & IMongoDocument>> {
    if (filter.deleted === undefined) {
      filter.deleted = false;
    }
    const transformedSort = this.formatQueryForAggregation(sort, subdocumentField);
    const transformedFilter = this.formatQueryForAggregation(filter, subdocumentField);
    const matches = await this.model.countDocuments({ _id: parentId, deleted: false }).exec();
    if (matches <= 0) {
      throw new ResourceNotFoundException(this.modelName, parentId);
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
    return aggregration.length > 0 ? (aggregration.pop()[subdocumentField] as Array<Subdocument & IMongoDocument>) : [];
  }

  async patch(filter: IDynamicObject = {}, update: IDynamicObject = {}, user: any): Promise<T & IMongoDocument> {
    return this.update(filter, { $set: update }, user);
  }

  async patchById(_id: string, update: any, user: any): Promise<T & IMongoDocument> {
    return this.patch({ _id: new ObjectId(_id) }, update, user);
  }

  async patchSubdocument<Subdocument extends IModelInstance>(
    parentId: string,
    subdocumentField: string,
    filter: IDynamicObject = {},
    update: any,
    user: any,
  ): Promise<Subdocument & IMongoDocument> {
    const conditions = Object.keys(filter).reduce(
      (result, key) => {
        result[`${subdocumentField}.${key}`] = filter[key];
        return result;
      },
      { _id: new ObjectId(parentId), deleted: false, [`${subdocumentField}.deleted`]: false },
    );
    const subdocument = await this.getSubdocument(parentId, subdocumentField, filter);
    if (!subdocument) {
      throw new ResourceNotFoundException(subdocumentField, JSON.stringify(conditions));
    }
    this.merge(subdocument, Object.assign(this.getDefaultUpdate(user), update));
    await subdocument.save();
    await this.patch({ _id: new ObjectId(parentId) }, this.getDefaultUpdate(user), user);
    return subdocument as Subdocument & IMongoDocument;
  }

  async patchSubdocumentById<Subdocument extends IModelInstance>(
    parentId: string,
    subdocumentField: string,
    subdocumentId: string,
    update: any,
    user: any,
  ) {
    return this.patchSubdocument<Subdocument>(parentId, subdocumentField, { _id: new ObjectId(subdocumentId) }, update, user);
  }

  async softDelete(_id: string, user: any): Promise<T & IMongoDocument> {
    return this.patchById(_id, { deleted: true, deletedAt: this.now(), deletedBy: user }, user);
  }

  async softDeleteSubdocument<Subdocument extends IModelInstance>(parentId: string, subdocumentField: string, subdocumentId: string, user: any) {
    return this.patchSubdocumentById<Subdocument>(
      parentId,
      subdocumentField,
      subdocumentId,
      { deleted: true, deletedAt: this.now(), deletedBy: user },
      user,
    );
  }

  async update(filter: IDynamicObject = {}, update: IDynamicObject = {}, user: any): Promise<T & IMongoDocument> {
    update.$set = update.$set ? Object.assign(this.getDefaultUpdate(user), update.$set) : this.getDefaultUpdate(user);
    const conditions = Object.assign({ deleted: false }, filter);
    const instance = await this.model.findOneAndUpdate(conditions, update, { new: true }).exec();
    if (!instance) {
      throw new ResourceNotFoundException(this.modelName, JSON.stringify(conditions));
    }
    this.events.emit(this.eventsPatch, instance);
    return instance;
  }

  async updateById(_id: string, update: IDynamicObject = {}, user: any): Promise<T & IMongoDocument> {
    return this.update({ _id: new ObjectId(_id) }, update, user);
  }

  private formatQueryForAggregation(input: IDynamicObject, field: string): IDynamicObject {
    const result = {};
    for (const key in input) {
      if (input.hasOwnProperty(key)) {
        result[`${field}.${key}`] = input[key];
      }
    }
    return result;
  }

  private getDefaultUpdate(user: any): IDynamicObject {
    return {
      updatedAt: this.now(),
      updatedBy: user,
    };
  }

  private merge(doc: IMongoDocument, newDoc: Partial<T & IMongoDocument>): IMongoDocument {
    for (const key of Object.keys(newDoc)) {
      doc.set(key, newDoc[key]);
    }
    return doc;
  }

  private now(): Date {
    return moment.utc().toDate();
  }
}
