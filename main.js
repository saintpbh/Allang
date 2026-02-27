import * as THREE from 'three';
import { Allang } from './Allang.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { MemoryManager } from './MemoryManager.js';
import { LocationManager } from './LocationManager.js';
import { VisionManager } from './VisionManager.js';

// ─── API Key: localStorage > .env fallback ───
function getApiKey() {
    return localStorage.getItem('allang_api_key') || import.meta.env.VITE_GEMINI_API_KEY || '';
}

// ─── Base System Prompt (memory context appended dynamically) ───
const BASE_SYSTEM_PROMPT = `
당신은 윈도우용 AI 친구 '알랑'의 두뇌입니다. 사용자의 입력을 분석하여 다음 JSON 형식으로만 응답하세요.
JSON 응답 구조:
{ "action": "명령어", "color_hex": "#색상코드", "message": "알랑의 대사" }

"action" 필드엔 다음 규격의 명령어를 넣으세요: {감정}_{행동}_{강도}_{지속시간}
1. 감정 (Emotion): 기쁨, 슬픔, 놀람, 화남, 궁금함, 평온, 피곤 
2. 행동 (Action): 기본, 인사, 흔들림, 회전, 응시, 움츠림, 확장, 속삭임, 하품, 떨림
3. 강도 (Intensity): 약, 중, 강
4. 지속시간 (Duration): 짧게, 보통, 길게

동작 프리셋 예시:
- 평온한 부유: 평온_기본_약_길게
- 반가운 흔들림: 기쁨_흔들림_중_보통
- 궁금한 응시: 궁금함_응시_중_보통
- 놀란 확장: 놀람_확장_강_짧게
- 슬픈 움츠림: 슬픔_움츠림_중_길게
- 피곤한 하품: 피곤_하품_약_길게
- 신나는 회전: 기쁨_회전_강_짧게
- 화난 떨림: 화남_떨림_강_보통
- 인사하기: 기쁨_인사_중_짧게
- 조용히 속삭임: 평온_속삭임_약_보통

중요: 기억 컨텍스트가 주어지면 사용자의 이름을 부르고, 과거 대화를 자연스럽게 참조하세요.
반드시 JSON 외에 다른 설명은 하지 마세요.
`;

// ─── Memory Classifier Prompt ───
const CLASSIFIER_SYSTEM = `당신은 대화 내용에서 기억할 정보를 추출하는 분류기입니다. JSON 배열만 출력하세요.`;

class App {
    constructor() {
        this.canvas = document.querySelector('#allang-canvas');
        this.scene = new THREE.Scene();

        this.width = window.innerWidth;
        this.height = window.innerHeight;

        this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 0.1, 1000);
        this.camera.position.z = 4;

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        this.allang = new Allang(this.scene);
        this.clock = new THREE.Clock();

        // Memory system
        this.memory = new MemoryManager();
        this.locationMgr = new LocationManager();
        this.visionMgr = new VisionManager(this.allang);

        // API setup
        this.apiKey = getApiKey();
        this._initModels();
        this._initAwareness();

        this._lastUserActive = 0; // Time of last user message

        // Raycaster for petting
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.initResize();
        this.initChat();
        this.initPetting();
        this.initSettings();
        this.animate();
    }

    // ─── Create Models with Memory Context ───
    _initModels() {
        if (!this.apiKey) {
            this.chat = null;
            this.classifierChat = null;
            return;
        }
        const genAI = new GoogleGenerativeAI(this.apiKey);

        // Main conversation model
        this.mainModel = genAI.getGenerativeModel({
            model: "gemini-flash-latest",
            systemInstruction: BASE_SYSTEM_PROMPT
        });
        this.chat = this.mainModel.startChat();

        // Classifier model (lightweight, separate session)
        this.classifierModel = genAI.getGenerativeModel({
            model: "gemini-flash-latest",
            systemInstruction: CLASSIFIER_SYSTEM
        });
        this.classifierChat = this.classifierModel.startChat();
    }

    async _initAwareness() {
        const locEnabled = localStorage.getItem('allang_loc_enabled') === 'true';
        const visEnabled = localStorage.getItem('allang_vis_enabled') === 'true';

        if (locEnabled) await this.locationMgr.init();
        if (visEnabled) await this.visionMgr.start();
    }

    // ─── Settings Modal ───
    initSettings() {
        const modal = document.querySelector('#settings-modal');
        const openBtn = document.querySelector('#settings-btn');
        const closeBtn = document.querySelector('#settings-close-btn');
        const saveBtn = document.querySelector('#settings-save-btn');
        const apiInput = document.querySelector('#api-key-input');
        const status = document.querySelector('#api-status');

        // Profile inputs
        const nameInput = document.querySelector('#profile-name');
        const birthdayInput = document.querySelector('#profile-birthday');
        const likesInput = document.querySelector('#profile-likes');
        const dislikesInput = document.querySelector('#profile-dislikes');
        const resetMemBtn = document.querySelector('#reset-memory-btn');

        // Toggles
        const locToggle = document.querySelector('#toggle-location');
        const visToggle = document.querySelector('#toggle-vision');

        const updateStatus = () => {
            if (this.apiKey) {
                status.textContent = `✅ API 키 설정됨 (${this.apiKey.slice(0, 8)}...)`;
                status.className = 'api-status connected';
            } else {
                status.textContent = '❌ API 키가 없습니다. 설정해 주세요.';
                status.className = 'api-status disconnected';
            }
        };

        const loadProfile = () => {
            const p = this.memory.getProfile();
            if (nameInput) nameInput.value = p.name || '';
            if (birthdayInput) birthdayInput.value = p.birthday || '';
            if (likesInput) likesInput.value = (p.likes || []).join(', ');
            if (dislikesInput) dislikesInput.value = (p.dislikes || []).join(', ');

            if (locToggle) locToggle.checked = localStorage.getItem('allang_loc_enabled') === 'true';
            if (visToggle) visToggle.checked = localStorage.getItem('allang_vis_enabled') === 'true';
        };

        openBtn.addEventListener('click', () => {
            apiInput.value = localStorage.getItem('allang_api_key') || '';
            updateStatus();
            loadProfile();
            modal.style.display = 'flex';
        });

        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });

        saveBtn.addEventListener('click', () => {
            // Save API key
            const newKey = apiInput.value.trim();
            if (newKey) {
                localStorage.setItem('allang_api_key', newKey);
                this.apiKey = newKey;
                this._initModels();
                status.textContent = '✅ 저장 완료!';
                status.className = 'api-status connected';
            } else {
                localStorage.removeItem('allang_api_key');
                this.apiKey = getApiKey();
                this._initModels();
                updateStatus();
            }

            // Save profile
            const profile = this.memory.getProfile();
            if (nameInput) profile.name = nameInput.value.trim() || null;
            if (birthdayInput) profile.birthday = birthdayInput.value.trim() || null;
            if (likesInput) {
                profile.likes = likesInput.value.split(',').map(s => s.trim()).filter(Boolean);
            }
            if (dislikesInput) {
                profile.dislikes = dislikesInput.value.split(',').map(s => s.trim()).filter(Boolean);
            }
            this.memory.saveProfile(profile);

            // Save permissions
            const locWas = localStorage.getItem('allang_loc_enabled') === 'true';
            const visWas = localStorage.getItem('allang_vis_enabled') === 'true';

            localStorage.setItem('allang_loc_enabled', locToggle.checked);
            localStorage.setItem('allang_vis_enabled', visToggle.checked);

            // Apply immediately if changed
            if (locToggle.checked && !locWas) this.locationMgr.init();
            if (visToggle.checked && !visWas) this.visionMgr.start();
            else if (!visToggle.checked && visWas) this.visionMgr.stop();
        });

        // Reset memory button
        if (resetMemBtn) {
            resetMemBtn.addEventListener('click', async () => {
                if (confirm('모든 기억을 초기화할까요? (프로필 + 에피소드)')) {
                    localStorage.removeItem('allang_user_profile');
                    await this.memory.clearAllEpisodes();
                    loadProfile();
                    status.textContent = '🗑️ 기억이 초기화되었습니다.';
                }
            });
        }

        // Show warning if no API key at startup
        if (!this.apiKey) {
            setTimeout(() => {
                modal.style.display = 'flex';
                updateStatus();
                loadProfile();
            }, 1000);
        }
    }

    // ─── Petting (Drag on Jelly) ───
    initPetting() {
        const canvas = this.canvas;
        let isPetting = false;

        const getNDC = (clientX, clientY) => {
            const rect = canvas.getBoundingClientRect();
            return new THREE.Vector2(
                ((clientX - rect.left) / rect.width) * 2 - 1,
                -((clientY - rect.top) / rect.height) * 2 + 1
            );
        };

        const tryPetStart = (x, y) => {
            this.mouse = getNDC(x, y);
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const hits = this.raycaster.intersectObject(this.allang.body);
            if (hits.length > 0) {
                isPetting = true;
                this.allang.startPet();
                const local = this.allang.body.worldToLocal(hits[0].point.clone());
                this.allang.updatePet(local);
            }
        };

        const tryPetMove = (x, y) => {
            if (!isPetting) return;
            this.mouse = getNDC(x, y);
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const hits = this.raycaster.intersectObject(this.allang.body);
            if (hits.length > 0) {
                const local = this.allang.body.worldToLocal(hits[0].point.clone());
                this.allang.updatePet(local);
            }
        };

        const petEnd = () => {
            if (isPetting) {
                isPetting = false;
                this.allang.endPet();
            }
        };

        canvas.addEventListener('mousedown', (e) => tryPetStart(e.clientX, e.clientY));
        canvas.addEventListener('mousemove', (e) => tryPetMove(e.clientX, e.clientY));
        canvas.addEventListener('mouseup', petEnd);
        canvas.addEventListener('mouseleave', petEnd);

        canvas.addEventListener('touchstart', (e) => {
            const t = e.touches[0];
            tryPetStart(t.clientX, t.clientY);
        }, { passive: true });
        canvas.addEventListener('touchmove', (e) => {
            const t = e.touches[0];
            tryPetMove(t.clientX, t.clientY);
        }, { passive: true });
        canvas.addEventListener('touchend', petEnd);
    }

    initResize() {
        window.addEventListener('resize', () => {
            this.width = window.innerWidth;
            this.height = window.innerHeight;

            this.camera.aspect = this.width / this.height;
            this.camera.updateProjectionMatrix();

            this.renderer.setSize(this.width, this.height);
        });
    }

    initChat() {
        const input = document.querySelector('#chat-input');
        const sendBtn = document.querySelector('#send-btn');

        const sendMessage = async () => {
            const text = input.value.trim();
            if (!text) return;

            this._lastUserActive = this.clock.getElapsedTime();
            if (this.allang.currentExpression === 'tired') {
                this.allang.drawFace('default');
            }

            this.addMessage(text, 'user');
            input.value = '';

            if (!this.chat) {
                this.addMessage("⚙️ API 키를 먼저 설정해 주세요! (우측 상단 ⚙️ 버튼)", 'bot');
                return;
            }

            try {
                // Build memory and environment context
                const memCtx = await this.memory.buildMemoryContext();
                const envCtx = this.locationMgr.getContextString();

                // Trigger visual recall effect if there's significant memory context
                if (memCtx && memCtx.length > 50) {
                    this.allang.triggerRecallEffect(1.5);
                }

                const augmentedMessage = `${memCtx}\n${envCtx}\n\n[사용자 메시지]\n${text}`;

                const result = await this.chat.sendMessage(augmentedMessage);
                const responseText = result.response.text();
                const cleanJson = responseText.replace(/```json|```/g, '').trim();
                const data = JSON.parse(cleanJson);

                this.addMessage(data.message, 'bot');
                this.allang.applyPreset(data.action, data.color_hex);

                // Classify and store memories (async, non-blocking)
                this.memory.classifyAndStore(text, data.message, this.classifierChat)
                    .catch(err => console.warn('Memory save failed:', err));

            } catch (error) {
                console.error("Gemini API Error:", error);
                this.addMessage("앗, 잠시 알랑이 생각에 잠겼어요. 다시 말씀해 주실래요?", 'bot');
            }
        };

        sendBtn.addEventListener('click', sendMessage);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }

    addMessage(text, type) {
        const messagesCont = document.querySelector('#chat-messages');
        const div = document.createElement('div');
        div.className = `message ${type}`;
        div.textContent = text;
        messagesCont.appendChild(div);
        messagesCont.scrollTop = messagesCont.scrollHeight;
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));
        const time = this.clock.getElapsedTime();

        // Update weather periodically (every 30 mins)
        if (Math.floor(time) % 1800 === 0 && Math.floor(time) !== 0) {
            this.locationMgr.updateWeather();
        }

        if (this.visionMgr) this.visionMgr.update(time);

        // Boredom check: If user hasn't talked for 2 mins (120s)
        if (time - this._lastUserActive > 120 && this.allang.currentExpression === 'default') {
            this.allang.drawFace('tired');
        }

        this.allang.update(time);
        this.renderer.render(this.scene, this.camera);
    }
}

new App();
