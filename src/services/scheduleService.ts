import { collection, doc, getDocs, writeBatch, query, where, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Schedule, OperationType } from '../types';
import { handleFirestoreError } from './firebaseUtils';

const COLLECTION_NAME = 'schedules';
const CONFIG_COLLECTION = 'version_configs'; 
const TERM_CONFIG_COLLECTION = 'term_settings'; // Collection lưu cấu hình học kỳ chung

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

  // 🔥 HÀM MỚI 1: LƯU CẤU HÌNH HỌC KỲ & LỚP KHUYẾT TẬT CHUNG
  // Hàm này giúp AdminDashboard lưu danh sách lớp KT và tổng tuần vào Firebase
  async saveTermConfig(totalWeeks: number, ktLops: string[]): Promise<void> {
    try {
      const docRef = doc(db, TERM_CONFIG_COLLECTION, 'current_term');
      await setDoc(docRef, {
        totalWeeks,
        ktLops,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, TERM_CONFIG_COLLECTION);
      throw error;
    }
  },

  // 🔥 HÀM MỚI 2: LẤY CẤU HÌNH HỌC KỲ
  async getTermConfig(): Promise<any> {
    try {
      const docRef = doc(db, TERM_CONFIG_COLLECTION, 'current_term');
      const snapshot = await getDoc(docRef);
      return snapshot.exists() ? snapshot.data() : null;
    } catch (error) {
      // Không báo lỗi nếu chưa có cấu hình, chỉ trả về null
      return null;
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
          const docRef = doc(db, COLLECTION_NAME, document.id);
          batch.update(docRef, { versionName: newName });
          count++;
        }
      });

      const oldConfigRef = doc(db, CONFIG_COLLECTION, oldName);
      const newConfigRef = doc(db, CONFIG_COLLECTION, newName);
      
      const configs = await this.getVersionConfigs();
      const oldConfig = configs.find(c => c.versionName === oldName);
      if (oldConfig) {
        batch.set(newConfigRef, { ...oldConfig, versionName: newName });
        batch.delete(oldConfigRef);
      }

      if (count > 0) {
        await batch.commit();
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
      const termSnapshot = await getDocs(collection(db, TERM_CONFIG_COLLECTION)); // Xóa luôn settings học kỳ
      
      const batch = writeBatch(db);
      
      snapshot.forEach(doc => batch.delete(doc.ref));
      configSnapshot.forEach(doc => batch.delete(doc.ref));
      termSnapshot.forEach(doc => batch.delete(doc.ref));
      
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, COLLECTION_NAME);
    }
  }
};
