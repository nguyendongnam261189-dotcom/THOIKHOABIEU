import { collection, doc, getDocs, getDoc, writeBatch, query, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Schedule, OperationType } from '../types';
import { handleFirestoreError } from './firebaseUtils';

// 🔥 VÙNG ĐẤT CHÍNH THỨC: Đã áp dụng công nghệ Đóng gói 1 Document
const COLLECTION_NAME = 'schedules';
const CONFIG_COLLECTION = 'version_configs';

// BIẾN LƯU TRÍ NHỚ TẠM (CACHE)
let cachedSchedules: Schedule[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 1000 * 60 * 30; // 30 phút

export const scheduleService = {
  // 1. TẢI TỔNG HỢP: Tự động bung các gói dữ liệu thành mảng phẳng cho UI
  async getAllSchedules(): Promise<Schedule[]> {
    if (cachedSchedules && (Date.now() - cacheTimestamp < CACHE_DURATION)) {
      return cachedSchedules;
    }

    try {
      const q = query(collection(db, COLLECTION_NAME));
      const snapshot = await getDocs(q);
      
      let allData: Schedule[] = [];
      snapshot.forEach(docSnap => {
        const docData = docSnap.data();
        // Bung mảng 'data' từ mỗi Document phiên bản ra
        if (docData.data && Array.isArray(docData.data)) {
          allData = allData.concat(docData.data);
        }
      });
      
      cachedSchedules = allData;
      cacheTimestamp = Date.now();
      return allData;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, COLLECTION_NAME);
      return [];
    }
  },

  // 2. LỌC OFFLINE (0 Quota)
  async getSchedulesByTeacher(teacherName: string): Promise<Schedule[]> {
    try {
      const allSchedules = await this.getAllSchedules();
      return allSchedules.filter(s => s.giao_vien === teacherName);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, COLLECTION_NAME);
      return [];
    }
  },

  // 3. LƯU ĐÓNG GÓI: 1.500 tiết -> 1 Document
  async saveSchedules(schedules: Schedule[]): Promise<void> {
    try {
      const grouped: Record<string, Schedule[]> = {};
      schedules.forEach(s => {
        const vName = (s as any).versionName || 'Mặc định';
        if (!grouped[vName]) grouped[vName] = [];
        grouped[vName].push(s);
      });

      const batch = writeBatch(db);
      
      for (const [vName, data] of Object.entries(grouped)) {
        const docRef = doc(db, COLLECTION_NAME, vName);
        batch.set(docRef, { 
          versionName: vName, 
          data: data, 
          updatedAt: new Date().toISOString() 
        });
      }

      await batch.commit();
      cachedSchedules = null; 
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
      throw error;
    }
  },

  // 4. CẬP NHẬT TÊN GIÁO VIÊN (Quét mảng)
  async updateTeacherInSchedules(oldName: string, newName: string): Promise<void> {
    try {
      const snapshot = await getDocs(collection(db, COLLECTION_NAME));
      const batch = writeBatch(db);
      let hasChanges = false;

      snapshot.forEach(docSnap => {
        const docData = docSnap.data();
        if (docData.data && Array.isArray(docData.data)) {
          let changedInThisVersion = false;
          const newData = docData.data.map((s: Schedule) => {
            if (s.giao_vien === oldName) {
              changedInThisVersion = true;
              return { ...s, giao_vien: newName };
            }
            return s;
          });

          if (changedInThisVersion) {
            batch.update(docSnap.ref, { data: newData });
            hasChanges = true;
          }
        }
      });

      if (hasChanges) {
        await batch.commit();
        cachedSchedules = null;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, COLLECTION_NAME);
      throw error;
    }
  },

  // 5. CÁC HÀM CẤU HÌNH PHIÊN BẢN (Giữ nguyên logic của thầy)
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
      return snapshot.docs.map(docSnap => docSnap.data());
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, CONFIG_COLLECTION);
      return [];
    }
  },

  async deleteScheduleByVersion(versionName: string): Promise<void> {
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, COLLECTION_NAME, versionName));
      batch.delete(doc(db, CONFIG_COLLECTION, versionName));
      await batch.commit();
      cachedSchedules = null;
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, COLLECTION_NAME);
      throw error;
    }
  },

  async renameVersion(oldName: string, newName: string): Promise<void> {
    try {
      const batch = writeBatch(db);
      const oldDocRef = doc(db, COLLECTION_NAME, oldName);
      const newDocRef = doc(db, COLLECTION_NAME, newName);
      const oldDocSnap = await getDoc(oldDocRef);
      
      if (oldDocSnap.exists()) {
        const data = oldDocSnap.data();
        const updatedData = (data.data || []).map((s: any) => ({ ...s, versionName: newName }));
        batch.set(newDocRef, { ...data, versionName: newName, data: updatedData });
        batch.delete(oldDocRef);
      }

      const oldConfigRef = doc(db, CONFIG_COLLECTION, oldName);
      const newConfigRef = doc(db, CONFIG_COLLECTION, newName);
      const oldConfigSnap = await getDoc(oldConfigRef);
      
      if (oldConfigSnap.exists()) {
        batch.set(newConfigRef, { ...oldConfigSnap.data(), versionName: newName });
        batch.delete(oldConfigRef);
      }

      await batch.commit();
      cachedSchedules = null;
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
      snapshot.forEach(docSnap => batch.delete(docSnap.ref));
      configSnapshot.forEach(docSnap => batch.delete(docSnap.ref));
      await batch.commit();
      cachedSchedules = null;
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, COLLECTION_NAME);
    }
  }
};
