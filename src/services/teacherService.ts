import { collection, doc, setDoc, getDocs, writeBatch, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Teacher, OperationType } from '../types';
import { handleFirestoreError } from './firebaseUtils';

const COLLECTION_NAME = 'teachers';

// 🔥 tạo ID ổn định
const generateTeacherId = (teacher: Teacher): string => {
  return `${teacher.name}__${teacher.group}__${teacher.versionName || 'default'}`
    .replace(/\s+/g, '_')
    .replace(/\//g, '_');
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

  // 🔥 lấy theo version (quan trọng cho UI)
  async getTeachersByVersion(versionName: string): Promise<Teacher[]> {
    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where('versionName', '==', versionName)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Teacher));
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, COLLECTION_NAME);
      return [];
    }
  },

  async saveTeachers(teachers: Teacher[], versionName: string): Promise<void> {
    try {
      const batch = writeBatch(db);

      // 🔥 XÓA CHỈ TEACHER CỦA VERSION NÀY
      const existingQuery = query(
        collection(db, COLLECTION_NAME),
        where('versionName', '==', versionName)
      );

      const existingDocs = await getDocs(existingQuery);
      existingDocs.forEach(docSnap => {
        batch.delete(docSnap.ref);
      });

      // 🔥 ADD MỚI
      teachers.forEach(teacher => {
        const teacherWithVersion = {
          ...teacher,
          versionName
        };

        const id = generateTeacherId(teacherWithVersion);
        const ref = doc(db, COLLECTION_NAME, id);

        batch.set(ref, teacherWithVersion);
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
