/* =============================================
   FIREBASE MODULE
   Configuration | Connection Monitoring | Retry Logic
   ============================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getAnalytics, isSupported as isAnalyticsSupported } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-analytics.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  collection,
  addDoc,
  getDocs,
  getDocsFromCache,
  getDocsFromServer,
  deleteDoc,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

/* =============================================
   FIREBASE CONFIGURATION
   ============================================= */
const firebaseConfig = {
  apiKey: "AIzaSyA9oWHSGNCs2TwVrjoJHDMtk0uTgyMoRcY",
  authDomain: "dpr-management.firebaseapp.com",
  projectId: "dpr-management",
  storageBucket: "dpr-management.firebasestorage.app",
  messagingSenderId: "991742304564",
  appId: "1:991742304564:web:1d3e64cf3330c4e3934561",
  measurementId: "G-18V93Z02CR"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);

// Firestore with offline persistence (multi-tab safe). Falls back to
// in-memory cache if IndexedDB is unavailable (e.g. private browsing).
let db;
try {
  db = initializeFirestore(firebaseApp, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
} catch (e) {
  console.warn('Persistent cache unavailable, using in-memory cache:', e);
  db = initializeFirestore(firebaseApp, { localCache: memoryLocalCache() });
}

// Optional analytics — only initialised where the environment supports it,
// so it can never break the app (file://, no cookies, etc.).
let analytics = null;
isAnalyticsSupported()
  .then((ok) => { if (ok) { try { analytics = getAnalytics(firebaseApp); } catch (_) {} } })
  .catch(() => {});

/* =============================================
   COLLECTION NAMES
   ============================================= */
const COLLECTIONS = {
  DPR: "dprEntries",
  ENGINEERS: "engineers",
  USERS: "users",
  FIELD_DEFS: "fieldDefinitions",
  PACKAGES: "packages",
  ZONES: "zones",
  DMAS: "dmas",
  CONTRACTORS: "contractors",
  SETTINGS: "settings"
};

/* =============================================
   CONNECTION MONITORING
   ============================================= */
let isOnline = navigator.onLine;
let connectionListeners = [];

function notifyConnectionChange(status) {
  isOnline = status;
  const badge = document.getElementById('connection-status');
  if (badge) {
    badge.className = 'connection-badge ' + (status ? 'online' : 'offline');
    badge.innerHTML = status
      ? '<i class="fa-solid fa-wifi"></i> <span>Connected</span>'
      : '<i class="fa-solid fa-wifi-slash"></i> <span>Offline</span>';
  }
  connectionListeners.forEach(cb => cb(status));
}

window.addEventListener('online', () => notifyConnectionChange(true));
window.addEventListener('offline', () => notifyConnectionChange(false));

/* =============================================
   RETRY UTILITY
   ============================================= */
async function withRetry(operation, options = {}) {
  const maxRetries = options.maxRetries || 3;
  const delayMs = options.delayMs || 1000;
  const backoff = options.backoff || 2;

  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      const isNetworkError = err?.code?.includes('network') ||
                             err?.code === 'unavailable' ||
                             err?.message?.toLowerCase().includes('network');
      if (!isNetworkError) throw err;
      if (attempt < maxRetries - 1) {
        const waitTime = delayMs * Math.pow(backoff, attempt);
        await new Promise(r => setTimeout(r, waitTime));
      }
    }
  }
  throw lastError;
}

/* =============================================
   DATA SERVICE WITH RETRY
   ============================================= */
const DataService = {
  /* ---- Connection Status ---- */
  isOnline() { return isOnline; },
  onConnectionChange(cb) { connectionListeners.push(cb); },

  /* ---- Generic CRUD ---- */
  async getAll(collectionName, options = {}) {
    return withRetry(async () => {
      let qref = collection(db, collectionName);
      const cons = [];
      if (options.orderBy) cons.push(orderBy(options.orderBy, options.orderDir || 'asc'));
      if (options.limit) cons.push(limit(options.limit));
      if (cons.length) qref = query(qref, ...cons);
      const snap = await getDocs(qref);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    });
  },

  /* Cache-first read: returns locally-cached docs instantly (fast restart),
     then fetches fresh docs from the server in the background and hands them
     to onFresh(). If there's no cache yet (first ever load), it waits for the
     server so the first load still works. */
  async getAllFast(collectionName, options = {}, onFresh = null) {
    let qref = collection(db, collectionName);
    const cons = [];
    if (options.orderBy) cons.push(orderBy(options.orderBy, options.orderDir || 'asc'));
    if (options.limit) cons.push(limit(options.limit));
    if (cons.length) qref = query(qref, ...cons);

    let cached = [];
    try {
      const cacheSnap = await getDocsFromCache(qref);
      cached = cacheSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) { /* no cache available */ }

    const serverPromise = getDocsFromServer(qref)
      .then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })))
      .catch(() => null);

    if (cached.length > 0) {
      // hand back cached immediately; refresh the view when the server responds
      if (onFresh) {
        serverPromise.then(fresh => { if (fresh) onFresh(fresh); });
      }
      return cached;
    }
    // no cache -> wait for the server this once
    const fresh = await serverPromise;
    return fresh || [];
  },


  async query(collectionName, conditions = [], orderByField = null) {
    return withRetry(async () => {
      let qref = collection(db, collectionName);
      const constraints = [];
      conditions.forEach(c => {
        constraints.push(where(c.field, c.op, c.value));
      });
      if (orderByField) {
        constraints.push(orderBy(orderByField, 'desc'));
      }
      if (constraints.length > 0) {
        qref = query(qref, ...constraints);
      }
      const snap = await getDocs(qref);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    });
  },

  async getById(collectionName, id) {
    return withRetry(async () => {
      const snap = await getDoc(doc(db, collectionName, id));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() };
    });
  },

  async add(collectionName, data) {
    return withRetry(async () => {
      const payload = {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      return await addDoc(collection(db, collectionName), payload);
    });
  },

  async set(collectionName, id, data) {
    return withRetry(async () => {
      const payload = {
        ...data,
        updatedAt: serverTimestamp()
      };
      await setDoc(doc(db, collectionName, id), payload, { merge: true });
      return { id };
    });
  },

  async update(collectionName, id, data) {
    return withRetry(async () => {
      const payload = {
        ...data,
        updatedAt: serverTimestamp()
      };
      await updateDoc(doc(db, collectionName, id), payload);
    });
  },

  async delete(collectionName, id) {
    return withRetry(async () => {
      await deleteDoc(doc(db, collectionName, id));
    });
  },

  /* ---- Real-time Listeners ---- */
  onCollectionChange(collectionName, callback, options = {}) {
    let qref = collection(db, collectionName);
    if (options.orderBy) {
      qref = query(qref, orderBy(options.orderBy));
    }
    return onSnapshot(qref, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(data);
    }, (err) => {
      console.error(`Snapshot error for ${collectionName}:`, err);
    });
  },

  /* ---- Load Multiple Collections ---- */
  async loadMultiple(requests) {
    const results = {};
    const promises = requests.map(async ({ key, collectionName, options }) => {
      results[key] = await this.getAll(collectionName, options);
    });
    await Promise.all(promises);
    return results;
  }
};

/* =============================================
   OFFLINE PERSISTENCE
   Configured at initialization above via persistentLocalCache.
   ============================================= */

/* =============================================
   MASTER DATA
   ============================================= */
const MASTER_DATA = [
  {"p":1,"zn":3,"z":"Dhalli","d":3},{"p":1,"zn":3,"z":"Dhalli","d":2},
  {"p":1,"zn":3,"z":"Dhalli","d":1},{"p":1,"zn":2,"z":"Mashobra","d":2},
  {"p":1,"zn":2,"z":"Mashobra","d":1},{"p":1,"zn":1,"z":"Craignano","d":1},
  {"p":10,"zn":49,"z":"Bhimakali Temple","d":3},{"p":10,"zn":49,"z":"Bhimakali Temple","d":2},
  {"p":10,"zn":49,"z":"Bhimakali Temple","d":1},{"p":10,"zn":48,"z":"Baluganj Hari Nagar-NEW Tank","d":2},
  {"p":10,"zn":48,"z":"Baluganj Hari Nagar-NEW Tank","d":1},{"p":10,"zn":52,"z":"Summer Hill Bazar-New Tank","d":1},
  {"p":10,"zn":51,"z":"Kamnadevi Temple","d":1},{"p":10,"zn":41,"z":"Chakkar/Sandal","d":1},
  {"p":10,"zn":47,"z":"Adv Study Steel","d":1},{"p":10,"zn":50,"z":"IIA Summerhill","d":1},
  {"p":10,"zn":42,"z":"Kamna Devi-New Tank","d":1},{"p":2,"zn":8,"z":"Sanjauli Tank","d":2},
  {"p":2,"zn":8,"z":"Sanjauli Tank","d":1},{"p":2,"zn":7,"z":"Dhingodevi-4-NEW Tank","d":1},
  {"p":2,"zn":12,"z":"North Oak-1-New Tank","d":1},{"p":2,"zn":5,"z":"Dhingodevi_2","d":1},
  {"p":2,"zn":4,"z":"Dhingodevi_1","d":1},{"p":2,"zn":6,"z":"Dhingodevi_3","d":1},
  {"p":3,"zn":53,"z":"Tapping Point Near Navbahar Chauk","d":1},{"p":3,"zn":11,"z":"Navbahar-New Tank","d":1},
  {"p":3,"zn":9,"z":"Jakhu Tank","d":1},{"p":3,"zn":10,"z":"Jakhu-Tank (UC)","d":2},
  {"p":3,"zn":10,"z":"Jakhu-Tank (UC)","d":1},{"p":4,"zn":16,"z":"Tara Hall-New Tank","d":2},
  {"p":4,"zn":15,"z":"Kelestone1-OHT","d":1},{"p":4,"zn":14,"z":"Kelston-2/Bharari","d":1},
  {"p":4,"zn":13,"z":"Tapping Point Near Ridge","d":1},{"p":4,"zn":16,"z":"Tara Hall-New Tank","d":1},
  {"p":4,"zn":13,"z":"Tapping Point Near Ridge","d":3},{"p":4,"zn":13,"z":"Tapping Point Near Ridge","d":2},
  {"p":5,"zn":22,"z":"Panthaghati-New Tank","d":2},{"p":5,"zn":18,"z":"IAS Colony-2-New Tank","d":1},
  {"p":5,"zn":22,"z":"Panthaghati-New Tank","d":1},{"p":5,"zn":17,"z":"Vasant Vihar-New Tank","d":1},
  {"p":5,"zn":20,"z":"Kasumpti-New Tank","d":1},{"p":5,"zn":20,"z":"Kasumpti-New Tank","d":2},
  {"p":5,"zn":21,"z":"HP PWD-OHT","d":1},{"p":5,"zn":23,"z":"Vasant Vihar-1","d":1},
  {"p":6,"zn":24,"z":"Vidhan Sabha-New Tank","d":1},{"p":6,"zn":25,"z":"Shanti Vihar","d":1},
  {"p":6,"zn":24,"z":"Vidhan Sabha-New Tank","d":2},{"p":6,"zn":27,"z":"Ark-New Tank","d":1},
  {"p":6,"zn":27,"z":"Ark-New Tank","d":2},{"p":6,"zn":26,"z":"Chotta-1,2,3-New Tank","d":1},
  {"p":7,"zn":29,"z":"Lichu-Krishna Nagar","d":1},{"p":7,"zn":30,"z":"HIMLAND-BCS","d":1},
  {"p":7,"zn":30,"z":"HIMLAND-BCS","d":2},{"p":7,"zn":28,"z":"Shimla East-Nabha","d":1},
  {"p":7,"zn":28,"z":"Shimla East-Nabha","d":2},{"p":7,"zn":31,"z":"Lichu-New Tank","d":1},
  {"p":7,"zn":29,"z":"Lichu-Krishna Nagar","d":2},{"p":8,"zn":33,"z":"Boileauganj-1,2,3","d":1},
  {"p":8,"zn":34,"z":"Kashyap-Nagar","d":1},{"p":8,"zn":34,"z":"Kashyap-Nagar","d":2},
  {"p":8,"zn":32,"z":"New Shivalik-1,2","d":1},{"p":8,"zn":33,"z":"Boileauganj-1,2,3","d":2},
  {"p":8,"zn":32,"z":"New Shivalik-1,2","d":2},{"p":9,"zn":37,"z":"Mehli-Gumma","d":1},
  {"p":9,"zn":36,"z":"Gumma-Knolls","d":1},{"p":9,"zn":37,"z":"Mehli-Gumma","d":2},
  {"p":9,"zn":35,"z":"Kashyap-Nagar","d":1},{"p":9,"zn":38,"z":"Upper Kalyan-New Tank","d":1},
  {"p":9,"zn":38,"z":"Upper Kalyan-New Tank","d":2},{"p":9,"zn":36,"z":"Gumma-Knolls","d":2},
  {"p":10,"zn":40,"z":"Panthaghati UC","d":1},{"p":10,"zn":43,"z":"Baluganj UC","d":1},
  {"p":10,"zn":44,"z":"VikasNagar UC","d":1},{"p":10,"zn":39,"z":"Lower Kalyan UC","d":1},
  {"p":10,"zn":45,"z":"Craignano UC","d":1},{"p":10,"zn":46,"z":"Panthaghati-2 UC","d":1}
];

const PIPE_DIAMETERS = [15,20,25,32,40,50,63,75,80,90,100,110,125,140,150,160,180,200,225,250,280,300,315,350,400,450,500,600];
const CONTRACTORS = ["SAI","Rohit","Kulbhushan","Khajan Singh","Jarnail Singh","RK","Shabdbhaid","Brij","Roshan","Chandresh","Mahindar","Ajay Thakur","Sandeep","Surendar Hansreta"];

/* =============================================
   EXPORTS
   ============================================= */
export {
  firebaseApp,
  auth,
  db,
  analytics,
  onAuthStateChanged,
  signOut,
  COLLECTIONS,
  DataService,
  MASTER_DATA,
  PIPE_DIAMETERS,
  CONTRACTORS
};
