const DATABASE = 'motorrad-atlas';
const STORE = 'fahrtenbuch';

export function openJournal() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function readJournal(db) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get('journal');
    request.onsuccess = () => resolve(request.result ?? { rides: [], draft: null });
    request.onerror = () => reject(request.error);
  });
}

export function writeJournal(db, journal) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.objectStore(STORE).put(journal, 'journal');
  });
}
