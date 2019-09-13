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
```

### **Instance initiation**

```typescript
```

### **NestJS Examples**

```typescript
```

```typescript
```

### **Timestamped**

The service automatically adds timestamps for the write operations. It also stores a user attribute, which can of type **any**.

- Create --> createdAt and createdBy
- Update --> updatedAt and updatedBy

### **Soft Delete**

This service implements soft delete, which is a common feature requested in many projects. When applying one of the soft delete methods, the property deleted will be set to true, and will not be found by any of the other methods, except the list methods if explictly search for objects with **{ deleted : true }** filter. It also adds the deletedAt and deletedBy properties.

### **Subdocuments CRUD**

### **Extension through events**
