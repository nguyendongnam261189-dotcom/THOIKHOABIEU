import { collection, doc, setDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { Teacher, OperationType } from '../types';
import { handleFirestoreError } from './firebaseUtils';

const COLLECTION_NAME = 'teachers';

/**
 * 🔑 HÀM TẠO ID CỐ ĐỊNH (ĐỒNG BỘ VỚI PARSER)
 * Chuyển "Nguyễn Thị Oanh" -> "nguyen_thi_oanh"
 */
const generateTeacherId = (name: string): string => {
  if (!name) return 'unknown';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
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
      
      // 1. Lấy dữ liệu hiện tại từ Firebase để đối soát (Tiết kiệm Quota Writes)
      const existingSnapshot = await getDocs(collection(db, COLLECTION_NAME));
      const existingMap = new Map<string, any>();
      existingSnapshot.forEach(doc => {
        existingMap.set(doc.id, doc.data());
      });

      let writeCount = 0;

      // 2. Duyệt danh sách giáo viên mới từ Excel
      teachers.forEach(teacher => {
        if (!teacher.name) return;

        const tId = generateTeacherId(teacher.name);
        const docRef = doc(db, COLLECTION_NAME, tId);
        const oldData = existingMap.get(tId);

        // Kiểm tra xem có thực sự cần cập nhật không (So sánh Tên, Tổ, Môn)
        const isDifferent = !oldData || 
          oldData.name !== teacher.name || 
          oldData.group !== teacher.group || 
          oldData.subject !== teacher.subject;

        if (isDifferent) {
          // Chỉ thêm vào Batch nếu có sự thay đổi
          batch.set(docRef, {
            ...teacher,
            id: tId, // Đảm bảo ID luôn cố định
            updatedAt: new Date().toISOString()
          }, { merge: true });
          
          writeCount++;
        }
      });

      // 3. Chỉ Commit nếu có ít nhất 1 sự thay đổi
      if (writeCount > 0) {
        await batch.commit();
        console.log(`✅ Đã cập nhật/thêm mới ${writeCount} giáo viên.`);
      } else {
        console.log("ℹ️ Không có thay đổi về giáo viên, bỏ qua lượt ghi Firebase.");
      }

    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
      throw error;
    }
  },

  async updateTeacher(id: string, updates: Partial<Teacher>): Promise<void> {
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      await setDoc(docRef, {
        ...updates,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, COLLECTION_NAME);
    }
  }
};
