# Generic Mongoose Crud Service

A customizable service that implements top level CRUD operations as well as one-level nested CRUD operations.

## **How to install**

```shell
npm install --save @aluxion-nestjs/mongoose-crud-service
```

## **How to use it**

The  service can be used in two different ways.

### **Class inheritance (Recommended)**

```typescript
class UsersService extends GenericMongooseCrudService<ITestData>{
    eventsCreate = 'FOO'
    model = UserModel
}
```

### **Instance initiation**

```typescript
const service = new GenericMongooseCrudService<ITestData>({ model, modelName: MODEL_NAME });
```

### **Options**

```typescript
export interface IGenericMongooseCrudServiceOptions<T extends IMongoDocument> {
  eventsCreate?: string;
  eventsDelete?: string;
  eventsPatch?: string;
  model?: Model<T>;
  modelName?: string;
}
```

### **NestJS Examples**

```typescript
@Injectable()
export class UsersService extends GenericMongooseCrudService<IUser> {
  eventEmitter: EventEmitter = new EventEmitter();
  @InjectModel(USER_MODEL_NAME) private readonly userModel: Model<IUserModel>;
}
```

### **Timestamped**

The service automatically adds timestamps for the write operations. It also stores a user attribute, which can of type **any**.

- Create --> createdAt and createdBy
- Update --> updatedAt and updatedBy

### **Schemas and interfaces**

In the package we can find the timestampedSchemaDefinition which we can used to add the timestamp properties to the schemas

```typescript
const userSchemaDefinition: SchemaDefinition = {
  username: String,
};
const schemaDefinition: SchemaDefinition = Object.assign<SchemaDefinition, SchemaDefinition>(timestampedSchemaDefinition, userSchemaDefinition);
```

We also find several interfaces, but the most important ones are IModelInstance and IMongoDocument. The first one is the interface that are objects must implement, the second one is used internally to add the Mongoose Document properties.

```typescript
interface ITestData extends IModelInstance {
  subs: ITestSubData[];
  value: string;
}

interface ITestDataModel extends ITestData, IMongoDocument {
  subs: mongoose.Types.DocumentArray<ITestSubDataModel>;
}

const schemaDefinition: mongoose.SchemaDefinition = Object.assign<mongoose.SchemaDefinition, mongoose.SchemaDefinition, mongoose.SchemaDefinition>(
  {},
  timestampedSchemaDefinition,
  { value: { type: String }, subs: [subSchemaDefinition] },
);

model = mongoose.model(MODEL_NAME, new mongoose.Schema(schemaDefinition));
service = new GenericMongooseCrudService<ITestData>({ model, modelName: MODEL_NAME });
```

### **Soft Delete**

This service implements soft delete, which is a common feature requested in many projects. When applying one of the soft delete methods, the property deleted will be set to true, and will not be found by any of the other methods, except the list methods if explictly search for objects with **{ deleted : true }** filter. It also adds the deletedAt and deletedBy properties.

### **Subdocuments CRUD**

The service supports the same operations of top level documents for subdocuments in arrays. Thi feature is still somehow experimental but it is pretty usable. 

**All subdocument operations are considered update operations on the parent document**

### **Extension through events**

Each of the write operations has an event that can be listened to in order to react o extend this operations. As an example, you could want to log each time an object is created. This is for event-based development. The name of the events can be customizable. The event emitter can be accessed through the **events** property. The event receives the modified/created document.

```typescript
usersService.eventEmitter.on(eventName, async (data: IUserModel) => {
    // Do something
});
```

## **Methods**

The service has methods for documents and first-level subdocuments (Deeply nested subdocuments is not supported). Most methods are aliases of other methods, like the ById kind that will call the basic method with an objectId in the query.

```typescript
export declare class GenericMongooseCrudService<T extends IModelInstance> {
    addSubdocument<Subdocument extends IModelInstance>(parentId: string, subdocumentField: string, subdocument: any, user: any): Promise<Subdocument>;
    count(filter?: IDynamicObject): Promise<number>;
    countSubdocuments(parentId: string, subdocumentField: string, filter?: IDynamicObject): Promise<number>;
    create(data: Partial<T>, user: any): Promise<T & IMongoDocument>;
    getById(_id: string, projection?: string): Promise<T & IMongoDocument>;
    getSubdocument<Subdocument extends IModelInstance>(parentId: string, subdocumentField: string, filter?: IDynamicObject): Promise<Subdocument & IMongoDocument>;
    getSubdocumentById<Subdocument extends IModelInstance>(parentId: string, subdocumentField: string, subdocumentId: string): Promise<Subdocument & IMongoDocument>;
    hardDelete(_id: string): Promise<T & IMongoDocument>;
    hardDeleteSubdocument(parentId: string, subdocumentField: string, subdocumentId: string, user: any): Promise<T & IMongoDocument>;
    list(filter?: IDynamicObject, limit?: number, skip?: number, projection?: string, sort?: ISortOptions): Promise<Array<T & IMongoDocument>>;
    listSubdocuments<Subdocument extends IModelInstance>(parentId: string, subdocumentField: string, filter?: IDynamicObject, limit?: number, skip?: number, sort?: ISortOptions): Promise<Array<Subdocument & IMongoDocument>>;
    patch(filter: IDynamicObject, update: IDynamicObject, user: any): Promise<T & IMongoDocument>;
    patchById(_id: string, update: any, user: any): Promise<T & IMongoDocument>;
    patchSubdocument<Subdocument extends IModelInstance>(parentId: string, subdocumentField: string, filter: IDynamicObject, update: any, user: any): Promise<Subdocument & IMongoDocument>;
    patchSubdocumentById<Subdocument extends IModelInstance>(parentId: string, subdocumentField: string, subdocumentId: string, update: any, user: any): Promise<Subdocument & IMongoDocument>;
    softDelete(_id: string, user: any): Promise<T & IMongoDocument>;
    softDeleteSubdocument<Subdocument extends IModelInstance>(parentId: string, subdocumentField: string, subdocumentId: string, user: any): Promise<Subdocument & IMongoDocument>;
    update(filter: IDynamicObject, update: IDynamicObject, user: any): Promise<T & IMongoDocument>;
    updateById(_id: string, update: IDynamicObject, user: any): Promise<T & IMongoDocument>;
}

```
