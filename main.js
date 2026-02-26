import * as THREE from 'three';
import { Allang } from './Allang.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ─── API Key: localStorage > .env fallback ───
function getApiKey() {
    return localStorage.getItem('allang_api_key') || import.meta.env.VITE_GEMINI_API_KEY || '';
}

function createModel(apiKey) {
    if (!apiKey) return null;
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({
        model: "gemini-flash-latest",
        systemInstruction: SYSTEM_PROMPT
    });
}

const SYSTEM_PROMPT = `
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

반드시 JSON 외에 다른 설명은 하지 마세요.
`;

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

        // API setup
        this.apiKey = getApiKey();
        this.model = createModel(this.apiKey);
        this.chat = this.model ? this.model.startChat() : null;

        // Raycaster for petting
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.initResize();
        this.initChat();
        this.initPetting();
        this.initSettings();
        this.animate();
    }

    // ─── Settings Modal ───
    initSettings() {
        const modal = document.querySelector('#settings-modal');
        const openBtn = document.querySelector('#settings-btn');
        const closeBtn = document.querySelector('#settings-close-btn');
        const saveBtn = document.querySelector('#settings-save-btn');
        const input = document.querySelector('#api-key-input');
        const status = document.querySelector('#api-status');

        const updateStatus = () => {
            if (this.apiKey) {
                status.textContent = `✅ API 키 설정됨 (${this.apiKey.slice(0, 8)}...)`;
                status.className = 'api-status connected';
            } else {
                status.textContent = '❌ API 키가 없습니다. 설정해 주세요.';
                status.className = 'api-status disconnected';
            }
        };

        openBtn.addEventListener('click', () => {
            input.value = localStorage.getItem('allang_api_key') || '';
            updateStatus();
            modal.style.display = 'flex';
        });

        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });

        saveBtn.addEventListener('click', () => {
            const newKey = input.value.trim();
            if (newKey) {
                localStorage.setItem('allang_api_key', newKey);
                this.apiKey = newKey;
                this.model = createModel(newKey);
                this.chat = this.model.startChat();
                status.textContent = '✅ 저장 완료! API 키가 적용되었습니다.';
                status.className = 'api-status connected';
            } else {
                localStorage.removeItem('allang_api_key');
                this.apiKey = getApiKey(); // fall back to .env
                this.model = createModel(this.apiKey);
                this.chat = this.model ? this.model.startChat() : null;
                updateStatus();
            }
        });

        // Show warning if no API key at startup
        if (!this.apiKey) {
            setTimeout(() => {
                modal.style.display = 'flex';
                updateStatus();
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

            this.addMessage(text, 'user');
            input.value = '';

            if (!this.chat) {
                this.addMessage("⚙️ API 키를 먼저 설정해 주세요! (우측 상단 ⚙️ 버튼)", 'bot');
                return;
            }

            try {
                const result = await this.chat.sendMessage(text);
                const responseText = result.response.text();
                const cleanJson = responseText.replace(/```json|```/g, '').trim();
                const data = JSON.parse(cleanJson);

                this.addMessage(data.message, 'bot');
                this.allang.applyPreset(data.action, data.color_hex);
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
        this.allang.update(time);
        this.renderer.render(this.scene, this.camera);
    }
}

new App();
