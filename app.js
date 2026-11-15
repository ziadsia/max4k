// إعدادات السيرفر الثابتة الخاصة بك
const SERVER_HOST = "http://max4k.xyz";

// حالة التطبيق والبيانات المخزنة
let state = {
    username: "",
    password: "",
    currentTab: "live",
    liveCategories: [],
    liveStreams: [],
    vodCategories: [],
    vodStreams: [],
    seriesCategories: [],
    seriesList: [],
    favorites: JSON.parse(localStorage.getItem("max4k_favs") || "[]"),
    currentPlaying: null,
    hlsInstance: null,
    mpegtsInstance: null
};

// عناصر DOM
const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const loginBtn = document.getElementById("login-btn");

// دالة ذكية لجلب البيانات تتخطى مشاكل CORS و HTTPS تلقائياً
async function fetchXtream(params) {
    const query = new URLSearchParams({
        username: state.username,
        password: state.password,
        ...params
    }).toString();

    const targetUrl = `${SERVER_HOST}/player_api.php?${query}`;

    // المحاولة 1: اتصال مباشر بالسيرفر
    try {
        const res = await fetch(targetUrl);
        if (res.ok) return await res.json();
    } catch (e) {
        console.warn("الاتصال المباشر محجوب من المتصفح، جاري التحويل للبروكسي الآمن...");
    }

    // المحاولة 2: العبور عبر بروكسي HTTPS لتجاوز حظر Mixed Content على GitHub
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
    const proxyRes = await fetch(proxyUrl);
    if (!proxyRes.ok) throw new Error("فشل الاتصال بالسيرفر");
    return await proxyRes.json();
}

// استعادة الجلسة المحفوظة عند فتح الموقع
window.addEventListener("DOMContentLoaded", () => {
    const saved = JSON.parse(localStorage.getItem("max4k_auth"));
    if (saved && saved.username && saved.password) {
        document.getElementById("username").value = saved.username;
        document.getElementById("password").value = saved.password;
        authenticateUser(saved.username, saved.password, true);
    }
});

// إظهار وإخفاء كلمة المرور
document.getElementById("toggle-pass").addEventListener("click", () => {
    const passInput = document.getElementById("password");
    passInput.type = passInput.type === "password" ? "text" : "password";
});

// معالجة نموذج تسجيل الدخول
loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const user = document.getElementById("username").value.trim();
    const pass = document.getElementById("password").value.trim();
    const remember = document.getElementById("remember-me").checked;
    authenticateUser(user, pass, remember);
});

async function authenticateUser(username, password, remember) {
    loginError.classList.add("hidden");
    loginBtn.disabled = true;
    loginBtn.innerHTML = `<span>جاري التحقق من الاشتراك...</span>`;

    state.username = username;
    state.password = password;

    try {
        const data = await fetchXtream({});
        if (!data || !data.user_info || data.user_info.auth !== 1) {
            throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة.");
        }

        if (data.user_info.status !== "Active") {
            throw new Error(`حالة الحساب غير نشطة (${data.user_info.status}).`);
        }

        if (remember) {
            localStorage.setItem("max4k_auth", JSON.stringify({ username, password }));
        }

        // عرض بيانات المشترك
        document.getElementById("display-username").textContent = data.user_info.username;
        document.getElementById("active-cons").textContent = `${data.user_info.active_cons} / ${data.user_info.max_connections}`;
        
        if (data.user_info.exp_date) {
            const date = new Date(data.user_info.exp_date * 1000);
            document.getElementById("exp-date").textContent = date.toLocaleDateString("ar-EG");
        } else {
            document.getElementById("exp-date").textContent = "مفتوح";
        }

        loginScreen.classList.add("hidden");
        appScreen.classList.remove("hidden");

        // تحميل الأقسام
        await loadLiveSection();
    } catch (err) {
        loginError.textContent = err.message || "تعذر الاتصال بالسيرفر، تأكد من البيانات أو الإنترنت.";
        loginError.classList.remove("hidden");
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerHTML = `<span>تسجيل الدخول</span> <i class="fa-solid fa-arrow-left"></i>`;
    }
}

// تسجيل الخروج
document.getElementById("logout-btn").addEventListener("click", () => {
    localStorage.removeItem("max4k_auth");
    location.reload();
});

// التنقل بين التبويبات (مباشر / أفلام / مسلسلات / مفضلة)
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

// ================= قسم البث المباشر =================
async function loadLiveSection() {
    const catList = document.getElementById("live-categories");
    catList.innerHTML = "<li>جاري التحميل...</li>";

    const [cats, streams] = await Promise.all([
        fetchXtream({ action: "get_live_categories" }),
        fetchXtream({ action: "get_live_streams" })
    ]);

    state.liveCategories = cats || [];
    state.liveStreams = streams || [];

    catList.innerHTML = `<li class="active" data-id="all">جميع القنوات (${state.liveStreams.length})</li>`;
    state.liveCategories.forEach(cat => {
        const li = document.createElement("li");
        li.textContent = cat.category_name;
        li.dataset.id = cat.category_id;
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

    renderChannels(state.liveStreams.slice(0, 150)); // عرض أول 150 قناة لسرعة الأداء
}

function renderChannels(channels) {
    const container = document.getElementById("channels-list");
    document.getElementById("items-count").textContent = channels.length;
    container.innerHTML = "";

    channels.forEach(ch => {
        const div = document.createElement("div");
        div.className = "channel-item";
        const logo = ch.stream_icon || "https://via.placeholder.com/40x40/111/fff?text=TV";
        div.innerHTML = `
            <img src="${logo}" onerror="this.src='https://via.placeholder.com/40x40/111/fff?text=TV'">
            <span>${ch.name}</span>
        `;
        div.onclick = () => {
            document.querySelectorAll(".channel-item").forEach(el => el.classList.remove("active"));
            div.classList.add("active");
            playLiveStream(ch);
        };
        container.appendChild(div);
    });
}

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
        const hls = new Hls();
        hls.loadSource(m3u8Url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            document.getElementById("player-loader").classList.add("hidden");
            video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, () => {
            document.getElementById("player-loader").classList.add("hidden");
        });
        state.hlsInstance = hls;
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = m3u8Url;
        video.addEventListener("loadedmetadata", () => {
            document.getElementById("player-loader").classList.add("hidden");
            video.play();
        });
    }
}

// ================= قسم الأفلام (VOD) =================
async function loadMoviesSection() {
    const grid = document.getElementById("vod-grid");
    grid.innerHTML = "<p>جاري تحميل مكتبة الأفلام...</p>";

    if (state.vodStreams.length === 0) {
        const [cats, movies] = await Promise.all([
            fetchXtream({ action: "get_vod_categories" }),
            fetchXtream({ action: "get_vod_streams" })
        ]);
        state.vodCategories = cats || [];
        state.vodStreams = movies || [];
    }

    renderVodCategories(state.vodCategories, (catId) => {
        const filtered = catId === "all" ? state.vodStreams : state.vodStreams.filter(m => m.category_id === catId);
        renderMediaCards(filtered.slice(0, 120), "movie");
    });

    renderMediaCards(state.vodStreams.slice(0, 120), "movie");
}

// ================= قسم المسلسلات =================
async function loadSeriesSection() {
    const grid = document.getElementById("vod-grid");
    grid.innerHTML = "<p>جاري تحميل مكتبة المسلسلات...</p>";

    if (state.seriesList.length === 0) {
        const [cats, series] = await Promise.all([
            fetchXtream({ action: "get_series_categories" }),
            fetchXtream({ action: "get_series" })
        ]);
        state.seriesCategories = cats || [];
        state.seriesList = series || [];
    }

    renderVodCategories(state.seriesCategories, (catId) => {
        const filtered = catId === "all" ? state.seriesList : state.seriesList.filter(s => s.category_id === catId);
        renderMediaCards(filtered.slice(0, 120), "series");
    });

    renderMediaCards(state.seriesList.slice(0, 120), "series");
}

function renderVodCategories(categories, onSelect) {
    const bar = document.getElementById("vod-categories");
    bar.innerHTML = `<button class="vod-cat-pill active" data-id="all">الكل</button>`;
    categories.forEach(c => {
        const btn = document.createElement("button");
        btn.className = "vod-cat-pill";
        btn.textContent = c.category_name;
        btn.onclick = () => {
            document.querySelectorAll(".vod-cat-pill").forEach(p => p.classList.remove("active"));
            btn.classList.add("active");
            onSelect(c.category_id);
        };
        bar.appendChild(btn);
    });
    bar.firstChild.onclick = () => {
        document.querySelectorAll(".vod-cat-pill").forEach(p => p.classList.remove("active"));
        bar.firstChild.classList.add("active");
        onSelect("all");
    };
}

function renderMediaCards(items, type) {
    const grid = document.getElementById("vod-grid");
    grid.innerHTML = "";

    items.forEach(item => {
        const card = document.createElement("div");
        card.className = "media-card";
        const poster = item.stream_icon || item.cover || "https://via.placeholder.com/200x300/181e2e/fff?text=MAX+4K";
        card.innerHTML = `
            <img src="${poster}" loading="lazy" onerror="this.src='https://via.placeholder.com/200x300/181e2e/fff?text=MAX+4K'">
            <div class="media-card-info">
                <h4>${item.name}</h4>
            </div>
        `;
        card.onclick = () => {
            if (type === "movie") {
                const ext = item.container_extension || "mp4";
                const movieUrl = `${SERVER_HOST}/movie/${state.username}/${state.password}/${item.stream_id}.${ext}`;
                openVodPlayer(item.name, movieUrl);
            } else {
                openSeriesDetails(item);
            }
        };
        grid.appendChild(card);
    });
}

// فتح تفاصيل المسلسل والحلقات
async function openSeriesDetails(series) {
    const modal = document.getElementById("series-modal");
    modal.classList.remove("hidden");
    document.getElementById("series-title").textContent = series.name;
    document.getElementById("series-plot").textContent = series.plot || "جاري جلب الحلقات...";
    document.getElementById("series-poster").src = series.cover || "";
    const epList = document.getElementById("episodes-list");
    epList.innerHTML = "<p>جاري تحميل الحلقات...</p>";

    const info = await fetchXtream({ action: "get_series_info", series_id: series.series_id });
    epList.innerHTML = "";

    if (info && info.episodes) {
        const seasons = Object.keys(info.episodes);
        const firstSeason = seasons[0];
        info.episodes[firstSeason].forEach(ep => {
            const btn = document.createElement("button");
            btn.className = "episode-btn";
            btn.textContent = `حلقة ${ep.episode_num}`;
            btn.onclick = () => {
                const ext = ep.container_extension || "mp4";
                const epUrl = `${SERVER_HOST}/series/${state.username}/${state.password}/${ep.id}.${ext}`;
                openVodPlayer(`${series.name} - حلقة ${ep.episode_num}`, epUrl);
            };
            epList.appendChild(btn);
        });
    }
}

document.getElementById("close-series-modal").onclick = () => {
    document.getElementById("series-modal").classList.add("hidden");
};

// تشغيل الأفلام والمسلسلات في النافذة المنبثقة
function openVodPlayer(title, url) {
    const modal = document.getElementById("vod-player-modal");
    const player = document.getElementById("vod-video-player");
    document.getElementById("vod-playing-title").textContent = title;
    modal.classList.remove("hidden");
    player.src = url;
    player.play().catch(() => {});
}

document.getElementById("close-vod-player").onclick = () => {
    const modal = document.getElementById("vod-player-modal");
    const player = document.getElementById("vod-video-player");
    player.pause();
    player.src = "";
    modal.classList.add("hidden");
};

// البحث الفوري
document.getElementById("search-input").addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase().trim();
    if (state.currentTab === "live") {
        const res = state.liveStreams.filter(c => c.name.toLowerCase().includes(q));
        renderChannels(res.slice(0, 100));
    } else if (state.currentTab === "movies") {
        const res = state.vodStreams.filter(m => m.name.toLowerCase().includes(q));
        renderMediaCards(res.slice(0, 100), "movie");
    } else if (state.currentTab === "series") {
        const res = state.seriesList.filter(s => s.name.toLowerCase().includes(q));
        renderMediaCards(res.slice(0, 100), "series");
    }
});

// المفضلة
document.getElementById("fav-current-btn").onclick = () => {
    if (!state.currentPlaying) return;
    const exists = state.favorites.find(f => f.stream_id === state.currentPlaying.data.stream_id);
    if (!exists) {
        state.favorites.push(state.currentPlaying.data);
        localStorage.setItem("max4k_favs", JSON.stringify(state.favorites));
        alert("تمت الإضافة للمفضلة بنجاح!");
    }
};

function renderFavorites() {
    document.getElementById("vod-categories").innerHTML = "";
    const grid = document.getElementById("vod-grid");
    grid.innerHTML = "";
    state.favorites.forEach(ch => {
        const card = document.createElement("div");
        card.className = "media-card";
        card.innerHTML = `
            <img src="${ch.stream_icon || ''}" style="height:140px;object-fit:contain;padding:15px;">
            <div class="media-card-info"><h4>${ch.name}</h4></div>
        `;
        card.onclick = () => {
            document.querySelector('[data-tab="live"]').click();
            playLiveStream(ch);
        };
        grid.appendChild(card);
    });
}

// نافذة عائمة PiP
document.getElementById("pip-btn").onclick = async () => {
    const video = document.getElementById("video-player");
    if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
    } else if (video.readyState >= 2) {
        await video.requestPictureInPicture();
    }
};