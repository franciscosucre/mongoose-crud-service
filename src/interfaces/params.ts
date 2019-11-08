import { ClientSession, SaveOptions } from 'mongoose';

import {
  HintedDynamicObject,
  IWithCreateData,
  IWithFilter,
  IWithHintedUpdate,
  IWithId,
  IWithPagination,
  IWithParentId,
  IWithProjection,
  IWithSort,
  IWithSubdocumentField,
  IWithSubdocumentId,
  IWithUpdateOptions,
  IWithUser,
  UpdateOptions,
} from './behaviors';

export interface IGetParams<Model extends object = object> extends IWithFilter<Model>, IWithProjection<Model> {}

export interface IGetByIdParams<Model extends object = object> extends IWithId, IWithProjection<Model> {}

export interface IPatchParams<Model extends object = object, UserType = any>
  extends IWithFilter<Model>,
    IWithUser<UserType>,
    IWithHintedUpdate<Model>,
    IWithUpdateOptions {}

export interface IPatchByIdParams<Model extends object = object, UserType = any>
  extends IWithId,
    IWithUser<UserType>,
    IWithHintedUpdate<Model>,
    IWithUpdateOptions {}

export interface IUpdateParams<Model extends object = object, UserType = any> extends IWithFilter<Model>, IWithUser<UserType>, IWithUpdateOptions {
  update: HintedDynamicObject<Model> & { $set?: any };
}

export interface IUpdateByIdParams<Model extends object = object, UserType = any>
  extends IWithId,
    IWithUser<UserType>,
    IWithUpdateOptions,
    IWithHintedUpdate<Model> {}

export interface IListParams<Model extends object = object> extends IWithFilter<Model>, IWithPagination, IWithProjection<Model>, IWithSort<Model> {}

export interface ICreateParams<Model extends object = object, UserType = any> extends IWithUser<UserType>, IWithCreateData<Model> {
  options?: SaveOptions;
}

export interface IHardDeleteParams extends IWithId {
  session?: ClientSession;
}

export interface ISoftDeleteParams<UserType = any> extends IWithId, IWithUser<UserType>, IWithUpdateOptions {}

export interface IGetSubDocumentParams<Model extends object = object, Submodel extends object = object>
  extends IWithParentId,
    IWithFilter<Submodel>,
    IWithSubdocumentField<Model> {}

export interface IGetSubDocumentByIdParams<Model extends object = object> extends IWithParentId, IWithSubdocumentId, IWithSubdocumentField<Model> {}

export interface ICountSubdocumentsParams<Model extends object = object, Submodel extends object = object>
  extends IWithFilter<Submodel>,
    IWithParentId,
    IWithSubdocumentField<Model> {}

export interface IListSubdocuments<Model extends object = object, Submodel extends object = object>
  extends IWithFilter<Submodel>,
    IWithSubdocumentField<Model>,
    IWithPagination,
    IWithParentId,
    IWithSort<Submodel> {}

export interface IAddSubdocumentParams<Model extends object = object, Submodel extends object = object, UserType = any>
  extends IWithParentId,
    IWithSubdocumentField<Model>,
    IWithUser<UserType>,
    IWithUpdateOptions,
    IWithCreateData<Submodel> {}

export interface IHardDeleteSubdocumentParams<Model extends object = object, Submodel extends object = object, UserType = any>
  extends IWithSubdocumentField<Model>,
    IWithFilter<Submodel>,
    IWithParentId,
    IWithUser<UserType>,
    IWithUpdateOptions {}

export interface IHardDeleteSubdocumentByIdParams<Model extends object = object, UserType = any>
  extends IWithParentId,
    IWithSubdocumentField<Model>,
    IWithSubdocumentId,
    IWithUser<UserType>,
    IWithUpdateOptions {}

export interface ISoftDeleteSubdocumentParams<Model extends object = object, UserType = any>
  extends IWithParentId,
    IWithSubdocumentField<Model>,
    IWithSubdocumentId,
    IWithUser<UserType> {}

export interface IPatchSubdocumentParams<Model extends object = object, Submodel extends object = object, UserType = any>
  extends IWithFilter<Submodel>,
    IWithParentId,
    IWithSubdocumentField<Model>,
    IWithUser<UserType>,
    IWithHintedUpdate<Submodel>,
    IWithUpdateOptions {}

export interface IPatchSubdocumentByIdParams<Model extends object = object, Submodel extends object = object, UserType = any>
  extends IWithParentId,
    IWithSubdocumentField<Model>,
    IWithSubdocumentId,
    IWithUser,
    IWithHintedUpdate<Submodel>,
    IWithUpdateOptions {}
