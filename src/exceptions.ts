import { MongoError } from 'mongodb';

export class DuplicateKeyException {
  static readonly code = 'DUPLICATE_KEY';

  readonly code;
  readonly collection: number | string;
  readonly index: string;
  readonly key: object;
  readonly message: any;
  readonly statusCode: number;

  constructor(mongoError: MongoError) {
    const [collection, index, key] = mongoError.errmsg.match(/collection: (.+) index: (.+) dup key: (.+)/).splice(1);
    this.message = mongoError.errmsg;
    this.code = DuplicateKeyException.code;
    this.collection = collection;
    this.index = index;
    this.key = key && typeof key !== 'object' ? JSON.parse(key) : key;
  }
}

export class DocumentNotFoundException {
  static readonly code = 'DOCUMENT_NOT_FOUND';
  static readonly message = 'The requested document was not found';

  readonly code = DocumentNotFoundException.code;
  readonly message: any = DocumentNotFoundException.message;
  readonly resourceId: number | string;
  readonly resourceType: string;

  constructor(resourceType: string, resourceId: number | string) {
    this.code = DocumentNotFoundException.code;
    this.message = DocumentNotFoundException.message;
    this.resourceId = resourceId;
    this.resourceType = resourceType;
  }
}
