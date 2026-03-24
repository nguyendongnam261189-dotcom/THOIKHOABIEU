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

  // 🔥 SỬA LẠI HÀM LƯU: LƯU THÊM MỚI, KHÔNG XÓA SẠCH DỮ LIỆU CŨ CỦA PHIÊN BẢN KHÁC
  async saveSchedules(schedules: Schedule[]): Promise<void> {
    try {
      const batch = writeBatch(db);
      
      // Không còn bước xóa sạch docs cũ ở đây để bảo toàn các phiên bản khác
      // Chỉ thêm mới các schedules của phiên bản đang tải lên
      schedules.forEach(schedule => {
        const docRef = doc(collection(db, COLLECTION_NAME));
        batch.set(docRef, schedule);
      });

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
    }
  },

  // 🔥 THÊM HÀM MỚI: XÓA THEO TÊN PHIÊN BẢN
  async deleteScheduleByVersion(versionName: string): Promise<void> {
    try {
      const q = query(collection(db, COLLECTION_NAME), where('versionName', '==', versionName));
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
