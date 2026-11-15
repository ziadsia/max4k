const SERVER_HOST = "https://max4k.xyz";

let state = {
    username: "", password: "", currentTab: "live",
    liveCategories: [], liveStreams: [], vodCategories: [],
    vodStreams: [], seriesCategories: [], seriesList: [],
    favorites: JSON.parse(localStorage.getItem("max4k_favs") || "[]"),
    currentPlaying: null, hlsInstance: null
};

const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const loginBtn = document.getElementById("login-btn");

async function fetchXtream(params) {
    const query = new URLSearchParams({ username: state.username, password: state.password, ...params }).toString();
    const targetUrl = `${SERVER_HOST}/player_api.php?${query}`;

    try {
        const res = await fetch(targetUrl);
        if (!res.ok) throw new Error("فشل الاتصال بالسيرفر");
        return await res.json();
    } catch (e) {
        console.error("خطأ:", e);
        throw new Error("تعذر الاتصال بالسيرفر، تأكد من صحة بيانات الدخول.");
    }
}

window.addEventListener("DOMContentLoaded", () => {
    const saved = JSON.parse(localStorage.getItem("max4k_auth"));
    if (saved && saved.username && saved.password) {
        document.getElementById("username").value = saved.username;
        document.getElementById("password").value = saved.password;
        authenticateUser(saved.username, saved.password, true);
    }
});

document.getElementById("toggle-pass").addEventListener("click", () => {
    const p = document.getElementById("password");
    p.type = p.type === "password" ? "text" : "password";
});

loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    authenticateUser(document.getElementById("username").value.trim(), document.getElementById("password").value.trim(), document.getElementById("remember-me").checked);
});

async function authenticateUser(username, password, remember) {
    loginError.classList.add("hidden");
    loginBtn.disabled = true;
    loginBtn.innerHTML = `<span>جاري التحقق...</span>`;
    state.username = username;
    state.password = password;

    try {
        const data = await fetchXtream({});
        if (!data || !data.user_info || data.user_info.auth !== 1) throw new Error("بيانات الدخول غير صحيحة.");
        if (data.user_info.status !== "Active") throw new Error("الحساب غير نشط.");

        if (remember) localStorage.setItem("max4k_auth", JSON.stringify({ username, password }));

        document.getElementById("display-username").textContent = data.user_info.username;
        document.getElementById("active-cons").textContent = `${data.user_info.active_cons} / ${data.user_info.max_connections}`;
        document.getElementById("exp-date").textContent = data.user_info.exp_date ? new Date(data.user_info.exp_date * 1000).toLocaleDateString("ar-EG") : "مفتوح";

        loginScreen.classList.add("hidden");
        appScreen.classList.remove("hidden");
        await loadLiveSection();
    } catch (err) {
        loginError.textContent = err.message;
        loginError.classList.remove("hidden");
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerHTML = `<span>تسجيل الدخول</span> <i class="fa-solid fa-arrow-left"></i>`;
    }
}

document.getElementById("logout-btn").addEventListener("click", () => {
    localStorage.removeItem("max4k_auth");
    location.reload();
});

document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", async () => {
        document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.currentTab = btn.dataset.tab;
        document.getElementById("search-input").value = "";

        if (state.currentTab === "live") {
            document.getElementById("live-workspace").classList.remove("hidden");
            document.getElementById("vod-workspace").classList.add("hidden");
            if (state.liveStreams.length === 0) await loadLiveSection();
        } else {
            document.getElementById("live-workspace").classList.add("hidden");
            document.getElementById("vod-workspace").classList.remove("hidden");
            if (state.currentTab === "movies") await loadMoviesSection();
            if (state.currentTab === "series") await loadSeriesSection();
            if (state.currentTab === "favorites") renderFavorites();
        }
    });
});

async function loadLiveSection() {
    const catList = document.getElementById("live-categories");
    catList.innerHTML = "<li>جاري التحميل...</li>";
    const [cats, streams] = await Promise.all([fetchXtream({ action: "get_live_categories" }), fetchXtream({ action: "get_live_streams" })]);
    state.liveCategories = cats || [];
    state.liveStreams = streams || [];

    catList.innerHTML = `<li class="active" data-id="all">جميع القنوات (${state.liveStreams.length})</li>`;
    state.liveCategories.forEach(cat => {
        const li = document.createElement("li");
        li.textContent = cat.category_name;
        li.onclick = () => {
            document.querySelectorAll("#live-categories li").forEach(el => el.classList.remove("active"));
            li.classList.add("active");
            document.getElementById("current-category-title").textContent = cat.category_name;
            renderChannels(state.liveStreams.filter(s => s.category_id === cat.category_id));
        };
        catList.appendChild(li);
    });
    catList.firstChild.onclick = () => {
        document.querySelectorAll("#live-categories li").forEach(el => el.classList.remove("active"));
        catList.firstChild.classList.add("active");
        document.getElementById("current-category-title").textContent = "جميع القنوات";
        renderChannels(state.liveStreams);
    };
    renderChannels(state.liveStreams.slice(0, 150));
}

function renderChannels(channels) {
    const container = document.getElementById("channels-list");
    document.getElementById("items-count").textContent = channels.length;
    container.innerHTML = "";
    channels.forEach(ch => {
        const div = document.createElement("div");
        div.className = "channel-item";
        div.innerHTML = `<img src="${ch.stream_icon || ''}" onerror="this.src='https://via.placeholder.com/40x40/111/fff?text=TV'"><span>${ch.name}</span>`;
        div.onclick = () => {
            document.querySelectorAll(".channel-item").forEach(el => el.classList.remove("active"));
            div.classList.add("active");
            playLiveStream(ch);
        };
        container.appendChild(div);
    });
}

// المشغل الحديث المحسن للبث المباشر
function playLiveStream(channel) {
    state.currentPlaying = { type: "live", data: channel };
    document.getElementById("playing-title").textContent = channel.name;
    document.getElementById("player-placeholder").classList.add("hidden");
    document.getElementById("player-loader").classList.remove("hidden");

    const video = document.getElementById("video-player");
    const m3u8Url = `${SERVER_HOST}/live/${state.username}/${state.password}/${channel.stream_id}.m3u8`;

    if (state.hlsInstance) { 
        state.hlsInstance.destroy(); 
        state.hlsInstance = null; 
    }

    if (Hls.isSupported()) {
        const hls = new Hls({
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            enableWorker: true,
            lowLatencyMode: true
        });
        
        hls.loadSource(m3u8Url);
        hls.attachMedia(video);
        
        hls.on(Hls.Events.MANIFEST_PARSED, () => { 
            document.getElementById("player-loader").classList.add("hidden"); 
            video.play().catch(() => {}); 
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        hls.startLoad();
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        hls.recoverMediaError();
                        break;
                    default:
                        document.getElementById("player-loader").classList.add("hidden");
                        hls.destroy();
                        break;
                }
            }
        });
        
        state.hlsInstance = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = m3u8Url;
        video.addEventListener('loadedmetadata', () => {
            document.getElementById("player-loader").classList.add("hidden");
            video.play().catch(() => {});
        });
    }
}

async function loadMoviesSection() {
    if (state.vodStreams.length === 0) {
        const [cats, movies] = await Promise.all([fetchXtream({ action: "get_vod_categories" }), fetchXtream({ action: "get_vod_streams" })]);
        state.vodCategories = cats || [];
        state.vodStreams = movies || [];
    }
    renderVodCategories(state.vodCategories, (id) => renderMediaCards(id === "all" ? state.vodStreams : state.vodStreams.filter(m => m.category_id === id), "movie"));
    renderMediaCards(state.vodStreams.slice(0, 120), "movie");
}

async function loadSeriesSection() {
    if (state.seriesList.length === 0) {
        const [cats, series] = await Promise.all([fetchXtream({ action: "get_series_categories" }), fetchXtream({ action: "get_series" })]);
        state.seriesCategories = cats || [];
        state.seriesList = series || [];
    }
    renderVodCategories(state.seriesCategories, (id) => renderMediaCards(id === "all" ? state.seriesList : state.seriesList.filter(s => s.category_id === id), "series"));
    renderMediaCards(state.seriesList.slice(0, 120), "series");
}

function renderVodCategories(categories, onSelect) {
    const bar = document.getElementById("vod-categories");
    bar.innerHTML = `<button class="vod-cat-pill active" data-id="all">الكل</button>`;
    categories.forEach(c => {
        const btn = document.createElement("button");
        btn.className = "vod-cat-pill";
        btn.textContent = c.category_name;
        btn.onclick = () => { document.querySelectorAll(".vod-cat-pill").forEach(p => p.classList.remove("active")); btn.classList.add("active"); onSelect(c.category_id); };
        bar.appendChild(btn);
    });
    bar.firstChild.onclick = () => { document.querySelectorAll(".vod-cat-pill").forEach(p => p.classList.remove("active")); bar.firstChild.classList.add("active"); onSelect("all"); };
}

function renderMediaCards(items, type) {
    const grid = document.getElementById("vod-grid");
    grid.innerHTML = "";
    items.forEach(item => {
        const card = document.createElement("div");
        card.className = "media-card";
        card.innerHTML = `<img src="${item.stream_icon || item.cover || ''}" loading="lazy" onerror="this.src='https://via.placeholder.com/200x300/181e2e/fff?text=MAX+4K'"><div class="media-card-info"><h4>${item.name}</h4></div>`;
        card.onclick = () => {
            if (type === "movie") {
                openVodPlayer(item.name, `${SERVER_HOST}/movie/${state.username}/${state.password}/${item.stream_id}.${item.container_extension || 'mp4'}`);
            } else {
                openSeriesDetails(item);
            }
        };
        grid.appendChild(card);
    });
}

async function openSeriesDetails(series) {
    const modal = document.getElementById("series-modal");
    modal.classList.remove("hidden");
    document.getElementById("series-title").textContent = series.name;
    document.getElementById("series-plot").textContent = series.plot || "";
    document.getElementById("series-poster").src = series.cover || "";
    const epList = document.getElementById("episodes-list");
    epList.innerHTML = "<p>جاري تحميل الحلقات...</p>";

    const info = await fetchXtream({ action: "get_series_info", series_id: series.series_id });
    epList.innerHTML = "";
    if (info && info.episodes) {
        const firstSeason = Object.keys(info.episodes)[0];
        info.episodes[firstSeason].forEach(ep => {
            const btn = document.createElement("button");
            btn.className = "episode-btn";
            btn.textContent = `حلقة ${ep.episode_num}`;
            btn.onclick = () => openVodPlayer(`${series.name} - حلقة ${ep.episode_num}`, `${SERVER_HOST}/series/${state.username}/${state.password}/${ep.id}.${ep.container_extension || 'mp4'}`);
            epList.appendChild(btn);
        });
    }
}

document.getElementById("close-series-modal").onclick = () => document.getElementById("series-modal").classList.add("hidden");

// مشغل الأفلام والمسلسلات الحديث
function openVodPlayer(title, url) {
    const modal = document.getElementById("vod-player-modal");
    const player = document.getElementById("vod-video-player");
    document.getElementById("vod-playing-title").textContent = title;
    modal.classList.remove("hidden");
    
    if (url.includes('.m3u8') && Hls.isSupported()) {
        if (window.vodHlsInstance) { window.vodHlsInstance.destroy(); }
        const vodHls = new Hls();
        vodHls.loadSource(url);
        vodHls.attachMedia(player);
        vodHls.on(Hls.Events.MANIFEST_PARSED, () => { player.play().catch(() => {}); });
        window.vodHlsInstance = vodHls;
    } else {
        player.src = url;
        player.play().catch(() => {});
    }
}

document.getElementById("close-vod-player").onclick = () => {
    const player = document.getElementById("vod-video-player");
    player.pause(); player.src = "";
    if (window.vodHlsInstance) { window.vodHlsInstance.destroy(); }
    document.getElementById("vod-player-modal").classList.add("hidden");
};

document.getElementById("search-input").addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase().trim();
    if (state.currentTab === "live") renderChannels(state.liveStreams.filter(c => c.name.toLowerCase().includes(q)).slice(0, 100));
    else if (state.currentTab === "movies") renderMediaCards(state.vodStreams.filter(m => m.name.toLowerCase().includes(q)).slice(0, 100), "movie");
    else if (state.currentTab === "series") renderMediaCards(state.seriesList.filter(s => s.name.toLowerCase().includes(q)).slice(0, 100), "series");
});

document.getElementById("fav-current-btn").onclick = () => {
    if (!state.currentPlaying) return;
    if (!state.favorites.some(f => f.stream_id === state.currentPlaying.data.stream_id)) {
        state.favorites.push(state.currentPlaying.data);
        localStorage.setItem("max4k_favs", JSON.stringify(state.favorites));
        alert("تمت الإضافة للمفضلة!");
    }
};

function renderFavorites() {
    const grid = document.getElementById("vod-grid");
    document.getElementById("vod-categories").innerHTML = "";
    grid.innerHTML = "";
    state.favorites.forEach(ch => {
        const card = document.createElement("div");
        card.className = "media-card";
        card.innerHTML = `<img src="${ch.stream_icon || ''}" style="height:140px;object-fit:contain;padding:15px;"><div class="media-card-info"><h4>${ch.name}</h4></div>`;
        card.onclick = () => { document.querySelector('[data-tab="live"]').click(); playLiveStream(ch); };
        grid.appendChild(card);
    });
}
