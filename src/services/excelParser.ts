import { collection, doc, setDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { Teacher, OperationType } from '../types';
import { handleFirestoreError } from './firebaseUtils';

const COLLECTION_NAME = 'teachers';

const generateTeacherId = (name: string): string => {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '_').trim();
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

  async saveTeachers(teachers: Teacher[]): Promise<void> {
    try {
      const batch = writeBatch(db);
      const existingSnapshot = await getDocs(collection(db, COLLECTION_NAME));
      const existingTeachers: Record<string, any> = {};
      existingSnapshot.forEach(doc => { existingTeachers[doc.id] = doc.data(); });

      teachers.forEach(teacher => {
        const tId = generateTeacherId(teacher.name);
        const docRef = doc(db, COLLECTION_NAME, tId);
        const oldData = existingTeachers[tId];
        
        // 🛡️ CHIẾN THUẬT BẢO VỆ TỔ CHUYÊN MÔN (DÀNH CHO GDĐP)
        let finalGroup = teacher.group;

        // Nếu giáo viên ĐÃ CÓ TRÊN HỆ THỐNG và ĐÃ CÓ TỔ (không phải tổ Chung)
        // Thì giữ nguyên tổ cũ, không quan tâm môn dạy ở TKB mới là gì.
        if (oldData && oldData.group && oldData.group !== 'Chung') {
          finalGroup = oldData.group;
        }

        batch.set(docRef, {
          ...teacher,
          id: tId,
          group: finalGroup,
          // Cập nhật môn dạy thực tế vào danh sách năng lực (không ghi đè)
          teachableSubjects: Array.from(new Set([
            ...(oldData?.teachableSubjects || []),
            teacher.subject
          ].filter(Boolean)))
        }, { merge: true });
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
