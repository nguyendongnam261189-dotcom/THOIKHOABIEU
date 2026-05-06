import { collection, doc, getDocs, getDoc, writeBatch, query, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Schedule, OperationType } from '../types';
import { handleFirestoreError } from './firebaseUtils';

// 🔥 VÙNG ĐẤT MỚI: TKB Version 2 (Để test an toàn, không đụng data cũ)
const COLLECTION_NAME = 'schedules_v2';
const CONFIG_COLLECTION = 'version_configs_v2';

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
      
      let allData: Schedule[] = [];
      snapshot.forEach(doc => {
        const docData = doc.data();
        if (docData.data && Array.isArray(docData.data)) {
          allData = allData.concat(docData.data);
        }
      });
      
      // Lưu vào bộ nhớ tạm
      cachedSchedules = allData;
      cacheTimestamp = Date.now();
      
      return allData;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, COLLECTION_NAME);
      return [];
    }
  },

  async getSchedulesByTeacher(teacherName: string): Promise<Schedule[]> {
    try {
      // Tận dụng sức mạnh của Cache và lọc Offline (0 tốn Quota)
      const allSchedules = await this.getAllSchedules();
      return allSchedules.filter(s => s.giao_vien === teacherName);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, COLLECTION_NAME);
      return [];
    }
  },

  async saveSchedules(schedules: Schedule[]): Promise<void> {
    try {
      // 1. Gom nhóm tất cả tiết học theo versionName (Đóng gói dữ liệu)
      const grouped: Record<string, Schedule[]> = {};
      schedules.forEach(s => {
        const vName = (s as any).versionName || 'Không rõ';
        if (!grouped[vName]) grouped[vName] = [];
        grouped[vName].push(s);
      });

      const batch = writeBatch(db);
      
      // 2. Mỗi versionName lưu thành đúng 1 Document duy nhất (Tiết kiệm hàng nghìn lượt Write)
      for (const [vName, data] of Object.entries(grouped)) {
        const docRef = doc(db, COLLECTION_NAME, vName);
        batch.set(docRef, { 
          versionName: vName, 
          data: data, // Đóng gói toàn bộ mảng vào field này
          updatedAt: new Date().toISOString() 
        });
      }

      await batch.commit();
      
      cachedSchedules = null; // 🔥 Xóa trí nhớ tạm khi có dữ liệu mới
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
      throw error;
    }
  },

  // 🔥 CẬP NHẬT TRÚNG ĐÍCH TÊN GIÁO VIÊN (Đã nâng cấp để quét trên mảng)
  async updateTeacherInSchedules(oldName: string, newName: string): Promise<void> {
    try {
      const snapshot = await getDocs(collection(db, COLLECTION_NAME));
      const batch = writeBatch(db);
      let hasChanges = false;

      // Không cần chia batch 500 nữa vì số lượng document giờ chỉ bằng số phiên bản (rất ít)
      snapshot.forEach(document => {
        const docData = document.data();
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
            batch.update(document.ref, { data: newData });
            hasChanges = true;
          }
        }
      });

      if (hasChanges) {
        await batch.commit();
        cachedSchedules = null; // Xóa bộ nhớ đệm vì lịch đã thay đổi
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, COLLECTION_NAME);
      throw error;
    }
  },

  // 🔥 LƯU SỐ TUẦN ÁP DỤNG CHO PHIÊN BẢN (Giữ nguyên logic)
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

  // 🔥 LẤY TẤT CẢ CẤU HÌNH PHIÊN BẢN (Giữ nguyên logic)
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
      const batch = writeBatch(db);
      
      // Xóa 1 document duy nhất chứa TKB của phiên bản đó
      const docRef = doc(db, COLLECTION_NAME, versionName);
      batch.delete(docRef);
      
      // Xóa cấu hình
      const configRef = doc(db, CONFIG_COLLECTION, versionName);
      batch.delete(configRef);
      
      await batch.commit();
      cachedSchedules = null; // 🔥 Xóa trí nhớ tạm
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, COLLECTION_NAME);
      throw error;
    }
  },

  async renameVersion(oldName: string, newName: string): Promise<void> {
    try {
      const batch = writeBatch(db);
      
      // 1. Lấy dữ liệu gói TKB cũ
      const oldDocRef = doc(db, COLLECTION_NAME, oldName);
      const newDocRef = doc(db, COLLECTION_NAME, newName);
      const oldDocSnap = await getDoc(oldDocRef);
      
      if (oldDocSnap.exists()) {
        const data = oldDocSnap.data();
        // Sửa lại thuộc tính versionName nằm bên trong từng tiết học (nếu có)
        const updatedData = (data.data || []).map((s: any) => ({ ...s, versionName: newName }));
        
        batch.set(newDocRef, { ...data, versionName: newName, data: updatedData });
        batch.delete(oldDocRef);
      }

      // 2. Đổi tên cấu hình số tuần
      const oldConfigRef = doc(db, CONFIG_COLLECTION, oldName);
      const newConfigRef = doc(db, CONFIG_COLLECTION, newName);
      const oldConfigSnap = await getDoc(oldConfigRef);
      
      if (oldConfigSnap.exists()) {
        batch.set(newConfigRef, { ...oldConfigSnap.data(), versionName: newName });
        batch.delete(oldConfigRef);
      }

      await batch.commit();
      cachedSchedules = null; // 🔥 Xóa trí nhớ tạm
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
