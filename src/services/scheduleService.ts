import { collection, doc, getDocs, writeBatch, query, where, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Schedule, OperationType } from '../types';
import { handleFirestoreError } from './firebaseUtils';

const COLLECTION_NAME = 'schedules';
const CONFIG_COLLECTION = 'version_configs';
const TEACHERS_COLLECTION = 'teachers'; // Bảng lưu trữ ID giáo viên định danh

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
      
      const configRef = doc(db, CONFIG_COLLECTION, versionName);
      batch.delete(configRef);
      
      if (count > 0 || versionName !== 'Không rõ') {
        await batch.commit();
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
          batch.update(document.ref, { versionName: newName });
          count++;
        }
      });

      const oldConfigRef = doc(db, CONFIG_COLLECTION, oldName);
      const newConfigRef = doc(db, CONFIG_COLLECTION, newName);
      
      const configsSnapshot = await getDocs(collection(db, CONFIG_COLLECTION));
      const oldConfig = configsSnapshot.docs.find(d => d.id === oldName)?.data();
      
      if (oldConfig) {
        batch.set(newConfigRef, { ...oldConfig, versionName: newName });
        batch.delete(oldConfigRef);
      }

      if (count > 0 || oldConfig) {
        await batch.commit();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
      throw error;
    }
  },

  /**
   * 🔥 HÀM XÓA SẠCH 100% DỮ LIỆU
   * Quét và xóa sạch 3 bảng: Tiết dạy (schedules), Cấu hình (configs) và Giáo viên (teachers)
   */
  async deleteAllSchedules(): Promise<void> {
    try {
      // 1. Lấy dữ liệu từ 3 collection song song
      const [schSnap, cfgSnap, teaSnap] = await Promise.all([
        getDocs(collection(db, COLLECTION_NAME)),
        getDocs(collection(db, CONFIG_COLLECTION)),
        getDocs(collection(db, TEACHERS_COLLECTION))
      ]);

      const batch = writeBatch(db);
      let count = 0;

      // 2. Đưa tất cả vào batch xóa
      schSnap.forEach(doc => { batch.delete(doc.ref); count++; });
      cfgSnap.forEach(doc => { batch.delete(doc.ref); count++; });
      teaSnap.forEach(doc => { batch.delete(doc.ref); count++; });

      // 3. Thực thi (Firestore batch giới hạn 500 records, nếu trường thầy cực lớn sẽ cần chia nhỏ thêm)
      if (count > 0) {
        await batch.commit();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, COLLECTION_NAME);
      throw error;
    }
  }
};
