import { collection, doc, getDocs, writeBatch, query, where, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Schedule, OperationType } from '../types';
import { handleFirestoreError } from './firebaseUtils';

const COLLECTION_NAME = 'schedules';
const CONFIG_COLLECTION = 'version_configs';

// 🔥 sanitize an toàn cho Firestore ID
const safeString = (str: string): string => {
  return (str || '')
    .replace(/\//g, '_')      // bỏ dấu /
    .replace(/#/g, '')
    .replace(/\?/g, '')
    .replace(/\s+/g, '_')     // space → _
    .trim();
};

// 🔥 TẠO ID DUY NHẤT CHO SCHEDULE
const generateScheduleId = (schedule: Schedule): string => {
  const version = safeString(schedule.versionName || 'unknown');
  const teacher = safeString(schedule.giao_vien || 'unknown');
  const thu = schedule.thu;
  const tiet = schedule.tiet;
  const buoi = safeString(schedule.buoi || '');
  const lop = safeString(schedule.lop || '');

  return `${version}__${teacher}__${lop}__${thu}_${tiet}_${buoi}`;
};

export const scheduleService = {
  async getAllSchedules(): Promise<Schedule[]> {
    try {
      const q = query(collection(db, COLLECTION_NAME));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Schedule));
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, COLLECTION_NAME);
      return [];
    }
  },

  async getSchedulesByTeacher(teacherName: string): Promise<Schedule[]> {
    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where('giao_vien', '==', teacherName)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Schedule));
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, COLLECTION_NAME);
      return [];
    }
  },

  async saveSchedules(schedules: Schedule[]): Promise<void> {
    try {
      const batch = writeBatch(db);

      schedules.forEach(schedule => {
        const docId = generateScheduleId(schedule);
        const docRef = doc(db, COLLECTION_NAME, docId);

        batch.set(docRef, schedule, { merge: true });
      });

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
    }
  },

  async saveVersionWeeks(versionName: string, weeks: number): Promise<void> {
    try {
      const safeVersion = safeString(versionName);
      const docRef = doc(db, CONFIG_COLLECTION, safeVersion);

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
      return snapshot.docs.map(doc => doc.data());
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, CONFIG_COLLECTION);
      return [];
    }
  },

  async deleteScheduleByVersion(versionName: string): Promise<void> {
    try {
      const snapshot = await getDocs(collection(db, COLLECTION_NAME));
      const batch = writeBatch(db);

      snapshot.forEach(document => {
        const data = document.data();
        if (data.versionName === versionName) {
          batch.delete(document.ref);
        }
      });

      const configRef = doc(db, CONFIG_COLLECTION, safeString(versionName));
      batch.delete(configRef);

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, COLLECTION_NAME);
      throw error;
    }
  },

  async renameVersion(oldName: string, newName: string): Promise<void> {
    try {
      const snapshot = await getDocs(collection(db, COLLECTION_NAME));
      const batch = writeBatch(db);

      snapshot.forEach(document => {
        const data = document.data();

        if (data.versionName === oldName) {
          const newId = generateScheduleId({
            ...data,
            versionName: newName
          } as Schedule);

          const newRef = doc(db, COLLECTION_NAME, newId);

          batch.set(newRef, { ...data, versionName: newName });
          batch.delete(document.ref);
        }
      });

      const oldConfigRef = doc(db, CONFIG_COLLECTION, safeString(oldName));
      const newConfigRef = doc(db, CONFIG_COLLECTION, safeString(newName));

      const configs = await this.getVersionConfigs();
      const oldConfig = configs.find(c => c.versionName === oldName);

      if (oldConfig) {
        batch.set(newConfigRef, { ...oldConfig, versionName: newName });
        batch.delete(oldConfigRef);
      }

      await batch.commit();
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
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, COLLECTION_NAME);
    }
  }
};
