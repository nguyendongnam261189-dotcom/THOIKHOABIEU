import { collection, doc, setDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { Teacher, OperationType } from '../types';
import { handleFirestoreError } from './firebaseUtils';

const COLLECTION_NAME = 'teachers';

// 🔥 FIX: sanitize ID
const safeString = (str: string): string => {
  return (str || '')
    .replace(/\//g, '_')   // bỏ dấu /
    .replace(/#/g, '')
    .replace(/\?/g, '')
    .replace(/\s+/g, '_')  // space → _
    .trim();
};

const generateTeacherId = (teacher: Teacher): string => {
  const name = safeString(teacher.name);
  const group = safeString(teacher.group);

  return `${name}__${group}`;
};

export const teacherService = {
  async getAllTeachers(): Promise<Teacher[]> {
    try {
      const snapshot = await getDocs(collection(db, COLLECTION_NAME));
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Teacher));
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, COLLECTION_NAME);
      return [];
    }
  },

  async mergeTeachers(teachers: Teacher[]): Promise<void> {
    try {
      const batch = writeBatch(db);

      teachers.forEach(teacher => {
        const docId = generateTeacherId(teacher);
        const docRef = doc(db, COLLECTION_NAME, docId);

        batch.set(docRef, teacher, { merge: true });
      });

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
    }
  },

  async updateTeacher(id: string, updates: Partial<Teacher>): Promise<void> {
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      await setDoc(docRef, updates, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, COLLECTION_NAME);
    }
  }
};
