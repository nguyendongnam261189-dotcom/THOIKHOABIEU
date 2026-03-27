import * as XLSX from 'xlsx';
import { Schedule, Teacher } from '../types';

const getDepartmentFromSheetName = (sheetName: string): string => {
  const name = sheetName.toUpperCase();
  if (name.includes('_NN')) return 'Ngoại ngữ';
  if (name.includes('_KHTN') || name.includes('_CN_') || name.endsWith('_CN')) return 'KHTN và Công nghệ';
  if (name.includes('_SĐ') || name.includes('_SD')) return 'Sử - Địa';
  if (name.includes('_T_') || name.endsWith('_T')) return 'Toán - Tin';
  if (name.includes('_TM')) return 'Nghệ thuật - Thể chất';
  if (name.includes('_V_') || name.endsWith('_V')) return 'Văn - GDCD';
  return 'Chung';
};

const inferDepartmentFromSubject = (subject: string): string | null => {
  if (!subject) return null;
  const s = subject.toUpperCase();
  if (s.includes('TOÁN') || s.includes('TIN')) return 'Toán - Tin';
  if (s.includes('VĂN') || s.includes('GDCD')) return 'Văn - GDCD';
  if (s.includes('ANH') || s.includes('AVĂN')) return 'Ngoại ngữ';
  if (s.includes('KHTN') || s.includes('HÓA') || s.includes('LÝ') || s.includes('SINH') || s.includes('CÔNG NGHỆ') || s.includes('CNGHỆ')) return 'KHTN và Công nghệ';
  if (s.includes('SỬ') || s.includes('ĐỊA') || s.includes('NDGDĐP') || s.includes('NDGĐP') || s.includes('LỊCH SỬ') || s.includes('ĐỊA LÝ')) return 'Sử - Địa';
  if (s.includes('GDTC') || s.includes('THỂ DỤC') || s.includes('NGHỆ THUẬT') || s.includes('ÂM NHẠC') || s.includes('MỸ THUẬT')) return 'Nghệ thuật - Thể chất';
  return null;
};

const formatClassName = (className: any): string => {
  if (!className) return '';
  let str = String(className).trim();
  return str.replace(/\./g, '/').replace(/\s+/g, '');
};

const cleanString = (str: any): string => {
  if (str === null || str === undefined) return '';
  return String(str).normalize('NFC').trim();
};

export const parseExcelFile = async (
  file: File,
  versionName: string // 🔥 THÊM
): Promise<{ schedules: Schedule[], teachers: Teacher[] }> => {

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        let uniqueSchedules: Map<string, Schedule> = new Map();
        let allTeachersMap: Map<string, Teacher> = new Map();

        // ===== 1. MAP TỔ =====
        const teacherDepartmentDict = new Map<string, string>();

        workbook.SheetNames.forEach(sheetName => {
          if (sheetName.includes('TKB_GV') && !sheetName.includes('PCGD')) {
            const department = getDepartmentFromSheetName(sheetName);
            if (department === 'Chung') return;

            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];

            for (let i = 0; i < Math.min(15, jsonData.length); i++) {
              const row = jsonData[i] || [];
              const rowStr = row.map((c: any) => String(c).toLowerCase()).join('');
              if (rowStr.includes('thứ') || rowStr.includes('tiết')) {
                for (let c = 2; c < row.length; c++) {
                  let teacherName = cleanString(row[c]);
                  if (teacherName) {
                    teacherDepartmentDict.set(teacherName, department);
                  }
                }
                break;
              }
            }
          }
        });

        // ===== 2. SUBJECT LIST (giữ nguyên) =====
        const knownSubjects = new Set<string>();
        ['Toán','Văn','Anh','AVăn','Lý','Hóa','Sinh','Sử','Địa','GDCD','Tin','CNghệ','Công nghệ','GDTC','Thể dục','Nghệ thuật','Âm nhạc','Mỹ thuật','KHTN','HĐTNHN','CC-HĐTNHN','SHL','Chào cờ']
        .forEach(s => knownSubjects.add(s));

        const sortedKnownSubjects = Array.from(knownSubjects).sort((a,b)=>b.length-a.length);

        // ===== 3. PARSE =====
        workbook.SheetNames.forEach(sheetName => {

          if (sheetName.toUpperCase().includes('PCGD')) return;

          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];

          let headerRowIdx = -1, thuColIdx=-1, tietColIdx=-1;

          for (let i = 0; i < 15; i++) {
            const row = jsonData[i] || [];
            for (let c=0;c<row.length;c++){
              const str = cleanString(row[c]).toLowerCase();
              if(str.includes('thứ')) thuColIdx = c;
              if(str.includes('tiết')) tietColIdx = c;
            }
            if(thuColIdx!==-1 && tietColIdx!==-1){
              headerRowIdx = i;
              break;
            }
          }

          if (headerRowIdx === -1) return;

          const headerRow = jsonData[headerRowIdx];

          for(let c=0;c<headerRow.length;c++){
            if(c===thuColIdx||c===tietColIdx) continue;

            const teacherShort = cleanString(headerRow[c]);
            if(!teacherShort) continue;

            for(let r=headerRowIdx+1;r<jsonData.length;r++){

              const row = jsonData[r] || [];
              const tiet = parseInt(cleanString(row[tietColIdx]));
              if(isNaN(tiet)) continue;

              const cell = cleanString(row[c]);
              if(!cell) continue;

              let subject='', lop='';

              const match = sortedKnownSubjects.find(s=>cell.toUpperCase().startsWith(s.toUpperCase()));
              if(match){
                subject = match;
                lop = cell.substring(match.length).replace(/[-\s]/g,'').trim();
              }

              if(!subject) continue;

              const teacherGroup =
                teacherDepartmentDict.get(teacherShort)
                || inferDepartmentFromSubject(subject)
                || 'Chưa phân tổ';

              const schedule: Schedule = {
                giao_vien: teacherShort,
                lop: formatClassName(lop),
                mon: subject,
                thu: 0,
                tiet: tiet>5?tiet-5:tiet,
                buoi: tiet>5?'Chiều':'Sáng',
                versionName // 🔥 THÊM
              };

              const key = `${schedule.thu}-${schedule.buoi}-${schedule.tiet}-${schedule.giao_vien}-${schedule.mon}`;

              uniqueSchedules.set(key, schedule);

              if(!allTeachersMap.has(teacherShort)){
                allTeachersMap.set(teacherShort,{
                  name: teacherShort,
                  subject: subject,
                  group: teacherGroup,
                  versionName // 🔥 THÊM
                } as Teacher);
              }
            }
          }
        });

        resolve({
          schedules: Array.from(uniqueSchedules.values()),
          teachers: Array.from(allTeachersMap.values())
        });

      } catch (error) {
        reject(error);
      }
    };

    reader.readAsArrayBuffer(file);
  });
};
