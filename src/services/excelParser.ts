import * as XLSX from 'xlsx';
import { Schedule, Teacher } from '../types';

// 🔥 MAP MÔN → TỔ (fallback)
const inferDepartmentFromSubject = (subject: string): string | null => {
  const s = subject.toUpperCase();

  if (s.includes('TOÁN') || s.includes('TIN')) return 'Toán - Tin';
  if (s.includes('VĂN') || s.includes('GDCD')) return 'Văn - GDCD';
  if (s.includes('ANH')) return 'Ngoại ngữ';
  if (s.includes('LÝ') || s.includes('HÓA') || s.includes('SINH') || s.includes('CÔNG NGHỆ') || s.includes('KHTN')) return 'KHTN và Công nghệ';
  if (s.includes('SỬ') || s.includes('ĐỊA')) return 'Sử - Địa';
  if (s.includes('THỂ') || s.includes('GDTC') || s.includes('ÂM') || s.includes('MỸ')) return 'Nghệ thuật - Thể chất';

  return null;
};

const getDepartmentFromSheetName = (sheetName: string): string => {
  const name = sheetName.toUpperCase();
  if (name.includes('_NN')) return 'Ngoại ngữ';
  if (name.includes('_KHTN') || name.includes('_CN_') || name.endsWith('_CN')) return 'KHTN và Công nghệ';
  if (name.includes('_SĐ') || name.includes('_SD')) return 'Sử - Địa';
  if (name.includes('_T_') || name.endsWith('_T')) return 'Toán - Tin';
  if (name.includes('_TM')) return 'Nghệ thuật - Thể chất';
  if (name.includes('_V_') || name.endsWith('_V')) return 'Văn - GDCD';
  return '';
};

const normalizeSubject = (subject: string): string => {
  const s = subject.toUpperCase().replace(/\s+/g, '');
  if (s.includes('HĐTN')) return 'HĐTN';
  return subject.trim();
};

const isHDTN = (subject: string): boolean => {
  return normalizeSubject(subject) === 'HĐTN';
};

const cleanString = (str: any): string => {
  if (!str) return '';
  return String(str).normalize('NFC').trim();
};

// 🔥 LỌC HEADER
const isInvalidRow = (row: any[]): boolean => {
  if (!row) return true;
  const text = row.join(' ').toUpperCase();

  return (
    text.includes('THỜI KHÓA BIỂU') ||
    text.includes('GIÁO VIÊN') ||
    text.includes('BUỔI SÁNG') ||
    text.includes('BUỔI CHIỀU') ||
    text.includes('THỨ') ||
    text.includes('TIẾT')
  );
};

export const parseExcelFile = async (file: File): Promise<{ schedules: Schedule[], teachers: Teacher[] }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        let uniqueSchedules: Map<string, Schedule> = new Map();
        let allTeachersMap: Map<string, { subjects: Map<string, number>, groups: Set<string> }> = new Map();

        const shortNameToDept = new Map<string, string>();

        // 🔥 1. LẤY TỔ
        workbook.SheetNames.forEach(sheetName => {
          if (sheetName.includes('TKB_GV') && !sheetName.includes('PCGD')) {
            const department = getDepartmentFromSheetName(sheetName);
            if (!department) return;

            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];

            for (let i = 0; i < 15; i++) {
              const row = jsonData[i] || [];
              const rowStr = row.map((c: any) => String(c).toLowerCase()).join('');
              if (rowStr.includes('thứ') || rowStr.includes('tiết')) {
                for (let c = 2; c < row.length; c++) {
                  const name = cleanString(row[c]);
                  if (name) shortNameToDept.set(name, department);
                }
                break;
              }
            }
          }
        });

        // 🔥 2. PARSE DATA
        workbook.SheetNames.forEach(sheetName => {
          if (sheetName.toUpperCase().includes('PCGD')) return;

          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];

          jsonData.forEach(row => {
            if (!row || isInvalidRow(row)) return;

            for (let i = 0; i < row.length; i++) {
              const subject = normalizeSubject(cleanString(row[i]));
              const teacher = cleanString(row[i + 1]);

              // 🔥 BỎ DATA RÁC
              if (!teacher || teacher.length < 2) continue;

              if (teacher.toUpperCase().includes('THỜI KHÓA BIỂU')) continue;

              if (!allTeachersMap.has(teacher)) {
                allTeachersMap.set(teacher, {
                  subjects: new Map(),
                  groups: new Set()
                });
              }

              const t = allTeachersMap.get(teacher)!;

              if (!isHDTN(subject)) {
                t.subjects.set(subject, (t.subjects.get(subject) || 0) + 1);
              }

              const dept = shortNameToDept.get(teacher);
              if (dept) t.groups.add(dept);
            }
          });
        });

        // 🔥 3. MAP FULL NAME
        const shortToFullName = new Map<string, string>();

        const pcgdSheetName = workbook.SheetNames.find(n => n.toUpperCase().includes('PCGD'));
        if (pcgdSheetName) {
          const worksheet = workbook.Sheets[pcgdSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];

          jsonData.forEach(row => {
            const fullName = cleanString(row[0]);
            if (!fullName) return;

            const short = fullName.split(' ').pop() || fullName;
            shortToFullName.set(short, fullName);
          });
        }

        // 🔥 4. BUILD TEACHERS
        const finalTeachers: Teacher[] = [];

        allTeachersMap.forEach((data, shortName) => {
          const fullName = shortToFullName.get(shortName) || shortName;

          let group = '';

          if (data.groups.size > 0) {
            group = Array.from(data.groups)[0];
          } else {
            let max = 0;
            let bestSubject = '';

            data.subjects.forEach((count, subject) => {
              if (count > max) {
                max = count;
                bestSubject = subject;
              }
            });

            if (!bestSubject) {
              console.warn(`⚠️ Không xác định được tổ cho giáo viên: ${fullName}`);
              return;
            }

            group = inferDepartmentFromSubject(bestSubject) || '';

            if (!group) {
              console.warn(`⚠️ Không xác định được tổ cho giáo viên: ${fullName}`);
              return;
            }
          }

          finalTeachers.push({
            name: fullName,
            subject: Array.from(data.subjects.keys()).join(', '),
            group
          });
        });

        resolve({
          schedules: [],
          teachers: finalTeachers
        });

      } catch (error) {
        reject(error);
      }
    };

    reader.readAsArrayBuffer(file);
  });
};
