import * as faker from 'faker';
import * as moment from 'moment';
import * as mongoUnit from 'mongo-unit';
import * as mongoose from 'mongoose';

import { DocumentNotFoundException } from './exceptions';
import { IModelInstance, IMongoDocument, SubmodelType } from './interfaces';
import { timestampedSchemaDefinition } from './schemas';
import { GenericMongooseCrudService } from './service';

jasmine.DEFAULT_TIMEOUT_INTERVAL = 600000;

interface ITestSubData extends IModelInstance {
  msg: string;
}

interface ITestSubDataModel extends ITestSubData, IMongoDocument {}

interface ITestData extends IModelInstance {
  subs: ITestSubData[];
  value: string;
}

interface ITestDataModel extends ITestData, IMongoDocument {
  subs: mongoose.Types.DocumentArray<ITestSubDataModel>;
  instanceMethod(): any;
}

const generateTestSubData = (data: Partial<ITestSubData> = {}): ITestSubData => {
  return {
    _id: data._id !== undefined ? data._id : new mongoose.mongo.ObjectId(),
    msg: data.msg !== undefined ? data.msg : faker.random.word(),
    deleted: data.deleted !== undefined ? data.deleted : false,
    createdAt: data.createdAt !== undefined ? data.createdAt : moment.utc().toDate(),
    updatedAt: data.updatedAt !== undefined ? data.updatedAt : moment.utc().toDate(),
    deletedAt: data.deleted !== undefined ? (data.deletedAt ? data.deletedAt : moment.utc().toDate()) : undefined,
  };
};

export const generateRandomTestSubData = (count: number = 1): ITestSubData[] => new Array(count).fill(0).map(() => generateTestSubData());

const generateTestData = (data: Partial<ITestData> = {}): ITestData => {
  return {
    _id: data._id !== undefined ? data._id : new mongoose.mongo.ObjectId(),
    value: data.value !== undefined ? data.value : faker.name.firstName(),
    subs: data.subs !== undefined ? data.subs : generateRandomTestSubData(faker.random.number({ min: 1, max: 10 })),
    deleted: data.deleted !== undefined ? data.deleted : false,
    createdAt: data.createdAt !== undefined ? data.createdAt : moment.utc().toDate(),
    updatedAt: data.updatedAt !== undefined ? data.updatedAt : moment.utc().toDate(),
    deletedAt: data.deleted !== undefined ? (data.deletedAt ? data.deletedAt : moment.utc().toDate()) : undefined,
  };
};

export const generateRandomTestData = (count: number = 1): ITestData[] => new Array(count).fill(0).map(() => generateTestData());

const generateUserData = () => {
  return {
    email: faker.internet.email(),
  };
};

const subSchemaDefinition: mongoose.SchemaDefinition = Object.assign<mongoose.SchemaDefinition, mongoose.SchemaDefinition, mongoose.SchemaDefinition>(
  {},
  timestampedSchemaDefinition,
  { msg: { type: String } },
);

const schemaDefinition: mongoose.SchemaDefinition = Object.assign<mongoose.SchemaDefinition, mongoose.SchemaDefinition, mongoose.SchemaDefinition>(
  {},
  timestampedSchemaDefinition,
  { value: { type: String }, subs: [subSchemaDefinition] },
);

const MODEL_NAME = 'TestModel';
const opts: mongoose.ConnectionOptions = { useNewUrlParser: true, useFindAndModify: false, useCreateIndex: true, useUnifiedTopology: true };
let model: mongoose.Model<ITestDataModel>;
let service: GenericMongooseCrudService<ITestData, ITestDataModel>;

describe('GenericMongooseCrudService', () => {
  beforeAll(async () => {
    await mongoUnit.start();
    const mongoUri = mongoUnit.getUrl();
    await mongoose.connect(mongoUri, opts);
    model = mongoose.model(MODEL_NAME, new mongoose.Schema(schemaDefinition));
    service = new GenericMongooseCrudService<ITestData, ITestDataModel>(model);
    return;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoUnit.stop();
    return;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Documents', () => {
    describe('list', () => {
      beforeEach(async () => {
        await model.deleteMany({}).exec();
      });

      it('should return an empty list', async () => {
        const instances = await service.list();
        return expect(instances.length).toBe(0);
      });

      it('should return 10 elements', async () => {
        await model.create(generateRandomTestData(10));
        const instances = await service.list();
        return expect(instances.length).toBe(10);
      });

      it('should return only the instances set on limit', async () => {
        await model.create(generateRandomTestData(10));
        const instances = await service.list({ limit: 3 });
        return expect(instances.length).toBe(3);
      });

      it('should paginate the instances', async () => {
        await model.create(generateRandomTestData(10));
        const [first] = await service.list({ limit: 1, skip: 0 });
        const [second] = await service.list({ limit: 1, skip: 1 });
        return expect(first._id.toString()).not.toEqual(second._id.toString());
      });

      it('should filter the instances with the given query', async () => {
        const [instance] = await model.create(generateRandomTestData(10));
        const instances = await service.list({ filter: { value: instance.value } });
        expect(instances.length).toEqual(1);
        return expect(instances.pop().id).toEqual(instance.id);
      });

      it('should show only non deleted instances', async () => {
        await model.create(generateTestData({ deleted: true }));
        await model.create(generateRandomTestData(9));
        const instances = await service.list();
        return expect(instances.length).toEqual(9);
      });
    });

    describe('count', () => {
      beforeEach(async () => {
        await model.deleteMany({}).exec();
      });

      it('should return an empty list', async () => {
        const count = await service.count();
        return expect(count).toEqual(0);
      });

      it('should return 10 elements', async () => {
        await model.create(generateRandomTestData(10));
        const count = await service.count();
        return expect(count).toEqual(10);
      });

      it('should filter the instances with the given query', async () => {
        const [instance] = await model.create(generateRandomTestData(10));
        const count = await service.count({ value: instance.value });
        return expect(count).toEqual(1);
      });

      it('should count only non deleted instances', async () => {
        await model.create(generateTestData({ deleted: true }));
        await model.create(generateRandomTestData(9));
        const count = await service.count();
        return expect(count).toEqual(9);
      });
    });

    describe('create', () => {
      beforeEach(async () => {
        await model.deleteMany({}).exec();
      });

      it('should create a MongoDB document', async () => {
        const instance = await service.create({ data: generateTestData(), user: generateUserData() });
        const [persistedInstance] = await model.find().exec();
        expect(instance._id.toString()).toEqual(persistedInstance._id.toString());
        return expect(instance._id).toEqual(persistedInstance._id);
      });
    });

    describe('getById', () => {
      let instance: ITestDataModel;

      beforeEach(async () => {
        await model.deleteMany({}).exec();
        instance = await model.create(generateTestData());
        return;
      });

      it('should retrieve the instance', async () => {
        const retrievedInstance = await service.getById(instance._id);
        return expect(retrievedInstance._id.toString()).toEqual(instance._id.toString());
      });

      it('should retrieve the instance only the _id field', async () => {
        const retrievedInstance = await service.getById({ _id: instance._id, projection: '_id' });
        expect(retrievedInstance._id.toString()).toEqual(instance._id.toString());
        expect(instance.value).toBeDefined();
        return expect(retrievedInstance.value).not.toBeDefined();
      });

      it('should throw an error if the document does not exist', async () => {
        const _id = instance._id;
        await model.deleteOne({ _id }).exec();
        try {
          await service.getById(_id);
          return fail();
        } catch (error) {
          return expect(error).toBeInstanceOf(DocumentNotFoundException);
        }
      });

      it('should throw an error if the document was soft deleted', async () => {
        const _id = instance._id;
        await model.findByIdAndUpdate(_id, { deleted: true }).exec();
        try {
          await service.getById(_id);
          return fail();
        } catch (error) {
          return expect(error).toBeInstanceOf(DocumentNotFoundException);
        }
      });
    });

    describe('patchById', () => {
      let instance: ITestDataModel;
      const newName = 'newName';
      const oldName = 'oldName';

      beforeEach(async () => {
        await model.deleteMany({}).exec();
        instance = await model.create(generateTestData({ value: oldName }));
      });

      it('should update the document', async () => {
        const retrievedInstance = await service.patchById({ _id: instance._id, update: { value: newName }, user: generateUserData() });
        expect(retrievedInstance.updatedAt.toISOString()).not.toEqual(instance.updatedAt.toISOString());
        return expect(retrievedInstance.value).not.toEqual(instance.value);
      });

      it('should throw an error if the instance does not exist', async () => {
        const _id = instance._id;
        await model.deleteOne({ _id }).exec();
        try {
          await service.patchById({ _id, update: { value: newName }, user: generateUserData() });
          return fail();
        } catch (error) {
          return expect(error).toBeInstanceOf(DocumentNotFoundException);
        }
      });

      it('should throw an error if the instance was soft deleted', async () => {
        const _id = instance._id;
        await model.findByIdAndUpdate(_id, { $set: { deleted: true } }).exec();
        try {
          await service.patchById({ _id, update: { value: newName }, user: generateUserData() });
          return fail();
        } catch (error) {
          return expect(error).toBeInstanceOf(DocumentNotFoundException);
        }
      });
    });

    describe('delete', () => {
      let instance: ITestDataModel;

      beforeEach(async () => {
        await model.deleteMany({}).exec();
        instance = await model.create(generateTestData());
      });

      it('should soft delete the document', async () => {
        const retrievedInstance = await service.softDelete({ _id: instance._id, user: generateUserData() });
        expect(instance.deletedAt).not.toBeDefined();
        expect(retrievedInstance.deletedAt).toBeInstanceOf(Date);
        expect(retrievedInstance.deleted).toEqual(true);
        return expect(service.getById(retrievedInstance._id)).rejects.toBeInstanceOf(DocumentNotFoundException);
      });

      it('should throw an error if the instance does not exist', async () => {
        const _id = instance._id;
        await model.deleteOne({ _id }).exec();
        try {
          await service.softDelete({ _id, user: generateUserData() });
          return fail();
        } catch (error) {
          return expect(error).toBeInstanceOf(DocumentNotFoundException);
        }
      });

      it('should throw an error if the instance was soft deleted', async () => {
        const _id = instance._id;
        await model.findByIdAndUpdate(_id, { deleted: true }).exec();
        try {
          await service.softDelete({ _id, user: generateUserData() });
          return fail();
        } catch (error) {
          return expect(error).toBeInstanceOf(DocumentNotFoundException);
        }
      });
    });
  });

  describe('Subdocuments', () => {
    const subdocumentField = 'subs';

    describe('list', () => {
      let instance: ITestDataModel;

      beforeEach(async () => {
        await model.deleteMany({}).exec();
        instance = await model.create(generateTestData({ subs: generateRandomTestSubData(10) }));
      });

      it('should list a list of subdocuments', async () => {
        const subs = await service.listSubdocuments<ITestSubData>({ parentId: instance._id, subdocumentField });
        expect(subs).toBeInstanceOf(Array);
        expect(subs.length).toEqual(instance.subs.length);
      });

      it('should filter the list of subdocuments', async () => {
        const sub = faker.random.arrayElement(instance.subs);
        const subs = await service.listSubdocuments<ITestSubData>({ parentId: instance._id, subdocumentField, filter: { _id: sub._id } });
        expect(subs).toBeInstanceOf(Array);
        expect(subs.length).toEqual(1);
      });

      it('should limit the results', async () => {
        const subs = await service.listSubdocuments<ITestSubData>({ parentId: instance._id, subdocumentField, limit: 5 });
        expect(subs).toBeInstanceOf(Array);
        expect(subs.length).toEqual(5);
      });

      it('should paginate the results', async () => {
        const first = (await service.listSubdocuments<ITestSubData>({ parentId: instance._id, subdocumentField, limit: 1, skip: 0 })).pop();
        const second = (await service.listSubdocuments<ITestSubData>({ parentId: instance._id, subdocumentField, limit: 1, skip: 1 })).pop();
        expect(first.msg).not.toEqual(second.msg);
      });

      it('should sort the results', async () => {
        const orderedRepresentatives = instance.subs.slice();
        orderedRepresentatives.sort((a, b) => {
          if (a > b) {
            return 1;
          } else if (a < b) {
            return -1;
          } else {
            return 0;
          }
        });
        const wanted = orderedRepresentatives[0];
        const received = (await service.listSubdocuments<ITestSubData>({
          parentId: instance._id,
          subdocumentField,
          limit: 1,
          skip: 0,
          sort: { msg: 1 },
        })).pop();
        expect(received.msg).toEqual(wanted.msg);
      });
    });

    describe('count', () => {
      let instance: ITestDataModel;

      beforeEach(async () => {
        await model.deleteMany({}).exec();
        instance = await model.create(generateTestData({ subs: generateRandomTestSubData(10) }));
      });

      it('should count the subdocuments', async () => {
        const count = await service.countSubdocuments<ITestSubData>({ parentId: instance._id, subdocumentField });
        expect(count).not.toBeNaN();
        expect(count).toEqual(instance.subs.length);
      });

      it('should count the subdocuments', async () => {
        const count = await service.countSubdocuments<ITestSubData>({
          parentId: instance._id,
          subdocumentField,
          filter: { _id: instance.subs[0]._id },
        });
        expect(count).not.toBeNaN();
        expect(count).toEqual(1);
      });
    });

    describe('addSubdocument', () => {
      let instance: ITestDataModel;

      beforeEach(async () => {
        await model.deleteMany({}).exec();
        instance = await model.create(generateTestData());
      });

      it('should add the sub', async () => {
        const sub = await service.addSubdocument<ITestSubData>({
          parentId: instance._id,
          subdocumentField,
          data: generateTestSubData(),
          user: generateUserData(),
        });
        const newInstance = await model.findById(instance._id, 'subs').exec();
        expect(newInstance.subs.length).toEqual(instance.subs.length + 1);
        expect(newInstance.subs.find((r) => r._id.toString() === sub._id.toString())).toBeTruthy();
      });
    });

    describe('getById', () => {
      let instance: ITestDataModel;

      beforeEach(async () => {
        await model.deleteMany({}).exec();
        instance = await model.create(generateTestData({ subs: generateRandomTestSubData(10) }));
      });

      it('should get the subdocument', async () => {
        const expectedRepresentative = instance.subs[0];
        const receivedSubDoc = await service.getSubdocumentById({
          parentId: instance._id.toString(),
          subdocumentField,
          subdocumentId: expectedRepresentative._id.toString(),
        });
        expect(expectedRepresentative._id.toString()).toEqual(receivedSubDoc._id.toString());
      });
    });

    describe('patch', () => {
      let instance: ITestDataModel;
      beforeEach(async () => {
        await model.deleteMany({}).exec();
        instance = await model.create(generateTestData());
      });

      it('should patch the subdocument', async () => {
        const sub: SubmodelType<ITestSubData> = faker.random.arrayElement(instance.subs);
        const receivedSubDoc: SubmodelType<ITestSubData> = await service.patchSubdocumentById<ITestSubData>({
          parentId: instance._id,
          subdocumentField,
          subdocumentId: sub._id,
          update: { msg: 'msg' },
          user: generateUserData(),
        });
        const persistedSub = await service.getSubdocumentById<ITestSubData>({ parentId: instance._id, subdocumentField, subdocumentId: sub._id });
        expect(receivedSubDoc.msg).not.toEqual(sub.msg);
        expect(receivedSubDoc.id).toEqual(sub.id);
        expect(receivedSubDoc.msg).toEqual(persistedSub.msg);
      });
    });

    describe('delete', () => {
      let instance: ITestDataModel;

      beforeEach(async () => {
        await model.deleteMany({}).exec();
        instance = await model.create(generateTestData({ subs: generateRandomTestSubData(10) }));
      });
    });
  });
});
