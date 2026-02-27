// ─── MemoryManager: 3-Tier Hierarchical Memory System ───
// Long-term  → localStorage (permanent user profile)
// Mid-term   → IndexedDB    (episodic memories, 7-day TTL)
// Short-term → Gemini chat  (session context, handled externally)

const DB_NAME = 'allang_memory';
const DB_VERSION = 1;
const STORE_NAME = 'episodes';
const PROFILE_KEY = 'allang_user_profile';
const MAX_EPISODE_AGE_DAYS = 7;

// ─── Default Profile ───
const DEFAULT_PROFILE = {
    name: null,
    birthday: null,
    likes: [],
    dislikes: [],
    values: [],
    relationships: [],
    office_location: null,
    home_location: null,
    memo: ''
};

export class MemoryManager {
    constructor() {
        this.db = null;
        this._initDB();
    }

    // ════════════════════════════════════
    //  IndexedDB Initialization
    // ════════════════════════════════════
    _initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('date', 'date', { unique: false });
                }
            };
            request.onsuccess = (e) => {
                this.db = e.target.result;
                this.pruneOldEpisodes(); // clean up on init
                resolve(this.db);
            };
            request.onerror = (e) => {
                console.warn('IndexedDB failed, mid-term memory disabled:', e);
                reject(e);
            };
        });
    }

    async _getDB() {
        if (this.db) return this.db;
        return this._initDB();
    }

    // ════════════════════════════════════
    //  LONG-TERM MEMORY (localStorage)
    // ════════════════════════════════════
    getProfile() {
        try {
            const stored = localStorage.getItem(PROFILE_KEY);
            return stored ? { ...DEFAULT_PROFILE, ...JSON.parse(stored) } : { ...DEFAULT_PROFILE };
        } catch {
            return { ...DEFAULT_PROFILE };
        }
    }

    saveProfile(profile) {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    }

    updateProfile(key, value) {
        const profile = this.getProfile();
        if (Array.isArray(profile[key]) && !Array.isArray(value)) {
            // Append to array if not already present
            if (!profile[key].includes(value)) {
                profile[key].push(value);
            }
        } else {
            profile[key] = value;
        }
        this.saveProfile(profile);
        return profile;
    }

    removeFromProfile(key, value) {
        const profile = this.getProfile();
        if (Array.isArray(profile[key])) {
            profile[key] = profile[key].filter(v => v !== value);
        } else {
            profile[key] = DEFAULT_PROFILE[key];
        }
        this.saveProfile(profile);
        return profile;
    }

    // ════════════════════════════════════
    //  MID-TERM MEMORY (IndexedDB)
    // ════════════════════════════════════
    async saveEpisode(summary, emotion = '평온', priority = 3) {
        const db = await this._getDB();
        const today = new Date().toISOString().split('T')[0];
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).add({
                date: today,
                summary,
                emotion,
                priority,
                timestamp: Date.now()
            });
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e);
        });
    }

    async getRecentEpisodes(days = 3) {
        const db = await this._getDB();
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const cutoffStr = cutoff.toISOString().split('T')[0];

        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const results = [];

            store.openCursor().onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    if (cursor.value.date >= cutoffStr) {
                        results.push(cursor.value);
                    }
                    cursor.continue();
                } else {
                    // Sort by timestamp descending, limit to 20
                    results.sort((a, b) => b.timestamp - a.timestamp);
                    resolve(results.slice(0, 20));
                }
            };
        });
    }

    async pruneOldEpisodes() {
        const db = await this._getDB();
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - MAX_EPISODE_AGE_DAYS);
        const cutoffStr = cutoff.toISOString().split('T')[0];

        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.openCursor().onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    if (cursor.value.date < cutoffStr) {
                        cursor.delete();
                    }
                    cursor.continue();
                } else {
                    resolve();
                }
            };
        });
    }

    async clearAllEpisodes() {
        const db = await this._getDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).clear();
            tx.oncomplete = () => resolve();
        });
    }

    // ════════════════════════════════════
    //  MEMORY CLASSIFICATION (via Gemini)
    // ════════════════════════════════════
    async classifyAndStore(userMessage, aiResponse, classifierChat) {
        if (!classifierChat) return;

        const classifyPrompt = `다음 대화를 분석하여 기억으로 저장할 정보를 JSON 배열로 추출하세요.

사용자: "${userMessage}"
AI 응답: "${aiResponse}"

규칙:
- long-term: 변하지 않는 핵심 정보 (이름, 생일, 취향, 가치관, 관계, home_location, office_location)
- mid-term: 며칠간 유효한 활동/상태 (여행, 프로젝트, 기분 상태)
- skip: 저장할 필요 없는 일상적 대화

출력 형식 (JSON 배열만, 설명 없이):
[{ "category": "long-term|mid-term|skip", "key": "필드명", "value": "값", "priority": 1-5 }]

저장할 것이 없으면 빈 배열 [] 을 출력하세요.`;

        try {
            const result = await classifierChat.sendMessage(classifyPrompt);
            const text = result.response.text().replace(/```json|```/g, '').trim();
            const memories = JSON.parse(text);

            if (!Array.isArray(memories)) return;

            for (const mem of memories) {
                if (mem.category === 'long-term' && mem.key && mem.value) {
                    this.updateProfile(mem.key, mem.value);
                } else if (mem.category === 'mid-term' && mem.value) {
                    await this.saveEpisode(mem.value, mem.key || '기타', mem.priority || 3);
                }
            }
        } catch (err) {
            console.warn('Memory classification failed (non-critical):', err);
        }
    }

    // ════════════════════════════════════
    //  CONTEXT BUILDER (for System Prompt)
    // ════════════════════════════════════
    async buildMemoryContext() {
        const profile = this.getProfile();
        const episodes = await this.getRecentEpisodes(3);

        let context = '\n[기억 컨텍스트]\n';

        // Long-term
        if (profile.name) context += `- 사용자 이름: ${profile.name}\n`;
        if (profile.birthday) context += `- 생일: ${profile.birthday}\n`;
        if (profile.likes.length > 0) context += `- 좋아하는 것: ${profile.likes.join(', ')}\n`;
        if (profile.dislikes.length > 0) context += `- 싫어하는 것: ${profile.dislikes.join(', ')}\n`;
        if (profile.values.length > 0) context += `- 가치관/성격: ${profile.values.join(', ')}\n`;
        if (profile.relationships.length > 0) context += `- 관계: ${profile.relationships.join(', ')}\n`;
        if (profile.office_location) context += `- 주 업무지: ${profile.office_location}\n`;
        if (profile.home_location) context += `- 거주지: ${profile.home_location}\n`;
        if (profile.memo) context += `- 메모: ${profile.memo}\n`;

        // Mid-term
        if (episodes.length > 0) {
            context += '- 최근 대화 기억:\n';
            episodes.forEach(ep => {
                context += `  · [${ep.date}] ${ep.summary}\n`;
            });
        }

        // Return empty string if no memories
        const hasMemories = profile.name || profile.likes.length > 0 ||
            profile.dislikes.length > 0 || episodes.length > 0;

        return hasMemories ? context : '';
    }
}
