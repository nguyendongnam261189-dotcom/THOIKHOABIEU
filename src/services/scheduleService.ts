import { collection, doc, getDocs, writeBatch, query, where, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Schedule, OperationType } from '../types';
import { handleFirestoreError } from './firebaseUtils';

const COLLECTION_NAME = 'schedules';
const CONFIG_COLLECTION = 'version_configs'; // 🔥 Collection mới để lưu số tuần

// 🔥 BIẾN LƯU TRÍ NHỚ TẠM (CACHE) - GIÚP TIẾT KIỆM QUOTA FIREBASE
let cachedSchedules: Schedule[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 1000 * 60 * 30; // Nhớ trong 30 phút

export const scheduleService = {
  async getAllSchedules(): Promise<Schedule[]> {
    // Nếu đã có dữ liệu trong bộ nhớ tạm và chưa quá 30 phút -> Dùng luôn, không gọi Firebase
    if (cachedSchedules && (Date.now() - cacheTimestamp < CACHE_DURATION)) {
      return cachedSchedules;
    }

    try {
      const q = query(collection(db, COLLECTION_NAME));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Schedule));
      
      // Lưu vào bộ nhớ tạm
      cachedSchedules = data;
      cacheTimestamp = Date.now();
      
      return data;
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
      
      cachedSchedules = null; // 🔥 Xóa trí nhớ tạm khi có dữ liệu mới
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
    }
  },

  // 🔥 HÀM MỚI: CẬP NHẬT TRÚNG ĐÍCH TÊN GIÁO VIÊN TRONG LỊCH DẠY
  async updateTeacherInSchedules(oldName: string, newName: string): Promise<void> {
    try {
      // 1. Lấy tất cả các tiết dạy của giáo viên cũ
      const q = query(collection(db, COLLECTION_NAME), where('giao_vien', '==', oldName));
      const snapshot = await getDocs(q);

      if (snapshot.empty) return;

      // 2. Cập nhật thành tên mới (Chia batch 500 để an toàn)
      const MAX_BATCH_SIZE = 500;
      let currentBatch = writeBatch(db);
      let operationCount = 0;
      const commitPromises: Promise<void>[] = [];

      snapshot.forEach(document => {
        currentBatch.update(document.ref, { giao_vien: newName });
        operationCount++;

        if (operationCount === MAX_BATCH_SIZE) {
          commitPromises.push(currentBatch.commit());
          currentBatch = writeBatch(db);
          operationCount = 0;
        }
      });

      if (operationCount > 0) {
        commitPromises.push(currentBatch.commit());
      }

      await Promise.all(commitPromises);
      
      cachedSchedules = null; // Xóa bộ nhớ đệm vì lịch đã thay đổi
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, COLLECTION_NAME);
      throw error;
    }
  },

  // 🔥 LƯU SỐ TUẦN ÁP DỤNG CHO PHIÊN BẢN
  async saveVersionWeeks(versionName: string, weeks: number): Promise<void> {
    try {
      const docRef = doc(db, CONFIG_COLLECTION, versionName);
      await setDoc(docRef, {
        versionName,
        appliedWeeks: weeks,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, CONFIG_COLLECTION);
      throw error;
    }
  },

  // 🔥 LẤY TẤT CẢ CẤU HÌNH PHIÊN BẢN
  async getVersionConfigs(): Promise<any[]> {
    try {
      const snapshot = await getDocs(collection(db, CONFIG_COLLECTION));
      return snapshot.docs.map(doc => doc.data());
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, CONFIG_COLLECTION);
      return [];
    }
  },

  async deleteScheduleByVersion(versionName: string): Promise<void> {
    try {
      const snapshot = await getDocs(collection(db, COLLECTION_NAME));
      const batch = writeBatch(db);
      let count = 0;
      
      snapshot.forEach(document => {
        const data = document.data();
        const currentVName = data.versionName || 'Không rõ';
        if (currentVName === versionName) {
          batch.delete(document.ref);
          count++;
        }
      });
      
      // 🔥 Dọn dẹp luôn cấu hình số tuần khi xóa phiên bản
      const configRef = doc(db, CONFIG_COLLECTION, versionName);
      batch.delete(configRef);
      
      if (count > 0 || versionName !== 'Không rõ') {
        await batch.commit();
        cachedSchedules = null; // 🔥 Xóa trí nhớ tạm
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, COLLECTION_NAME);
      throw error;
    }
  },

  async renameVersion(oldName: string, newName: string): Promise<void> {
    try {
      const snapshot = await getDocs(collection(db, COLLECTION_NAME));
      const batch = writeBatch(db);
      let count = 0;

      snapshot.forEach((document) => {
        const data = document.data();
        const currentVName = data.versionName || 'Không rõ';
        
        if (currentVName === oldName) {
          const docRef = doc(db, COLLECTION_NAME, document.id);
          batch.update(docRef, { versionName: newName });
          count++;
        }
      });

      // 🔥 Đổi tên cả trong bảng cấu hình số tuần
      const oldConfigRef = doc(db, CONFIG_COLLECTION, oldName);
      const newConfigRef = doc(db, CONFIG_COLLECTION, newName);
      
      // Trong Firestore không có lệnh rename doc, nên ta phải lấy dữ liệu cũ và ghi sang doc mới
      const configs = await this.getVersionConfigs();
      const oldConfig = configs.find(c => c.versionName === oldName);
      if (oldConfig) {
        batch.set(newConfigRef, { ...oldConfig, versionName: newName });
        batch.delete(oldConfigRef);
      }

      if (count > 0) {
        await batch.commit();
        cachedSchedules = null; // 🔥 Xóa trí nhớ tạm
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
      throw error;
    }
  },

  async deleteAllSchedules(): Promise<void> {
    try {
      const snapshot = await getDocs(collection(db, COLLECTION_NAME));
      const configSnapshot = await getDocs(collection(db, CONFIG_COLLECTION));
      const batch = writeBatch(db);
      
      snapshot.forEach(doc => batch.delete(doc.ref));
      configSnapshot.forEach(doc => batch.delete(doc.ref));
      
      await batch.commit();
      cachedSchedules = null; // 🔥 Xóa trí nhớ tạm
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, COLLECTION_NAME);
    }
  }
};
