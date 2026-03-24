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

  // 🔥 SỬA LẠI: XÓA PHIÊN BẢN BẰNG CHIẾN THUẬT QUÉT TOÀN BỘ (ĐỂ TRỊ LỖI TRƯỜNG KHÔNG TỒN TẠI)
  async deleteScheduleByVersion(versionName: string): Promise<void> {
    try {
      const snapshot = await getDocs(collection(db, COLLECTION_NAME));
      const batch = writeBatch(db);
      let count = 0;
      
      snapshot.forEach(document => {
        const data = document.data();
        // Nếu không có versionName thì coi là 'Không rõ'
        const currentVName = data.versionName || 'Không rõ';
        
        if (currentVName === versionName) {
          batch.delete(document.ref);
          count++;
        }
      });
      
      if (count > 0) {
        await batch.commit();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, COLLECTION_NAME);
      throw error;
    }
  },

  // 🔥 HÀM MỚI: ĐỔI TÊN PHIÊN BẢN (CHIẾN THUẬT QUÉT TOÀN BỘ ĐỂ TRỊ LỖI UNDEFINED)
  async renameVersion(oldName: string, newName: string): Promise<void> {
    try {
      // Lấy tất cả dữ liệu TKB không dùng query lọc (để tránh lỗi Firebase bỏ qua trường undefined)
      const snapshot = await getDocs(collection(db, COLLECTION_NAME));
      const batch = writeBatch(db);
      let count = 0;

      snapshot.forEach((document) => {
        const data = document.data();
        // Logic kiểm tra: nếu không có trường versionName thì mặc định hiểu là 'Không rõ'
        const currentVName = data.versionName || 'Không rõ';
        
        if (currentVName === oldName) {
          const docRef = doc(db, COLLECTION_NAME, document.id);
          // Ép Firebase ghi đè trường này (update sẽ tạo trường mới nếu chưa có)
          batch.update(docRef, { versionName: newName });
          count++;
        }
      });

      // Chỉ commit nếu tìm thấy dữ liệu cần sửa
      if (count > 0) {
        await batch.commit();
      } else {
        console.warn("Không tìm thấy dữ liệu nào khớp với tên phiên bản:", oldName);
      }
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
