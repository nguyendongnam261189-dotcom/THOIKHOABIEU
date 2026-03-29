import { collection, doc, setDoc, getDocs, writeBatch, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Teacher, OperationType } from '../types';
import { handleFirestoreError } from './firebaseUtils';

const COLLECTION_NAME = 'teachers';
const ALIAS_COLLECTION = 'teacher_aliases';

/**
 * 🔥 HÀM TẠO ID CỐ ĐỊNH TỪ TÊN ĐÃ PHÂN TÍCH
 * Giúp gộp "Hải" và "Nguyễn Ngọc Hải" hoặc phân biệt 2 cô Vân.
 */
export const generateTeacherId = (name: string): string => {
  if (!name) return 'unknown';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .trim();
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
      
      // 1. Lấy dữ liệu hiện có trên Firebase để đối soát tổ chuyên môn
      const existingSnapshot = await getDocs(collection(db, COLLECTION_NAME));
      const existingMap = new Map();
      existingSnapshot.forEach(doc => {
        existingMap.set(doc.id, doc.data());
      });

      // 2. Xử lý danh sách giáo viên mới từ Excel
      teachers.forEach(teacher => {
        if (!teacher.name) return;

        const tId = generateTeacherId(teacher.name);
        const docRef = doc(db, COLLECTION_NAME, tId);
        const oldData = existingMap.get(tId);

        // Giữ lại tên dài nhất (Ưu tiên tên đầy đủ từ PCGD so với tên viết tắt TKB)
        let finalName = teacher.name;
        if (oldData && oldData.name && oldData.name.length > teacher.name.length) {
          finalName = oldData.name;
        }

        // Bảo vệ tổ chuyên môn: Nếu cũ đã có tổ xịn, mới là "Chung" thì lấy cái cũ
        let finalGroup = teacher.group || 'Chung';
        if (oldData && oldData.group && oldData.group !== 'Chung' && finalGroup === 'Chung') {
          finalGroup = oldData.group;
        }

        // 3. Ghi dữ liệu bằng SET MERGE (Không xóa cũ, chỉ cập nhật hoặc thêm mới)
        batch.set(docRef, {
          ...teacher,
          id: tId,
          name: finalName,
          group: finalGroup
        }, { merge: true });
      });

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
      throw error;
    }
  },

  async updateTeacher(id: string, updates: Partial<Teacher>): Promise<void> {
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      await setDoc(docRef, updates, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, COLLECTION_NAME);
    }
  },

  // DỌN RÁC (Garbage Collection)
  async deleteTeacher(id: string): Promise<void> {
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
      throw error;
    }
  },

  // ============================================================================
  // BỘ NHỚ TỪ ĐIỂN MAPPING (Alias Dictionary)
  // ============================================================================

  // Đọc từ điển để hỗ trợ việc phân tích tự động
  async getTeacherAliases(): Promise<Record<string, string>> {
    try {
      const snapshot = await getDocs(collection(db, ALIAS_COLLECTION));
      const aliases: Record<string, string> = {};
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.shortName && data.fullName) {
          aliases[data.shortName] = data.fullName;
        }
      });
      return aliases;
    } catch (error) {
      console.error("Lỗi tải từ điển GV:", error);
      return {};
    }
  },

  // Lưu từ điển mới sau khi Admin đã Mapping thủ công
  async saveTeacherAliases(mapping: Record<string, string>): Promise<void> {
    try {
      const batch = writeBatch(db);
      Object.entries(mapping).forEach(([shortName, fullName]) => {
        if (!shortName || !fullName) return;
        
        const safeId = generateTeacherId(shortName);
        const docRef = doc(db, ALIAS_COLLECTION, safeId);
        
        batch.set(docRef, { shortName, fullName }, { merge: true });
      });
      await batch.commit();
    } catch (error) {
      console.error("Lỗi lưu từ điển GV:", error);
      throw error;
    }
  },

  // 🔥 HÀM MỚI: XÓA MỘT BÍ DANH (Dùng để tháo nút thắt khi bị trùng)
  async deleteTeacherAlias(shortName: string): Promise<void> {
    try {
      const safeId = generateTeacherId(shortName);
      const docRef = doc(db, ALIAS_COLLECTION, safeId);
      await deleteDoc(docRef);
    } catch (error) {
      console.error("Lỗi xóa từ điển GV:", error);
      throw error;
    }
  }
};
