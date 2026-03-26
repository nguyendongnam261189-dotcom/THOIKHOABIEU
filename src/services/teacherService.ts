import { collection, doc, setDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { Teacher, OperationType } from '../types';
import { handleFirestoreError } from './firebaseUtils';

const COLLECTION_NAME = 'teachers';

// Hàm hỗ trợ chuẩn hóa tên làm ID (Ví dụ: "Nguyễn Đông Nam" -> "nguyen_dong_nam")
const generateTeacherId = (name: string): string => {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .trim();
};

// Hàm tự động xác định tổ dựa trên môn học cho các giáo viên "vãng lai"
const getAutomaticGroup = (subject: string): string => {
  const s = subject.toUpperCase();
  if (s.includes('GDTC') || s.includes('THE DUC')) return 'Năng khiếu'; // Hoặc tên tổ Thể dục của trường
  if (s.includes('CNGHE') || s.includes('CÔNG NGHỆ')) return 'Lý - Công nghệ';
  if (s.includes('TIN')) return 'Toán - Tin';
  return 'Chung'; // Mặc định nếu không khớp
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
      
      // Lấy danh sách giáo viên hiện có để kiểm tra tổ
      const existingSnapshot = await getDocs(collection(db, COLLECTION_NAME));
      const existingTeachers: Record<string, any> = {};
      existingSnapshot.forEach(doc => {
        existingTeachers[doc.id] = doc.data();
      });

      teachers.forEach(teacher => {
        const tId = generateTeacherId(teacher.name);
        const docRef = doc(db, COLLECTION_NAME, tId);
        
        const oldData = existingTeachers[tId];
        
        // LOGIC BẢO VỆ TỔ CHUYÊN MÔN:
        // Nếu đã có dữ liệu cũ và tổ cũ khác "Chung", giữ nguyên tổ cũ.
        // Nếu là giáo viên mới hoàn toàn, kiểm tra môn để tự xếp tổ.
        let finalGroup = teacher.group;
        
        if (oldData && oldData.group && oldData.group !== 'Chung' && oldData.group !== '') {
          finalGroup = oldData.group;
        } else if (finalGroup === 'Chung' || !finalGroup) {
          finalGroup = getAutomaticGroup(teacher.subject);
        }

        // Chỉ cập nhật môn học và giữ lại các thông tin quan trọng khác
        batch.set(docRef, {
          ...teacher,
          id: tId,
          group: finalGroup,
          // Hợp nhất danh sách môn dạy để không bị mất dữ liệu môn từ các TKB khác
          teachableSubjects: Array.from(new Set([
            ...(oldData?.teachableSubjects || []),
            ...(teacher.teachableSubjects || []),
            teacher.subject
          ].filter(Boolean)))
        }, { merge: true });
      });

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
    }
  },

  async updateTeacher(id: string, updates: Partial<Teacher>): Promise<void> {
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      await setDoc(docRef, updates, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, COLLECTION_NAME);
    }
  }
};
