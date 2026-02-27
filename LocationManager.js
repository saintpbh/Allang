// ─── Environment Awareness Manager (Location & IP) ───
export class LocationManager {
    constructor() {
        this.location = null; // { city, country, lat, lon }
        this.ip = null;
        this.weather = null;
    }

    async init() {
        try {
            // 1. IP Detection
            const ipData = await fetch('https://ipapi.co/json/').then(res => res.json());
            this.ip = ipData.ip;
            this.location = {
                city: ipData.city,
                country: ipData.country_name,
                lat: ipData.latitude,
                lon: ipData.longitude,
                region: ipData.region
            };

            // 2. Fetch Weather based on IP location
            await this.updateWeather();
        } catch (err) {
            console.warn('IP-based location detection failed:', err);
        }
    }

    async updateWeather() {
        if (!this.location) return;
        try {
            const { lat, lon } = this.location;
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
            const data = await fetch(url).then(res => res.json());
            if (data.current_weather) {
                this.weather = {
                    temp: data.current_weather.temperature,
                    code: data.current_weather.weathercode,
                    isDay: data.current_weather.is_day
                };
            }
        } catch (err) {
            console.warn('Weather fetch failed:', err);
        }
    }

    _getWeatherDesc(code) {
        // Simple mapping for Open-Meteo codes
        if (code === 0) return '맑음';
        if (code <= 3) return '구름 조금';
        if (code <= 48) return '안개';
        if (code <= 67) return '비/이슬비';
        if (code <= 77) return '눈';
        if (code <= 82) return '소나기';
        if (code <= 99) return '뇌우';
        return '알 수 없음';
    }

    getContextString() {
        if (!this.location) return '';
        const weatherStr = this.weather
            ? `${this.weather.temp}°C, ${this._getWeatherDesc(this.weather.code)}`
            : '정보 없음';

        return `[현재 환경 정보]
- 위치: ${this.location.city}, ${this.location.region}, ${this.location.country}
- 날씨: ${weatherStr}
- 시간: ${new Date().toLocaleString('ko-KR')}
`;
    }
}
