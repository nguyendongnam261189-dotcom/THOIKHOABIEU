import { collection, doc, setDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { Teacher, OperationType } from '../types';
import { handleFirestoreError } from './firebaseUtils';

const COLLECTION_NAME = 'teachers';

/**
 * 🔥 HÀM CHUẨN HÓA ID GIÁO VIÊN: 
 * Biến "Nguyễn Văn A" thành "nguyen_van_a" để dùng làm ID cố định.
 */
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

/**
 * 🔥 HÀM TỰ ĐỘNG PHÂN TỔ DỰA TRÊN MÔN DẠY
 */
const inferGroupFromSubject = (subject: string): string => {
  const s = (subject || '').toUpperCase();
  if (s.includes('GDTC') || s.includes('THỂ DỤC')) return 'Nghệ thuật - Thể chất';
  if (s.includes('CNGHE') || s.includes('CÔNG NGHỆ')) return 'KHTN và Công nghệ';
  return 'Chung';
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
      
      // 1. Lấy dữ liệu giáo viên hiện có để bảo vệ Tổ chuyên môn (Group)
      const existingSnapshot = await getDocs(collection(db, COLLECTION_NAME));
      const existingData: Record<string, any> = {};
      existingSnapshot.forEach(doc => {
        existingData[doc.id] = doc.data();
      });

      // 2. Xử lý từng giáo viên từ file Excel mới
      teachers.forEach(teacher => {
        if (!teacher.name) return;

        const tId = generateTeacherId(teacher.name);
        const docRef = doc(db, COLLECTION_NAME, tId);
        const oldTeacher = existingData[tId];

        // LOGIC BẢO VỆ TỔ CHUYÊN MÔN & TỰ ĐỘNG PHÂN TỔ
        let finalGroup = teacher.group || 'Chung';

        // Nếu giáo viên đã có trên hệ thống và có tổ (khác Chung), giữ nguyên tổ cũ
        if (oldTeacher && oldTeacher.group && oldTeacher.group !== 'Chung') {
          finalGroup = oldTeacher.group;
        } 
        // Nếu là giáo viên mới hoàn toàn hoặc tổ đang là "Chung", thử đoán tổ từ môn dạy
        else if (finalGroup === 'Chung') {
          finalGroup = inferGroupFromSubject(teacher.subject);
        }

        // 3. Ghi dữ liệu bằng lệnh SET với MERGE để không làm mất thông tin cũ
        batch.set(docRef, {
          ...teacher,
          id: tId,
          group: finalGroup,
          // Hợp nhất danh sách môn có thể dạy (phục vụ thống kê đa TKB)
          teachableSubjects: Array.from(new Set([
            ...(oldTeacher?.teachableSubjects || []),
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
