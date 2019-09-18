import { ResourceNotFoundException } from '@aluxion-nestjs/exceptions';
import * as faker from 'faker';
import * as moment from 'moment';
import * as mongoUnit from 'mongo-unit';
import * as mongoose from 'mongoose';

import { GenericMongooseCrudService } from './generic-mongoose-crud-service';
import { IModelInstance, IMongoDocument } from './generic-mongoose-crud-service.interfaces';
import { timestampedSchemaDefinition } from './generic-mongoose-crud-service.schemas';

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

class TestDataService extends GenericMongooseCrudService<ITestData, ITestDataModel> {
  create(data, user): Promise<ITestDataModel> {
    return super.create(data, user);
  }
}

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

      it('should return only the patients set on limit', async () => {
        await model.create(generateRandomTestData(10));
        const instances = await service.list({}, 3);
        return expect(instances.length).toBe(3);
      });

      it('should paginate the patients', async () => {
        await model.create(generateRandomTestData(10));
        const [first] = await service.list({}, 1, 0);
        const [second] = await service.list({}, 1, 1);
        return expect(first._id.toString()).not.toEqual(second._id.toString());
      });

      it('should filter the patients with the given query', async () => {
        const [instance] = await model.create(generateRandomTestData(10));
        const patients = await service.list({ value: instance.value });
        expect(patients.length).toEqual(1);
        return expect(patients.pop().id).toEqual(instance.id);
      });

      it('should show only non deleted patients', async () => {
        await model.create(generateTestData({ deleted: true }));
        await model.create(generateRandomTestData(9));
        const patients = await service.list();
        return expect(patients.length).toEqual(9);
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

      it('should filter the patients with the given query', async () => {
        const [instance] = await model.create(generateRandomTestData(10));
        const count = await service.count({ value: instance.value });
        return expect(count).toEqual(1);
      });

      it('should count only non deleted patients', async () => {
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
        const instance = await service.create(generateTestData(), generateUserData());
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
        const retrievedInstance = await service.getById(instance._id, '_id');
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
          return expect(error.getResponse().code).toEqual('RESOURCE_NOT_FOUND');
        }
      });

      it('should throw an error if the document was soft deleted', async () => {
        const _id = instance._id;
        await model.findByIdAndUpdate(_id, { deleted: true }).exec();
        try {
          await service.getById(_id);
          return fail();
        } catch (error) {
          return expect(error.getResponse().code).toEqual('RESOURCE_NOT_FOUND');
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
        const retrievedInstance = await service.patchById(instance._id, { value: newName }, generateUserData());
        expect(retrievedInstance.updatedAt.toISOString()).not.toEqual(instance.updatedAt.toISOString());
        return expect(retrievedInstance.value).not.toEqual(instance.value);
      });

      it('should throw an error if the instance does not exist', async () => {
        const _id = instance._id;
        await model.deleteOne({ _id }).exec();
        try {
          await service.patchById(_id, { value: newName }, generateUserData());
          return fail();
        } catch (error) {
          return expect(error.getResponse().code).toEqual('RESOURCE_NOT_FOUND');
        }
      });

      it('should throw an error if the instance was soft deleted', async () => {
        const _id = instance._id;
        await model.findByIdAndUpdate(_id, { $set: { deleted: true } }).exec();
        try {
          await service.patchById(_id, { value: newName }, generateUserData());
          return fail();
        } catch (error) {
          return expect(error.getResponse().code).toEqual('RESOURCE_NOT_FOUND');
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
        const retrievedInstance = await service.softDelete(instance._id, generateUserData());
        expect(instance.deletedAt).not.toBeDefined();
        expect(retrievedInstance.deletedAt).toBeInstanceOf(Date);
        expect(retrievedInstance.deleted).toEqual(true);
        return expect(service.getById(retrievedInstance._id)).rejects.toBeInstanceOf(ResourceNotFoundException);
      });

      it('should throw an error if the instance does not exist', async () => {
        const _id = instance._id;
        await model.deleteOne({ _id }).exec();
        try {
          await service.softDelete(_id, generateUserData());
          return fail();
        } catch (error) {
          return expect(error.getResponse().code).toEqual('RESOURCE_NOT_FOUND');
        }
      });

      it('should throw an error if the instance was soft deleted', async () => {
        const _id = instance._id;
        await model.findByIdAndUpdate(_id, { deleted: true }).exec();
        try {
          await service.softDelete(_id, generateUserData());
          return fail();
        } catch (error) {
          return expect(error.getResponse().code).toEqual('RESOURCE_NOT_FOUND');
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
        const subs = await service.listSubdocuments(instance._id, subdocumentField);
        expect(subs).toBeInstanceOf(Array);
        expect(subs.length).toEqual(instance.subs.length);
      });

      it('should filter the list of subdocuments', async () => {
        const sub = faker.random.arrayElement(instance.subs);
        const subs = await service.listSubdocuments(instance._id, subdocumentField, { _id: sub._id });
        expect(subs).toBeInstanceOf(Array);
        expect(subs.length).toEqual(1);
      });

      it('should limit the results', async () => {
        const subs = await service.listSubdocuments(instance._id, subdocumentField, {}, 5);
        expect(subs).toBeInstanceOf(Array);
        expect(subs.length).toEqual(5);
      });

      it('should paginate the results', async () => {
        const first = (await service.listSubdocuments<ITestSubData>(instance._id, subdocumentField, {}, 1, 0)).pop();
        const second = (await service.listSubdocuments<ITestSubData>(instance._id, subdocumentField, {}, 1, 1)).pop();
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
        const received = (await service.listSubdocuments<ITestSubData>(instance._id, subdocumentField, {}, 1, 0, { msg: 1 })).pop();
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
        const count = await service.countSubdocuments(instance._id, subdocumentField);
        expect(count).not.toBeNaN();
        expect(count).toEqual(instance.subs.length);
      });

      it('should count the subdocuments', async () => {
        const count = await service.countSubdocuments(instance._id, subdocumentField, { _id: instance.subs[0]._id });
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
        const sub = await service.addSubdocument(instance._id, subdocumentField, generateTestSubData(), generateUserData());
        const newPatient = await model.findById(instance._id, 'subs').exec();
        expect(newPatient.subs.length).toEqual(instance.subs.length + 1);
        expect(newPatient.subs.find((r) => r._id.toString() === sub._id.toString())).toBeTruthy();
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
        const receivedRepresentative = await service.getSubdocumentById(
          instance._id.toString(),
          subdocumentField,
          expectedRepresentative._id.toString(),
        );
        expect(expectedRepresentative._id.toString()).toEqual(receivedRepresentative._id.toString());
      });
    });

    describe('patch', () => {
      let instance: ITestDataModel;
      beforeEach(async () => {
        await model.deleteMany({}).exec();
        instance = await model.create(generateTestData());
      });

      it('should patch the subdocument', async () => {
        const sub: ITestSubDataModel = faker.random.arrayElement(instance.subs);
        const receivedRep: ITestSubDataModel = await service.patchSubdocumentById<ITestSubData>(
          instance._id,
          subdocumentField,
          sub._id,
          { msg: 'msg' },
          generateUserData(),
        );
        expect(receivedRep.msg).not.toEqual(sub.msg);
        expect(receivedRep.id).toEqual(sub.id);
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
