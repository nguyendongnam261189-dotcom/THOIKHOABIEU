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

const formatClassName = (className: any): string => {
  if (!className) return '';
  let str = String(className).trim();
  // Giữ nguyên logic định dạng của thầy để khớp PCGD (6.1, 7/2...)
  return str.replace(/\./g, '/').replace(/\s+/g, '');
};

const cleanString = (str: any): string => {
  if (str === null || str === undefined) return '';
  return String(str).normalize('NFC').trim();
};

const generateFixedId = (name: string): string => {
  return name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
};

const isProfessionalSubject = (subject: string): boolean => {
  if (!subject) return false;
  const s = subject.toUpperCase();
  const nonPro = ['SHL', 'CHÀO CỜ', 'CC-', 'CC', 'GDĐP', 'ĐỊA PHƯƠNG'];
  return !nonPro.some(k => s.includes(k)) && !s.includes('HĐTN') && !s.includes('HDTN');
};

export const parseExcelFile = async (file: File): Promise<{ schedules: Schedule[], teachers: Teacher[] }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        let uniqueSchedules: Map<string, Schedule> = new Map();
        let allTeachersMap: Map<string, Teacher> = new Map();
        const teacherDepartmentDict = new Map<string, string>();

        // 1. LẤY TỔ CHUYÊN MÔN (Bản gốc)
        workbook.SheetNames.forEach(sn => {
          if (sn.includes('TKB_GV') && !sn.includes('PCGD')) {
            const dept = getDepartmentFromSheetName(sn);
            const ws = workbook.Sheets[sn];
            const json = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[];
            for (let i = 0; i < Math.min(15, json.length); i++) {
              const row = json[i] || [];
              if (row.join('').toLowerCase().includes('thứ') || row.join('').toLowerCase().includes('tiết')) {
                for (let c = 2; c < row.length; c++) {
                  let tName = cleanString(row[c]);
                  if (tName && !['sáng', 'chiều'].includes(tName.toLowerCase())) {
                    teacherDepartmentDict.set(tName, dept);
                  }
                }
                break;
              }
            }
          }
        });

        // 2. ĐỌC TKB & GỘP LỚP (Bản gốc - Bảo toàn vân tay)
        workbook.SheetNames.forEach(sn => {
          if (sn.toUpperCase().includes('PCGD') || sn.toUpperCase().includes('PHONGHOC')) return;
          const ws = workbook.Sheets[sn];
          const json = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[];
          if (json.length === 0) return;

          let hIdx = -1, tCol = -1, tiCol = -1;
          for (let i = 0; i < Math.min(15, json.length); i++) {
            const row = json[i] || [];
            let fT = -1, fTi = -1;
            for (let c = 0; c < Math.min(5, row.length); c++) {
              const s = cleanString(row[c]).toLowerCase();
              if (s.includes('thứ') && fT === -1) fT = c;
              if (s.includes('tiết') && fTi === -1) fTi = c;
            }
            if (fT !== -1 && fTi !== -1) { hIdx = i; tCol = fT; tiCol = fTi; break; }
          }

          if (hIdx !== -1) {
            const hRow = json[hIdx];
            const colMap: any = {};
            hRow.forEach((v: any, c: number) => {
              const val = cleanString(v);
              if (c !== tCol && c !== tiCol && val.length > 1) {
                colMap[c] = { name: val.replace(/\s*\(.*\)/, '').trim(), buoi: sn.toUpperCase().includes('_C') ? 'Chiều' : 'Sáng' };
              }
            });

            for (let i = hIdx + 1; i < json.length; i++) {
              const r = json[i] || [];
              const rT = cleanString(r[tCol]);
              let curThu = 2; if (rT) { const m = rT.match(/\d+/); if (m) curThu = parseInt(m[0]); }
              const curTi = parseInt(cleanString(r[tiCol]));
              if (!isNaN(curTi)) {
                Object.keys(colMap).forEach(cIdx => {
                  const cell = cleanString(r[Number(cIdx)]);
                  if (cell) {
                    const monMatch = cell.match(/^([A-ZĐĐ\s\-]+)/i);
                    let mon = monMatch ? monMatch[0].trim() : 'Môn khác';
                    let sec = cell.substring(mon.length).replace(/^[-\n\s]+/, '').trim();
                    let lop = sn.includes('LOP') ? colMap[cIdx].name : sec;
                    let gv = sn.includes('LOP') ? sec : colMap[cIdx].name;

                    const sch: Schedule = {
                      thu: curThu, tiet: curTi > 5 ? curTi - 5 : curTi,
                      lop: lop, mon: mon, giao_vien: gv, phong: '',
                      buoi: curTi > 5 ? 'Chiều' : colMap[cIdx].buoi
                    };

                    const key = `${curThu}-${sch.buoi}-${curTi}-${gv}-${mon}`;
                    if (uniqueSchedules.has(key)) {
                      const ex = uniqueSchedules.get(key)!;
                      if (!ex.lop.includes(lop)) ex.lop += `, ${lop}`;
                    } else {
                      uniqueSchedules.set(key, sch);
                    }

                    if (!allTeachersMap.has(gv)) {
                      allTeachersMap.set(gv, { name: gv, subject: mon, group: teacherDepartmentDict.get(gv) || 'Chung' });
                    } else {
                      const t = allTeachersMap.get(gv)!;
                      if (!t.subject.includes(mon)) t.subject += `, ${mon}`;
                    }
                  }
                });
              }
            }
          }
        });

        // 3. ĐỐI SOÁT TÊN (Kế thừa logic vân tay chuẩn)
        const shortToFull = new Map<string, string>();
        const pcgdTeachers: any[] = [];
        const pcgdSN = workbook.SheetNames.find(n => n.toUpperCase().includes('PCGD'));
        if (pcgdSN) {
          const ws = workbook.Sheets[pcgdSN];
          const json = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[];
          let nCol = -1, pCol = -1, hIdx = -1;
          for (let i = 0; i < Math.min(15, json.length); i++) {
            const r = json[i] || [];
            r.forEach((c: any, idx: number) => {
              const s = cleanString(c).toLowerCase();
              if (s === 'họ và tên' || s === 'họ tên') nCol = idx;
              if (s.includes('chuyên môn')) pCol = idx;
            });
            if (nCol !== -1) { hIdx = i; break; }
          }
          if (nCol !== -1) {
            for (let i = hIdx + 1; i < json.length; i++) {
              const r = json[i] || [];
              const fn = cleanString(r[nCol]);
              if (!fn || fn.length < 4) continue;
              const pccm = pCol !== -1 ? cleanString(r[pCol]) : '';
              const cMatches = pccm.match(/\d{1,2}\s*[./]\s*\d{1,2}/g) || [];
              pcgdTeachers.push({ fullName: fn, classes: new Set(cMatches.map(c => formatClassName(c))) });
            }
          }

          allTeachersMap.forEach((t, short) => {
            const tkbClasses = new Set<string>();
            uniqueSchedules.forEach(s => {
              if (s.giao_vien === short) s.lop.split(',').forEach(l => {
                const f = formatClassName(l); if (f && f !== 'CHƯAXẾP') tkbClasses.add(f);
              });
            });

            let bestMatch = null, maxScore = -1;
            pcgdTeachers.forEach(cand => {
              let score = 0;
              tkbClasses.forEach(c => { if (cand.classes.has(c)) score += 1000; });
              if (cand.fullName.toUpperCase().includes(short.toUpperCase())) score += 100;
              if (score > maxScore) { maxScore = score; bestMatch = cand; }
            });
            shortToFull.set(short, (bestMatch && maxScore >= 50) ? bestMatch.fullName : short);
          });
        }

        // 4. KẾT XUẤT (Gộp ID và lọc môn chuyên môn)
        const mergedTeachers = new Map<string, Teacher>();
        allTeachersMap.forEach((t, short) => {
          const fName = shortToFull.get(short) || short;
          let subs = t.subject.split(', ').map(s => s.trim());
          
          let finalSub = subs.join(', ');
          if (subs.length > 1) {
            const pro = subs.filter(isProfessionalSubject);
            if (pro.length > 0) finalSub = pro.join(', ');
          }

          if (mergedTeachers.has(fName)) {
            const ex = mergedTeachers.get(fName)!;
            const combined = new Set([...ex.subject.split(', '), ...finalSub.split(', ')]);
            ex.subject = Array.from(combined).filter(Boolean).join(', ');
          } else {
            mergedTeachers.set(fName, { ...t, id: generateFixedId(fName), name: fName, subject: finalSub });
          }
        });

        resolve({
          schedules: Array.from(uniqueSchedules.values()).map(s => ({ 
            ...s, 
            giao_vien: shortToFull.get(s.giao_vien) || s.giao_vien, 
            lop: s.lop.split(',').map(formatClassName).join(', ') 
          })),
          teachers: Array.from(mergedTeachers.values())
        });
      } catch (err) { reject(err); }
    };
    reader.readAsArrayBuffer(file);
  });
};
