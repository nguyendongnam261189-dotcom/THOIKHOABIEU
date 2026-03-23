export interface Schedule {
  id?: string;
  thu: number;
  tiet: number;
  lop: string;
  mon: string;
  giao_vien: string;
  phong: string;
  buoi: 'Sáng' | 'Chiều';
}

export interface Teacher {
  id?: string;
  name: string;
  subject: string;
  group: string;
  teachableSubjects?: string[];
}

export interface User {
  uid: string;
  email: string;
  role: 'admin' | 'teacher' | 'ttcm';
  name?: string;
  department?: string;
  status?: 'pending' | 'approved' | 'rejected';
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}
