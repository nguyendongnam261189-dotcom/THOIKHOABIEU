import * as XLSX from 'xlsx';
import { Schedule, Teacher } from '../types';

// ====== UTIL ======

const clean = (s: any) => String(s || '').normalize('NFC').trim();

const normalizeSubject = (s: string) => {
  const str = s.toUpperCase().replace(/\s+/g, '');
  if (str.includes('HĐTN')) return 'HĐTN';
  return s.trim();
};

const extractSubjectAndClass = (text: string) => {
  if (!text) return { subject: '', lop: '' };

  let t = text.replace(/\s+/g, ' ').trim();

  // dạng "AVăn - 7.1"
  if (t.includes('-')) {
    const parts = t.split('-');
    const lop = parts.pop()?.trim() || '';
    const subject = parts.join('-').trim();
    return { subject: normalizeSubject(subject), lop };
  }

  // dạng "HĐTNHN (7.2)"
  const match = t.match(/\(([^)]+)\)/);
  if (match) {
    return {
      subject: normalizeSubject(t.replace(match[0], '').trim()),
      lop: match[1].trim()
    };
  }

  return { subject: t, lop: '' };
};

const getDepartmentFromSheetName = (name: string) => {
  const n = name.toUpperCase();
  if (n.includes('_NN')) return 'Ngoại ngữ';
  if (n.includes('_KHTN') || n.includes('_CN')) return 'KHTN và Công nghệ';
  if (n.includes('_SD')) return 'Sử - Địa';
  if (n.includes('_T')) return 'Toán - Tin';
  if (n.includes('_TM')) return 'Nghệ thuật - Thể chất';
  if (n.includes('_V')) return 'Văn - GDCD';
  return '';
};

// ====== MAIN ======

export const parseExcelFile = async (file: File) => {
  return new Promise<{ schedules: Schedule[], teachers: Teacher[] }>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target?.result as ArrayBuffer), { type: 'array' });

        // ===== 1. MAP SHORT → FULL =====
        const shortToFull = new Map<string, string>();

        const pcgd = wb.SheetNames.find(n => n.toUpperCase().includes('PCGD'));
        if (pcgd) {
          const data = XLSX.utils.sheet_to_json(wb.Sheets[pcgd], { header: 1 }) as any[];

          data.forEach(r => {
            const full = clean(r[1] || r[0]);
            if (!full) return;

            const short = full.split(' ').pop() || full;
            shortToFull.set(short, full);
          });
        }

        // ===== 2. PARSE =====
        const schedules: Schedule[] = [];
        const teacherMap = new Map<string, { subjects: Set<string>, group: string }>();

        wb.SheetNames.forEach(sheetName => {
          if (sheetName.toUpperCase().includes('PCGD')) return;

          const group = getDepartmentFromSheetName(sheetName);
          const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 }) as any[];

          // tìm header row (có tên giáo viên)
          let headerRowIndex = -1;
          for (let i = 0; i < 10; i++) {
            const row = data[i] || [];
            if (row.some(c => clean(c).length > 2)) {
              headerRowIndex = i;
              break;
            }
          }

          if (headerRowIndex === -1) return;

          const headers = data[headerRowIndex];

          // ===== duyệt theo CỘT =====
          for (let col = 0; col < headers.length; col++) {
            const shortName = clean(headers[col]);
            if (!shortName || shortName.length < 2) continue;

            const fullName = shortToFull.get(shortName.split('.').pop() || shortName) || shortName;

            if (!teacherMap.has(fullName)) {
              teacherMap.set(fullName, {
                subjects: new Set(),
                group
              });
            }

            // ===== duyệt xuống dưới =====
            for (let row = headerRowIndex + 1; row < data.length; row++) {
              const cell = clean(data[row][col]);
              if (!cell) continue;

              if (cell.toUpperCase().includes('THỜI') || cell.toUpperCase().includes('BUỔI')) continue;

              const { subject, lop } = extractSubjectAndClass(cell);

              if (!subject || !lop) continue;

              teacherMap.get(fullName)!.subjects.add(subject);

              schedules.push({
                giao_vien: fullName,
                lop,
                mon: subject,
                thu: 0,
                tiet: 0,
                buoi: '',
              } as Schedule);
            }
          }
        });

        // ===== 3. BUILD TEACHERS =====
        const teachers: Teacher[] = [];

        teacherMap.forEach((data, name) => {
          teachers.push({
            name,
            subject: Array.from(data.subjects).join(', '),
            group: data.group
          });
        });

        resolve({ schedules, teachers });

      } catch (err) {
        reject(err);
      }
    };

    reader.readAsArrayBuffer(file);
  });
};
