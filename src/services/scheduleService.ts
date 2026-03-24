import { collection, doc, getDocs, writeBatch, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Schedule, OperationType } from '../types';
import { handleFirestoreError } from './firebaseUtils';

const COLLECTION_NAME = 'schedules';

export const scheduleService = {
  async getAllSchedules(): Promise<Schedule[]> {
    try {
      const q = query(collection(db, COLLECTION_NAME));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Schedule));
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, COLLECTION_NAME);
      return [];
    }
  },

  async getSchedulesByTeacher(teacherName: string): Promise<Schedule[]> {
    try {
      const q = query(collection(db, COLLECTION_NAME), where('giao_vien', '==', teacherName));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Schedule));
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, COLLECTION_NAME);
      return [];
    }
  },

  async saveSchedules(schedules: Schedule[]): Promise<void> {
    try {
      const batch = writeBatch(db);
      schedules.forEach(schedule => {
        const docRef = doc(collection(db, COLLECTION_NAME));
        batch.set(docRef, schedule);
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
    }
  },

  async deleteScheduleByVersion(versionName: string): Promise<void> {
    try {
      // Xử lý trường hợp phiên bản cũ không có trường versionName (Không rõ)
      const targetName = versionName === 'Không rõ' ? null : versionName;
      const q = query(collection(db, COLLECTION_NAME), where('versionName', '==', targetName));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      
      snapshot.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, COLLECTION_NAME);
      throw error;
    }
  },

  // 🔥 HÀM MỚI: ĐỔI TÊN PHIÊN BẢN (Dùng để sửa lỗi "Không rõ")
  async renameVersion(oldName: string, newName: string): Promise<void> {
    try {
      // Nếu là "Không rõ", ta tìm các tài liệu mà trường versionName không tồn tại hoặc null
      const targetOldName = oldName === 'Không rõ' ? null : oldName;
      const q = query(collection(db, COLLECTION_NAME), where('versionName', '==', targetOldName));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);

      snapshot.forEach((document) => {
        const docRef = doc(db, COLLECTION_NAME, document.id);
        batch.update(docRef, { versionName: newName });
      });

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
      throw error;
    }
  },

  async deleteAllSchedules(): Promise<void> {
    try {
      const snapshot = await getDocs(collection(db, COLLECTION_NAME));
      const batch = writeBatch(db);
      snapshot.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, COLLECTION_NAME);
    }
  }
};
