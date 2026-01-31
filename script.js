// Global Variables
let channels = [];
let currentChannel = null;
let currentCategory = 'all';
let favoriteChannels = JSON.parse(localStorage.getItem('favoriteChannels') || '[]');
let recentChannels = JSON.parse(localStorage.getItem('recentChannels') || '[]'); // Son izlenenler
let activeTab = 'channels';
let activeTimeouts = []; // Track all timeouts for cleanup
let hlsInstance = null; // Track HLS instance
let allCategories = new Set(); // Tüm kategorileri tutmak için
const m3uFiles = ['tv.m3u']; // Yüklenecek M3U dosyaları
const BLOG_TV_BASE_URL = 'https://www.blogtv.net.tr';
const BLOG_TV_MAX_CRAWL_PAGES = 8;
const BLOG_TV_MAX_CRAWL_DEPTH = 2;
const BLOG_TV_CATEGORY_KEYWORDS = [
    '/category/',
    '/kategori/',
    '/kanal/',
    '/ulusal',
    '/haber',
    '/spor',
    '/film',
    '/belgesel',
    '/cocuk',
    '/muzik',
    '/dini'
];
const BLOG_TV_MAX_CHANNEL_PAGES = 20;
const BLOG_TV_MAX_CHANNELS = 200;
const BLOG_TV_CHANNEL_LINK_HINTS = [
    'canli',
    'canlı',
    'canli-izle',
    'canlı-izle',
    'canli-izle',
    'canli-izle',
    'canli izle',
    'canlı izle',
    'canli yayın',
    'canlı yayın'
];
let userListVisible = false;
let userListOutsideHandlerBound = false;

// Sorting
let categorySort = 'default'; // 'default', 'az', 'za'
let channelSort = 'default'; // 'default', 'az', 'za'

// Country selection
let selectedCountry = null; // { code: 'TR', name: 'Turkey', flag: '🇹🇷' }
let countries = []; // All available countries
let countryChannels = []; // Channels filtered by country
let useCountryFilter = false; // Whether to use country filter or default m3u

// IPTV-org base URL for country-based M3U files
const IPTV_ORG_BASE_URL = 'https://raw.githubusercontent.com/iptv-org/iptv/master';
const IPTV_ORG_COUNTRIES_URL = `${IPTV_ORG_BASE_URL}/countries`;

// Multiple CORS proxy services
const CORS_PROXIES = [
    { name: 'allorigins', url: (target) => `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}` },
    { name: 'corsproxy', url: (target) => `https://corsproxy.io/?${encodeURIComponent(target)}` },
    { name: 'codetabs', url: (target) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}` },
    { name: 'cors-anywhere', url: (target) => `https://cors-anywhere.herokuapp.com/${target}` },
    { name: 'thingproxy', url: (target) => `https://thingproxy.freeboard.io/fetch/${target}` }
];

// Alternative IPTV sources (if IPTV-org fails)
const ALTERNATIVE_IPTV_SOURCES = [
    {
        name: 'IPTV-org GitHub Pages',
        getUrl: (code) => `https://iptv-org.github.io/iptv/countries/${code.toLowerCase()}.m3u`
    },
    {
        name: 'IPTV-org CDN',
        getUrl: (code) => `https://cdn.jsdelivr.net/gh/iptv-org/iptv@master/countries/${code.toLowerCase()}.m3u`
    }
];

// User management
let users = [];
let currentUserId = null;

// Load users from localStorage
function loadUsers() {
    try {
        const stored = localStorage.getItem('users');
        users = stored ? JSON.parse(stored) : [];
        currentUserId = localStorage.getItem('currentUserId') || (users.length > 0 ? users[0].id : null);
    } catch (e) {
        console.error('Error loading users:', e);
        users = [];
        currentUserId = null;
    }
}

// Save users to localStorage
function saveUsers() {
    try {
        const usersJson = JSON.stringify(users);
        localStorage.setItem('users', usersJson);
        if (currentUserId) {
            localStorage.setItem('currentUserId', currentUserId);
        }
        // Doğrulama: localStorage'a kaydedildiğinden emin ol
        const savedUsers = localStorage.getItem('users');
        if (savedUsers !== usersJson) {
            console.error('❌ Users localStorage\'a kaydedilemedi!');
            // Tekrar dene
            localStorage.setItem('users', usersJson);
        } else {
            // Removed verbose logging
        }
    } catch (e) {
        console.error('❌ Error saving users:', e);
        // QuotaExceededError kontrolü
        if (e.name === 'QuotaExceededError') {
            console.error('❌ localStorage dolu! Eski veriler temizleniyor...');
            // Eski verileri temizle ve tekrar dene
            try {
                localStorage.removeItem('users');
                localStorage.setItem('users', JSON.stringify(users));
                if (currentUserId) {
                    localStorage.setItem('currentUserId', currentUserId);
                }
                // Removed verbose logging
            } catch (e2) {
                console.error('❌ Users tekrar kaydedilemedi:', e2);
            }
        }
    }
}

function getUserListContainer() {
    return document.getElementById('usersListContainer');
}

function handleUserListOutsideClick(event) {
    if (!userListVisible) return;
    const container = getUserListContainer();
    if (!container) return;
    
    const triggerArea = document.querySelector('.channel-source-switch');
    
    if (container.contains(event.target) || (triggerArea && triggerArea.contains(event.target))) {
        return;
    }
    
    hideUserList();
}

function bindUserListOutsideHandler() {
    if (userListOutsideHandlerBound) return;
    document.addEventListener('mousedown', handleUserListOutsideClick, true);
    document.addEventListener('touchstart', handleUserListOutsideClick, true);
    userListOutsideHandlerBound = true;
}

function unbindUserListOutsideHandler() {
    if (!userListOutsideHandlerBound) return;
    document.removeEventListener('mousedown', handleUserListOutsideClick, true);
    document.removeEventListener('touchstart', handleUserListOutsideClick, true);
    userListOutsideHandlerBound = false;
}

function syncUserListVisibility() {
    const container = getUserListContainer();
    const select = document.getElementById('channelSourceSelect');
    if (!container) return;
    
    if (!userListVisible || container.childElementCount === 0) {
        container.style.display = 'none';
        container.setAttribute('aria-hidden', 'true');
        if (select) {
            select.setAttribute('aria-expanded', 'false');
        }
        unbindUserListOutsideHandler();
        return;
    }
    
    container.style.display = 'block';
    container.setAttribute('aria-hidden', 'false');
    if (select) {
        select.setAttribute('aria-expanded', 'true');
    }
    bindUserListOutsideHandler();
}

function showUserList() {
    // Artık kullanılmıyor - M3U switch modal kullanılıyor
    openM3uSwitchModal();
}

function hideUserList() {
    userListVisible = false;
    syncUserListVisibility();
}

// Aktif kullanıcıyı güncelle ve UI'ı yenile
function setActiveUser(userId, options = {}) {
    const source = options.source || 'manual';
    
    if (!userId || userId === 'default') {
        currentUserId = null;
        localStorage.removeItem('currentUserId');
    } else {
        currentUserId = userId;
        localStorage.setItem('currentUserId', currentUserId);
        
        // Xtream user seçildiğinde country filter'ı kapat
        const currentUser = users.find(u => u && u.id === userId);
        if (currentUser && currentUser.source === 'xtream') {
            useCountryFilter = false;
            selectedCountry = null;
            countryChannels = [];
            updateCountrySelectorLabel();
            console.log('🔌 Xtream user seçildi, country filter kapatıldı');
        }
    }
    
    renderCategorySidebar();
    renderSidebarChannels();
    renderDynamicCategories();
    
    if (!options.skipUserListRender) {
        renderM3uSwitchList();
    }
}

// Kullanıcıyı sil
function deleteUserById(userId) {
    if (!Array.isArray(users) || users.length === 0) {
        return false;
    }
    
    const userIndex = users.findIndex(u => u && u.id === userId);
    if (userIndex === -1) {
        return false;
    }
    
    const [removedUser] = users.splice(userIndex, 1);
    
    // Eğer silinen kullanıcı bir ülke kullanıcısı ise, ülke filtresini temizle
    let isCountryUser = false;
    if (removedUser && removedUser.name) {
        if (selectedCountry) {
            const countryPlaylistName = `${selectedCountry.flag} ${selectedCountry.name}`;
            if (removedUser.name === countryPlaylistName) {
                isCountryUser = true;
            }
        } else if (useCountryFilter) {
            // selectedCountry null ama useCountryFilter true ise, 
            // kullanıcı adında bayrak emoji'si varsa ülke kullanıcısı olabilir
            const flagEmojiPattern = /[\u{1F1E6}-\u{1F1FF}]{2}/u;
            if (flagEmojiPattern.test(removedUser.name)) {
                isCountryUser = true;
            }
        }
    }
    
    if (isCountryUser) {
        // Ülke kullanıcısı silindi, ülke filtresini temizle
        selectedCountry = null;
        useCountryFilter = false;
        countryChannels = [];
        updateCountrySelectorLabel();
        saveSelectedCountry();
        console.log('🗑️ Ülke kullanıcısı silindi, ülke filtresi temizlendi');
    }
    
    // Aktif kullanıcı silindiyse fallback belirle
    if (currentUserId === userId) {
        const fallbackUser = users.length > 0 ? users[0].id : null;
        if (fallbackUser) {
            currentUserId = fallbackUser;
            localStorage.setItem('currentUserId', currentUserId);
        } else {
            currentUserId = null;
            localStorage.removeItem('currentUserId');
        }
    }
    
    saveUsers();
    loadUsers();
    
    renderM3uSwitchList();
    renderCategorySidebar();
    renderSidebarChannels();
    renderDynamicCategories();
    
    console.log(`🗑️ M3U kullanıcısı silindi: ${removedUser ? removedUser.name : userId}`);
    return true;
}

// Kullanıcı listesini render et
function renderUserList() {
    const usersListContainer = getUserListContainer();
    
    if (!usersListContainer) {
        return;
    }
    
    usersListContainer.innerHTML = '';
    
    const helper = document.createElement('div');
    helper.className = 'user-list-hint';
    helper.innerHTML = `
        <span class="user-list-hint-text">Seçmek için dokun, silmek için çöp ikonuna bas</span>
        <button type="button" class="user-list-close-btn" title="Listeyi kapat">×</button>
    `;
    const helperCloseBtn = helper.querySelector('.user-list-close-btn');
    if (helperCloseBtn) {
        helperCloseBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            hideUserList();
        });
    }
    helper.addEventListener('click', (event) => {
        const target = event.target;
        if (target && target.classList.contains('user-list-close-btn')) {
            return;
        }
        hideUserList();
    });
    
    usersListContainer.appendChild(helper);
    
    const entries = [];
    const defaultChannelCount = Array.isArray(channels) ? channels.length : 0;
    
    entries.push({
        id: 'default',
        name: 'Mevcut Kanallar',
        channelsCount: defaultChannelCount,
        deletable: false,
        isDefault: true,
        subtitle: defaultChannelCount > 0 ? 'Yerleşik kanal listesi' : 'Henüz kanal yok'
    });
    
    if (Array.isArray(users) && users.length > 0) {
        usersListContainer.setAttribute('data-user-count', users.length.toString());
        users.forEach((user) => {
            if (!user || !user.id) return;
            entries.push({
                id: user.id,
                name: user.name || 'M3U Playlist',
                channelsCount: Array.isArray(user.channels) ? user.channels.length : 0,
                deletable: true,
                isDefault: false,
                subtitle: user.m3uUrl ? 'URL kaynağı' : 'Dosya kaynağı'
            });
        });
    } else {
        usersListContainer.setAttribute('data-user-count', '0');
    }
    
    const currentSelection = currentUserId || 'default';
    
    entries.forEach((entry) => {
        const item = document.createElement('div');
        item.className = 'user-list-item';
        if (entry.isDefault) {
            item.classList.add('user-list-item-default');
        }
        if (entry.id === currentSelection) {
            item.classList.add('active');
        }
        
        const info = document.createElement('div');
        info.className = 'user-list-item-info';
        
        const nameEl = document.createElement('div');
        nameEl.className = 'user-list-item-name';
        nameEl.textContent = entry.name;
        info.appendChild(nameEl);
        
        if (entry.subtitle) {
            const subtitleEl = document.createElement('div');
            subtitleEl.className = 'user-list-item-subtitle';
            subtitleEl.textContent = entry.subtitle;
            info.appendChild(subtitleEl);
        }
        
        if (typeof entry.channelsCount === 'number') {
            const countEl = document.createElement('div');
            countEl.className = 'user-list-item-channels';
            countEl.textContent = `${entry.channelsCount} kanal`;
            info.appendChild(countEl);
        }
        
        item.appendChild(info);
        
        const actions = document.createElement('div');
        actions.className = 'user-list-item-actions';
        
        if (entry.deletable) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'user-list-item-delete';
            deleteBtn.type = 'button';
            deleteBtn.title = `"${entry.name}" kaydını sil`;
            deleteBtn.innerHTML = `
                <span class="user-list-item-delete-icon">🗑️</span>
                <span class="user-list-item-delete-text">Sil</span>
            `;
            deleteBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                deleteUserById(entry.id);
            });
            ['touchstart', 'mousedown'].forEach(evt => {
                deleteBtn.addEventListener(evt, (event) => {
                    event.stopPropagation();
                }, { passive: evt === 'touchstart' });
            });
            actions.appendChild(deleteBtn);
        } else {
            const badge = document.createElement('span');
            badge.className = 'user-list-item-badge';
            badge.textContent = 'Varsayılan';
            actions.appendChild(badge);
        }
        
        item.appendChild(actions);
        
        item.addEventListener('click', () => {
            setActiveUser(entry.id, { source: 'userList' });
            hideUserList();
        });
        
        usersListContainer.appendChild(item);
    });
    
    syncUserListVisibility();
}

// M3U Switch listesini render et
function renderM3uSwitchList() {
    const m3uSwitchList = document.getElementById('m3uSwitchList');
    
    if (!m3uSwitchList) {
        return;
    }
    
    m3uSwitchList.innerHTML = '';
    
    const entries = [];
    
    // Ülke filtresi aktifse, önce onu göster
    if (useCountryFilter && selectedCountry) {
        entries.push({
            id: 'country',
            name: `${selectedCountry.flag} ${selectedCountry.name} Kanalları`,
            deletable: false,
            isDefault: false,
            isCountry: true,
            channelCount: countryChannels.length
        });
    }
    
    // Default kanalları ekle
    entries.push({
        id: 'default',
        name: 'Mevcut Kanallar',
        deletable: false,
        isDefault: true,
        channelCount: Array.isArray(channels) ? channels.length : 0
    });
    
    // M3U kullanıcılarını ekle
    if (Array.isArray(users) && users.length > 0) {
        users.forEach((user) => {
            if (!user || !user.id) return;
            entries.push({
                id: user.id,
                name: user.name || 'M3U Playlist',
                deletable: true,
                isDefault: false,
                channelCount: Array.isArray(user.channels) ? user.channels.length : 0
            });
        });
    }
    
    // Determine current selection
    let currentSelection;
    if (useCountryFilter && selectedCountry) {
        currentSelection = 'country';
    } else {
        currentSelection = currentUserId || 'default';
    }
    
    entries.forEach((entry) => {
        const item = document.createElement('div');
        item.className = 'm3u-switch-item';
        if (entry.isDefault) {
            item.classList.add('m3u-switch-item-default');
        }
        if (entry.id === currentSelection) {
            item.classList.add('active');
        }
        
        const nameEl = document.createElement('div');
        nameEl.className = 'm3u-switch-item-name';
        const nameText = entry.name;
        const countText = entry.channelCount !== undefined ? ` (${entry.channelCount})` : '';
        nameEl.textContent = nameText + countText;
        item.appendChild(nameEl);
        
        const actions = document.createElement('div');
        actions.className = 'm3u-switch-item-actions';
        
        if (entry.deletable) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'm3u-switch-item-delete';
            deleteBtn.type = 'button';
            deleteBtn.title = 'Sil';
            deleteBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>';
            deleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                deleteUserById(entry.id);
                renderM3uSwitchList();
            });
            actions.appendChild(deleteBtn);
        }
        
        item.appendChild(actions);
        
        item.addEventListener('click', (e) => {
            // Sil butonuna tıklanırsa seçim yapma
            if (e.target.closest('.m3u-switch-item-delete')) {
                return;
            }
            
            // Ülke seçimi ise
            if (entry.isCountry) {
                // Zaten seçili, bir şey yapma
                if (useCountryFilter && selectedCountry) {
                    closeM3uSwitchModal();
                    return;
                }
            } else if (entry.id === 'default') {
                // Default m3u'ya geçiş - ülke filtresini kapat
                useCountryFilter = false;
                countryChannels = [];
                selectedCountry = null;
                saveSelectedCountry();
                updateCountrySelectorLabel();
            }
            
            setActiveUser(entry.id === 'default' ? null : entry.id, { source: 'm3uSwitch' });
            closeM3uSwitchModal();
        });
        
        m3uSwitchList.appendChild(item);
    });
}

// M3U Switch modalını aç
function openM3uSwitchModal() {
    const modal = document.getElementById('m3uSwitchModal');
    if (modal) {
        renderM3uSwitchList();
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
}

// M3U Switch modalını kapat
function closeM3uSwitchModal() {
    const modal = document.getElementById('m3uSwitchModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
}

// Sıralama modalını aç
function openSortModal() {
    const modal = document.getElementById('sortModal');
    if (modal) {
        // Aktif sıralamaları göster
        updateSortModalActiveStates();
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
}

// Sıralama modalını kapat
function closeSortModal() {
    const modal = document.getElementById('sortModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
}

// Sıralama modalındaki aktif durumları güncelle
function updateSortModalActiveStates() {
    document.querySelectorAll('.sort-option').forEach(option => {
        const type = option.dataset.type;
        const sort = option.dataset.sort;
        if ((type === 'category' && sort === categorySort) || 
            (type === 'channel' && sort === channelSort)) {
            option.classList.add('active');
        } else {
            option.classList.remove('active');
        }
    });
}

// Sıralamayı uygula
function applySort(type, sort) {
    if (type === 'category') {
        categorySort = sort;
        localStorage.setItem('categorySort', sort);
        renderDynamicCategories();
    } else if (type === 'channel') {
        channelSort = sort;
        localStorage.setItem('channelSort', sort);
        renderSidebarChannels();
    }
}

// Get current channels (from current user or default)
function getCurrentChannels() {
    // If country filter is active, return country channels (priority)
    if (useCountryFilter && selectedCountry) {
        if (countryChannels && countryChannels.length > 0) {
            return countryChannels;
        }
        // Even if countryChannels is empty, return it if filter is active
        return countryChannels || [];
    }
    
    // If users exist and currentUserId is set, use user channels
    if (users && Array.isArray(users) && users.length > 0 && currentUserId) {
        const currentUser = users.find(u => u && u.id === currentUserId);
        if (currentUser && currentUser.channels && Array.isArray(currentUser.channels) && currentUser.channels.length > 0) {
            // Xtream user aktifse, sadece o user'ın kanallarını döndür (varsayılan kanalları değil)
            return currentUser.channels;
        }
    }
    
    // Fallback to default channels (always return channels array)
    // Ama Xtream user aktifse varsayılan kanalları döndürme
    if (users && Array.isArray(users) && users.length > 0 && currentUserId) {
        const currentUser = users.find(u => u && u.id === currentUserId);
        if (currentUser && currentUser.source === 'xtream') {
            // Xtream user aktif ama kanalları yok, boş array döndür
            return [];
        }
    }
    
    // Ensure channels is always an array
    if (!Array.isArray(channels)) {
        channels = [];
    }
    return channels;
}

// Country Selection Functions
function getCountryFlag(code) {
    if (!code || code.length !== 2) return '🌍';
    const codePoints = code
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt());
    return String.fromCodePoint(...codePoints);
}

// Load countries list (static list with popular countries)
async function loadCountries() {
    // Popular countries with their codes and names
    const countryList = [
        { code: 'TR', name: 'Turkey', flag: '🇹🇷' },
        { code: 'US', name: 'United States', flag: '🇺🇸' },
        { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
        { code: 'DE', name: 'Germany', flag: '🇩🇪' },
        { code: 'FR', name: 'France', flag: '🇫🇷' },
        { code: 'IT', name: 'Italy', flag: '🇮🇹' },
        { code: 'ES', name: 'Spain', flag: '🇪🇸' },
        { code: 'RU', name: 'Russia', flag: '🇷🇺' },
        { code: 'CN', name: 'China', flag: '🇨🇳' },
        { code: 'JP', name: 'Japan', flag: '🇯🇵' },
        { code: 'KR', name: 'South Korea', flag: '🇰🇷' },
        { code: 'IN', name: 'India', flag: '🇮🇳' },
        { code: 'BR', name: 'Brazil', flag: '🇧🇷' },
        { code: 'MX', name: 'Mexico', flag: '🇲🇽' },
        { code: 'CA', name: 'Canada', flag: '🇨🇦' },
        { code: 'AU', name: 'Australia', flag: '🇦🇺' },
        { code: 'NL', name: 'Netherlands', flag: '🇳🇱' },
        { code: 'BE', name: 'Belgium', flag: '🇧🇪' },
        { code: 'CH', name: 'Switzerland', flag: '🇨🇭' },
        { code: 'AT', name: 'Austria', flag: '🇦🇹' },
        { code: 'SE', name: 'Sweden', flag: '🇸🇪' },
        { code: 'NO', name: 'Norway', flag: '🇳🇴' },
        { code: 'DK', name: 'Denmark', flag: '🇩🇰' },
        { code: 'FI', name: 'Finland', flag: '🇫🇮' },
        { code: 'PL', name: 'Poland', flag: '🇵🇱' },
        { code: 'GR', name: 'Greece', flag: '🇬🇷' },
        { code: 'PT', name: 'Portugal', flag: '🇵🇹' },
        { code: 'IE', name: 'Ireland', flag: '🇮🇪' },
        { code: 'AR', name: 'Argentina', flag: '🇦🇷' },
        { code: 'CL', name: 'Chile', flag: '🇨🇱' },
        { code: 'CO', name: 'Colombia', flag: '🇨🇴' },
        { code: 'EG', name: 'Egypt', flag: '🇪🇬' },
        { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦' },
        { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪' },
        { code: 'IL', name: 'Israel', flag: '🇮🇱' },
        { code: 'TH', name: 'Thailand', flag: '🇹🇭' },
        { code: 'VN', name: 'Vietnam', flag: '🇻🇳' },
        { code: 'PH', name: 'Philippines', flag: '🇵🇭' },
        { code: 'ID', name: 'Indonesia', flag: '🇮🇩' },
        { code: 'MY', name: 'Malaysia', flag: '🇲🇾' },
        { code: 'SG', name: 'Singapore', flag: '🇸🇬' },
        { code: 'PK', name: 'Pakistan', flag: '🇵🇰' },
        { code: 'BD', name: 'Bangladesh', flag: '🇧🇩' },
        { code: 'UA', name: 'Ukraine', flag: '🇺🇦' },
        { code: 'RO', name: 'Romania', flag: '🇷🇴' },
        { code: 'HU', name: 'Hungary', flag: '🇭🇺' }
    ];
    
    countries = countryList.map(country => ({
        ...country,
        channelCount: 0 // Will be updated when channels are loaded
    }));
    
            // Removed verbose logging
    return true;
}

// Parse M3U using tvglobal-style parser (more robust)
function parseM3UContent(m3uContent) {
    const lines = m3uContent.split('\n');
    const channels = [];
    let currentChannel = null;
    let channelId = 1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.startsWith('#EXTM3U')) {
            continue;
        }

        if (line.startsWith('#EXTINF:')) {
            currentChannel = parseExtInfLine(line);
            currentChannel.id = `channel_${channelId++}`;
        } else if (line && !line.startsWith('#') && currentChannel) {
            // URL line
            if (isValidUrl(line)) {
                currentChannel.url = line;
                currentChannel.streamUrl = line;
                channels.push(currentChannel);
            }
            currentChannel = null;
        }
    }

    return channels;
}

// Parse EXTINF line (tvglobal style)
function parseExtInfLine(extInfLine) {
    const channel = {
        name: '',
        tvgName: '',
        tvgId: '',
        tvgLogo: '',
        group: '',
        country: '',
        language: '',
        category: '',
        url: '',
        streamUrl: ''
    };

    const attributeMatch = extInfLine.match(/^#EXTINF:(-?\d+)\s*(.*)$/);
    if (!attributeMatch) {
        return channel;
    }

    const attributes = attributeMatch[2];
    const commaIndex = attributes.lastIndexOf(',');
    
    if (commaIndex !== -1) {
        const attrString = attributes.substring(0, commaIndex);
        const channelName = attributes.substring(commaIndex + 1).trim();
        
        channel.name = channelName;
        channel.tvgName = channelName;

        // Parse attributes
        const attrRegex = /(\w+(?:-\w+)*)="([^"]*)"/g;
        let match;
        
        while ((match = attrRegex.exec(attrString)) !== null) {
            const key = match[1];
            const value = match[2];
            
            switch (key) {
                case 'tvg-id':
                    channel.tvgId = value;
                    const tvgIdCountryMatch = value.match(/\.([a-z]{2})(?:@|$)/i);
                    if (tvgIdCountryMatch && !channel.country) {
                        channel.country = tvgIdCountryMatch[1].toUpperCase();
                    }
                    break;
                case 'tvg-name':
                    channel.tvgName = value;
                    break;
                case 'tvg-logo':
                    channel.tvgLogo = value;
                    break;
                case 'group-title':
                    channel.group = value;
                    channel.category = value;
                    if (!channel.country) {
                        const countryMatch = value.match(/\b([A-Z]{2})\b/);
                        if (countryMatch) {
                            channel.country = countryMatch[1];
                        }
                    }
                    break;
                case 'country':
                    channel.country = value.toUpperCase();
                    break;
                case 'language':
                    channel.language = value;
                    break;
            }
        }
    }

    return channel;
}

function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

// Load channels for selected country from IPTV-org (tvglobal style)
async function loadCountryChannels(countryCode, forceUpdate = false) {
    const countryCodeLower = countryCode.toLowerCase();
    const countryCodeUpper = countryCode.toUpperCase();
    
    // Special handling for GB (United Kingdom) - also try UK as fallback
    const alternativeCodes = [];
    if (countryCodeUpper === 'GB') {
        alternativeCodes.push('uk');
    } else if (countryCodeUpper === 'UK') {
        alternativeCodes.push('gb');
    }
    
    // Removed verbose logging for performance
    
    let m3uContent = null;
    let lastError = null;
    let usedMethod = null;
    
    // Build all possible URLs to try
    const baseUrls = [];

    // Prefer sources that actually work in browsers (GitHub Pages / CDN)
    ALTERNATIVE_IPTV_SOURCES.forEach(source => {
        baseUrls.push(source.getUrl(countryCode));
        // Also try alternative codes if available
        alternativeCodes.forEach(altCode => {
            baseUrls.push(source.getUrl(altCode));
        });
    });

    // Fallbacks (some of these may 404; keep as last resort)
    baseUrls.push(
        `${IPTV_ORG_COUNTRIES_URL}/${countryCodeLower}.m3u`,
        `${IPTV_ORG_COUNTRIES_URL}/${countryCodeUpper}.m3u`,
        `${IPTV_ORG_BASE_URL}/streams/${countryCodeLower}.m3u`
    );
    
    // Also try alternative codes in fallback URLs
    alternativeCodes.forEach(altCode => {
        baseUrls.push(
            `${IPTV_ORG_COUNTRIES_URL}/${altCode}.m3u`,
            `${IPTV_ORG_COUNTRIES_URL}/${altCode.toUpperCase()}.m3u`,
            `${IPTV_ORG_BASE_URL}/streams/${altCode}.m3u`
        );
    });
    
    // Step 1: Try direct fetch for each URL
    for (const url of baseUrls) {
        try {
            // Add cache-busting parameter if forceUpdate is true
            let fetchUrl = url;
            if (forceUpdate) {
                const separator = url.includes('?') ? '&' : '?';
                fetchUrl = `${url}${separator}_t=${Date.now()}`;
            }
            
            const response = await fetch(fetchUrl, {
                method: 'GET',
                mode: 'cors',
                cache: forceUpdate ? 'no-cache' : 'default',
                headers: {
                    'Accept': 'application/vnd.apple.mpegurl, text/plain, */*',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            if (response.ok) {
                m3uContent = await response.text();
                if (m3uContent && m3uContent.length > 100) {
                    usedMethod = `Direkt: ${url}`;
                    break;
                }
            }
        } catch (error) {
            if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
                console.warn(`⚠️ CORS hatası: ${url}`);
            } else {
                console.warn(`⚠️ ${url} başarısız:`, error.message);
            }
            lastError = error;
            continue;
        }
    }
    
    // Step 2: If direct fetch failed, try CORS proxies
    if (!m3uContent) {
        const targetUrl = baseUrls[0]; // Use first URL as target
        
        for (const proxy of CORS_PROXIES) {
            try {
                const proxyUrl = proxy.url(targetUrl);
                
                const response = await fetch(proxyUrl, {
                    method: 'GET',
                    mode: 'cors',
                    cache: forceUpdate ? 'no-cache' : 'no-cache'
                });
                
                if (response.ok) {
                    let content = await response.text();
                    
                    // Remove JSON wrapper if exists
                    if (content.trim().startsWith('{')) {
                        try {
                            const json = JSON.parse(content);
                            content = json.contents || json.data || json.content || content;
                        } catch (e) {
                            // Not JSON, use as is
                        }
                    }
                    
                    if (content && content.length > 100 && (content.includes('#EXTINF') || content.includes('#EXTM3U'))) {
                        m3uContent = content;
                        usedMethod = `CORS Proxy (${proxy.name})`;
                        break;
                    }
                }
            } catch (proxyError) {
                console.warn(`⚠️ ${proxy.name} proxy başarısız:`, proxyError.message);
                continue;
            }
        }
    }
    
    // Step 3: Try alternative sources with proxies
    if (!m3uContent) {
        for (const source of ALTERNATIVE_IPTV_SOURCES) {
            const altUrl = source.getUrl(countryCode);
            
            for (const proxy of CORS_PROXIES.slice(0, 2)) { // Try first 2 proxies
                try {
                    const proxyUrl = proxy.url(altUrl);
                    
                    const response = await fetch(proxyUrl, {
                        method: 'GET',
                        mode: 'cors',
                        cache: forceUpdate ? 'no-cache' : 'no-cache'
                    });
                    
                    if (response.ok) {
                        let content = await response.text();
                        if (content.trim().startsWith('{')) {
                            try {
                                const json = JSON.parse(content);
                                content = json.contents || json.data || json.content || content;
                            } catch (e) {}
                        }
                        
                        if (content && content.length > 100 && (content.includes('#EXTINF') || content.includes('#EXTM3U'))) {
                            m3uContent = content;
                            usedMethod = `${source.name} - ${proxy.name}`;
                            break;
                        }
                    }
                } catch (error) {
                    continue;
                }
            }
            
            if (m3uContent) break;
        }
    }
    
    if (!m3uContent || m3uContent.trim().length === 0) {
        console.error('❌ M3U içeriği alınamadı:', lastError?.message || 'Bilinmeyen hata');
        
        // Show user-friendly error with manual option
        let manualUrl = `https://iptv-org.github.io/iptv/countries/${countryCodeLower}.m3u`;
        if (alternativeCodes.length > 0) {
            manualUrl += `\nveya: https://iptv-org.github.io/iptv/countries/${alternativeCodes[0]}.m3u`;
        }
        
        const errorMsg = `❌ ${countryCode} için kanallar yüklenemedi.\n\n` +
            `Olası nedenler:\n` +
            `• CORS hatası (tüm proxy'ler engellenmiş olabilir)\n` +
            `• İnternet bağlantısı sorunu\n` +
            `• Bu ülke için M3U dosyası mevcut olmayabilir\n\n` +
            `Çözüm: Manuel olarak M3U URL'i ekleyebilirsiniz:\n` +
            manualUrl;
        
        showNotification(errorMsg);
        countryChannels = [];
        return false;
    }
    
    // Clean content
    let cleanContent = m3uContent.trim();
    if (!cleanContent.startsWith('#EXTM3U')) {
        if (cleanContent.includes('#EXTM3U')) {
            const m3uStart = cleanContent.indexOf('#EXTM3U');
            cleanContent = cleanContent.substring(m3uStart);
        } else if (cleanContent.includes('#EXTINF')) {
            cleanContent = '#EXTM3U\n' + cleanContent;
        }
    }
    
    // Parse using tvglobal-style parser
    let parsedChannels = [];
    
    try {
        parsedChannels = parseM3UContent(cleanContent);
    } catch (parseError) {
        console.error('❌ Parse hatası:', parseError);
        // Fallback to existing parser
        try {
            parsedChannels = parseM3uContentForPlayer(cleanContent);
        } catch (fallbackError) {
            console.error('❌ Fallback parse de başarısız:', fallbackError);
            countryChannels = [];
            return false;
        }
    }
    
    if (!parsedChannels || parsedChannels.length === 0) {
        console.warn(`⚠️ ${countryCode} için kanal bulunamadı`);
        countryChannels = [];
        return false;
    }
    
    // Convert to channel format and set country
    countryChannels = parsedChannels.map((ch, index) => ({
        id: ch.id || `country_${countryCode}_${index}`,
        name: ch.name || ch.tvgName || 'İsimsiz Kanal',
        url: ch.url || ch.streamUrl || '',
        tvgName: ch.tvgName || ch.name,
        tvgLogo: ch.tvgLogo || '',
        group: ch.group || ch.category || '',
        category: ch.category || ch.group || '',
        country: ch.country || countryCodeUpper,
        tvgId: ch.tvgId || '',
        language: ch.language || ''
    }));
    
    // Filter out channels without URLs
    countryChannels = countryChannels.filter(ch => ch.url && ch.url.trim().length > 0);
    
    // Ülke M3U çekildiğinde kategoriler de otomatik güncellensin:
    // - önce temizle
    // - sonra bu ülkenin kanallarından tekrar türet
    allCategories.clear();

    // Extract categories from channels and add to allCategories Set (do not normalize here)
    const categoriesAdded = new Set();
    countryChannels.forEach(ch => {
        // Ensure category always exists
        if (!ch.category || !String(ch.category).trim()) {
            ch.category = ch.group || 'Ulusal';
        }

        if (ch.category && String(ch.category).trim()) {
            let category = String(ch.category).trim();
            
            // Birleşik kategorileri ayır (örn: "Ulusal - Yurt Dışı")
            if (category.includes(' - ')) {
                const parts = category.split(' - ').map(p => p.trim()).filter(p => p && p !== 'undefined');
                parts.forEach(part => {
                    if (part) {
                        // Orijinal kategoriyi direkt ekle (normalize etme!)
                        allCategories.add(part);
                        categoriesAdded.add(part);
                    }
                });
            } else {
                // Tek kategori - orijinal halini ekle
                if (category && category !== 'undefined') {
                    allCategories.add(category);
                    categoriesAdded.add(category);
                }
            }
        }
    });
    
    // Update country channel count
    const country = countries.find(c => c.code === countryCodeUpper);
    if (country) {
        country.channelCount = countryChannels.length;
    }
    
    return countryChannels.length > 0;
}

// Open country selection modal
function openCountryModal() {
    const countryModal = document.getElementById('countryModal');
    if (!countryModal) return;
    
    countryModal.classList.add('active');
    countryModal.style.display = 'flex';
    
    // Show/hide update button
    const updateBtn = document.getElementById('updateCountryChannels');
    if (updateBtn) {
        updateBtn.style.display = selectedCountry ? 'flex' : 'none';
    }
    
    // Load countries if not loaded
    if (countries.length === 0) {
        loadCountries().then(() => {
            renderCountryList();
        });
    } else {
        renderCountryList();
    }
}

// Close country selection modal
function closeCountryModal() {
    const countryModal = document.getElementById('countryModal');
    if (countryModal) {
        countryModal.classList.remove('active');
        setTimeout(() => {
            countryModal.style.display = 'none';
        }, 300);
    }
}

// Render country list in modal
function renderCountryList(searchQuery = '') {
    const container = document.getElementById('countryListContainer');
    if (!container) return;
    
    let filteredCountries = countries;
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filteredCountries = countries.filter(c => 
            c.name.toLowerCase().includes(query) || 
            c.code.toLowerCase().includes(query)
        );
    }
    
    container.innerHTML = '';
    
    if (filteredCountries.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">Ülke bulunamadı</div>';
        return;
    }
    
    filteredCountries.forEach(country => {
        const item = document.createElement('div');
        item.className = 'country-item';
        if (selectedCountry && selectedCountry.code === country.code) {
            item.classList.add('selected');
        }
        
        item.innerHTML = `
            <div class="country-item-flag">${country.flag}</div>
            <div class="country-item-name">${country.name}</div>
            <div class="country-item-code">${country.code}</div>
            ${country.channelCount > 0 ? `<div class="country-item-count">${country.channelCount} kanal</div>` : ''}
        `;
        
        item.addEventListener('click', () => {
            // Toggle selection
            if (selectedCountry && selectedCountry.code === country.code) {
                selectedCountry = null;
                item.classList.remove('selected');
            } else {
                // Remove selection from other items
                container.querySelectorAll('.country-item').forEach(i => i.classList.remove('selected'));
                selectedCountry = country;
                item.classList.add('selected');
            }
            
            // Show/hide update button
            const updateBtn = document.getElementById('updateCountryChannels');
            if (updateBtn) {
                updateBtn.style.display = selectedCountry ? 'flex' : 'none';
            }
        });
        
        container.appendChild(item);
    });
}

// Apply country selection
async function applyCountrySelection(forceUpdate = false) {
    if (selectedCountry) {
        useCountryFilter = true;
        showNotification(`⏳ ${selectedCountry.name} kanalları yükleniyor...`);
        
        try {
            // Show loading state
            const applyBtn = document.getElementById('applyCountrySelection');
            if (applyBtn) {
                applyBtn.disabled = true;
                applyBtn.textContent = 'Yükleniyor...';
            }
            
            const success = await loadCountryChannels(selectedCountry.code, forceUpdate);
            if (success && countryChannels.length > 0) {
                // Load as M3U user
                const countryM3uContent = generateM3UFromChannels(countryChannels);
                const playlistName = `${selectedCountry.flag} ${selectedCountry.name}`;
                
                // Load as user M3U
                await loadM3uFromFileContent(countryM3uContent, playlistName);
                
                // Reload users to get the new user
                loadUsers();
                
                // Wait a bit for users to be saved
                await new Promise(resolve => setTimeout(resolve, 200));
                
                // Set as active user
                const countryUser = users.find(u => u && u.name === playlistName);
                
                if (countryUser) {
                    setActiveUser(countryUser.id, { source: 'countrySelection' });
                } else {
                    // Try to find by partial match
                    const partialMatch = users.find(u => u && u.name && u.name.includes(selectedCountry.name));
                    if (partialMatch) {
                        setActiveUser(partialMatch.id, { source: 'countrySelection' });
                    }
                }
                
                updateCountrySelectorLabel();
                saveSelectedCountry();
                renderDynamicCategories();
                renderCategorySidebar();
                renderSidebarChannels();
                closeCountryModal();
                showNotification(`✅ ${selectedCountry.name} - ${countryChannels.length} kanal yüklendi`);
            } else {
                const errorMsg = success ? 'Kanal bulunamadı' : 'Yükleme başarısız';
                console.error(`❌ ${selectedCountry.name} için ${errorMsg}`);
                
                // Show detailed error
                let detailedError = `❌ ${selectedCountry.name} için kanal bulunamadı veya yüklenemedi`;
                if (!success) {
                    detailedError += '\n\nOlası nedenler:\n';
                    detailedError += '• İnternet bağlantısı sorunu\n';
                    detailedError += '• CORS hatası (tarayıcı konsolunu kontrol edin)\n';
                    detailedError += '• Bu ülke için M3U dosyası mevcut olmayabilir\n';
                    detailedError += '\nLütfen tarayıcı konsolunu (F12) açıp hata detaylarını kontrol edin.';
                }
                
                showNotification(detailedError);
                useCountryFilter = false;
                countryChannels = [];
            }
            
            // Re-enable button
            if (applyBtn) {
                applyBtn.disabled = false;
                applyBtn.textContent = 'Uygula';
            }
        } catch (error) {
            console.error('❌ applyCountrySelection hatası:', error);
            showNotification(`❌ Hata: ${error.message || 'Bilinmeyen hata'}\n\nDetaylar için konsolu (F12) kontrol edin.`);
            useCountryFilter = false;
            countryChannels = [];
            
            // Re-enable button
            const applyBtn = document.getElementById('applyCountrySelection');
            if (applyBtn) {
                applyBtn.disabled = false;
                applyBtn.textContent = 'Uygula';
            }
        }
    } else {
        useCountryFilter = false;
        countryChannels = [];
        updateCountrySelectorLabel();
        saveSelectedCountry();
        renderDynamicCategories();
        renderSidebarChannels();
        closeCountryModal();
        showNotification('✅ Ülke filtresi kaldırıldı');
    }
}

// Generate M3U content from channels array
function generateM3UFromChannels(channels) {
    let m3uContent = '#EXTM3U\n';
    
    channels.forEach(ch => {
        const attrs = [];
        if (ch.tvgId) attrs.push(`tvg-id="${ch.tvgId}"`);
        if (ch.tvgName) attrs.push(`tvg-name="${ch.tvgName}"`);
        if (ch.tvgLogo) attrs.push(`tvg-logo="${ch.tvgLogo}"`);
        if (ch.category || ch.group) attrs.push(`group-title="${ch.category || ch.group}"`);
        if (ch.country) attrs.push(`country="${ch.country}"`);
        
        const attrString = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
        m3uContent += `#EXTINF:-1${attrString},${ch.name || ch.tvgName || 'Kanal'}\n`;
        m3uContent += `${ch.url || ch.streamUrl || ''}\n`;
    });
    
    return m3uContent;
}

// Update country channels (refresh from internet)
async function updateCountryChannels() {
    if (!selectedCountry) {
        showNotification('⚠️ Lütfen önce bir ülke seçin');
        return;
    }
    
    console.log('🔄 Ülke kanalları güncelleniyor:', selectedCountry);
    showNotification(`🔄 ${selectedCountry.name} kanalları güncelleniyor...`);
    
    try {
        // Clear existing channels first
        countryChannels = [];
        
        // Force reload from internet
        const success = await loadCountryChannels(selectedCountry.code, true);
        
        if (success && countryChannels.length > 0) {
            // Set country filter flag
            useCountryFilter = true;
            
            // Load as M3U user
            const countryM3uContent = generateM3UFromChannels(countryChannels);
            const playlistName = `${selectedCountry.flag} ${selectedCountry.name}`;
            
            // Load as user M3U (this will update existing or create new)
            await loadM3uFromFileContent(countryM3uContent, playlistName);
            
            // Reload users to get the updated user
            loadUsers();
            
            // Wait a bit for users to be saved
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Set as active user - try multiple times if needed
            let countryUser = users.find(u => u && u.name === playlistName);
            
            // If not found, try again after another short delay
            if (!countryUser) {
                await new Promise(resolve => setTimeout(resolve, 200));
                loadUsers();
                countryUser = users.find(u => u && u.name === playlistName);
            }
            
            if (countryUser) {
                setActiveUser(countryUser.id, { source: 'countryUpdate' });
            } else {
                // Try to find by partial match
                const partialMatch = users.find(u => u && u.name && u.name.includes(selectedCountry.name));
                if (partialMatch) {
                    setActiveUser(partialMatch.id, { source: 'countryUpdate' });
                }
            }
            
            updateCountrySelectorLabel();
            saveSelectedCountry();
            
            // Force re-render everything
            renderDynamicCategories();
            renderCategorySidebar();
            renderSidebarChannels();
            
            // Don't close modal, let user see the result
            showNotification(`✅ ${selectedCountry.name} - ${countryChannels.length} kanal güncellendi`);
        } else {
            const errorMsg = success ? 'Kanal bulunamadı' : 'Yükleme başarısız';
            console.error(`❌ ${selectedCountry.name} için ${errorMsg}`);
            useCountryFilter = false;
            showNotification(`❌ ${selectedCountry.name} için kanal bulunamadı veya yüklenemedi`);
        }
    } catch (error) {
        console.error('❌ updateCountryChannels hatası:', error);
        useCountryFilter = false;
        showNotification(`❌ Güncelleme hatası: ${error.message || 'Bilinmeyen hata'}`);
    }
}

// Clear country selection
function clearCountrySelection() {
    selectedCountry = null;
    useCountryFilter = false;
    countryChannels = [];
    updateCountrySelectorLabel();
    saveSelectedCountry();
    renderDynamicCategories();
    renderSidebarChannels();
    closeCountryModal();
    showNotification('✅ Ülke filtresi temizlendi');
}

// Update country selector button label
function updateCountrySelectorLabel() {
    const label = document.getElementById('countrySelectorLabel');
    if (label) {
        if (selectedCountry) {
            label.textContent = selectedCountry.flag;
            label.title = selectedCountry.name;
        } else {
            label.textContent = '🌍';
            label.title = 'Ülke Seç';
        }
    }
}

// Load selected country from localStorage
async function loadSelectedCountry() {
    try {
        // ÖNEMLİ: Önce users'ı yükle, yoksa user bulunamaz
        loadUsers();
        
        const saved = localStorage.getItem('selectedCountry');
        if (saved) {
            selectedCountry = JSON.parse(saved);
            useCountryFilter = localStorage.getItem('useCountryFilter') === 'true';
            if (useCountryFilter && selectedCountry) {
                // Check if user exists for this country
                const playlistName = `${selectedCountry.flag} ${selectedCountry.name}`;
                const countryUser = users.find(u => u && u.name === playlistName);
                
                if (countryUser && countryUser.channels && Array.isArray(countryUser.channels) && countryUser.channels.length > 0) {
                    // User exists with channels, just activate it
                    // Removed verbose logging
                    
                    // countryChannels array'ini de doldur (getCurrentChannels için gerekli)
                    countryChannels = countryUser.channels;
                    
                    setActiveUser(countryUser.id, { source: 'load' });
                    updateCountrySelectorLabel();
                    
                    // Kategorileri de user'ın kanallarından türet
                    allCategories.clear();
                    countryUser.channels.forEach(ch => {
                        if (ch.category && String(ch.category).trim()) {
                            let category = String(ch.category).trim();
                            if (category.includes(' - ')) {
                                const parts = category.split(' - ').map(p => p.trim()).filter(p => p && p !== 'undefined');
                                parts.forEach(part => {
                                    if (part) allCategories.add(part);
                                });
                            } else {
                                if (category && category !== 'undefined') {
                                    allCategories.add(category);
                                }
                            }
                        }
                    });
                    // Removed verbose logging
                    
                    // Render'ları güncelle
                    renderDynamicCategories();
                    renderCategorySidebar();
                    renderSidebarChannels();
                } else {
                    // User yok veya kanalları boş, internetten yükle
                    console.log(`⚠️ Ülke user bulunamadı veya kanalları boş, internetten yükleniyor...`);
                    await loadCountryChannels(selectedCountry.code);
                    if (countryChannels.length > 0) {
                        const countryM3uContent = generateM3UFromChannels(countryChannels);
                        await loadM3uFromFileContent(countryM3uContent, playlistName);
                        loadUsers(); // Tekrar yükle
                        const newCountryUser = users.find(u => u && u.name === playlistName);
                        if (newCountryUser) {
                            setActiveUser(newCountryUser.id, { source: 'load' });
                            // Removed verbose logging
                        }
                    }
                    updateCountrySelectorLabel();
                }
            } else {
                updateCountrySelectorLabel();
            }
        }
    } catch (e) {
        console.error('Error loading selected country:', e);
    }
}

// Save selected country to localStorage
function saveSelectedCountry() {
    try {
        if (selectedCountry) {
            localStorage.setItem('selectedCountry', JSON.stringify(selectedCountry));
            localStorage.setItem('useCountryFilter', useCountryFilter.toString());
        } else {
            localStorage.removeItem('selectedCountry');
            localStorage.removeItem('useCountryFilter');
        }
    } catch (e) {
        console.error('Error saving selected country:', e);
    }
}

// Update channel source select dropdown
function updateChannelSourceSelect() {
    const channelSourceSelect = document.getElementById('channelSourceSelect');
    if (!channelSourceSelect) {
        console.warn('⚠️ channelSourceSelect elementi bulunamadı');
        return;
    }
    
    // Önce users'ı localStorage'dan tekrar yükle (güncel olması için)
    loadUsers();
    
    console.log('🔄 updateChannelSourceSelect çağrıldı');
    // Removed verbose logging for performance
    
    // Mevcut seçili değeri sakla
    const currentSelectedValue = channelSourceSelect.value;
    
    // Change event listener'ları temizlemek için cloneNode kullan
    const newSelect = channelSourceSelect.cloneNode(false); // Sadece element'i kopyala, içeriği değil
    channelSourceSelect.parentNode.replaceChild(newSelect, channelSourceSelect);
    
    // Clear existing options
    newSelect.innerHTML = '';
    
    // Önce "Mevcut Kanallar" seçeneğini ekle (default channels)
    const defaultOption = document.createElement('option');
    defaultOption.value = 'default';
    defaultOption.textContent = 'Mevcut Kanallar';
    if (!currentUserId || currentUserId === 'default') {
        defaultOption.selected = true;
    }
    newSelect.appendChild(defaultOption);
    
    // Add users as options (M3U dosyalarından yüklenenler)
    if (users && users.length > 0) {
        // Removed verbose logging for performance
        users.forEach((user, index) => {
            if (!user || !user.id || !user.name) {
                console.warn(`⚠️ Geçersiz user at index ${index}:`, user);
                return;
            }
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = user.name;
            if (user.id === currentUserId || user.id === currentSelectedValue) {
                option.selected = true;
                console.log(`✅ User seçili yapıldı: ${user.name} (ID: ${user.id})`);
            }
            newSelect.appendChild(option);
            console.log(`✅ User dropdown'a eklendi: ${user.name} (ID: ${user.id})`);
        });
    } else {
        console.warn('⚠️ Users array boş veya tanımsız');
    }
    
    newSelect.setAttribute('data-custom-select', 'true');
    newSelect.setAttribute('aria-haspopup', 'listbox');
    newSelect.setAttribute('aria-controls', 'usersListContainer');
    newSelect.setAttribute('aria-expanded', userListVisible ? 'true' : 'false');
    
    // Change event listener ekle (programatik değişiklikler için)
    newSelect.addEventListener('change', (e) => {
        const selectedValue = e.target.value;
        console.log('🔄 Dropdown değişti:', selectedValue);
        setActiveUser(selectedValue, { source: 'dropdown' });
        hideUserList();
    });
    
    const openUserList = (event) => {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        if (document.activeElement !== newSelect) {
            try {
                newSelect.focus({ preventScroll: true });
            } catch (err) {
                newSelect.focus();
            }
        }
        showUserList();
    };
    
    newSelect.addEventListener('mousedown', openUserList);
    newSelect.addEventListener('click', openUserList);
    newSelect.addEventListener('focus', () => {
        showUserList();
    });
    newSelect.addEventListener('touchstart', (event) => {
        event.preventDefault();
        openUserList(event);
    }, { passive: false });
    newSelect.addEventListener('keydown', (event) => {
        const interactiveKeys = ['Enter', ' ', 'Spacebar', 'ArrowDown', 'ArrowUp'];
        if (interactiveKeys.includes(event.key)) {
            event.preventDefault();
            openUserList(event);
        }
    });
    newSelect.addEventListener('wheel', (event) => {
        event.preventDefault();
    }, { passive: false });
}

// Zoom state
let zoomLevel = 1.0; // 1.0 = normal, 0.9 = %90, 0.85 = %85, 0.8 = %80
let zoomToggleBtn;
let playerPage;

// Kategori ikonları mapping
const categoryIcons = {
    'all': '📺',
    'favorites': '⭐',
    'Favoriler': '⭐',
    'recent': '🕐',
    'Son İzlenenler': '🕐',
    'ulusal': '📡',
    'Ulusal': '📡',
    'haber': '📰',
    'Haber': '📰',
    'spor': '⚽',
    'Spor': '⚽',
    'eglence': '🎭',
    'Eglence': '🎭',
    'eğlence': '🎭',
    'Eğlence': '🎭',
    'muzik': '🎵',
    'Muzik': '🎵',
    'müzik': '🎵',
    'Müzik': '🎵',
    'belgesel': '🎬',
    'Belgesel': '🎬',
    'dini': '🕌',
    'Dini': '🕌',
    'cocuk': '👶',
    'Cocuk': '👶',
    'çocuk': '👶',
    'Çocuk': '👶',
    'ekonomi': '💰',
    'Ekonomi': '💰',
    'yurt disi': '🌍',
    'Yurt Disi': '🌍',
    'yurt dışı': '🌍',
    'Yurt Dışı': '🌍',
    'radyo canlı': '📻',
    'Radyo Canlı': '📻',
    'radyo': '📻',
    'Radyo': '📻',
    'diğer': '📺',
    'Diğer': '📺'
};

// Sabit kategori listesi (varsayılan sıralama)
const STANDARD_CATEGORIES = [
    { id: 'all', name: 'Tümü', icon: '📺', order: 0 },
    { id: 'Ulusal', name: 'Ulusal', icon: '📡', order: 1 },
    { id: 'Haber', name: 'Haber', icon: '📰', order: 2 },
    { id: 'Çocuk', name: 'Çocuk', icon: '👶', order: 3 },
    { id: 'Müzik', name: 'Müzik', icon: '🎵', order: 4 },
    { id: 'Radyo Canlı', name: 'Radyo Canlı', icon: '📻', order: 5 },
    { id: 'Spor', name: 'Spor', icon: '⚽', order: 6 },
    { id: 'Eğlence', name: 'Eğlence', icon: '🎭', order: 7 },
    { id: 'Yerel', name: 'Yerel', icon: '🏘️', order: 8 },
    { id: 'Belgesel', name: 'Belgesel', icon: '🎬', order: 9 },
    { id: '7/24 Dizi', name: '7/24 Dizi', icon: '📺', order: 10 },
    { id: 'Dini', name: 'Dini', icon: '🕌', order: 11 },
    { id: 'Ekonomi', name: 'Ekonomi', icon: '💰', order: 12 },
    { id: 'Kıbrıs', name: 'Kıbrıs', icon: '🏝️', order: 13 },
    { id: 'Kurumlar', name: 'Kurumlar', icon: '🏢', order: 14 }
];

// Kategori eşleştirme (eski -> yeni)
const categoryMapping = {
    'Eglence': 'Eğlence',
    'Muzik': 'Müzik',
    'Cocuk': 'Çocuk',
    'Yurt Disi': 'Yurt Dışı',
    '7-24 Dizi': '7/24 Dizi',
    '7/24 dizi': '7/24 Dizi',
    '7-24 dizi': '7/24 Dizi'
};

// Kategoriyi normalize et
function normalizeCategory(category) {
    if (!category) return 'Ulusal';
    
    // Trim ve temizle
    category = category.trim();
    
    // Önce categoryMapping'e bak (tam eşleşme)
    if (categoryMapping[category]) {
        return categoryMapping[category];
    }
    
    // Büyük/küçük harf duyarsız kontrol (ilk harf büyük, diğerleri küçük)
    const categoryLower = category.toLowerCase();
    const categoryTitleCase = category.split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
    
    // categoryMapping'de büyük/küçük harf varyantlarını kontrol et
    for (const [key, value] of Object.entries(categoryMapping)) {
        if (key.toLowerCase() === categoryLower) {
            return value;
        }
    }
    
    // STANDARD_CATEGORIES'de TAM EŞLEŞME kontrolü (büyük/küçük harf duyarsız)
    // ÖNEMLİ: Sadece tam eşleşme varsa normalize et, yoksa birleşik kategorileri koru
    const standardCat = STANDARD_CATEGORIES.find(c => 
        c.id.toLowerCase() === categoryLower || 
        c.name.toLowerCase() === categoryLower
    );
    if (standardCat) {
        return standardCat.id;
    }
    
    // Birleşik kategorileri koru (örn: "Dini Müzik" -> "Dini Müzik")
    // İlk harf büyük, diğerleri küçük formatına dönüştür (her kelime için)
    return categoryTitleCase;
}

// Uygulama içinde olup olmadığını kontrol et
function isInApp() {
    // iOS Safari standalone mode
    if (window.navigator.standalone === true) {
        return true;
    }
    
    // PWA standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches) {
        return true;
    }
    
    // Fullscreen mode
    if (window.matchMedia('(display-mode: fullscreen)').matches) {
        return true;
    }
    
    // Android app
    if (document.referrer.includes('android-app://')) {
        return true;
    }
    
    // File protocol
    if (window.location.protocol === 'file:') {
        return true;
    }
    
    // No browser UI (window dimensions check)
    const heightDiff = window.outerHeight - window.innerHeight;
    const widthDiff = window.outerWidth - window.innerWidth;
    if (heightDiff < 5 && widthDiff < 5 && heightDiff >= 0 && widthDiff >= 0) {
        return true;
    }
    
    // User agent check for mobile apps
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    if (/android/i.test(ua) && !/chrome/i.test(ua) && !/firefox/i.test(ua)) {
        return true;
    }
    
    return false;
}

// Kopyalamayı engelleme koruması
function enableCopyProtection() {
    // Sağ tıklamayı engelle
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
    }, { passive: false });

    // Metin seçimini engelle
    document.addEventListener('selectstart', (e) => {
        e.preventDefault();
        return false;
    }, { passive: false });

    // Drag'i engelle
    document.addEventListener('dragstart', (e) => {
        e.preventDefault();
        return false;
    }, { passive: false });

    // Klavye kısayollarını engelle
    document.addEventListener('keydown', (e) => {
        // Ctrl+C, Ctrl+A, Ctrl+S, Ctrl+P, Ctrl+U, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
        if (e.ctrlKey || e.metaKey) {
            // Ctrl+C (Copy)
            if (e.key === 'c' || e.key === 'C') {
                e.preventDefault();
                return false;
            }
            // Ctrl+A (Select All)
            if (e.key === 'a' || e.key === 'A') {
                e.preventDefault();
                return false;
            }
            // Ctrl+S (Save)
            if (e.key === 's' || e.key === 'S') {
                e.preventDefault();
                return false;
            }
            // Ctrl+P (Print)
            if (e.key === 'p' || e.key === 'P') {
                e.preventDefault();
                return false;
            }
            // Ctrl+U (View Source)
            if (e.key === 'u' || e.key === 'U') {
                e.preventDefault();
                return false;
            }
            // Ctrl+Shift+I (Developer Tools)
            if (e.shiftKey && (e.key === 'I' || e.key === 'i')) {
                e.preventDefault();
                return false;
            }
            // Ctrl+Shift+J (Console)
            if (e.shiftKey && (e.key === 'J' || e.key === 'j')) {
                e.preventDefault();
                return false;
            }
            // Ctrl+Shift+C (Inspect Element)
            if (e.shiftKey && (e.key === 'C' || e.key === 'c')) {
                e.preventDefault();
                return false;
            }
            // Ctrl+V (Paste) - sadece input alanlarında çalışsın
            if ((e.key === 'v' || e.key === 'V') && 
                e.target.tagName !== 'INPUT' && 
                e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                return false;
            }
        }

        // F12 (Developer Tools)
        if (e.key === 'F12' || e.keyCode === 123) {
            e.preventDefault();
            return false;
        }

        // Ctrl+Shift+K (Firefox Developer Tools)
        if (e.ctrlKey && e.shiftKey && (e.key === 'K' || e.key === 'k')) {
            e.preventDefault();
            return false;
        }

        // Print Screen (kısmen engelleme)
        if (e.key === 'PrintScreen' || e.keyCode === 44) {
            e.preventDefault();
            // Ekran görüntüsü alındığında uyarı göster
            console.warn('Ekran görüntüsü alınamaz');
            return false;
        }
    }, { passive: false });

    // Copy event'ini engelle
    document.addEventListener('copy', (e) => {
        e.clipboardData.setData('text/plain', '');
        e.preventDefault();
        return false;
    }, { passive: false });

    // Cut event'ini engelle
    document.addEventListener('cut', (e) => {
        e.clipboardData.setData('text/plain', '');
        e.preventDefault();
        return false;
    }, { passive: false });

    // CSS ile metin seçimini engelle
    const style = document.createElement('style');
    style.textContent = `
        * {
            -webkit-user-select: none !important;
            -moz-user-select: none !important;
            -ms-user-select: none !important;
            user-select: none !important;
            -webkit-touch-callout: none !important;
            -webkit-tap-highlight-color: transparent !important;
        }
        input, textarea {
            -webkit-user-select: text !important;
            -moz-user-select: text !important;
            -ms-user-select: text !important;
            user-select: text !important;
        }
    `;
    document.head.appendChild(style);

    // Developer tools detection removed for better performance
    // This was causing unnecessary CPU usage with setInterval checks
}

// Service Worker kaydı
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    // Removed verbose logging
                    
                    // Service Worker güncellemesi kontrolü
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        if (newWorker) {
                            newWorker.addEventListener('statechange', () => {
                                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                    // Removed verbose logging
                                }
                            });
                        }
                    });
                })
                .catch(error => {
                    console.warn('❌ Service Worker kaydı başarısız:', error);
                });
        });
        
        // Service Worker mesaj dinleyicisi
        navigator.serviceWorker.addEventListener('message', event => {
            // Removed verbose logging
        });
    } else {
        console.warn('⚠️ Service Worker desteklenmiyor');
    }
}

// Video player controls'u ayarla
function setupVideoControls() {
    if (!videoPlayer) return;
    
    const inApp = isInApp();
    
    // Video container ve iframe için de data attribute ekle
    const videoContainer = document.getElementById('videoContainerPlayer');
    const iframePlayer = document.getElementById('iframePlayer');
    
    if (inApp) {
        // Uygulama içinde: controls'u tamamen kapat
        videoPlayer.controls = false;
        videoPlayer.removeAttribute('controls');
        // Data attribute ile işaretle
        videoPlayer.setAttribute('data-in-app', 'true');
        if (iframePlayer) {
            iframePlayer.setAttribute('data-in-app', 'true');
        }
        if (videoContainer) {
            videoContainer.setAttribute('data-in-app', 'true');
        }
        // HTML ve body'ye de ekle (CSS selector'lar için)
        document.documentElement.setAttribute('data-in-app', 'true');
        document.body.setAttribute('data-in-app', 'true');
        // Native controls'u tamamen devre dışı bırak
        videoPlayer.setAttribute('controlsList', 'nodownload noplaybackrate nofullscreen noremoteplayback');
        // CSS ile de gizle
        videoPlayer.classList.add('no-controls');
    } else {
        // Normal tarayıcı: controls göster
        videoPlayer.controls = true;
        videoPlayer.removeAttribute('controlsList');
        videoPlayer.removeAttribute('data-in-app');
        if (iframePlayer) {
            iframePlayer.removeAttribute('data-in-app');
        }
        if (videoContainer) {
            videoContainer.removeAttribute('data-in-app');
        }
        document.documentElement.removeAttribute('data-in-app');
        document.body.removeAttribute('data-in-app');
        videoPlayer.classList.remove('no-controls');
    }
}

// DOM Elements
const sidebarCategoryTitle = document.getElementById('sidebarCategoryTitle');
let categoryCards = document.querySelectorAll('.category-card');
const channelsSidebarList = document.getElementById('channelsSidebarList');
const categorySidebarList = document.getElementById('categorySidebarList');
const tabButtons = document.querySelectorAll('.tab-btn');
const videoPlayer = document.getElementById('videoPlayer');
const videoJsPlayer = document.getElementById('videoJsPlayer');
let videoJsInstance = null; // Video.js instance
playerPage = document.querySelector('.player-page');
zoomToggleBtn = document.getElementById('zoomToggleBtn');
const iframePlayer = document.getElementById('iframePlayer');
const videoContainerPlayer = document.getElementById('videoContainerPlayer');
const videoPlaceholderPlayer = document.getElementById('videoPlaceholderPlayer');
const loadingPlayer = document.getElementById('loadingPlayer');

// Tesla Screen Detection & Orientation Handler
function detectTeslaScreen() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const isLandscape = width > height;
    
    // Tesla ekranları genellikle 17 inç, 1920x1200 veya benzeri
    const isTeslaScreen = (
        (width >= 1700 && width <= 2200 && height >= 900 && height <= 1300) ||
        (width >= 900 && width <= 1300 && height >= 1700 && height <= 2200)
    );
    
    if (isTeslaScreen) {
        document.documentElement.classList.add('tesla-screen');
        if (isLandscape) {
            document.documentElement.classList.add('tesla-landscape');
            document.documentElement.classList.remove('tesla-portrait');
        } else {
            document.documentElement.classList.add('tesla-portrait');
            document.documentElement.classList.remove('tesla-landscape');
        }
    } else {
        document.documentElement.classList.remove('tesla-screen', 'tesla-landscape', 'tesla-portrait');
    }
}

// Initialize
// Dikey ekran kontrolü fonksiyonu - CSS media query ile uyumlu
function isPortraitMode() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    // CSS media query: @media (max-width: 900px)
    // 900px'e kadar TÜM genişliklerde portrait-mode aktif olmalı
    // İkinci ekran senaryosunda orientation portrait olarak algılanmayabilir
    // Bu yüzden sadece genişlik kontrolü yapıyoruz - 900px'e kadar tüm genişliklerde aktif
    // - 900px'den büyükse portrait-mode aktif değil
    const isPortrait = width <= 900;
    // Debug: 485px civarında sorun olduğu için log ekle
    if (width >= 480 && width <= 490) {
        // Removed debug logging
    }
    return isPortrait;
}

// Dikey ekran modunu uygula
function applyPortraitMode() {
    const playerContentWrapper = document.querySelector('.player-content-wrapper');
    if (!playerContentWrapper) return;
    
    const wasPortrait = playerContentWrapper.classList.contains('portrait-mode');
    const isPortrait = isPortraitMode();
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    // Debug: 900px'e kadar genişliklerde portrait-mode kontrolü
    if (width <= 900) {
    }
    
    if (isPortrait) {
        // Dikey ekranda - player üstte, kategori ve kanallar altta
        if (!wasPortrait) {
            playerContentWrapper.classList.add('portrait-mode');
            // Removed verbose logging
        }
        // İlk açılışta kategori ve kanalları göster (channels-hidden'ı kaldır)
        // Kanal tıklandığında player-view-mode eklenir ve kategoriler gizlenir
    } else {
        // Yatay moda geçildiğinde portrait-mode'u kaldır
        if (wasPortrait) {
            playerContentWrapper.classList.remove('portrait-mode');
            // Removed verbose logging
            // Eğer player-view-mode aktifse, onu da kaldır (normal moda dön)
            playerContentWrapper.classList.remove('channels-hidden');
            playerContentWrapper.classList.remove('player-view-mode');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Dikey ekranlarda başlangıçta kanalları gizle
    applyPortraitMode();
    
    // Resize handler - requestAnimationFrame ile optimize edilmiş
    let portraitModeResizeRaf = null;
    const handlePortraitModeResize = () => {
        if (portraitModeResizeRaf) {
            cancelAnimationFrame(portraitModeResizeRaf);
        }
        portraitModeResizeRaf = requestAnimationFrame(() => {
            applyPortraitMode();
            portraitModeResizeRaf = null;
        });
    };
    
    // Ekran yönü değiştiğinde kontrol et - hemen çalıştır
    window.addEventListener('resize', handlePortraitModeResize, { passive: true });
    
    window.addEventListener('orientationchange', () => {
        // Orientation change'de hemen kontrol et
        if (portraitModeResizeRaf) {
            cancelAnimationFrame(portraitModeResizeRaf);
        }
        // Orientation change'de biraz bekle (tarayıcı boyutları güncellensin)
        setTimeout(() => {
            applyPortraitMode();
        }, 100);
    });
    
    // Visual Viewport API desteği varsa (mobil tarayıcılar için)
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', handlePortraitModeResize, { passive: true });
    }
    
    // MatchMedia API ile CSS media query'leri dinle
    // İkinci ekran senaryosunda orientation portrait olarak algılanmayabilir, bu yüzden sadece genişlik kontrolü yapıyoruz
    const portraitMediaQuery = window.matchMedia('(max-width: 900px)');
    const handleMediaQueryChange = (e) => {
        applyPortraitMode();
    };
    portraitMediaQuery.addEventListener('change', handleMediaQueryChange);
    
    // İlk yüklemede de kontrol et
    applyPortraitMode();
    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'purple';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    // Kopyalamayı engelleme koruması
    enableCopyProtection();
    
    // Service Worker kaydı
    registerServiceWorker();
    
    // Video player controls ayarı
    setupVideoControls();
    
    // Detect Tesla screen and orientation
    detectTeslaScreen();
    
    // Listen for orientation changes
    // Optimized resize handler with debounce
    let resizeTimeout;
    const handleResize = () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            detectTeslaScreen();
        }, 50); // Reduced from immediate to 50ms for better performance
    };
    
    window.addEventListener('resize', handleResize, { passive: true });
    
    // Orientation change handler
    const handleOrientationChange = () => {
        clearTimeout(resizeTimeout);
        // Immediate update for orientation changes
        setTimeout(detectTeslaScreen, 50);
    };
    
    window.addEventListener('orientationchange', handleOrientationChange);
    
    if (screen.orientation) {
        screen.orientation.addEventListener('change', handleOrientationChange);
    }
    
    // Load users
    loadUsers();
    
    // Load country selection
    loadSelectedCountry();
    updateCountrySelectorLabel();
    
    // Load sort settings
    categorySort = localStorage.getItem('categorySort') || 'default';
    channelSort = localStorage.getItem('channelSort') || 'default';
    
    // M3U listesini ilk yüklemede güncelle
    // Böylece sayfa yenilense bile son yüklenen M3U kaynakları görünecek
    renderM3uSwitchList();
    
    // Get channel ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const channelId = urlParams.get('id');
    const category = urlParams.get('category') || 'all';
    
    currentCategory = category;
    
    loadChannelsFromM3U().then(async () => {
        // Ensure channels are loaded before rendering
        if (!channels || channels.length === 0) {
            console.warn('⚠️ Kanallar yüklenemedi');
        }
        
        // Android'de otomatik M3U yükleme kontrolü
        const isAndroid = /Android/i.test(navigator.userAgent);
        const androidInterfaceNames = ['Android', 'android', 'JSInterface', 'jsInterface', 'WebViewInterface', 'webViewInterface'];
        let androidInterface = null;
        for (const name of androidInterfaceNames) {
            if (typeof window[name] !== 'undefined' && window[name] !== null) {
                androidInterface = window[name];
                break;
            }
        }
        const isAndroidApp = isAndroid && androidInterface !== null;
        
        if (isAndroidApp) {
            // Removed verbose logging
            const defaultPath = '/storage/emulated/0/Download/plustv.m3u';
            
            // Android dosya okuma fonksiyonu - kapsamlı versiyon
            async function readAndroidFile(filePath) {
                if (!androidInterface) {
                    throw new Error('Android interface bulunamadı');
                }
                
                const readMethods = [
                    'readFile', 'readFileContent', 'getFileContent',
                    'readFileAsString', 'readFileAsText',
                    'loadFile', 'loadFileContent',
                    'getFile', 'getFileText',
                    'readM3U', 'loadM3U',
                    'readFileFromPath', 'getFileFromPath'
                ];
                
                for (const method of readMethods) {
                    try {
                        if (typeof androidInterface[method] === 'function') {
                            const content = androidInterface[method](filePath);
                            if (content && content.trim().length > 0) {
                                // Removed verbose logging
                                return content;
                            }
                        }
                    } catch (err) {
                        console.warn(`⚠️ ${method} çağrısı başarısız:`, err);
                    }
                }
                throw new Error('Dosya okunamadı');
            }
            
            // Otomatik M3U yükleme dene - farklı yolları dene
            // Önce Android interface'inden Downloads yolunu almayı dene
            let downloadPath = null;
            if (androidInterface) {
                const pathMethods = ['getDownloadsPath', 'getDownloadPath', 'getDownloadsDirectory', 'getDownloadDirectory'];
                for (const method of pathMethods) {
                    try {
                        if (typeof androidInterface[method] === 'function') {
                            downloadPath = androidInterface[method]();
                            if (downloadPath && downloadPath.trim().length > 0) {
                                console.log(`✅ Downloads yolu alındı (${method}): ${downloadPath}`);
                                break;
                            }
                        }
                    } catch (err) {
                        console.warn(`⚠️ ${method} çağrısı başarısız:`, err);
                    }
                }
            }
            
            const possiblePaths = [];
            
            // Eğer Android'den yol alındıysa, onu kullan
            if (downloadPath) {
                const cleanPath = downloadPath.endsWith('/') ? downloadPath.slice(0, -1) : downloadPath;
                possiblePaths.push(`${cleanPath}/plustv.m3u`);
            }
            
            // Standart yolları ekle
            possiblePaths.push(
                '/storage/emulated/0/Download/plustv.m3u',
                '/sdcard/Download/plustv.m3u',
                '/storage/emulated/0/Downloads/plustv.m3u',
                '/sdcard/Downloads/plustv.m3u'
            );
            
            let loaded = false;
            for (const path of possiblePaths) {
                try {
                    const fileContent = await readAndroidFile(path);
                    if (fileContent && fileContent.trim().length > 0) {
                        await loadM3uFromFileContent(fileContent, 'plustv.m3u');
                        loaded = true;
                        break;
                    }
                } catch (error) {
                    // Removed verbose logging
                    // Bir sonraki yolu dene
                    continue;
                }
            }
            
            if (!loaded) {
                // Removed verbose logging
                // Sessizce devam et, hata gösterme (otomatik yükleme için)
            }
        }
        
        if (channelId) {
            const channel = channels.find(ch => ch.id === parseInt(channelId));
            if (channel) {
                playChannel(channel);
            }
        }
        // Kategorileri render et (optimized - non-blocking)
        requestAnimationFrame(() => {
            renderDynamicCategories();
            renderCategorySidebar();
            renderM3uSwitchList();
            // Channels render'ı ayrı bir frame'de yap
            requestAnimationFrame(() => {
                renderSidebarChannels();
            });
        });
    }).catch(error => {
        console.error('❌ Kanallar yüklenirken hata:', error);
    });
    
    setupEventListeners();
    
    // Setup fullscreen listeners
    setupFullscreenListeners();
    
    // Initialize zoom - DOM tamamen yüklendikten sonra
    // Önce hemen dene, sonra bir kez daha dene
    initializeZoom();
    setTimeout(() => {
        initializeZoom();
    }, 300);
    
    // Setup user menu and M3U buttons
    setupUserMenuAndM3UButtons();
    
    // Setup channel navigation buttons
    setupChannelNavButtons();
    
    // Update navigation buttons initially
    updateChannelNavButtons();
    
    // Setup back to main button (for portrait mode player view)
    setupBackToMainButton();
});

// Zoom Functions
function loadZoomLevel() {
    try {
        const stored = localStorage.getItem('plusTv_zoomLevel');
        return stored ? parseFloat(stored) : 1.0;
    } catch (e) {
        return 1.0;
    }
}

function saveZoomLevel() {
    try {
        localStorage.setItem('plusTv_zoomLevel', zoomLevel.toString());
        // Storage event'i tetikle (diğer sayfalar için)
        window.dispatchEvent(new StorageEvent('storage', {
            key: 'plusTv_zoomLevel',
            newValue: zoomLevel.toString(),
            oldValue: localStorage.getItem('plusTv_zoomLevel')
        }));
    } catch (e) {
        console.warn('Could not save zoom level:', e);
    }
}

function applyZoom() {
    // Zoom iptal edildi - her zaman 100% (1.0), transform'ları kaldır
    if (!playerPage) {
        playerPage = document.querySelector('.player-page');
    }
    if (playerPage) {
        const playerContentWrapper = document.querySelector('.player-content-wrapper');
        const videoContainer = document.querySelector('.video-container-player');
        const playerMain = document.querySelector('.player-main');
        const searchHeader = document.querySelector('.search-header');
            const categoriesSidebar = document.getElementById('categoriesSidebar');
            const channelsSidebar = document.getElementById('channelsSidebar');
        
        // Tüm zoom transform'larını kaldır (100% için gerekli değil)
        
        // Header'dan zoom'u kaldır
        if (searchHeader) {
            searchHeader.style.transform = 'none';
            searchHeader.style.width = '';
            searchHeader.style.maxWidth = '';
            const originalHeight = searchHeader.offsetHeight || parseInt(window.getComputedStyle(searchHeader).minHeight) || 64;
            
            // Player content wrapper ve sidebar'ların margin-top ve height'ını ayarla
            if (playerContentWrapper) {
                playerContentWrapper.style.marginTop = `${originalHeight}px`;
            }
            if (categoriesSidebar) {
                categoriesSidebar.style.height = `calc(100vh - ${originalHeight}px)`;
            }
            if (channelsSidebar) {
                channelsSidebar.style.height = `calc(100vh - ${originalHeight}px)`;
            }
        }
        
        // Categories sidebar'dan zoom'u kaldır
        if (categoriesSidebar) {
            categoriesSidebar.style.transform = 'none';
            categoriesSidebar.style.width = '';
            categoriesSidebar.style.minWidth = '';
            categoriesSidebar.style.maxWidth = '';
            categoriesSidebar.style.overflow = '';
            categoriesSidebar.style.overflowY = '';
            categoriesSidebar.style.overflowX = '';
        }
        
        // Channels sidebar'dan zoom'u kaldır
            if (channelsSidebar) {
            channelsSidebar.style.transform = 'none';
            channelsSidebar.style.width = '';
            channelsSidebar.style.minWidth = '';
            channelsSidebar.style.maxWidth = '';
            channelsSidebar.style.overflow = '';
            channelsSidebar.style.overflowY = '';
            channelsSidebar.style.overflowX = '';
        }
        
        // Player main'den zoom'u kaldır
        if (playerMain) {
            playerMain.style.transform = 'none';
            playerMain.style.width = '';
            playerMain.style.maxWidth = '';
            playerMain.style.height = '';
        }
        
        // Video container'dan zoom'u kaldır
        if (playerContentWrapper && videoContainer) {
            const videoPlaceholder = document.getElementById('videoPlaceholderPlayer');
            const loadingPlayer = document.getElementById('loadingPlayer');
            
            videoContainer.style.transform = 'none';
            videoContainer.style.width = '';
            videoContainer.style.height = '';
            videoContainer.style.maxWidth = '';
            videoContainer.style.maxHeight = '';
            videoContainer.style.minHeight = '';
            
            // Placeholder ve loading overlay'den zoom'u kaldır
            if (videoPlaceholder) {
                videoPlaceholder.style.transform = 'none';
                videoPlaceholder.style.transformOrigin = '';
            }
            if (loadingPlayer) {
                loadingPlayer.style.transform = 'none';
                loadingPlayer.style.transformOrigin = '';
            }
            
            // Video ve iframe'den zoom'u kaldır
            const videoPlayer = document.getElementById('videoPlayer');
            const iframePlayer = document.getElementById('iframePlayer');
            if (videoPlayer) {
                videoPlayer.style.transform = 'none';
                videoPlayer.style.width = '100%';
                videoPlayer.style.height = '100%';
            }
            if (iframePlayer) {
                iframePlayer.style.transform = 'none';
                iframePlayer.style.width = '100%';
                iframePlayer.style.height = '100%';
            }
            
            // Content wrapper'dan zoom'u kaldır
            playerContentWrapper.style.transform = 'none';
            playerContentWrapper.style.width = '';
            playerContentWrapper.style.height = '';
            playerContentWrapper.style.maxWidth = '';
        }
            
            // Player page'in boyutlarını koru
            playerPage.style.transform = 'none';
            playerPage.style.width = '100%';
            playerPage.style.maxWidth = '100%';
            playerPage.style.height = '100vh';
            playerPage.style.margin = '0';
            playerPage.style.padding = '0';
            
        // Removed verbose logging
        
        // Zoom uygulandıktan sonra kanallar ve kategorileri yeniden render et
        setTimeout(() => {
            try {
                if (typeof renderDynamicCategories === 'function') {
                    renderDynamicCategories();
                }
                if (typeof renderSidebarChannels === 'function') {
                    renderSidebarChannels();
                }
                if (typeof renderCategorySidebar === 'function') {
                    renderCategorySidebar();
                }
                // Removed verbose logging
            } catch (error) {
                console.warn('⚠️ Render hatası:', error);
            }
        }, 100);
    } else {
        console.warn('playerPage not found for zoom application');
    }
}

function toggleZoom() {
    // Zoom iptal edildi - her zaman 100% kalacak
    zoomLevel = 1.0;
    applyZoom();
    console.log('⚠️ Zoom iptal edildi - toggleZoom çalışmıyor, her zaman 100%');
}

function updateZoomIcon() {
    if (!zoomToggleBtn) return;
    
    const fullscreenIcon = zoomToggleBtn.querySelector('.fullscreen-icon');
    const fullscreenExitIcon = zoomToggleBtn.querySelector('.fullscreen-exit-icon');
    
    if (fullscreenIcon && fullscreenExitIcon) {
        if (zoomLevel < 1.0) {
            fullscreenIcon.style.display = 'none';
            fullscreenExitIcon.style.display = 'block';
            zoomToggleBtn.title = `Tam ekran (${Math.round(zoomLevel * 100)}%)`;
        } else {
            fullscreenIcon.style.display = 'block';
            fullscreenExitIcon.style.display = 'none';
            zoomToggleBtn.title = 'Tam ekran';
        }
    }
}

function initializeZoom() {
    // Zoom özelliği iptal edildi - her zaman 100% (1.0)
    zoomLevel = 1.0;
    
    // DOM elementlerini kontrol et
    if (!playerPage) {
        playerPage = document.querySelector('.player-page');
    }
    if (!zoomToggleBtn) {
        zoomToggleBtn = document.getElementById('zoomToggleBtn');
    }
    
    // Zoom butonunu gizle
            if (zoomToggleBtn) {
        zoomToggleBtn.style.display = 'none';
        zoomToggleBtn.style.visibility = 'hidden';
    }
    
    // Zoom'u uygula (her zaman 100%)
    applyZoom();
    
    console.log('✅ Zoom iptal edildi - her zaman 100%');
}

function setupResponsiveZoom() {
    // Ekran boyutuna göre responsive zoom ayarlama
    function adjustZoomForScreen() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        // İlk açılış kontrolü - eğer localStorage'da zoom yoksa, responsive zoom'u devre dışı bırak
        const storedZoom = localStorage.getItem('plusTv_zoomLevel');
        if (!storedZoom || storedZoom === 'null' || storedZoom === 'undefined' || storedZoom === '') {
            console.log('📌 İlk açılış: Responsive zoom devre dışı, zoom 100% kalacak');
            return; // İlk açılışta responsive zoom yapma
        }
        
        // Eğer kullanıcı manuel zoom yapmışsa (1.0 değilse), otomatik ayarlama yapma
        const savedZoom = loadZoomLevel();
        if (savedZoom !== 1.0) {
            console.log('📌 Kullanıcı manuel zoom yapmış (' + savedZoom + '), responsive zoom atlandı');
            return; // Kullanıcı manuel zoom yapmış, değiştirme
        }
        
        // Eğer zoom 1.0 ise ama bu ilk açılıştan hemen sonra ise (kullanıcı henüz zoom değiştirmemişse)
        // Responsive zoom yapabiliriz, ama sadece kullanıcı zoom butonuna hiç tıklamamışsa
        // Bunu kontrol etmek için bir flag kullanabiliriz veya sadece resize/orientation değişikliklerinde responsive zoom yapalım
        
        // Responsive zoom: Ekran boyutuna göre otomatik ayarla
            let autoZoom = 1.0;
            
        if (width < 480) {
            // Çok küçük ekranlar (mobil)
            autoZoom = 0.75;
        } else if (width < 900) {
            // Küçük ekranlar (tablet portrait)
            autoZoom = 0.85;
        } else if (width < 1024) {
            // Orta ekranlar (tablet landscape)
            autoZoom = 0.9;
        } else if (width < 1440) {
            // Büyük ekranlar (laptop)
            autoZoom = 0.95;
            } else {
            // Çok büyük ekranlar
                autoZoom = 1.0;
            }
            
            // Zoom seviyesini ayarla ve kaydet
            if (Math.abs(autoZoom - zoomLevel) > 0.01) {
                zoomLevel = autoZoom;
                saveZoomLevel();
                applyZoom();
                updateZoomIcon();
            console.log('Responsive zoom applied:', autoZoom, 'for screen width:', width);
        }
    }
    
    // İlk yüklemede ve ekran boyutu değiştiğinde ayarla
    adjustZoomForScreen();
    
    // Optimized resize handler
    let zoomResizeTimeout;
    const handleZoomResize = () => {
        clearTimeout(zoomResizeTimeout);
        zoomResizeTimeout = setTimeout(() => {
            adjustZoomForScreen();
            // Zoom uygulandıktan sonra tekrar uygula
            applyZoom();
        }, 150);
    };
    
    window.addEventListener('resize', handleZoomResize, { passive: true });
    
    // Orientation change'de de ayarla
    window.addEventListener('orientationchange', () => {
        clearTimeout(zoomResizeTimeout);
        setTimeout(() => {
            adjustZoomForScreen();
            applyZoom();
        }, 200);
    }, { passive: true });
    
    // Media query değişikliklerini dinle
    if (window.matchMedia) {
        const mediaQueries = [
            window.matchMedia('(max-width: 480px)'),
            window.matchMedia('(max-width: 900px)'),
            window.matchMedia('(max-width: 1024px)'),
            window.matchMedia('(max-width: 1440px)')
        ];
        
        mediaQueries.forEach(mq => {
            mq.addEventListener('change', () => {
                clearTimeout(zoomResizeTimeout);
                zoomResizeTimeout = setTimeout(() => {
                    adjustZoomForScreen();
                    applyZoom();
                }, 150);
            });
        });
    }
}

function setupZoomSync() {
    // Storage event listener: diğer sayfalardaki zoom değişikliklerini dinle
    window.addEventListener('storage', (e) => {
        if (e.key === 'plusTv_zoomLevel' && e.newValue) {
            const newZoom = parseFloat(e.newValue);
            if (newZoom !== zoomLevel) {
                zoomLevel = newZoom;
                applyZoom();
                updateZoomIcon();
            }
        }
    });
    
    // Sayfa görünür olduğunda zoom seviyesini kontrol et
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            const savedZoom = loadZoomLevel();
            if (Math.abs(savedZoom - zoomLevel) > 0.01) {
                zoomLevel = savedZoom;
                applyZoom();
                updateZoomIcon();
            }
        }
    });
    
    // Focus olduğunda da kontrol et
    window.addEventListener('focus', () => {
        const savedZoom = loadZoomLevel();
        if (Math.abs(savedZoom - zoomLevel) > 0.01) {
            zoomLevel = savedZoom;
            applyZoom();
            updateZoomIcon();
        }
    });
}

// Cleanup function
function cleanup() {
    // Clear all timeouts
    activeTimeouts.forEach(timeout => {
        try {
            clearTimeout(timeout);
        } catch (e) {
            console.warn('Timeout cleanup error:', e);
        }
    });
    activeTimeouts = [];
    
    // Destroy HLS instance
    if (hlsInstance) {
        try {
            hlsInstance.destroy();
        } catch (e) {
            console.warn('HLS cleanup error:', e);
        }
        hlsInstance = null;
    }
    
    if (videoPlayer && videoPlayer.hls) {
        try {
            videoPlayer.hls.destroy();
            videoPlayer.hls = null;
        } catch (e) {
            console.warn('Video player HLS cleanup error:', e);
        }
    }
    
    // Destroy Video.js instance
    if (videoJsInstance) {
        try {
            videoJsInstance.dispose();
            videoJsInstance = null;
        } catch (e) {
            console.warn('Video.js cleanup error:', e);
        }
    }
    
    // Hide Video.js player
    if (videoJsPlayer) {
        videoJsPlayer.style.display = 'none';
    }
    
    // Stop video
    if (videoPlayer) {
        try {
            videoPlayer.pause();
            videoPlayer.src = '';
            videoPlayer.load();
        } catch (e) {
            console.warn('Video player cleanup error:', e);
        }
    }
    
    if (iframePlayer) {
        try {
            iframePlayer.src = '';
        } catch (e) {
            console.warn('Iframe cleanup error:', e);
        }
    }
    
    // Remove touch event handlers if they exist
    if (videoContainerPlayer && videoContainerPlayer._touchStartHandler) {
        try {
            videoContainerPlayer.removeEventListener('touchstart', videoContainerPlayer._touchStartHandler);
            videoContainerPlayer.removeEventListener('touchend', videoContainerPlayer._touchEndHandler);
            delete videoContainerPlayer._touchStartHandler;
            delete videoContainerPlayer._touchEndHandler;
        } catch (e) {
            console.warn('Touch handler cleanup error:', e);
        }
    }
}

// Safe timeout wrapper
function safeSetTimeout(callback, delay) {
    const timeout = setTimeout(() => {
        activeTimeouts = activeTimeouts.filter(t => t !== timeout);
        callback();
    }, delay);
    activeTimeouts.push(timeout);
    return timeout;
}

// Setup User Menu and M3U Buttons
function setupUserMenuAndM3UButtons() {
    console.log('🔧 setupUserMenuAndM3UButtons çağrıldı');
    
    const userIconBtn = document.getElementById('userIconBtn');
    const m3uModal = document.getElementById('m3uModal');
    const m3uModalClose = document.getElementById('m3uModalClose');
    const m3uCancelBtn = document.getElementById('m3uCancelBtn');
    
    console.log('🔍 Element kontrolü:', {
        userIconBtn: !!userIconBtn,
        m3uModal: !!m3uModal,
        m3uModalClose: !!m3uModalClose
    });
    
    if (!userIconBtn) {
        console.error('❌ User icon button not found', { userIconBtn });
        return;
    }
    
    if (!m3uModal) {
        console.error('❌ M3U modal bulunamadı!');
    }
    
    // User icon click - direkt M3U yükleme (dropdown yok)
    // Android interface kontrolü - daha kapsamlı
    function checkAndroidInterface() {
        // Tüm olası interface isimlerini dene
        const androidInterfaceNames = [
            'Android', 'android', 
            'JSInterface', 'jsInterface', 
            'WebViewInterface', 'webViewInterface',
            'WebAppInterface', 'webAppInterface',
            'AppInterface', 'appInterface',
            'PlusTV', 'plusTV', 'plustv',
            'MainActivity', 'mainActivity',
            'Bridge', 'bridge'
        ];
        
        console.log('🔍 Android interface aranıyor...');
        for (const name of androidInterfaceNames) {
            if (typeof window[name] !== 'undefined' && window[name] !== null) {
                console.log(`✅ Android interface bulundu: ${name}`, window[name]);
                return window[name];
            }
        }
        
        // window objesinin tüm property'lerini kontrol et
        console.log('🔍 window objesi property\'leri kontrol ediliyor...');
        for (const key in window) {
            if (key.toLowerCase().includes('android') || 
                key.toLowerCase().includes('interface') ||
                key.toLowerCase().includes('bridge') ||
                key.toLowerCase().includes('js')) {
                console.log(`🔍 Potansiyel interface: ${key}`, typeof window[key]);
                if (typeof window[key] === 'object' && window[key] !== null) {
                    console.log(`✅ Potansiyel interface bulundu: ${key}`, window[key]);
                    return window[key];
                }
            }
        }
        
        console.warn('⚠️ Android interface bulunamadı');
        return null;
    }
    
    // Android'de dosya okuma fonksiyonu - daha kapsamlı
    async function readAndroidFile(filePath) {
        const androidInterface = checkAndroidInterface();
        if (!androidInterface) {
            throw new Error('Android interface bulunamadı');
        }
        
        // Tüm olası method isimlerini dene
        const readMethods = [
            'readFile', 'readFileContent', 'getFileContent',
            'readFileAsString', 'readFileAsText',
            'loadFile', 'loadFileContent',
            'getFile', 'getFileText',
            'readM3U', 'loadM3U',
            'readFileFromPath', 'getFileFromPath'
        ];
        
        for (const method of readMethods) {
            try {
                if (typeof androidInterface[method] === 'function') {
                    const content = androidInterface[method](filePath);
                    if (content && content.trim().length > 0) {
                        return content;
                    }
                }
            } catch (err) {
                // Silently continue to next method
            }
        }
        
        throw new Error('Dosya okunamadı - hiçbir method çalışmadı');
    }
    
    // Android'de varsayılan M3U dosyasını yükle - farklı yolları dene
    async function loadAndroidM3uFile() {
        console.log('📱 Android: M3U dosyası yükleniyor...');
        
        // Önce Android interface'inden dosya yolunu almayı dene
        let downloadPath = null;
        const androidInterface = checkAndroidInterface();
        if (androidInterface) {
            // Android'den Downloads klasörü yolunu almayı dene
            const pathMethods = ['getDownloadsPath', 'getDownloadPath', 'getDownloadsDirectory', 'getDownloadDirectory'];
            for (const method of pathMethods) {
                try {
                    if (typeof androidInterface[method] === 'function') {
                        downloadPath = androidInterface[method]();
                        if (downloadPath && downloadPath.trim().length > 0) {
                            console.log(`✅ Downloads yolu alındı (${method}): ${downloadPath}`);
                            break;
                        }
                    }
                } catch (err) {
                    console.warn(`⚠️ ${method} çağrısı başarısız:`, err);
                }
            }
        }
        
        // Farklı dosya yollarını dene (Environment.getExternalStoragePublicDirectory kullanıyor)
        const possiblePaths = [];
        
        // Eğer Android'den yol alındıysa, onu kullan
        if (downloadPath) {
            // Yolun sonunda / var mı kontrol et
            const cleanPath = downloadPath.endsWith('/') ? downloadPath.slice(0, -1) : downloadPath;
            possiblePaths.push(`${cleanPath}/plustv.m3u`);
            possiblePaths.push(`${cleanPath}/plustv.m3u8`);
        }
        
        // Standart yolları ekle
        possiblePaths.push(
            '/storage/emulated/0/Download/plustv.m3u',
            '/sdcard/Download/plustv.m3u',
            '/storage/emulated/0/Downloads/plustv.m3u',
            '/sdcard/Downloads/plustv.m3u',
            '/storage/emulated/0/Download/plustv.m3u8',
            '/sdcard/Download/plustv.m3u8',
            // Android 10+ için scoped storage yolları
            '/storage/emulated/0/Android/data/com.android.providers.downloads/cache/plustv.m3u',
            '/storage/emulated/0/Android/data/com.android.providers.downloads/cache/plustv.m3u8'
        );
        
        console.log('📂 Denenecek dosya yolları:', possiblePaths);
        
        let lastError = null;
        let triedPaths = [];
        
        for (const filePath of possiblePaths) {
            triedPaths.push(filePath);
            try {
                // Removed verbose logging
                const fileContent = await readAndroidFile(filePath);
                if (fileContent && fileContent.trim().length > 0) {
                    console.log(`✅ M3U dosyası okundu: ${filePath}, içerik uzunluğu: ${fileContent.length}`);
                    await loadM3uFromFileContent(fileContent, 'plustv.m3u');
                    return true;
                } else {
                    console.warn(`⚠️ Dosya boş: ${filePath}`);
                }
            } catch (error) {
                console.warn(`⚠️ Dosya okunamadı: ${filePath}`, error.message || error);
                lastError = error;
                // Bir sonraki yolu dene
                continue;
            }
        }
        
        // Hiçbir yol çalışmadıysa hata göster
        console.error('❌ M3U dosyası hiçbir yolda bulunamadı');
        const errorMsg = lastError ? (lastError.message || lastError.toString()) : 'Dosya bulunamadı';
        
        alert(`⚠️ M3U dosyası bulunamadı!\n\nDenenen yollar:\n${triedPaths.slice(0, 5).join('\n')}...\n\nLütfen dosyanın Downloads klasöründe olduğundan emin olun.\n\nHata: ${errorMsg}`);
        return false;
    }
    
    // Global file input (tekrar kullanım için)
    let globalFileInput = null;
    let isFilePickerOpen = false;
    
    // Dosya seçici aç (hem masaüstü hem Android için)
    function openFilePicker() {
        // Eğer dosya seçici zaten açıksa, tekrar açma
        if (isFilePickerOpen) {
            // Removed verbose logging
            return;
        }
        
        // Removed verbose logging
        isFilePickerOpen = true;
        
        // Navigation prevention - sadece beforeunload yeterli
        let navigationPreventionActive = true;
        const preventNavigation = (e) => {
            if (navigationPreventionActive) {
                e.preventDefault();
                e.returnValue = '';
                return '';
            }
        };
        
        window.addEventListener('beforeunload', preventNavigation, { capture: true, passive: false });
        
        // Cleanup fonksiyonu
        const cleanupNavigationPrevention = () => {
            navigationPreventionActive = false;
            window.removeEventListener('beforeunload', preventNavigation, { capture: true });
        };
        
        // Önce mevcut file input varsa temizle
        if (globalFileInput && globalFileInput.parentNode) {
            globalFileInput.parentNode.removeChild(globalFileInput);
            globalFileInput = null;
        }
        
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        // Android için daha geniş MIME type'lar (tüm dosyalar)
        fileInput.accept = '.m3u,.m3u8,audio/x-mpegurl,application/vnd.apple.mpegurl,text/plain,*/*';
        fileInput.setAttribute('data-m3u-picker', 'true');
        fileInput.style.display = 'none';
        fileInput.style.position = 'absolute';
        fileInput.style.left = '-9999px';
        fileInput.style.visibility = 'hidden';
        fileInput.setAttribute('multiple', 'false'); // Tek dosya seçimi
        
        // Android için özel attribute'lar
        fileInput.setAttribute('webkitdirectory', 'false');
        
        // Form içinde olmamasını garanti et - sayfa yenilenmesini engelle
        fileInput.setAttribute('form', '');
        fileInput.setAttribute('name', 'm3uFilePicker');
        
        // Tüm form submit event'lerini engelle
        fileInput.addEventListener('submit', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return false;
        }, { capture: true, passive: false });
        
        document.body.appendChild(fileInput);
        globalFileInput = fileInput;
        
        // Change event listener - sadece bir kez
        const handleFileChange = async (e) => {
            // Sayfa yenilenmesini engelle
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            // Form submit'i engelle
            if (e.target.form) {
                e.target.form.addEventListener('submit', (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    return false;
                }, { once: true });
            }
            
            isFilePickerOpen = false;
            
            const file = e.target.files[0];
            if (!file) {
                cleanupFileInput();
                return false;
            }
            
            const fileName = file.name.toLowerCase();
            console.log(`📂 Dosya seçildi: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
            
            // Dosya uzantısı kontrolü (daha esnek)
            if (!fileName.endsWith('.m3u') && !fileName.endsWith('.m3u8') && !file.type.includes('mpegurl') && !file.type.includes('plain')) {
                // Uzantı kontrolü yap ama çok katı olma
                const confirmLoad = confirm('⚠️ Seçilen dosya .m3u veya .m3u8 uzantılı değil.\n\nDosya adı: ' + file.name + '\n\nYine de yüklemek istiyor musunuz?');
                if (!confirmLoad) {
                    cleanupFileInput();
                    return false;
                }
            }
            
            try {
                const fileContent = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = (e) => reject(new Error('Dosya okunamadı'));
                    reader.readAsText(file);
                });
                
                if (fileContent && fileContent.trim().length > 0) {
                    // Doğrudan yükle - gereksiz Promise wrapper kaldırıldı
                    await loadM3uFromFileContent(fileContent, file.name);
                } else {
                    alert('⚠️ Dosya boş!');
                }
                
                cleanupFileInput();
                cleanupNavigationPrevention();
            } catch (error) {
                console.error('❌ Dosya okuma hatası:', error);
                // Hata mesajını daha açıklayıcı yap
                const errorMsg = error && typeof error === 'object' && error.message 
                    ? error.message 
                    : (typeof error === 'string' ? error : 'Bilinmeyen hata');
                alert('❌ Dosya okunurken hata oluştu!\n\nHata: ' + errorMsg);
                cleanupFileInput();
                cleanupNavigationPrevention();
            }
            
            // Sayfa yenilenmesini engelle
            return false;
        };
        
        // Change event listener - capture phase'de yakala ve engelle
        fileInput.addEventListener('change', handleFileChange, { once: true, passive: false, capture: true });
        
        // Cancel event (kullanıcı dosya seçiciyi kapattı)
        const handleCancel = () => {
            // Removed verbose logging
            isFilePickerOpen = false;
            cleanupFileInput();
        };
        
        // Input focus kaybı (dosya seçici kapandı)
        fileInput.addEventListener('blur', () => {
            setTimeout(() => {
                if (isFilePickerOpen && fileInput.files.length === 0) {
                    // Removed verbose logging
                    isFilePickerOpen = false;
                    cleanupFileInput();
                }
            }, 300);
        }, { once: true });
        
        // File input'u hemen tıkla
        setTimeout(() => {
            try {
                fileInput.click();
                console.log('✅ File input tıklandı');
            } catch (error) {
                console.error('❌ File input tıklanamadı:', error);
                isFilePickerOpen = false;
                cleanupFileInput();
            }
        }, 50);
        
        // Cleanup fonksiyonu
        function cleanupFileInput() {
            if (globalFileInput) {
                globalFileInput.value = '';
                if (globalFileInput.parentNode) {
                    globalFileInput.parentNode.removeChild(globalFileInput);
                }
                globalFileInput = null;
            }
            isFilePickerOpen = false;
        }
    }
    
    // User icon'a tıklayınca direkt M3U yükleme
    async function handleM3uLoad(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
        }
        
        // Eğer dosya seçici zaten açıksa, tekrar açma
        if (isFilePickerOpen) {
            // Removed verbose logging
            return false;
        }
        
        console.log('👤 User icon clicked - M3U yükleme başlatılıyor');
        
        // Android detection
        const isAndroid = /Android/i.test(navigator.userAgent);
        const androidInterface = checkAndroidInterface();
        const isAndroidApp = isAndroid && androidInterface !== null;
        
        if (isAndroidApp) {
            // Android: Önce dosya seçiciyi açmayı dene, yoksa otomatik yükleme yap
            console.log('📱 Android uygulama tespit edildi');
            
            // Önce dosya seçiciyi açmayı dene (WebView'de çalışıyorsa)
            openFilePicker();
            // Dosya seçici açıldıysa, otomatik yükleme yapma
            // Kullanıcı dosya seçerse fileInput change event'i tetiklenecek
        } else {
            // Masaüstü: Dosya seçici aç
            console.log('💻 Masaüstü tespit edildi');
            openFilePicker();
        }
        
        return false;
    }
    
    // Event listener'ları ekle - debounce ile
    let m3uLoadTimeout = null;
    const debouncedHandleM3uLoad = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
        }
        
        // Debounce: 500ms içinde tekrar tıklanırsa yok say
        if (m3uLoadTimeout) {
            clearTimeout(m3uLoadTimeout);
        }
        
        m3uLoadTimeout = setTimeout(() => {
            handleM3uLoad(e);
            m3uLoadTimeout = null;
        }, 300);
    };
    
    userIconBtn.addEventListener('click', debouncedHandleM3uLoad, true);
    userIconBtn.addEventListener('touchend', debouncedHandleM3uLoad, true);
    
    // onclick attribute da ekle (backup) - ama preventDefault ile
    userIconBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        debouncedHandleM3uLoad(e);
        return false;
    };
    
    console.log('✅ User icon event listener\'lar eklendi - direkt M3U yükleme');
    
    // Dropdown kaldırıldı - artık gerekli değil
    // M3U butonu artık kullanılmıyor, user icon direkt M3U yükleme yapıyor
    
    // M3U Modal close buttons
    if (m3uModalClose) {
        m3uModalClose.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (m3uModal) {
                m3uModal.style.display = 'none';
                m3uModal.classList.remove('active');
            }
        });
    }
    
    if (m3uCancelBtn) {
        m3uCancelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
    if (m3uModal) {
                m3uModal.style.display = 'none';
                m3uModal.classList.remove('active');
            }
        });
    }
    
    // BlogTV'den M3U çekme butonu
    const blogtvFetchBtn = document.getElementById('blogtvFetchBtn');
    if (blogtvFetchBtn) {
        blogtvFetchBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const originalText = blogtvFetchBtn.innerHTML;
            blogtvFetchBtn.disabled = true;
            blogtvFetchBtn.innerHTML = '<span>⏳</span><span>Çekiliyor...</span>';
            blogtvFetchBtn.style.opacity = '0.7';
            
            try {
                await fetchBlogTVM3U();
            } catch (error) {
                console.error('❌ BlogTV M3U çekme hatası:', error);
                alert('❌ BlogTV\'den M3U çekilemedi. Lütfen manuel olarak URL girin.');
            } finally {
                blogtvFetchBtn.disabled = false;
                blogtvFetchBtn.innerHTML = originalText;
                blogtvFetchBtn.style.opacity = '1';
            }
        });
    }
    
    // M3U Form submit
    if (m3uForm) {
        m3uForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            if (!m3uUrlInput || !m3uUrlInput.value.trim()) {
                console.warn('⚠️ Lütfen bir M3U URL girin');
                return false;
            }
            
            const m3uUrl = m3uUrlInput.value.trim();
            console.log('📡 M3U URL yükleniyor:', m3uUrl);
            
            try {
                // Fetch M3U content from URL
                const response = await fetch(m3uUrl);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                const m3uContent = await response.text();
                
                // Load M3U from URL content
                await loadM3uFromFileContent(m3uContent, m3uUrl);
                
                // Close modal and clear input
                if (m3uModal) {
                    m3uModal.style.display = 'none';
                    m3uModal.classList.remove('active');
                }
                if (m3uUrlInput) {
                    m3uUrlInput.value = '';
                }
            } catch (error) {
                console.error('❌ M3U URL yükleme hatası:', error);
                const errorMsg = error && typeof error === 'object' && error.message 
                    ? error.message 
                    : (typeof error === 'string' ? error : 'Bilinmeyen hata');
                console.error('❌ Hata detayı:', errorMsg);
                alert(`❌ M3U yüklenemedi: ${errorMsg}`);
            }
            
            return false;
        });
    }
    
    // Xtream Codes API Modal
    const xtreamModal = document.getElementById('xtreamModal');
    const xtreamModalClose = document.getElementById('xtreamModalClose');
    const xtreamApiBtn = document.getElementById('xtreamApiBtn');
    const xtreamForm = document.getElementById('xtreamForm');
    const xtreamCancelBtn = document.getElementById('xtreamCancelBtn');
    
    // Open Xtream modal
    if (xtreamApiBtn) {
        xtreamApiBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (xtreamModal) {
                xtreamModal.style.display = 'flex';
                xtreamModal.classList.add('active');
            }
        });
    }
    
    // Close Xtream modal
    const closeXtreamModal = () => {
        if (xtreamModal) {
            xtreamModal.style.display = 'none';
            xtreamModal.classList.remove('active');
        }
    };
    
    if (xtreamModalClose) {
        xtreamModalClose.addEventListener('click', closeXtreamModal);
    }
    
    if (xtreamCancelBtn) {
        xtreamCancelBtn.addEventListener('click', closeXtreamModal);
    }
    
    // Close modal when clicking outside
    if (xtreamModal) {
        xtreamModal.addEventListener('click', (e) => {
            if (e.target === xtreamModal) {
                closeXtreamModal();
            }
        });
    }
    
    // Xtream Form submit
    if (xtreamForm) {
        xtreamForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            const serverUrlInput = document.getElementById('xtreamServerUrl');
            const nameInput = document.getElementById('xtreamName');
            const usernameInput = document.getElementById('xtreamUsername');
            const passwordInput = document.getElementById('xtreamPassword');
            
            const serverUrl = serverUrlInput ? serverUrlInput.value.trim() : '';
            const name = nameInput ? nameInput.value.trim() : '';
            const username = usernameInput ? usernameInput.value.trim() : '';
            const password = passwordInput ? passwordInput.value.trim() : '';
            
            if (!serverUrl || !name || !username || !password) {
                alert('⚠️ Lütfen tüm alanları doldurun');
                return false;
            }
            
            try {
                showNotification('⏳ Xtream Codes API\'ye bağlanılıyor...');
                await connectXtreamAPI(serverUrl, username, password, name);
                
                // Close modal and clear inputs
                if (xtreamModal) {
                    xtreamModal.style.display = 'none';
                    xtreamModal.classList.remove('active');
                }
                if (xtreamForm) {
                    xtreamForm.reset();
                }
            } catch (error) {
                console.error('❌ Xtream API bağlantı hatası:', error);
                const errorMsg = error?.message || 'Bilinmeyen hata';
                alert(`❌ Xtream API bağlantısı başarısız:\n\n${errorMsg}`);
            }
            
            return false;
        });
    }
}

// Xtream Codes API Functions

// Mobil cihaz tespiti
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           (window.innerWidth <= 768 && window.innerHeight <= 1024);
}

// API çağrısı yap (mobil ise proxy kullan, masaüstünde doğrudan)
async function fetchXtreamAPI(serverUrl, username, password, action = '', endpoint = 'player_api.php', useProxy = null) {
    const useProxyMode = useProxy !== null ? useProxy : isMobileDevice();
    
    if (useProxyMode) {
        // PHP proxy kullan
        const proxyUrl = 'xtream-proxy.php';
        const params = new URLSearchParams({
            server: serverUrl,
            username: username,
            password: password,
            endpoint: endpoint
        });
        
        if (action) {
            params.append('action', action);
        }
        
        const response = await fetch(`${proxyUrl}?${params.toString()}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Bilinmeyen hata' }));
            throw new Error(errorData.error || `HTTP ${response.status}`);
        }
        
        return await response.json();
    } else {
        // Doğrudan API çağrısı (masaüstü)
        const baseUrl = serverUrl.replace(/\/$/, '');
        const apiUrl = `${baseUrl}/${endpoint}`;
        const params = new URLSearchParams({
            username: username,
            password: password
        });
        
        if (action) {
            params.append('action', action);
        }
        
        const response = await fetch(`${apiUrl}?${params.toString()}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        return await response.json();
    }
}

async function connectXtreamAPI(serverUrl, username, password, userName = null) {
    try {
        // Normalize server URL (remove trailing slash, ensure http/https)
        let baseUrl = serverUrl.trim();
        if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
            baseUrl = 'http://' + baseUrl;
        }
        baseUrl = baseUrl.replace(/\/$/, '');
        
        const isMobile = isMobileDevice();
        let apiUrl = null;
        let serverInfo = null;
        let useProxy = isMobile;
        
        // Masaüstünde önce doğrudan bağlantıyı dene
        if (!isMobile) {
            try {
                // Try player_api.php first, then portal.php
                const apiEndpoints = ['player_api.php', 'portal.php'];
                
                for (const endpoint of apiEndpoints) {
                    try {
                        const data = await fetchXtreamAPI(baseUrl, username, password, '', endpoint, false);
                        if (data && data.user_info) {
                            apiUrl = `${baseUrl}/${endpoint}`;
                            serverInfo = data;
                            useProxy = false;
                            break;
                        }
                    } catch (e) {
                        console.warn(`⚠️ ${endpoint} doğrudan bağlantı başarısız:`, e);
                        continue;
                    }
                }
            } catch (e) {
                console.warn('⚠️ Doğrudan bağlantı başarısız, proxy deneniyor...', e);
            }
        }
        
        // Mobil ise veya masaüstünde doğrudan bağlantı başarısız olduysa proxy kullan
        if (!apiUrl || !serverInfo) {
            try {
                const apiEndpoints = ['player_api.php', 'portal.php'];
                
                for (const endpoint of apiEndpoints) {
                    try {
                        const data = await fetchXtreamAPI(baseUrl, username, password, '', endpoint, true);
                        if (data && data.user_info) {
                            apiUrl = `${baseUrl}/${endpoint}`;
                            serverInfo = data;
                            useProxy = true;
                            break;
                        }
                    } catch (e) {
                        console.warn(`⚠️ ${endpoint} proxy bağlantı başarısız:`, e);
                        continue;
                    }
                }
            } catch (e) {
                console.error('❌ Proxy bağlantı hatası:', e);
            }
        }
        
        if (!apiUrl || !serverInfo) {
            throw new Error('API endpoint bulunamadı veya geçersiz kullanıcı bilgileri');
        }
        
        showNotification('✅ Bağlantı başarılı! Kanallar yükleniyor...');
        
        // Get live streams
        const endpointName = apiUrl.split('/').pop();
        const streamsData = await fetchXtreamAPI(baseUrl, username, password, 'get_live_streams', endpointName, useProxy);
        
        if (!streamsData || !Array.isArray(streamsData)) {
            throw new Error('Geçersiz streams verisi');
        }
        
        // Get live categories for grouping
        let categoriesData = [];
        try {
            categoriesData = await fetchXtreamAPI(baseUrl, username, password, 'get_live_categories', endpointName, useProxy) || [];
        } catch (e) {
            // Categories optional, continue without them
            console.warn('⚠️ Kategoriler alınamadı:', e);
        }
        
        // Get VOD streams
        let vodStreamsData = [];
        let vodCategoriesData = [];
        try {
            vodStreamsData = await fetchXtreamAPI(baseUrl, username, password, 'get_vod_streams', endpointName, useProxy) || [];
            vodCategoriesData = await fetchXtreamAPI(baseUrl, username, password, 'get_vod_categories', endpointName, useProxy) || [];
        } catch (e) {
            console.warn('⚠️ VOD streams alınamadı:', e);
        }
        
        // Get Series streams
        let seriesData = [];
        let seriesCategoriesData = [];
        try {
            seriesData = await fetchXtreamAPI(baseUrl, username, password, 'get_series', endpointName, useProxy) || [];
            seriesCategoriesData = await fetchXtreamAPI(baseUrl, username, password, 'get_series_categories', endpointName, useProxy) || [];
        } catch (e) {
            console.warn('⚠️ Series streams alınamadı:', e);
        }
        
        // Convert all to M3U format
        let m3uContent = '#EXTM3U\n';
        
        console.log(`📊 Stream verileri: Live: ${streamsData.length}, VOD: ${vodStreamsData.length}, Series: ${seriesData.length}`);
        
        // Add live streams
        const liveM3U = convertXtreamToM3U(streamsData, categoriesData, baseUrl, username, password, 'live');
        console.log(`📺 Live M3U içeriği uzunluğu: ${liveM3U.length} karakter`);
        m3uContent += liveM3U;
        
        // Add VOD streams
        if (vodStreamsData.length > 0) {
            const vodM3U = convertXtreamToM3U(vodStreamsData, vodCategoriesData, baseUrl, username, password, 'vod');
            console.log(`🎬 VOD M3U içeriği uzunluğu: ${vodM3U.length} karakter`);
            m3uContent += vodM3U;
        }
        
        // Add Series streams
        if (seriesData.length > 0) {
            const seriesM3U = convertXtreamToM3U(seriesData, seriesCategoriesData, baseUrl, username, password, 'series');
            console.log(`📺 Series M3U içeriği uzunluğu: ${seriesM3U.length} karakter`);
            m3uContent += seriesM3U;
        }
        
        console.log(`📦 Toplam M3U içeriği uzunluğu: ${m3uContent.length} karakter`);
        console.log(`📋 M3U içeriği önizleme (ilk 500 karakter):`, m3uContent.substring(0, 500));
        
        // Generate playlist name with user name and expiration date
        let playlistName = userName || username;
        
        // Get expiration date from user_info
        if (serverInfo && serverInfo.user_info) {
            const expDate = serverInfo.user_info.exp_date;
            if (expDate) {
                // Convert timestamp to readable date
                const expDateObj = new Date(expDate * 1000);
                const expDateStr = expDateObj.toLocaleDateString('tr-TR', { 
                    year: 'numeric', 
                    month: '2-digit', 
                    day: '2-digit' 
                });
                playlistName = `${playlistName} (Bitiş: ${expDateStr})`;
            }
        }
        
        // Load as M3U with xtream source
        await loadM3uFromFileContent(m3uContent, playlistName, 'xtream');
        
        const totalCount = streamsData.length + vodStreamsData.length + seriesData.length;
        showNotification(`✅ ${streamsData.length} canlı TV, ${vodStreamsData.length} VOD, ${seriesData.length} dizi yüklendi (Toplam: ${totalCount})`);
        
    } catch (error) {
        console.error('❌ Xtream API hatası:', error);
        throw error;
    }
}

// Convert Xtream Codes API response to M3U format
function convertXtreamToM3U(streams, categories, baseUrl, username, password, streamType = 'live') {
    let m3uContent = '';
    
    // Create category map
    const categoryMap = {};
    if (Array.isArray(categories)) {
        categories.forEach(cat => {
            if (cat.category_id && cat.category_name) {
                categoryMap[cat.category_id] = cat.category_name;
            }
        });
    }
    
    console.log(`🔄 convertXtreamToM3U çağrıldı: ${streams.length} stream, type: ${streamType}`);
    
    if (streams.length > 0) {
        console.log('📋 İlk stream örneği:', JSON.stringify(streams[0], null, 2));
    }
    
    let processedCount = 0;
    streams.forEach((stream, index) => {
        // Different ID fields for different stream types
        let streamId = stream.stream_id || stream.movie_id || stream.series_id || stream.id;
        const streamName = stream.name || stream.title || stream.movie_name || stream.series_name;
        
        if (!streamId || !streamName) {
            if (index < 3) {
                console.warn(`⚠️ Stream ${index} atlandı - streamId: ${streamId}, name: ${streamName}`, stream);
            }
            return;
        }
        
        processedCount++;
        
        // Build stream URL based on stream type
        let streamUrl = '';
        if (stream.stream_url || stream.container_extension) {
            // If stream_url is provided directly, use it
            streamUrl = stream.stream_url || '';
            // If relative URL, make it absolute
            if (streamUrl && streamUrl.startsWith('/')) {
                streamUrl = baseUrl + streamUrl;
            } else if (streamUrl && !streamUrl.startsWith('http')) {
                streamUrl = baseUrl + '/' + streamUrl;
            }
            
            // If no stream_url but container_extension exists, build URL
            if (!streamUrl && stream.container_extension) {
                const extension = stream.container_extension;
                if (streamType === 'vod') {
                    streamUrl = `${baseUrl}/movie/${username}/${password}/${streamId}.${extension}`;
                } else if (streamType === 'series') {
                    // For series, we need episode_id - if not available, skip or use series_id
                    const episodeId = stream.id || stream.episode_id || streamId;
                    streamUrl = `${baseUrl}/series/${username}/${password}/${stream.series_id || streamId}/${episodeId}.${extension}`;
                } else {
                    streamUrl = `${baseUrl}/live/${username}/${password}/${streamId}.${extension}`;
                }
            }
        }
        
        // If still no URL, use default format based on stream type
        if (!streamUrl) {
            if (streamType === 'vod') {
                streamUrl = `${baseUrl}/movie/${username}/${password}/${streamId}.mp4`;
            } else if (streamType === 'series') {
                const episodeId = stream.id || stream.episode_id || streamId;
                streamUrl = `${baseUrl}/series/${username}/${password}/${stream.series_id || streamId}/${episodeId}.mp4`;
            } else {
                streamUrl = `${baseUrl}/live/${username}/${password}/${streamId}.m3u8`;
            }
        }
        
        // Get category name with prefix for VOD and Series
        const categoryId = stream.category_id;
        let categoryName = categoryMap[categoryId] || stream.category_name || stream.categoryName || 'Genel';
        
        // Add prefix to category name for better organization
        if (streamType === 'vod') {
            categoryName = `VOD - ${categoryName}`;
        } else if (streamType === 'series') {
            categoryName = `Dizi - ${categoryName}`;
        }
        
        // Build EXTINF line
        const attrs = [];
        if (stream.epg_channel_id) {
            attrs.push(`tvg-id="${stream.epg_channel_id}"`);
        } else if (stream.tvg_id) {
            attrs.push(`tvg-id="${stream.tvg_id}"`);
        }
        if (stream.stream_icon || stream.cover || stream.cover_big) {
            const icon = stream.stream_icon || stream.cover || stream.cover_big;
            attrs.push(`tvg-logo="${icon}"`);
        } else if (stream.tvg_logo) {
            attrs.push(`tvg-logo="${stream.tvg_logo}"`);
        }
        attrs.push(`group-title="${categoryName}"`);
        
        const attrString = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
        m3uContent += `#EXTINF:-1${attrString},${streamName}\n`;
        m3uContent += `${streamUrl}\n`;
    });
    
    console.log(`✅ convertXtreamToM3U tamamlandı: ${processedCount}/${streams.length} stream işlendi, M3U uzunluğu: ${m3uContent.length}`);
    
    return m3uContent;
}

// Toggle play/pause
function togglePlayPause() {
    // Video.js player kontrolü
    if (videoJsInstance && videoJsPlayer && videoJsPlayer.style.display !== 'none') {
        if (videoJsInstance.paused()) {
            videoJsInstance.play().catch(err => {
                console.warn('Video.js play hatası:', err);
            });
        } else {
            videoJsInstance.pause();
        }
        updatePlayPauseButton();
        return;
    }
    
    if (videoPlayer && videoPlayer.style.display !== 'none') {
        // Video player aktif
        if (videoPlayer.paused) {
            videoPlayer.play().catch(err => {
                console.warn('Video play hatası:', err);
            });
        } else {
            videoPlayer.pause();
        }
        updatePlayPauseButton();
    } else if (iframePlayer && iframePlayer.style.display !== 'none') {
        // Iframe player aktif - iframe içeriğini kontrol etmek zor
        // YouTube gibi iframe'ler için play/pause çalışmayabilir
        console.log('Iframe player aktif - play/pause desteklenmeyebilir');
    }
}

// Update play/pause button state
function updatePlayPauseButton() {
    const playPauseBtn = document.getElementById('playPauseBtn');
    if (!playPauseBtn) return;
    
    const playIcon = playPauseBtn.querySelector('.play-icon');
    const pauseIcon = playPauseBtn.querySelector('.pause-icon');
    
    // Video.js player kontrolü
    if (videoJsInstance && videoJsPlayer && videoJsPlayer.style.display !== 'none') {
        if (videoJsInstance.paused()) {
            if (playIcon) playIcon.style.display = 'block';
            if (pauseIcon) pauseIcon.style.display = 'none';
        } else {
            if (playIcon) playIcon.style.display = 'none';
            if (pauseIcon) pauseIcon.style.display = 'block';
        }
        return;
    }
    
    if (!videoPlayer || videoPlayer.style.display === 'none') {
        // Video yok veya iframe aktif
        if (playIcon) playIcon.style.display = 'block';
        if (pauseIcon) pauseIcon.style.display = 'none';
        return;
    }
    
    if (videoPlayer.paused) {
        // Paused - show play
        if (playIcon) playIcon.style.display = 'block';
        if (pauseIcon) pauseIcon.style.display = 'none';
    } else {
        // Playing - show pause
        if (playIcon) playIcon.style.display = 'none';
        if (pauseIcon) pauseIcon.style.display = 'block';
    }
}

// Update fullscreen button state
function updateFullscreenButton() {
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    if (!fullscreenBtn) return;
    
    const fullscreenIcon = fullscreenBtn.querySelector('.fullscreen-icon');
    const fullscreenExitIcon = fullscreenBtn.querySelector('.fullscreen-exit-icon');
    
    const isFullscreen = !!(document.fullscreenElement || 
                           document.webkitFullscreenElement || 
                           document.mozFullScreenElement || 
                           document.msFullscreenElement);
    
    if (isFullscreen) {
        // Fullscreen aktif - exit icon göster
        if (fullscreenIcon) fullscreenIcon.style.display = 'none';
        if (fullscreenExitIcon) fullscreenExitIcon.style.display = 'block';
    } else {
        // Fullscreen değil - fullscreen icon göster
        if (fullscreenIcon) fullscreenIcon.style.display = 'block';
        if (fullscreenExitIcon) fullscreenExitIcon.style.display = 'none';
    }
}

// Show/hide video controls on touch/click
let controlsTimeout = null;
let controlsVisible = false;
const CONTROLS_HIDE_DELAY = 10000; // 10 saniye

function showVideoControls() {
    const overlay = document.getElementById('videoControlsOverlay');
    if (!overlay) return;
    
    // Fullscreen kontrolü - tam ekranda kontrolleri gösterme
    const isFullscreen = !!(document.fullscreenElement || 
                           document.webkitFullscreenElement || 
                           document.mozFullScreenElement || 
                           document.msFullscreenElement);
    
    if (isFullscreen) {
        // Tam ekranda kontrolleri gizle
        overlay.style.display = 'none';
        overlay.classList.remove('show');
        controlsVisible = false;
        
        // Kontrol bar'ı da gizle
        const controlsBar = document.getElementById('videoControlsBar');
        if (controlsBar) {
            controlsBar.style.display = 'none';
            controlsBar.style.opacity = '0';
            controlsBar.style.visibility = 'hidden';
            controlsBar.style.pointerEvents = 'none';
        }
        return;
    }
    
    overlay.style.display = 'block';
    overlay.classList.add('show');
    controlsVisible = true;
    
    // Kontrol bar'ı da görünür yap
    const controlsBar = document.getElementById('videoControlsBar');
    if (controlsBar) {
        controlsBar.style.display = 'flex';
        controlsBar.style.pointerEvents = 'auto';
    }
    
    // Normal modda görünür olmalı
    overlay.style.opacity = '1';
    overlay.style.pointerEvents = 'auto';
    overlay.style.zIndex = '10';
    overlay.style.display = 'block';
    
    if (controlsBar) {
        controlsBar.style.display = 'flex';
        controlsBar.style.pointerEvents = 'auto';
    }
    
    // Hide after 10 seconds of inactivity
    resetControlsTimeout();
}

function resetControlsTimeout() {
    clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(() => {
        hideVideoControls();
    }, CONTROLS_HIDE_DELAY);
}

function hideVideoControls() {
    const overlay = document.getElementById('videoControlsOverlay');
    if (overlay) {
        // Fullscreen kontrolü
        const isFullscreen = !!(document.fullscreenElement || 
                               document.webkitFullscreenElement || 
                               document.mozFullScreenElement || 
                               document.msFullscreenElement);
        
        if (isFullscreen) {
            // Tam ekranda tamamen gizle
            overlay.style.display = 'none';
            overlay.classList.remove('show');
            overlay.style.opacity = '0';
            
            // Kontrol bar'ı da gizle
            const controlsBar = document.getElementById('videoControlsBar');
            if (controlsBar) {
                controlsBar.style.display = 'none';
                controlsBar.style.opacity = '0';
                controlsBar.style.visibility = 'hidden';
                controlsBar.style.pointerEvents = 'none';
            }
        } else {
            // Normal modda sadece opacity ile gizle
            overlay.classList.remove('show');
        }
        controlsVisible = false;
    }
    clearTimeout(controlsTimeout);
}

// Toggle controls on click - always show, reset timer (except in fullscreen)
function toggleVideoControls() {
    const isFullscreen = !!(document.fullscreenElement || 
                           document.webkitFullscreenElement || 
                           document.mozFullScreenElement || 
                           document.msFullscreenElement);
    
    if (isFullscreen) {
        // Tam ekranda kontrolleri gösterme
        return;
    }
    
    showVideoControls();
    resetControlsTimeout();
}

// Format time (seconds to MM:SS)
function formatTime(seconds) {
    if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Update video time display
function updateTimeDisplay() {
    const currentTimeEl = document.getElementById('currentTime');
    const durationEl = document.getElementById('duration');
    
    if (videoPlayer && videoPlayer.style.display !== 'none') {
        if (currentTimeEl) {
            currentTimeEl.textContent = formatTime(videoPlayer.currentTime);
        }
        if (durationEl) {
            durationEl.textContent = formatTime(videoPlayer.duration);
        }
    } else {
        if (currentTimeEl) currentTimeEl.textContent = '0:00';
        if (durationEl) durationEl.textContent = '0:00';
    }
}

// Update progress bar
function updateProgressBar() {
    const progressBar = document.getElementById('progressBar');
    if (!progressBar || !videoPlayer || videoPlayer.style.display === 'none') return;
    
    if (videoPlayer.duration) {
        const percent = (videoPlayer.currentTime / videoPlayer.duration) * 100;
        progressBar.value = percent;
    }
}

// Setup volume control
function setupVolumeControl() {
    const volumeBtn = document.getElementById('volumeBtn');
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeContainer = volumeSlider?.parentElement;
    
    if (!volumeBtn || !volumeSlider) return;
    
    // Volume button click - toggle mute
    const handleVolumeClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (videoPlayer && videoPlayer.style.display !== 'none') {
            videoPlayer.muted = !videoPlayer.muted;
            updateVolumeButton();
        }
        resetControlsTimeout();
    };
    
    volumeBtn.addEventListener('click', handleVolumeClick, { capture: true, passive: false });
    volumeBtn.addEventListener('touchend', handleVolumeClick, { capture: true, passive: false });
    
    // Volume slider change
    volumeSlider.addEventListener('input', (e) => {
        if (videoPlayer && videoPlayer.style.display !== 'none') {
            videoPlayer.volume = e.target.value / 100;
            videoPlayer.muted = false;
            updateVolumeButton();
        }
        resetControlsTimeout();
    });
    
    volumeSlider.addEventListener('touchstart', () => {
        resetControlsTimeout();
    });
    
    // Show volume slider on hover
    volumeBtn.addEventListener('mouseenter', () => {
        if (volumeContainer) volumeContainer.classList.add('show');
    });
    
    volumeContainer?.addEventListener('mouseleave', () => {
        if (volumeContainer) volumeContainer.classList.remove('show');
    });
    
    // Initial volume
    if (videoPlayer) {
        volumeSlider.value = videoPlayer.volume * 100;
        updateVolumeButton();
    }
}

// Update volume button icon
function updateVolumeButton() {
    const volumeBtn = document.getElementById('volumeBtn');
    if (!volumeBtn || !videoPlayer) return;
    
    const highIcon = volumeBtn.querySelector('.volume-high-icon');
    const lowIcon = volumeBtn.querySelector('.volume-low-icon');
    const muteIcon = volumeBtn.querySelector('.volume-mute-icon');
    
    if (videoPlayer.muted || videoPlayer.volume === 0) {
        if (highIcon) highIcon.style.display = 'none';
        if (lowIcon) lowIcon.style.display = 'none';
        if (muteIcon) muteIcon.style.display = 'block';
    } else if (videoPlayer.volume < 0.5) {
        if (highIcon) highIcon.style.display = 'none';
        if (lowIcon) lowIcon.style.display = 'block';
        if (muteIcon) muteIcon.style.display = 'none';
    } else {
        if (highIcon) highIcon.style.display = 'block';
        if (lowIcon) lowIcon.style.display = 'none';
        if (muteIcon) muteIcon.style.display = 'none';
    }
}

// Setup speed control
function setupSpeedControl() {
    const speedBtn = document.getElementById('speedBtn');
    const speedMenu = document.getElementById('speedMenu');
    const speedLabel = document.getElementById('speedLabel');
    
    if (!speedBtn || !speedMenu) return;
    
    let currentSpeed = 1;
    
    const handleSpeedClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const isVisible = speedMenu.style.display === 'block';
        hideAllMenus();
        speedMenu.style.display = isVisible ? 'none' : 'block';
        resetControlsTimeout();
    };
    
    speedBtn.addEventListener('click', handleSpeedClick, { capture: true, passive: false });
    speedBtn.addEventListener('touchend', handleSpeedClick, { capture: true, passive: false });
    
    speedMenu.querySelectorAll('button').forEach(btn => {
        const handleSpeedMenuClick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            const speed = parseFloat(btn.dataset.speed);
            currentSpeed = speed;
            
            if (videoPlayer && videoPlayer.style.display !== 'none') {
                videoPlayer.playbackRate = speed;
            }
            
            speedMenu.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (speedLabel) speedLabel.textContent = `${speed}x`;
            speedMenu.style.display = 'none';
            resetControlsTimeout();
        };
        
        btn.addEventListener('click', handleSpeedMenuClick, { capture: true, passive: false });
        btn.addEventListener('touchend', handleSpeedMenuClick, { capture: true, passive: false });
    });
}

// Update quality menu with HLS levels
function updateQualityMenu() {
    const qualityMenu = document.getElementById('qualityMenu');
    const qualityLabel = document.getElementById('qualityLabel');
    if (!qualityMenu) return;
    
    // Clear existing quality buttons (except Auto)
    const autoBtn = qualityMenu.querySelector('[data-quality="auto"]');
    qualityMenu.innerHTML = '';
    if (autoBtn) qualityMenu.appendChild(autoBtn);
    
    if (hlsInstance && hlsInstance.levels && hlsInstance.levels.length > 0) {
        hlsInstance.levels.forEach((level, index) => {
            const btn = document.createElement('button');
            btn.textContent = level.height ? `${level.height}p` : `Level ${index}`;
            btn.dataset.quality = index;
            
            const handleQualityMenuClick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                hlsInstance.currentLevel = index;
                qualityMenu.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (qualityLabel) qualityLabel.textContent = level.height ? `${level.height}p` : 'Auto';
                qualityMenu.style.display = 'none';
                resetControlsTimeout();
            };
            
            btn.addEventListener('click', handleQualityMenuClick, { capture: true, passive: false });
            btn.addEventListener('touchend', handleQualityMenuClick, { capture: true, passive: false });
            qualityMenu.appendChild(btn);
        });
    }
}

// Setup quality control
function setupQualityControl() {
    const qualityBtn = document.getElementById('qualityBtn');
    const qualityMenu = document.getElementById('qualityMenu');
    const qualityLabel = document.getElementById('qualityLabel');
    
    if (!qualityBtn || !qualityMenu) return;
    
    const handleQualityClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const isVisible = qualityMenu.style.display === 'block';
        hideAllMenus();
        qualityMenu.style.display = isVisible ? 'none' : 'block';
        resetControlsTimeout();
    };
    
    qualityBtn.addEventListener('click', handleQualityClick, { capture: true, passive: false });
    qualityBtn.addEventListener('touchend', handleQualityClick, { capture: true, passive: false });
    
    // Auto quality button
    const autoBtn = qualityMenu.querySelector('[data-quality="auto"]');
    if (autoBtn) {
        const handleAutoClick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            if (hlsInstance) {
                hlsInstance.currentLevel = -1; // Auto
            }
            qualityMenu.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            autoBtn.classList.add('active');
            if (qualityLabel) qualityLabel.textContent = 'Auto';
            qualityMenu.style.display = 'none';
            resetControlsTimeout();
        };
        
        autoBtn.addEventListener('click', handleAutoClick, { capture: true, passive: false });
        autoBtn.addEventListener('touchend', handleAutoClick, { capture: true, passive: false });
    }
}

// Update buffer progress
function updateBufferProgress() {
    const progressBuffer = document.getElementById('progressBuffer');
    if (!progressBuffer || !videoPlayer || videoPlayer.style.display === 'none') return;
    
    if (videoPlayer.buffered.length > 0 && videoPlayer.duration) {
        const bufferedEnd = videoPlayer.buffered.end(videoPlayer.buffered.length - 1);
        const percent = (bufferedEnd / videoPlayer.duration) * 100;
        progressBuffer.style.width = `${percent}%`;
    }
}

// Apply video scaling
function applyVideoScale(scaleMode) {
    try {
        const container = document.getElementById('videoContainerPlayer');
        if (!container) return;
        
        // Container'ın görünür olduğundan emin ol
        if (container.offsetWidth === 0 && container.offsetHeight === 0) {
            // Container henüz render edilmemiş, biraz bekle
            setTimeout(() => {
                applyVideoScale(scaleMode);
            }, 100);
            return;
        }
        
    const isFullscreen = !!(document.fullscreenElement || 
                           document.webkitFullscreenElement || 
                           document.mozFullScreenElement || 
                           document.msFullscreenElement);
    
    // Tam ekranda startStrictScale'in ayarlarını koru - stilleri sıfırlama
    if (isFullscreen) {
        // Tam ekranda sadece scale class'larını kaldır, stilleri sıfırlama
        if (videoPlayer) {
            videoPlayer.classList.remove('video-scale-cover', 'video-scale-contain', 'video-scale-original', 'video-scale-4-3', 'video-scale-16-9');
        }
        if (iframePlayer) {
            iframePlayer.classList.remove('video-scale-cover', 'video-scale-contain', 'video-scale-original', 'video-scale-4-3', 'video-scale-16-9');
        }
        // Tam ekranda startStrictScale'in ayarlarını korumak için fonksiyondan çık
        return;
    }
    
    // Normal modda tüm stilleri sıfırla
    if (videoPlayer) {
        // Remove scale classes
        videoPlayer.classList.remove('video-scale-cover', 'video-scale-contain', 'video-scale-original', 'video-scale-4-3', 'video-scale-16-9');
        videoPlayer.style.objectFit = '';
        videoPlayer.style.width = '';
        videoPlayer.style.height = '';
        videoPlayer.style.maxWidth = '';
        videoPlayer.style.maxHeight = '';
        videoPlayer.style.margin = '';
        videoPlayer.style.transform = '';
        videoPlayer.style.left = '';
        videoPlayer.style.top = '';
        videoPlayer.style.right = '';
        videoPlayer.style.bottom = '';
    }
    if (iframePlayer) {
        // Remove scale classes
        iframePlayer.classList.remove('video-scale-cover', 'video-scale-contain', 'video-scale-original', 'video-scale-4-3', 'video-scale-16-9');
        iframePlayer.style.objectFit = '';
        iframePlayer.style.width = '';
        iframePlayer.style.height = '';
        iframePlayer.style.maxWidth = '';
        iframePlayer.style.maxHeight = '';
        iframePlayer.style.margin = '';
        iframePlayer.style.transform = '';
        iframePlayer.style.left = '';
        iframePlayer.style.top = '';
        iframePlayer.style.right = '';
        iframePlayer.style.bottom = '';
    }
    
    // Mobil uygulama kontrolü
    const inApp = isInApp();
    
    // Fullscreen modda viewport boyutlarını kullan, normal modda container boyutlarını kullan
    let containerWidth, containerHeight;
    if (isFullscreen) {
        // Fullscreen modda viewport boyutlarını kullan
        containerWidth = window.innerWidth;
        containerHeight = window.innerHeight;
    } else {
        // Normal modda container boyutlarını al (hem tarayıcı hem mobil uygulama)
        containerWidth = container.clientWidth;
        containerHeight = container.clientHeight;
        
        // Eğer container boyutları geçersizse, viewport boyutlarını kullan
        if (!containerWidth || containerWidth <= 0 || !containerHeight || containerHeight <= 0) {
            containerWidth = window.innerWidth;
            containerHeight = window.innerHeight;
        }
    }
    
    // Aspect ratio hesaplaması için güvenlik kontrolü
    const containerAspect = (containerHeight > 0) ? (containerWidth / containerHeight) : (16 / 9);
    
    switch(scaleMode) {
        case 'contain':
            // En Uygun - video tamamen görünür
            if (videoPlayer) {
                // Mobil uygulamada fullscreen modda cover kullan (siyahlık olmasın)
                if (inApp && isFullscreen) {
                    videoPlayer.style.objectFit = 'cover';
                    videoPlayer.style.position = 'fixed';
                    videoPlayer.style.top = '0';
                    videoPlayer.style.left = '0';
                    videoPlayer.style.right = '0';
                    videoPlayer.style.bottom = '0';
                    videoPlayer.style.width = '100vw';
                    videoPlayer.style.height = '100vh';
                    videoPlayer.style.maxWidth = '100vw';
                    videoPlayer.style.maxHeight = '100vh';
                    videoPlayer.style.minWidth = '100vw';
                    videoPlayer.style.minHeight = '100vh';
                    videoPlayer.style.transform = '';
                } else if (inApp && !isFullscreen) {
                    videoPlayer.style.objectFit = 'contain';
                    videoPlayer.style.position = 'absolute';
                    videoPlayer.style.top = '0';
                    videoPlayer.style.left = '0';
                    videoPlayer.style.right = '0';
                    videoPlayer.style.bottom = '0';
                    videoPlayer.style.width = '100%';
                    videoPlayer.style.height = '100%';
                    videoPlayer.style.maxWidth = '100%';
                    videoPlayer.style.maxHeight = '100%';
                    videoPlayer.style.minWidth = '100%';
                    videoPlayer.style.minHeight = '100%';
                } else {
                    videoPlayer.style.objectFit = 'contain';
                    videoPlayer.style.left = '';
                    videoPlayer.style.top = '';
                    videoPlayer.style.transform = '';
                    videoPlayer.style.right = '';
                    videoPlayer.style.bottom = '';
                }
            }
            if (iframePlayer) {
                // Mobil uygulamada fullscreen modda cover kullan (siyahlık olmasın)
                if (inApp && isFullscreen) {
                    iframePlayer.style.objectFit = 'cover';
                    iframePlayer.style.position = 'fixed';
                    iframePlayer.style.top = '0';
                    iframePlayer.style.left = '0';
                    iframePlayer.style.right = '0';
                    iframePlayer.style.bottom = '0';
                    iframePlayer.style.width = '100vw';
                    iframePlayer.style.height = '100vh';
                    iframePlayer.style.maxWidth = '100vw';
                    iframePlayer.style.maxHeight = '100vh';
                    iframePlayer.style.minWidth = '100vw';
                    iframePlayer.style.minHeight = '100vh';
                    iframePlayer.style.transform = '';
                } else if (inApp && !isFullscreen) {
                    iframePlayer.style.objectFit = 'contain';
                    iframePlayer.style.position = 'absolute';
                    iframePlayer.style.top = '0';
                    iframePlayer.style.left = '0';
                    iframePlayer.style.right = '0';
                    iframePlayer.style.bottom = '0';
                    iframePlayer.style.width = '100%';
                    iframePlayer.style.height = '100%';
                    iframePlayer.style.maxWidth = '100%';
                    iframePlayer.style.maxHeight = '100%';
                    iframePlayer.style.minWidth = '100%';
                    iframePlayer.style.minHeight = '100%';
                } else {
                    iframePlayer.style.objectFit = 'contain';
                    iframePlayer.style.left = '';
                    iframePlayer.style.top = '';
                    iframePlayer.style.transform = '';
                    iframePlayer.style.right = '';
                    iframePlayer.style.bottom = '';
                }
            }
            break;
            
        case 'cover':
            // Ekranı Doldur - video ekranı tamamen doldurur, siyahlık olmasın
            if (videoPlayer) {
                // Cover modu için class ekle
                videoPlayer.classList.add('video-scale-cover');
                // Hem normal mod hem fullscreen modda aynı mantık (mobil uygulamada)
                if (isFullscreen || inApp) {
                    // Fullscreen veya mobil uygulamada tam ekranı kapla, siyahlık olmasın
                    videoPlayer.style.width = '100vw';
                    videoPlayer.style.height = '100vh';
                    videoPlayer.style.minWidth = '100vw';
                    videoPlayer.style.minHeight = '100vh';
                    videoPlayer.style.maxWidth = '100vw';
                    videoPlayer.style.maxHeight = '100vh';
                    videoPlayer.style.position = 'fixed';
                    videoPlayer.style.top = '0';
                    videoPlayer.style.left = '0';
                    videoPlayer.style.right = '0';
                    videoPlayer.style.bottom = '0';
                    videoPlayer.style.objectFit = 'cover';
                    videoPlayer.style.transform = '';
                } else {
                    videoPlayer.style.width = '100%';
                    videoPlayer.style.height = '100%';
                    videoPlayer.style.minWidth = '100%';
                    videoPlayer.style.minHeight = '100%';
                    videoPlayer.style.maxWidth = '100%';
                    videoPlayer.style.maxHeight = '100%';
                    videoPlayer.style.objectFit = 'cover';
                    videoPlayer.style.left = '';
                    videoPlayer.style.top = '';
                    videoPlayer.style.transform = '';
                    videoPlayer.style.right = '';
                    videoPlayer.style.bottom = '';
                }
            }
            if (iframePlayer) {
                // Cover modu için class ekle
                iframePlayer.classList.add('video-scale-cover');
                // Hem normal mod hem fullscreen modda aynı mantık (mobil uygulamada)
                if (isFullscreen || inApp) {
                    // Fullscreen veya mobil uygulamada tam ekranı kapla, siyahlık olmasın
                    iframePlayer.style.width = '100vw';
                    iframePlayer.style.height = '100vh';
                    iframePlayer.style.minWidth = '100vw';
                    iframePlayer.style.minHeight = '100vh';
                    iframePlayer.style.maxWidth = '100vw';
                    iframePlayer.style.maxHeight = '100vh';
                    iframePlayer.style.position = 'fixed';
                    iframePlayer.style.top = '0';
                    iframePlayer.style.left = '0';
                    iframePlayer.style.right = '0';
                    iframePlayer.style.bottom = '0';
                    iframePlayer.style.objectFit = 'cover';
                    iframePlayer.style.transform = '';
                } else {
                    iframePlayer.style.width = '100%';
                    iframePlayer.style.height = '100%';
                    iframePlayer.style.minWidth = '100%';
                    iframePlayer.style.minHeight = '100%';
                    iframePlayer.style.maxWidth = '100%';
                    iframePlayer.style.maxHeight = '100%';
                    iframePlayer.style.objectFit = 'cover';
                    iframePlayer.style.left = '';
                    iframePlayer.style.top = '';
                    iframePlayer.style.transform = '';
                    iframePlayer.style.right = '';
                    iframePlayer.style.bottom = '';
                }
            }
            break;
            
        case 'original':
            // Orijinal Boyut - video'nun doğal boyutları
            if (videoPlayer && videoPlayer.videoWidth > 0 && videoPlayer.videoHeight > 0) {
                // Mobil uygulamada container'ı tam kapla (hem normal hem fullscreen)
                if (inApp) {
                    videoPlayer.style.position = isFullscreen ? 'fixed' : 'absolute';
                    videoPlayer.style.top = '0';
                    videoPlayer.style.left = '0';
                    videoPlayer.style.right = '0';
                    videoPlayer.style.bottom = '0';
                    videoPlayer.style.width = isFullscreen ? '100vw' : '100%';
                    videoPlayer.style.height = isFullscreen ? '100vh' : '100%';
                    videoPlayer.style.maxWidth = isFullscreen ? '100vw' : '100%';
                    videoPlayer.style.maxHeight = isFullscreen ? '100vh' : '100%';
                    videoPlayer.style.minWidth = isFullscreen ? '100vw' : '100%';
                    videoPlayer.style.minHeight = isFullscreen ? '100vh' : '100%';
                    videoPlayer.style.objectFit = isFullscreen ? 'cover' : 'contain';
                    videoPlayer.style.transform = '';
                } else {
                    const videoAspect = videoPlayer.videoWidth / videoPlayer.videoHeight;
                    
                    let width, height;
                    if (videoAspect > containerAspect) {
                        // Video daha geniş, genişliğe göre ölçekle
                        width = Math.min(videoPlayer.videoWidth, containerWidth);
                        height = width / videoAspect;
                    } else {
                        // Video daha yüksek, yüksekliğe göre ölçekle
                        height = Math.min(videoPlayer.videoHeight, containerHeight);
                        width = height * videoAspect;
                    }
                    
                    videoPlayer.style.width = width + 'px';
                    videoPlayer.style.height = height + 'px';
                    videoPlayer.style.maxWidth = isFullscreen ? '100vw' : '100%';
                    videoPlayer.style.maxHeight = isFullscreen ? '100vh' : '100%';
                    videoPlayer.style.objectFit = 'contain';
                    // Center the video
                    videoPlayer.style.left = '50%';
                    videoPlayer.style.top = '50%';
                    videoPlayer.style.transform = 'translate(-50%, -50%)';
                    videoPlayer.style.right = 'auto';
                    videoPlayer.style.bottom = 'auto';
                }
            }
            // iframe için orijinal boyut uygulanamaz, contain kullan
            if (iframePlayer) {
                iframePlayer.style.objectFit = 'contain';
                // Mobil uygulamada container'ı tam kapla (hem normal hem fullscreen)
                if (inApp) {
                    iframePlayer.style.position = isFullscreen ? 'fixed' : 'absolute';
                    iframePlayer.style.top = '0';
                    iframePlayer.style.left = '0';
                    iframePlayer.style.right = '0';
                    iframePlayer.style.bottom = '0';
                    iframePlayer.style.width = isFullscreen ? '100vw' : '100%';
                    iframePlayer.style.height = isFullscreen ? '100vh' : '100%';
                    iframePlayer.style.maxWidth = isFullscreen ? '100vw' : '100%';
                    iframePlayer.style.maxHeight = isFullscreen ? '100vh' : '100%';
                    iframePlayer.style.minWidth = isFullscreen ? '100vw' : '100%';
                    iframePlayer.style.minHeight = isFullscreen ? '100vh' : '100%';
                    iframePlayer.style.transform = '';
                } else {
                    iframePlayer.style.left = '';
                    iframePlayer.style.top = '';
                    iframePlayer.style.transform = '';
                    iframePlayer.style.right = '';
                    iframePlayer.style.bottom = '';
                }
            }
            break;
            
        case '4:3':
            // 4:3 aspect ratio
            if (inApp) {
                // Mobil uygulamada container'ı tam kapla (hem normal hem fullscreen)
                if (videoPlayer) {
                    videoPlayer.style.position = isFullscreen ? 'fixed' : 'absolute';
                    videoPlayer.style.top = '0';
                    videoPlayer.style.left = '0';
                    videoPlayer.style.right = '0';
                    videoPlayer.style.bottom = '0';
                    videoPlayer.style.width = isFullscreen ? '100vw' : '100%';
                    videoPlayer.style.height = isFullscreen ? '100vh' : '100%';
                    videoPlayer.style.maxWidth = isFullscreen ? '100vw' : '100%';
                    videoPlayer.style.maxHeight = isFullscreen ? '100vh' : '100%';
                    videoPlayer.style.minWidth = isFullscreen ? '100vw' : '100%';
                    videoPlayer.style.minHeight = isFullscreen ? '100vh' : '100%';
                    videoPlayer.style.objectFit = 'cover';
                    videoPlayer.style.transform = '';
                }
                if (iframePlayer) {
                    iframePlayer.style.position = isFullscreen ? 'fixed' : 'absolute';
                    iframePlayer.style.top = '0';
                    iframePlayer.style.left = '0';
                    iframePlayer.style.right = '0';
                    iframePlayer.style.bottom = '0';
                    iframePlayer.style.width = isFullscreen ? '100vw' : '100%';
                    iframePlayer.style.height = isFullscreen ? '100vh' : '100%';
                    iframePlayer.style.maxWidth = isFullscreen ? '100vw' : '100%';
                    iframePlayer.style.maxHeight = isFullscreen ? '100vh' : '100%';
                    iframePlayer.style.minWidth = isFullscreen ? '100vw' : '100%';
                    iframePlayer.style.minHeight = isFullscreen ? '100vh' : '100%';
                    iframePlayer.style.objectFit = 'cover';
                    iframePlayer.style.transform = '';
                }
            } else {
                // Tarayıcı veya fullscreen modda aspect ratio'ya göre hesapla
                const aspect43 = 4 / 3;
                let width43, height43;
                
                if (containerAspect > aspect43) {
                    // Container daha geniş, yüksekliğe göre ölçekle
                    height43 = containerHeight;
                    width43 = height43 * aspect43;
                } else {
                    // Container daha yüksek, genişliğe göre ölçekle
                    width43 = containerWidth;
                    height43 = width43 / aspect43;
                }
                
                if (videoPlayer) {
                    videoPlayer.style.width = width43 + 'px';
                    videoPlayer.style.height = height43 + 'px';
                    videoPlayer.style.maxWidth = isFullscreen ? '100vw' : '100%';
                    videoPlayer.style.maxHeight = isFullscreen ? '100vh' : '100%';
                    videoPlayer.style.objectFit = 'cover';
                    // Center the video
                    videoPlayer.style.left = '50%';
                    videoPlayer.style.top = '50%';
                    videoPlayer.style.transform = 'translate(-50%, -50%)';
                    videoPlayer.style.right = 'auto';
                    videoPlayer.style.bottom = 'auto';
                }
                if (iframePlayer) {
                    iframePlayer.style.width = width43 + 'px';
                    iframePlayer.style.height = height43 + 'px';
                    iframePlayer.style.maxWidth = isFullscreen ? '100vw' : '100%';
                    iframePlayer.style.maxHeight = isFullscreen ? '100vh' : '100%';
                    iframePlayer.style.objectFit = 'cover';
                    // Center the iframe
                    iframePlayer.style.left = '50%';
                    iframePlayer.style.top = '50%';
                    iframePlayer.style.transform = 'translate(-50%, -50%)';
                    iframePlayer.style.right = 'auto';
                    iframePlayer.style.bottom = 'auto';
                }
            }
            break;
            
        case '16:9':
            // 16:9 aspect ratio
            if (inApp) {
                // Mobil uygulamada container'ı tam kapla (hem normal hem fullscreen)
                if (videoPlayer) {
                    videoPlayer.style.position = isFullscreen ? 'fixed' : 'absolute';
                    videoPlayer.style.top = '0';
                    videoPlayer.style.left = '0';
                    videoPlayer.style.right = '0';
                    videoPlayer.style.bottom = '0';
                    videoPlayer.style.width = isFullscreen ? '100vw' : '100%';
                    videoPlayer.style.height = isFullscreen ? '100vh' : '100%';
                    videoPlayer.style.maxWidth = isFullscreen ? '100vw' : '100%';
                    videoPlayer.style.maxHeight = isFullscreen ? '100vh' : '100%';
                    videoPlayer.style.minWidth = isFullscreen ? '100vw' : '100%';
                    videoPlayer.style.minHeight = isFullscreen ? '100vh' : '100%';
                    videoPlayer.style.objectFit = 'cover';
                    videoPlayer.style.transform = '';
                }
                if (iframePlayer) {
                    iframePlayer.style.position = isFullscreen ? 'fixed' : 'absolute';
                    iframePlayer.style.top = '0';
                    iframePlayer.style.left = '0';
                    iframePlayer.style.right = '0';
                    iframePlayer.style.bottom = '0';
                    iframePlayer.style.width = isFullscreen ? '100vw' : '100%';
                    iframePlayer.style.height = isFullscreen ? '100vh' : '100%';
                    iframePlayer.style.maxWidth = isFullscreen ? '100vw' : '100%';
                    iframePlayer.style.maxHeight = isFullscreen ? '100vh' : '100%';
                    iframePlayer.style.minWidth = isFullscreen ? '100vw' : '100%';
                    iframePlayer.style.minHeight = isFullscreen ? '100vh' : '100%';
                    iframePlayer.style.objectFit = 'cover';
                    iframePlayer.style.transform = '';
                }
            } else {
                // Tarayıcı veya fullscreen modda aspect ratio'ya göre hesapla
                const aspect169 = 16 / 9;
                let width169, height169;
                
                if (containerAspect > aspect169) {
                    // Container daha geniş, yüksekliğe göre ölçekle
                    height169 = containerHeight;
                    width169 = height169 * aspect169;
                } else {
                    // Container daha yüksek, genişliğe göre ölçekle
                    width169 = containerWidth;
                    height169 = width169 / aspect169;
                }
                
                if (videoPlayer) {
                    videoPlayer.style.width = width169 + 'px';
                    videoPlayer.style.height = height169 + 'px';
                    videoPlayer.style.maxWidth = isFullscreen ? '100vw' : '100%';
                    videoPlayer.style.maxHeight = isFullscreen ? '100vh' : '100%';
                    videoPlayer.style.objectFit = 'cover';
                    // Center the video
                    videoPlayer.style.left = '50%';
                    videoPlayer.style.top = '50%';
                    videoPlayer.style.transform = 'translate(-50%, -50%)';
                    videoPlayer.style.right = 'auto';
                    videoPlayer.style.bottom = 'auto';
                }
                if (iframePlayer) {
                    iframePlayer.style.width = width169 + 'px';
                    iframePlayer.style.height = height169 + 'px';
                    iframePlayer.style.maxWidth = isFullscreen ? '100vw' : '100%';
                    iframePlayer.style.maxHeight = isFullscreen ? '100vh' : '100%';
                    iframePlayer.style.objectFit = 'cover';
                    // Center the iframe
                    iframePlayer.style.left = '50%';
                    iframePlayer.style.top = '50%';
                    iframePlayer.style.transform = 'translate(-50%, -50%)';
                    iframePlayer.style.right = 'auto';
                    iframePlayer.style.bottom = 'auto';
                }
            }
            break;
    }
    
    // Save preference
    localStorage.setItem('videoScaleMode', scaleMode);
    } catch (error) {
        console.error('Error in applyVideoScale:', error);
        // Hata olsa bile devam et, sayfanın render edilmesini engelleme
    }
}

// Setup scale control
function setupScaleControl() {
    const scaleBtn = document.getElementById('scaleBtn');
    const scaleMenu = document.getElementById('scaleMenu');
    
    if (!scaleBtn || !scaleMenu) return;
    
    // Load saved preference
    const savedScale = localStorage.getItem('videoScaleMode') || 'contain';
    applyVideoScale(savedScale);
    
    // Update active button
    scaleMenu.querySelectorAll('button').forEach(btn => {
        if (btn.dataset.scale === savedScale) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    const handleScaleClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const isVisible = scaleMenu.style.display === 'block';
        hideAllMenus();
        scaleMenu.style.display = isVisible ? 'none' : 'block';
        resetControlsTimeout();
    };
    
    scaleBtn.addEventListener('click', handleScaleClick, { capture: true, passive: false });
    scaleBtn.addEventListener('touchend', handleScaleClick, { capture: true, passive: false });
    
    scaleMenu.querySelectorAll('button').forEach(btn => {
        const handleScaleMenuClick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            const scale = btn.dataset.scale;
            
            applyVideoScale(scale);
            
            scaleMenu.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            scaleMenu.style.display = 'none';
            resetControlsTimeout();
        };
        
        btn.addEventListener('click', handleScaleMenuClick, { capture: true, passive: false });
        btn.addEventListener('touchend', handleScaleMenuClick, { capture: true, passive: false });
    });
    
    // Reapply scale when video metadata loads (for original size)
    if (videoPlayer) {
        videoPlayer.addEventListener('loadedmetadata', () => {
            const currentScale = localStorage.getItem('videoScaleMode') || 'contain';
            if (currentScale === 'original' || currentScale === '4:3' || currentScale === '16:9') {
                applyVideoScale(currentScale);
            }
        });
        
        // Reapply scale on resize
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                const currentScale = localStorage.getItem('videoScaleMode') || 'contain';
                applyVideoScale(currentScale);
            }, 100);
        });
    }
}

// Setup Picture in Picture
function setupPictureInPicture() {
    const pipBtn = document.getElementById('pipBtn');
    if (!pipBtn) return;
    
    const handlePipClick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (!videoPlayer || videoPlayer.style.display === 'none') return;
        
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else {
                await videoPlayer.requestPictureInPicture();
            }
        } catch (err) {
            console.warn('Picture in Picture hatası:', err);
        }
        resetControlsTimeout();
    };
    
    pipBtn.addEventListener('click', handlePipClick, { capture: true, passive: false });
    pipBtn.addEventListener('touchend', handlePipClick, { capture: true, passive: false });
}

// Setup minimize button
function setupMinimizeButton() {
    const minimizeBtn = document.getElementById('minimizeBtn');
    if (!minimizeBtn) return;
    
    const handleMinimizeClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        hideVideoControls();
        // Minimize'da timer'ı durdur
        clearTimeout(controlsTimeout);
    };
    
    minimizeBtn.addEventListener('click', handleMinimizeClick, { capture: true, passive: false });
    minimizeBtn.addEventListener('touchend', handleMinimizeClick, { capture: true, passive: false });
}

// Hide all menus
function hideAllMenus() {
    const menus = document.querySelectorAll('.speed-menu, .quality-menu, .scale-menu');
    menus.forEach(menu => {
        menu.style.display = 'none';
    });
}

// Setup back to main button (for portrait mode player view)
function setupBackToMainButton() {
    const backToMainBtn = document.getElementById('backToMainBtn');
    if (!backToMainBtn) return;
    
    backToMainBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Player view mode'dan çık (kategorileri göster)
        const playerContentWrapper = document.querySelector('.player-content-wrapper');
        if (playerContentWrapper) {
            playerContentWrapper.classList.remove('player-view-mode');
        }
    });
    
    backToMainBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Player view mode'dan çık (kategorileri göster)
        const playerContentWrapper = document.querySelector('.player-content-wrapper');
        if (playerContentWrapper) {
            playerContentWrapper.classList.remove('player-view-mode');
        }
    }, { passive: false });
}

// Setup channel navigation buttons
function setupChannelNavButtons() {
    const prevSmallBtn = document.getElementById('prevSmallBtn');
    const nextSmallBtn = document.getElementById('nextSmallBtn');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const progressBar = document.getElementById('progressBar');
    const videoContainer = document.getElementById('videoContainerPlayer');
    const controlsOverlay = document.getElementById('videoControlsOverlay');
    
    if (!prevSmallBtn || !nextSmallBtn) {
        console.warn('⚠️ Channel navigation buttons not found');
        return;
    }
    
    // Show controls on touch/click - her dokunuş/tıklamada görünsün
    if (videoContainer) {
        // Video container'a tıklama - bubble phase'de dinle (kontroller önce çalışsın)
        videoContainer.addEventListener('click', (e) => {
            // Kontrollere tıklanırsa event'i durdur, sidebar toggle çalışmasın
            if (e.target.closest('.video-control-btn') || 
                e.target.closest('.speed-menu') || 
                e.target.closest('.quality-menu') || 
                e.target.closest('.scale-menu') ||
                e.target.closest('.volume-slider-container') || 
                e.target.closest('.progress-container') ||
                e.target.closest('.video-controls-bar') ||
                e.target.closest('.video-controls-overlay')) {
                // Event'i durdur, sidebar toggle çalışmasın
                e.stopPropagation();
                e.stopImmediatePropagation();
                resetControlsTimeout();
                return;
            }
            
            // Video player'a tıklanırsa kontrolleri göster ve timer'ı sıfırla
            // Event'i durdurma, player-main handler'ı sidebar toggle için çalışsın
            if (e.target === videoContainer || e.target === videoPlayer || e.target === iframePlayer) {
                showVideoControls();
                resetControlsTimeout();
                // stopPropagation çağrılmıyor - sidebar toggle için player-main handler'ı çalışsın
            }
        }, false); // Bubble phase'de dinle (kontroller önce çalışsın)
        
        // Video container'a dokunma
        videoContainer.addEventListener('touchstart', (e) => {
            // Kontrollere dokunulursa event'i durdur ve timer'ı sıfırla
            if (e.target.closest('.video-control-btn') || 
                e.target.closest('.speed-menu') || 
                e.target.closest('.quality-menu') || 
                e.target.closest('.scale-menu') ||
                e.target.closest('.volume-slider-container') || 
                e.target.closest('.progress-container') ||
                e.target.closest('.video-controls-bar') ||
                e.target.closest('.video-controls-overlay')) {
                // Event'i durdur, sidebar toggle çalışmasın
                e.stopPropagation();
                e.stopImmediatePropagation();
                resetControlsTimeout();
                return;
            }
            
            // Video player'a dokunulursa kontrolleri göster ve timer'ı sıfırla
            // Event'i durdurma, player-main handler'ı sidebar toggle için çalışsın
            if (e.target === videoContainer || e.target === videoPlayer || e.target === iframePlayer) {
                showVideoControls();
                resetControlsTimeout();
                // stopPropagation çağrılmıyor - sidebar toggle için player-main handler'ı çalışsın
            }
        }, true); // Capture phase'de dinle
        
        // Video player'a tıklama
        if (videoPlayer) {
            videoPlayer.addEventListener('click', (e) => {
                // Kontrollere tıklanırsa event'i durdur
                if (e.target.closest('.video-control-btn') || 
                    e.target.closest('.speed-menu') || 
                    e.target.closest('.quality-menu') || 
                    e.target.closest('.scale-menu') ||
                    e.target.closest('.volume-slider-container') || 
                    e.target.closest('.progress-container') ||
                    e.target.closest('.video-controls-overlay')) {
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    resetControlsTimeout();
                    return;
                }
                // Video'ya tıklanırsa kontrolleri göster ve timer'ı sıfırla
                // Video pause olmasın, sadece sidebar toggle çalışsın
                e.preventDefault(); // Video'nun native pause davranışını engelle
                showVideoControls();
                resetControlsTimeout();
                // Event'i durdurma, sidebar toggle için player-main handler'ı çalışsın
            }, true);
            
            videoPlayer.addEventListener('touchstart', (e) => {
                if (e.target.closest('.video-control-btn') ||
                    e.target.closest('.speed-menu') || 
                    e.target.closest('.quality-menu') || 
                    e.target.closest('.scale-menu') ||
                    e.target.closest('.volume-slider-container') || 
                    e.target.closest('.progress-container') ||
                    e.target.closest('.video-controls-overlay')) {
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    resetControlsTimeout();
                    return;
                }
                // Video pause olmasın, sadece sidebar toggle çalışsın
                e.preventDefault(); // Video'nun native pause davranışını engelle
                    showVideoControls();
                    resetControlsTimeout();
                // Event'i durdurma, sidebar toggle için player-main handler'ı çalışsın
            }, true);
        }
        
        // Iframe player'a tıklama
        if (iframePlayer) {
            iframePlayer.addEventListener('click', (e) => {
                if (e.target.closest('.video-control-btn') ||
                    e.target.closest('.speed-menu') || 
                    e.target.closest('.quality-menu') || 
                    e.target.closest('.scale-menu') ||
                    e.target.closest('.volume-slider-container') || 
                    e.target.closest('.progress-container') ||
                    e.target.closest('.video-controls-overlay')) {
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    resetControlsTimeout();
                    return;
                }
                // Event'i durdurma, sidebar toggle için player-main handler'ı çalışsın
                showVideoControls();
                resetControlsTimeout();
            }, true);
            
            iframePlayer.addEventListener('touchstart', (e) => {
                if (e.target.closest('.video-control-btn') ||
                    e.target.closest('.speed-menu') || 
                    e.target.closest('.quality-menu') || 
                    e.target.closest('.scale-menu') ||
                    e.target.closest('.volume-slider-container') || 
                    e.target.closest('.progress-container') ||
                    e.target.closest('.video-controls-overlay')) {
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    resetControlsTimeout();
                    return;
                }
                // Event'i durdurma, sidebar toggle için player-main handler'ı çalışsın
                    showVideoControls();
                    resetControlsTimeout();
            }, true);
        }
        
        // Butonlara tıklama/dokunma - timer'ı sıfırla ve event propagation'ı durdur
        const controlButtons = document.querySelectorAll('.video-control-btn, .progress-bar, .volume-slider');
        controlButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                resetControlsTimeout();
            }, true);
            btn.addEventListener('touchstart', (e) => {
                e.stopPropagation();
                resetControlsTimeout();
            }, true);
        });
        
        // Hide controls when clicking outside
        document.addEventListener('click', (e) => {
            if (!videoContainer.contains(e.target) && !controlsOverlay?.contains(e.target)) {
                hideAllMenus();
            }
        });
    }
    
    // Previous channel button
    // Button click handlers - capture phase'de dinle ve her zaman çalışsın
    const handleButtonClick = (handler) => {
        return (e) => {
        e.preventDefault();
        e.stopPropagation();
            e.stopImmediatePropagation();
            handler();
        showVideoControls();
        resetControlsTimeout();
        };
    };
    
    prevSmallBtn.addEventListener('click', handleButtonClick(() => {
        navigateToPreviousChannel();
    }), { capture: true, passive: false });
    
    prevSmallBtn.addEventListener('touchend', handleButtonClick(() => {
        navigateToPreviousChannel();
    }), { capture: true, passive: false });
    
    // Next channel button
    nextSmallBtn.addEventListener('click', handleButtonClick(() => {
        navigateToNextChannel();
    }), { capture: true, passive: false });
    
    nextSmallBtn.addEventListener('touchend', handleButtonClick(() => {
        navigateToNextChannel();
    }), { capture: true, passive: false });
    
    // Play/Pause button
    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', handleButtonClick(() => {
            togglePlayPause();
        }), { capture: true, passive: false });
        
        playPauseBtn.addEventListener('touchend', handleButtonClick(() => {
            togglePlayPause();
        }), { capture: true, passive: false });
    }
    
    // Progress bar
    if (progressBar && videoPlayer) {
        progressBar.addEventListener('input', (e) => {
            if (videoPlayer.duration) {
                videoPlayer.currentTime = (e.target.value / 100) * videoPlayer.duration;
            }
            resetControlsTimeout();
        });
        
        progressBar.addEventListener('mousedown', () => {
            if (videoPlayer && !videoPlayer.paused) {
                videoPlayer.pause();
            }
            resetControlsTimeout();
        });
        
        progressBar.addEventListener('mouseup', () => {
            if (videoPlayer && videoPlayer.paused) {
                videoPlayer.play().catch(() => {});
            }
            resetControlsTimeout();
        });
        
        progressBar.addEventListener('touchstart', () => {
            resetControlsTimeout();
        });
        
        progressBar.addEventListener('touchmove', () => {
            resetControlsTimeout();
        });
    }
    
    // Fullscreen button
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            toggleFullscreen();
            showVideoControls();
            resetControlsTimeout();
        }, { capture: true, passive: false });
        
        fullscreenBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            toggleFullscreen();
            showVideoControls();
            resetControlsTimeout();
        }, { capture: true, passive: false });
        
        // Fullscreen durumunu takip et
        const fullscreenEvents = [
            'fullscreenchange',
            'webkitfullscreenchange',
            'mozfullscreenchange',
            'MSFullscreenChange'
        ];
        
        fullscreenEvents.forEach(event => {
            document.addEventListener(event, () => {
                updateFullscreenButton();
            });
        });
    }
    
    // Setup other controls
    setupVolumeControl();
    setupSpeedControl();
    setupQualityControl();
    setupScaleControl();
    setupPictureInPicture();
    setupMinimizeButton();
    
    // Video player event listeners
    if (videoPlayer) {
        videoPlayer.addEventListener('play', () => {
            updatePlayPauseButton();
            showVideoControls();
            resetControlsTimeout();
        });
        videoPlayer.addEventListener('pause', () => {
            updatePlayPauseButton();
            showVideoControls();
            resetControlsTimeout();
        });
        videoPlayer.addEventListener('loadedmetadata', () => {
            updatePlayPauseButton();
            updateTimeDisplay();
        });
        videoPlayer.addEventListener('timeupdate', () => {
            updateTimeDisplay();
            updateProgressBar();
            updateBufferProgress();
        });
        videoPlayer.addEventListener('progress', updateBufferProgress);
        videoPlayer.addEventListener('volumechange', () => {
            updateVolumeButton();
            resetControlsTimeout();
        });
        videoPlayer.addEventListener('durationchange', updateTimeDisplay);
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            navigateToPreviousChannel();
            showVideoControls();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            navigateToNextChannel();
            showVideoControls();
        } else if (e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            togglePlayPause();
            showVideoControls();
        }
    });
    
    // Medya tuşları desteği (direksiyon ileri/geri tuşları)
    setupMediaKeys();
    
    // Initial states
    updatePlayPauseButton();
    updateFullscreenButton();
    updateTimeDisplay();
    updateVolumeButton();
    
    // Force video scale to fill mode
    setupForceVideoScale();
    
    console.log('✅ Video controls setup complete');
}

// Force video scale to fill mode (stretch to fill screen)
function setupForceVideoScale() {
    const v = videoPlayer; // Use videoPlayer instead of getElementById('video')
    
    if (!v) return;
    
    // startStrictScale fonksiyonunu çağır
    startStrictScale(v);
}

// Boyutu zorla kilitleyen fonksiyon
function startStrictScale(video) {
    const v = video || videoPlayer;
    
    if (!v) return;
    
    const fix = () => {
        // Tam ekranda video'yu her zaman tam ekrana yay
        if (v) {
            v.style.setProperty('width', '100vw', 'important');
            v.style.setProperty('height', '100vh', 'important');
            v.style.setProperty('object-fit', 'fill', 'important');
        }
    };

    // Yayını yormamak için sadece ilk 10 saniye boyunca çok sıkı kontrol et
    let timer = setInterval(fix, 100); 
    
    setTimeout(() => { 
        clearInterval(timer);
        // Sonrasında sadece her saniye bir kez kontrol et (Performans için)
        timer = setInterval(fix, 1000); 
    }, 10000);

    // Ekran döndüğünde anında çalıştır
    window.addEventListener('resize', fix);
    
    // İlk yüklemede de çalıştır
    fix();
}

// Setup media keys (direksiyon ileri/geri tuşları)
function setupMediaKeys() {
    // Medya tuşları için keydown event listener
    const handleMediaKey = (e) => {
        // Input alanlarında çalışmasın
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        
        // MediaTrackPrevious (direksiyon geri tuşu)
        const isPrevious = e.key === 'MediaTrackPrevious' || 
            e.code === 'MediaTrackPrevious' ||
            e.keyCode === 177 || // MediaTrackPrevious keyCode
            e.key === 'AudioPrev' ||
            (e.key === 'F7' && e.ctrlKey) || // Bazı sistemlerde Ctrl+F7
            (e.key === 'ArrowLeft' && e.ctrlKey && e.shiftKey); // Ctrl+Shift+Left
        
        if (isPrevious) {
            e.preventDefault();
            e.stopPropagation();
            navigateToPreviousChannel();
            showVideoControls();
            return;
        }
        
        // MediaTrackNext (direksiyon ileri tuşu)
        const isNext = e.key === 'MediaTrackNext' || 
            e.code === 'MediaTrackNext' ||
            e.keyCode === 176 || // MediaTrackNext keyCode
            e.key === 'AudioNext' ||
            (e.key === 'F8' && e.ctrlKey) || // Bazı sistemlerde Ctrl+F8
            (e.key === 'ArrowRight' && e.ctrlKey && e.shiftKey); // Ctrl+Shift+Right
        
        if (isNext) {
            e.preventDefault();
            e.stopPropagation();
            navigateToNextChannel();
            showVideoControls();
            return;
        }
    };
    
    // Farklı event'ler için dinle
    document.addEventListener('keydown', handleMediaKey, true); // Capture phase'de dinle
    window.addEventListener('keydown', handleMediaKey, true);
    
    // Bazı sistemlerde keypress event'i de kullanılabilir
    document.addEventListener('keypress', (e) => {
        if (e.key === 'MediaTrackPrevious' || e.key === 'MediaTrackNext') {
            handleMediaKey(e);
        }
    }, true);
    
    // MediaSession API desteği (mobil ve araçlarda)
    if ('mediaSession' in navigator) {
        try {
            // Medya tuşları için action handler'ları ayarla
            navigator.mediaSession.setActionHandler('previoustrack', () => {
                navigateToPreviousChannel();
                showVideoControls();
            });
            
            navigator.mediaSession.setActionHandler('nexttrack', () => {
                navigateToNextChannel();
                showVideoControls();
            });
            
            navigator.mediaSession.setActionHandler('play', () => {
                if (videoPlayer && videoPlayer.paused) {
                    videoPlayer.play().catch(() => {});
                }
                showVideoControls();
            });
            
            navigator.mediaSession.setActionHandler('pause', () => {
                if (videoPlayer && !videoPlayer.paused) {
                    videoPlayer.pause();
                }
                showVideoControls();
            });
            
            // MediaSession metadata güncelle
            updateMediaSessionMetadata();
            
            console.log('✅ MediaSession API aktif');
        } catch (e) {
            console.warn('MediaSession API hatası:', e);
        }
    }
    
    // Video oynatıldığında MediaSession metadata'yı güncelle
    if (videoPlayer) {
        const updateMetadata = () => {
            updateMediaSessionMetadata();
        };
        
        videoPlayer.addEventListener('play', updateMetadata);
        videoPlayer.addEventListener('loadedmetadata', updateMetadata);
    }
}

// MediaSession metadata güncelle
function updateMediaSessionMetadata() {
    if (!('mediaSession' in navigator) || !currentChannel) {
        return;
    }
    
    try {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: currentChannel.name || 'PlusTV',
            artist: 'Canlı TV',
            album: 'PlusTV',
            artwork: [
                {
                    src: 'tv.png',
                    sizes: '512x512',
                    type: 'image/png'
                }
            ]
        });
    } catch (e) {
        console.warn('MediaSession metadata güncelleme hatası:', e);
    }
}

// Kanalları BlogTV'den yenileme fonksiyonu
// M3U dosyasını indir
function downloadM3UFile(content, filename = 'tv.m3u') {
    try {
        const blob = new Blob([content], { type: 'application/vnd.apple.mpegurl;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log(`💾 M3U dosyası indirildi: ${filename}`);
    } catch (error) {
        console.error('❌ Dosya indirme hatası:', error);
    }
}

async function fetchM3UFromUrl(m3uUrl) {
    console.log(`📡 M3U dosyası çekiliyor: ${m3uUrl}`);
    
    // Proxy listesi (birden fazla alternatif)
    const proxies = [
        (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        (url) => `https://cors-anywhere.herokuapp.com/${url}`,
        (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
    ];
    
    // Önce doğrudan fetch dene
    try {
        console.log('🔄 [1/5] Doğrudan fetch deneniyor...');
        const response = await fetch(m3uUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/vnd.apple.mpegurl, text/plain, */*',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const contentType = response.headers.get('content-type') || '';
        const text = await response.text();
        
        if (text.trim().startsWith('#EXTM3U') || 
            text.includes('#EXTINF') ||
            contentType.toLowerCase().includes('mpegurl') || 
            contentType.toLowerCase().includes('m3u')) {
            console.log(`✅ M3U dosyası başarıyla çekildi (doğrudan): ${m3uUrl}`);
            console.log(`📊 İçerik uzunluğu: ${text.length} karakter`);
            
            // M3U dosyasını tv.m3u olarak indir
            downloadM3UFile(text, 'tv.m3u');
            
            // URL'den dosya adını çıkar
            const urlPath = new URL(m3uUrl).pathname;
            const fileName = urlPath.split('/').pop() || 'playlist';
            const sourceName = fileName.replace(/\.(m3u|m3u8)$/i, '') || 'M3U Playlist';
            
            await loadM3uFromFileContent(text, sourceName);
            
            const m3uModal = document.getElementById('m3uModal');
            if (m3uModal) {
                m3uModal.style.display = 'none';
                m3uModal.classList.remove('active');
            }
            
            return true;
        } else {
            throw new Error('Dosya M3U formatında değil');
        }
    } catch (error) {
        console.warn(`⚠️ Doğrudan fetch başarısız:`, error.message);
        console.log('🔄 Proxy\'ler deneniyor...');
        
        // Her proxy'yi sırayla dene
        for (let i = 0; i < proxies.length; i++) {
            try {
                const proxyUrl = proxies[i](m3uUrl);
                console.log(`🔄 [${i + 2}/5] Proxy ${i + 1} deneniyor: ${proxyUrl.substring(0, 80)}...`);
                
                // Timeout için AbortController kullan
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 saniye timeout
                
                const response = await fetch(proxyUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/vnd.apple.mpegurl, text/plain, */*'
                    },
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const contentType = response.headers.get('content-type') || '';
                const text = await response.text();
                
                // Eğer proxy HTML döndürüyorsa (hata sayfası), içinden M3U içeriğini çıkarmaya çalış
                let m3uText = text;
                if (text.includes('#EXTM3U') && text.includes('</')) {
                    // HTML içinde M3U var, çıkar
                    const m3uMatch = text.match(/#EXTM3U[\s\S]*?(?=<\/|$)/);
                    if (m3uMatch) {
                        m3uText = m3uMatch[0];
                    }
                }
                
                if (m3uText.trim().startsWith('#EXTM3U') || 
                    m3uText.includes('#EXTINF') ||
                    contentType.toLowerCase().includes('mpegurl') || 
                    contentType.toLowerCase().includes('m3u')) {
                    console.log(`✅ M3U dosyası proxy ${i + 1} ile başarıyla çekildi: ${m3uUrl}`);
                    console.log(`📊 İçerik uzunluğu: ${m3uText.length} karakter`);
                    
                    // M3U dosyasını tv.m3u olarak indir
                    downloadM3UFile(m3uText, 'tv.m3u');
                    
                    // URL'den dosya adını çıkar
                    const urlPath = new URL(m3uUrl).pathname;
                    const fileName = urlPath.split('/').pop() || 'playlist';
                    const sourceName = fileName.replace(/\.(m3u|m3u8)$/i, '') || 'M3U Playlist';
                    
                    await loadM3uFromFileContent(m3uText, sourceName);
                    
                    const m3uModal = document.getElementById('m3uModal');
                    if (m3uModal) {
                        m3uModal.style.display = 'none';
                        m3uModal.classList.remove('active');
                    }
                    
                    return true;
                } else {
                    throw new Error(`Proxy ${i + 1} ile çekilen dosya M3U formatında değil`);
                }
            } catch (proxyError) {
                console.warn(`⚠️ Proxy ${i + 1} başarısız:`, proxyError.message);
                // Son proxy değilse devam et
                if (i < proxies.length - 1) {
                    continue;
                } else {
                    // Tüm proxy'ler başarısız oldu
                    throw new Error(`Tüm proxy'ler başarısız. Son hata: ${proxyError.message}`);
                }
            }
        }
        
        throw new Error(`M3U çekilemedi: ${error.message}`);
    }
}

async function refreshChannels() {
    const refreshIconBtn = document.getElementById('refreshIconBtn');
    const originalHtml = refreshIconBtn ? refreshIconBtn.innerHTML : null;
    
    console.log('🔄 ========== KANAL YENİLEME BAŞLADI ==========');
    
    try {
        if (refreshIconBtn) {
            refreshIconBtn.disabled = true;
            refreshIconBtn.classList.add('refreshing');
        }
        
        // Önce belirtilen URL'yi dene
        const targetUrl = 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663091167371/lXQCJEWGepXILedX.m3u8';
        console.log('🔄 M3U dosyası çekiliyor...', targetUrl);
        console.log('📋 Adım 1: Ana URL deneniyor');
        
        try {
            const success = await fetchM3UFromUrl(targetUrl);
            if (success) {
                console.log('✅ M3U dosyası başarıyla yüklendi');
                console.log('🔄 ========== KANAL YENİLEME TAMAMLANDI ==========');
                
                // Başarı mesajı göster (kısa süreli)
                const successMsg = document.createElement('div');
                successMsg.textContent = '✅ Kanallar başarıyla yüklendi!';
                successMsg.style.cssText = 'position:fixed;top:20px;right:20px;background:#4caf50;color:white;padding:12px 20px;border-radius:8px;z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-weight:600;';
                document.body.appendChild(successMsg);
                setTimeout(() => successMsg.remove(), 3000);
                return;
            } else {
                throw new Error('fetchM3UFromUrl false döndü');
            }
        } catch (urlError) {
            console.error('❌ Belirtilen URL çekilemedi:', urlError);
            console.error('📋 Hata detayı:', {
                message: urlError.message,
                stack: urlError.stack,
                name: urlError.name
            });
            console.warn('⚠️ BlogTV deneniyor...');
            console.log('📋 Adım 2: BlogTV fallback deneniyor');
            
            // Fallback: BlogTV'yi dene
            try {
                await fetchBlogTVM3U();
                console.log('✅ BlogTV kanalları yenilendi');
                console.log('🔄 ========== KANAL YENİLEME TAMAMLANDI ==========');
                
                const successMsg = document.createElement('div');
                successMsg.textContent = '✅ BlogTV kanalları yüklendi!';
                successMsg.style.cssText = 'position:fixed;top:20px;right:20px;background:#4caf50;color:white;padding:12px 20px;border-radius:8px;z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-weight:600;';
                document.body.appendChild(successMsg);
                setTimeout(() => successMsg.remove(), 3000);
                return;
            } catch (blogtvError) {
                console.error('❌ BlogTV de başarısız:', blogtvError);
                console.error('📋 BlogTV hata detayı:', {
                    message: blogtvError.message,
                    stack: blogtvError.stack,
                    name: blogtvError.name
                });
                throw new Error(`Ana URL çekilemedi: ${urlError.message}. BlogTV de başarısız: ${blogtvError.message}`);
            }
        }
    } catch (error) {
        console.error('❌ ========== YENİLEME HATASI ==========');
        console.error('❌ Yenileme hatası:', error);
        console.error('📋 Tam hata detayı:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        console.error('🔄 ========== KANAL YENİLEME BAŞARISIZ ==========');
        
        const errorMsg = document.createElement('div');
        errorMsg.innerHTML = `❌ Kanallar çekilemedi<br><small style="opacity:0.9;">${error.message || 'Bilinmeyen hata'}</small><br><small style="opacity:0.7;font-size:0.8em;">Konsolu kontrol edin (F12)</small>`;
        errorMsg.style.cssText = 'position:fixed;top:20px;right:20px;background:#f44336;color:white;padding:14px 22px;border-radius:8px;z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,0.3);max-width:400px;line-height:1.5;';
        document.body.appendChild(errorMsg);
        setTimeout(() => errorMsg.remove(), 8000);
    } finally {
        if (refreshIconBtn) {
            refreshIconBtn.disabled = false;
            refreshIconBtn.classList.remove('refreshing');
            if (originalHtml) {
                refreshIconBtn.innerHTML = originalHtml;
            }
        }
    }
}

// BlogTV yardımcı fonksiyonları
function normalizeBlogTVUrl(link) {
    if (!link) return null;
    if (link.startsWith('http://') || link.startsWith('https://')) {
        return link;
    }
    if (link.startsWith('//')) {
        return 'https:' + link;
    }
    if (link.startsWith('/')) {
        return BLOG_TV_BASE_URL + link;
    }
    return BLOG_TV_BASE_URL + '/' + link;
}

function isLikelyCategoryLink(href) {
    if (!href) return false;
    try {
        const url = new URL(normalizeBlogTVUrl(href));
        return BLOG_TV_CATEGORY_KEYWORDS.some(keyword => url.pathname.toLowerCase().includes(keyword));
    } catch (e) {
        return false;
    }
}

async function fetchWithCorsFallback(url, options = {}) {
    try {
        return await fetch(url, options);
    } catch (error) {
        console.warn('⚠️ fetch hata verdi, CORS proxy denenecek:', url, error.message);
        if (url.startsWith('https://cors.isomorphic-git.org/')) {
            throw error;
        }
        const proxiedUrl = 'https://cors.isomorphic-git.org/' + url;
        return fetch(proxiedUrl, options);
    }
}

function extractM3ULinksFromHtml(html) {
    const links = new Set();
    if (!html || typeof html !== 'string') return links;
    
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        doc.querySelectorAll('a[href], link[href], source[src], script[src]').forEach(el => {
            const href = el.getAttribute('href') || el.getAttribute('src');
            if (!href) return;
            if (href.toLowerCase().includes('.m3u')) {
                links.add(normalizeBlogTVUrl(href));
            }
        });
        
        // data- attributes
        doc.querySelectorAll('[data-play],[data-src],[data-url]').forEach(el => {
            const attrs = ['data-play', 'data-src', 'data-url'];
            attrs.forEach(attr => {
                const value = el.getAttribute(attr);
                if (value && value.toLowerCase().includes('.m3u')) {
                    links.add(normalizeBlogTVUrl(value));
                }
            });
        });
    } catch (error) {
        console.warn('⚠️ DOMParser başarısız oldu, regex fallback kullanılacak:', error.message);
    }
    
    const regexPatterns = [
        /href=["']([^"']*\.m3u[^"']*)["']/gi,
        /src=["']([^"']*\.m3u[^"']*)["']/gi,
        /url["']?\s*[:=]\s*["']([^"']*\.m3u[^"']*)["']/gi,
        /playlist["']?\s*[:=]\s*["']([^"']*\.m3u[^"']*)["']/gi
    ];
    for (const pattern of regexPatterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
            const rawLink = match[1];
            if (rawLink) {
                links.add(normalizeBlogTVUrl(rawLink));
            }
        }
    }
    
    return links;
}

function extractCategoryLinksFromHtml(html) {
    const links = new Set();
    if (!html || typeof html !== 'string') return links;
    
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        doc.querySelectorAll('a[href]').forEach(a => {
            const href = a.getAttribute('href');
            if (isLikelyCategoryLink(href)) {
                links.add(normalizeBlogTVUrl(href));
            }
        });
    } catch (error) {
        console.warn('⚠️ Kategori linkleri DOMParser ile alınamadı:', error.message);
    }
    
    const regex = /href=["']([^"']+)["']/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
        const href = match[1];
        if (isLikelyCategoryLink(href)) {
            links.add(normalizeBlogTVUrl(href));
        }
    }
    
    return links;
}

function detectCategoryFromUrl(url) {
    if (!url) return null;
    try {
        const pathname = new URL(normalizeBlogTVUrl(url)).pathname.toLowerCase();
        if (pathname.includes('ulusal')) return 'Ulusal';
        if (pathname.includes('haber')) return 'Haber';
        if (pathname.includes('spor')) return 'Spor';
        if (pathname.includes('film')) return 'Film';
        if (pathname.includes('belgesel')) return 'Belgesel';
        if (pathname.includes('cocuk') || pathname.includes('çocuk')) return 'Çocuk';
        if (pathname.includes('muzik') || pathname.includes('music')) return 'Müzik';
        if (pathname.includes('dini') || pathname.includes('religion')) return 'Dini';
        if (pathname.includes('yabanci') || pathname.includes('foreign')) return 'Yabancı';
    } catch (error) {
        console.warn('⚠️ Kategori URL analizinde hata:', error.message);
    }
    return null;
}

function inferCategoryFromAnchor(anchor) {
    if (!anchor) return null;
    const headingTags = ['H2', 'H3', 'H4', 'H5'];
    let node = anchor;
    let depth = 0;
    
    while (node && depth < 6) {
        let sibling = node.previousElementSibling;
        while (sibling) {
            if (headingTags.includes(sibling.tagName)) {
                const text = sibling.textContent && sibling.textContent.trim();
                if (text) {
                    return text.replace(/[:»]/g, '').trim();
                }
            }
            sibling = sibling.previousElementSibling;
        }
        node = node.parentElement;
        depth++;
    }
    
    return null;
}

function sanitizeChannelName(name) {
    if (!name || typeof name !== 'string') return 'BlogTV Kanalı';
    return name.replace(/CANLI İZLE/gi, '').replace(/CANLI IZLE/gi, '').replace(/-$/, '').trim() || 'BlogTV Kanalı';
}

function guessChannelNameFromUrl(url) {
    if (!url) return 'BlogTV Kanalı';
    try {
        const pathname = new URL(normalizeBlogTVUrl(url)).pathname;
        return pathname.split('/').filter(Boolean).pop()?.replace(/-/g, ' ').replace(/\.html?/i, '').toUpperCase() || 'BlogTV Kanalı';
    } catch (error) {
        return 'BlogTV Kanalı';
    }
}

async function scrapeBlogTVForM3ULinks() {
    console.log('🔍 BlogTV sayfaları taranıyor...');
    const visitedPages = new Set();
    const m3uLinks = new Set();
    const pagesToVisit = [{ url: BLOG_TV_BASE_URL, depth: 0 }];
    
    while (pagesToVisit.length > 0 && visitedPages.size < BLOG_TV_MAX_CRAWL_PAGES) {
        const current = pagesToVisit.shift();
        if (!current || visitedPages.has(current.url)) continue;
        visitedPages.add(current.url);
        
        try {
            console.log(`📄 BlogTV sayfası okunuyor: ${current.url}`);
            const response = await fetchWithCorsFallback(current.url, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                mode: 'cors'
            });
            
            if (!response.ok) {
                console.warn(`⚠️ ${current.url} okunamadı: HTTP ${response.status}`);
                continue;
            }
            
            const html = await response.text();
            const foundM3uLinks = extractM3ULinksFromHtml(html);
            foundM3uLinks.forEach(link => {
                if (link) {
                    m3uLinks.add(link);
                }
            });
            
            console.log(`🔎 ${current.url} sayfasında ${foundM3uLinks.size} M3U linki bulundu`);
            
            if (current.depth < BLOG_TV_MAX_CRAWL_DEPTH) {
                const categoryLinks = extractCategoryLinksFromHtml(html);
                categoryLinks.forEach(link => {
                    if (link && !visitedPages.has(link)) {
                        pagesToVisit.push({ url: link, depth: current.depth + 1 });
                    }
                });
            }
        } catch (error) {
            console.warn(`⚠️ ${current.url} taranamadı:`, error.message);
            continue;
        }
    }
    
    console.log(`📦 BlogTV taramasında toplam ${m3uLinks.size} M3U linki bulundu`);
    return Array.from(m3uLinks);
}

// BlogTV'den M3U çekme fonksiyonu
async function fetchBlogTVM3U() {
    const baseEndpoints = [
        '/playlist.m3u',
        '/api/playlist.m3u',
        '/m3u/playlist.m3u',
        '/channels.m3u',
        '/tv.m3u',
        '/iptv.m3u',
        '/playlist.m3u8',
        '/api/channels.m3u',
        '/api/tv.m3u',
        '/api/iptv.m3u'
    ].map(endpoint => BLOG_TV_BASE_URL + endpoint);
    
    console.log('📡 BlogTV\'den M3U çekiliyor...');
    
    let candidateLinks = [...baseEndpoints];
    try {
        const scrapedLinks = await scrapeBlogTVForM3ULinks();
        candidateLinks = [...new Set([...candidateLinks, ...scrapedLinks])];
    } catch (error) {
        console.warn('⚠️ BlogTV scrape başarısız oldu, sadece bilinen endpoint\'ler denenecek:', error.message);
    }
    
    console.log(`🔁 Toplam ${candidateLinks.length} aday link denenecek`);
    
    for (const url of candidateLinks) {
        if (!url) continue;
        console.log(`🔄 M3U link deneniyor: ${url}`);
        
        try {
            const response = await fetchWithCorsFallback(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/vnd.apple.mpegurl, text/plain, */*',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                mode: 'cors'
            });
            
            if (!response.ok) {
                console.warn(`⚠️ ${url} - HTTP ${response.status}`);
                continue;
            }
            
            const contentType = response.headers.get('content-type') || '';
            const text = await response.text();
            
            if (text.trim().startsWith('#EXTM3U') || 
                text.includes('#EXTINF') ||
                contentType.toLowerCase().includes('mpegurl') || 
                contentType.toLowerCase().includes('m3u')) {
                console.log(`✅ BlogTV M3U bulundu: ${url}`);
                console.log(`📊 İçerik uzunluğu: ${text.length} karakter`);
                
                await loadM3uFromFileContent(text, 'BlogTV - ' + (new URL(url).pathname.replace(/\//g, '-') || 'playlist'));
                
                const m3uModal = document.getElementById('m3uModal');
                if (m3uModal) {
                    m3uModal.style.display = 'none';
                    m3uModal.classList.remove('active');
                }
                
                return true;
            } else {
                console.log(`⚠️ ${url} M3U formatında değil`);
            }
        } catch (error) {
            console.warn(`⚠️ ${url} - Hata:`, error.message);
            continue;
        }
    }
    
    throw new Error('BlogTV\'den M3U dosyası bulunamadı. Lütfen manuel olarak URL girin.');
}

// Load M3U from file content
async function loadM3uFromFileContent(m3uContent, sourceName, source = 'm3u') {
    try {
        console.log('📥 M3U içeriği yükleniyor...', {
            sourceName,
            source,
            contentLength: m3uContent.length,
            firstChars: m3uContent.substring(0, 100)
        });
        
        // Parse M3U content (kategoriler allCategories'e eklenecek, temizleme yapmıyoruz)
        console.log('🔍 M3U içeriği parse ediliyor...');
        const parsedChannels = parseM3uContentForPlayer(m3uContent);
        console.log(`✅ Parse tamamlandı: ${parsedChannels.length} kanal bulundu`);
        
        if (!parsedChannels || parsedChannels.length === 0) {
            console.error('❌ M3U dosyasında kanal bulunamadı!', {
                contentLength: m3uContent.length,
                hasExtM3U: m3uContent.includes('#EXTM3U'),
                hasExtInf: m3uContent.includes('#EXTINF'),
                first500Chars: m3uContent.substring(0, 500)
            });
            alert('⚠️ M3U dosyasında kanal bulunamadı! Lütfen dosyanın geçerli bir M3U formatında olduğundan emin olun.');
            return;
        }
        
        // Xtream kaynaklı ise kategorileri allCategories'e ekleme (ayrı tutulacak)
        // Sadece varsayılan M3U kaynakları için allCategories'e ekle
        if (source === 'xtream') {
            // Xtream yüklendiğinde varsayılan kategorileri temizle
            allCategories.clear();
            console.log('🧹 Xtream yüklendi, varsayılan kategoriler temizlendi');
            
            // Xtream için de kanallardan kategorileri çıkar ve allCategories'e ekle
            // mergeAndNormalizeCategories fonksiyonu kanallardan kategorileri çıkaracak ama
            // allCategories'e eklemek de gerekli çünkü bazı durumlarda kanallar yüklenmeden önce
            // kategorileri göstermek gerekebilir
            parsedChannels.forEach(ch => {
                if (ch.category) {
                    // VOD ve Dizi prefix'li kategoriler için normalize etme (tam ismi koru)
                    if (ch.category.startsWith('VOD - ') || ch.category.startsWith('Dizi - ')) {
                        allCategories.add(ch.category);
                    } else {
                        const normalized = normalizeCategory(ch.category);
                        if (normalized) {
                            allCategories.add(normalized);
                        }
                    }
                }
            });
            console.log(`📂 Xtream: ${parsedChannels.length} kanaldan ${allCategories.size} kategori çıkarıldı`);
        } else {
            // Parse edilen kanallardan kategorileri çıkar ve allCategories'e ekle
            parsedChannels.forEach(ch => {
                if (ch.category) {
                    const normalized = normalizeCategory(ch.category);
                    if (normalized) {
                        allCategories.add(normalized);
                    }
                }
                // Birleşik kategorileri de kontrol et (group-title'da " - " varsa)
                // Bu bilgi parseM3uContentForPlayer'da kayboluyor, bu yüzden burada kontrol edemiyoruz
                // Ama genelde category zaten normalize edilmiş olarak geliyor
            });
        }
        
        // Get playlist name from source name (M3U dosya adı)
        const playlistName = getPlaylistNameFromPath(sourceName);
        console.log('📝 Playlist adı (User adı olarak kullanılacak):', playlistName);
        console.log(`📂 Toplam ${allCategories.size} kategori bulundu:`, Array.from(allCategories).sort());
        
        // Load users (her zaman güncel olması için)
        loadUsers();
        
        // Aynı isimde user var mı kontrol et
        const existingUserIndex = users.findIndex(u => u && u.name === playlistName);
        let isExistingUser = existingUserIndex !== -1;
        
        if (isExistingUser) {
            // Mevcut user'ı güncelle
            users[existingUserIndex].channels = parsedChannels;
            users[existingUserIndex].filePath = sourceName.startsWith('http') ? null : sourceName;
            users[existingUserIndex].m3uUrl = sourceName.startsWith('http') ? sourceName : null;
            users[existingUserIndex].source = source; // Kaynak bilgisini ekle
            users[existingUserIndex].updatedAt = Date.now();
            console.log(`✅ Mevcut user güncellendi: ${playlistName} (${parsedChannels.length} kanal, source: ${source})`);
            
        } else {
            // Yeni user oluştur
            const newUser = {
                id: Date.now().toString(),
                name: playlistName, // M3U dosya adı user adı olarak kullanılıyor
                channels: parsedChannels,
                filePath: sourceName.startsWith('http') ? null : sourceName,
                m3uUrl: sourceName.startsWith('http') ? sourceName : null,
                source: source, // Kaynak bilgisini ekle (xtream, m3u, vb.)
                createdAt: Date.now()
            };
            
            // Add user
            if (!users) {
                users = [];
            }
            users.push(newUser);
            console.log(`✅ Yeni user oluşturuldu: ${playlistName} (${parsedChannels.length} kanal, source: ${source})`);
            console.log(`📋 User detayları:`, {
                id: newUser.id,
                name: newUser.name,
                channelCount: newUser.channels?.length || 0,
                source: newUser.source
            });
        }
        
        // Users'ı kaydet (kanallar dahil)
        console.log(`💾 Users kaydediliyor... (${users.length} user)`);
        saveUsers();
        console.log(`✅ Users kaydedildi`);
        
        // Doğrulama: Kaydedilen user'ın kanallarını kontrol et
        let savedUser = users.find(u => u && u.name === playlistName);
        if (savedUser) {
            console.log(`✅ User kaydedildi: ${playlistName}, kanal sayısı: ${savedUser.channels?.length || 0}`);
            if (!savedUser.channels || savedUser.channels.length === 0) {
                console.error(`❌ UYARI: User kaydedildi ama kanalları boş!`);
            } else {
                console.log(`📺 İlk 3 kanal örneği:`, savedUser.channels.slice(0, 3).map(ch => ({
                    name: ch.name,
                    category: ch.category,
                    url: ch.url?.substring(0, 50) + '...'
                })));
                // Kategori örnekleri
                const categories = new Set(savedUser.channels.map(ch => ch.category).filter(c => c));
                console.log(`📂 Kategoriler (${categories.size} adet):`, Array.from(categories).slice(0, 10));
            }
        } else {
            console.error(`❌ HATA: User kaydedildi ama bulunamadı! playlistName: ${playlistName}`);
        }
        
        // User'ı bul - loadUsers() çağrısını kaldırdık çünkü users array'inde zaten user var
        // loadUsers() çağrısı users array'ini localStorage'dan yüklediği için yeni eklenen user kaybolabilir
        let targetUser = savedUser || users.find(u => u && u.name === playlistName);
        if (!targetUser) {
            // Eğer hala bulunamadıysa, ID ile dene (yeni oluşturulan user için)
            if (isExistingUser && existingUserIndex >= 0 && existingUserIndex < users.length) {
                targetUser = users[existingUserIndex];
            } else if (!isExistingUser && users.length > 0) {
                // Son eklenen user'ı al
                targetUser = users[users.length - 1];
            }
        }
        
        if (targetUser) {
            console.log(`✅ User bulundu ve aktif ediliyor: ${targetUser.name} (ID: ${targetUser.id}, Kanallar: ${targetUser.channels?.length || 0}, Source: ${targetUser.source || 'unknown'})`);
            
            // Yeni yüklenen M3U'yu aktif yap (setActiveUser country filter'ı da kontrol eder)
            setActiveUser(targetUser.id, { source: 'm3uLoad', skipUserListRender: false });
            
            // setActiveUser zaten render fonksiyonlarını çağırıyor, ama Xtream için ekstra kontrol
            // Kategorileri oluştur ve render et - setActiveUser sonrası
            // Xtream için kategoriler kanallardan çıkarılacak (mergeAndNormalizeCategories içinde)
            setTimeout(() => {
                console.log(`🔄 Kategoriler ve kanallar render ediliyor... (User: ${targetUser.name}, Source: ${source})`);
                const currentChannels = getCurrentChannels();
                console.log(`📺 Aktif kanallar: ${currentChannels.length}`);
                if (currentChannels.length > 0) {
                    const channelCategories = new Set(currentChannels.map(ch => ch.category).filter(c => c));
                    console.log(`📂 Kanal kategorileri (${channelCategories.size} adet):`, Array.from(channelCategories).slice(0, 10));
                }
                renderDynamicCategories();
                renderCategorySidebar();
                renderSidebarChannels();
                renderM3uSwitchList(); // User listesini güncelle
                console.log(`✅ Render tamamlandı`);
            }, 200);
        } else {
            console.error('❌ User bulunamadı:', playlistName);
            console.error('📋 Mevcut users:', users.map(u => ({ id: u?.id, name: u?.name, source: u?.source })));
            // Yine de render et (varsayılan kanallar için)
            requestAnimationFrame(() => {
                renderDynamicCategories();
                renderCategorySidebar();
                renderSidebarChannels();
                renderM3uSwitchList(); // User listesini güncelle
            });
        }
        
        // Removed verbose logging
    } catch (error) {
        console.error('❌ M3U yükleme hatası:', error);
        console.error('❌ Hata stack:', error.stack);
        
        // Hata mesajını daha açıklayıcı yap
        let errorMsg = 'Bilinmeyen hata';
        if (error && typeof error === 'object') {
            if (error.message) {
                errorMsg = error.message;
            } else if (error.toString && error.toString() !== '[object Object]') {
                errorMsg = error.toString();
            }
        } else if (typeof error === 'string') {
            errorMsg = error;
        }
        
        console.error('❌ Hata detayı:', errorMsg);
        console.error('❌ Hata objesi:', error);
        
        // Sadece gerçek hatalarda alert göster, başarılı işlemlerde gösterme
        // Ayrıca, hata mesajı boş veya undefined ise gösterme
        if (errorMsg && errorMsg !== 'Bilinmeyen hata' && !errorMsg.includes('success') && !errorMsg.includes('başarı')) {
            alert('❌ M3U dosyası yüklenirken hata oluştu!\n\nHata: ' + errorMsg);
        } else {
            // Hata mesajı yoksa veya bilinmeyen hata ise, sadece console'da log'la
            console.warn('⚠️ M3U yükleme sırasında bir sorun oluştu ama hata mesajı belirsiz');
        }
        
        // Hatayı tekrar fırlatma - zaten alert gösterildi, üst seviyede tekrar göstermesin
        // throw error;
    }
}

// Parse M3U content for player
function parseM3uContentForPlayer(m3uContent) {
    const channels = [];
    const lines = m3uContent.split('\n');
    let currentChannel = null;
    let channelId = 1;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        if (line.startsWith('#EXTINF:')) {
            const tvgIdMatch = line.match(/tvg-id="([^"]*)"/);
            const tvgLogoMatch = line.match(/tvg-logo="([^"]*)"/);
            const groupTitleMatch = line.match(/group-title="([^"]*)"/);
            
            const channelNameMatch = line.match(/,(.*)$/);
            let channelName = channelNameMatch ? channelNameMatch[1].trim() : ('Kanal ' + channelId);
            
            let groupTitle = groupTitleMatch ? groupTitleMatch[1].trim() : 'Ulusal';
            
            // Clean category name - birleşik kategorileri ayır
            // "Ulusal - Yurt Disi" -> "Ulusal" ve "Yurt Dışı" olarak işle
            // "VOD - Action" -> "VOD - Action" olarak koru (Xtream için önemli)
            let category = groupTitle;
            
            // Eğer " - " ile ayrılmışsa ve ilk kısım özel bir prefix değilse (VOD, Dizi gibi), sadece ilk kısmı al
            if (groupTitle.includes(' - ')) {
                const parts = groupTitle.split(' - ');
                const firstPart = parts[0].trim();
                // VOD veya Dizi prefix'i varsa, tam kategori ismini koru
                if (firstPart === 'VOD' || firstPart === 'Dizi') {
                    category = groupTitle; // Tam kategori ismini koru: "VOD - Action"
                } else {
                    category = firstPart; // Sadece ilk kısmı al: "Ulusal"
                }
            }
            
            // Eğer kategori boşsa veya geçersizse "Ulusal" yap
            if (!category || category === '' || category === 'undefined') {
                category = 'Ulusal';
            }
            
            // Normalize category (normalizeCategory fonksiyonu kullan - büyük/küçük harf duyarsız)
            // Ama VOD/Dizi prefix'li kategoriler için normalize etme (tam ismi koru)
            if (!category.startsWith('VOD - ') && !category.startsWith('Dizi - ')) {
                category = normalizeCategory(category);
            }
            
            // Not: allCategories'e ekleme işlemi loadM3uFromFileContent içinde yapılıyor
            // (source kontrolü ile - Xtream kategorileri eklenmiyor)
            
            // Eğer birleşik kategori varsa (örn: "Ulusal - Yurt Disi"), ikinci kategoriyi de işaretle
            // (allCategories'e ekleme loadM3uFromFileContent içinde yapılacak)
            if (groupTitle.includes(' - ')) {
                const secondCategory = groupTitle.split(' - ')[1]?.trim();
                if (secondCategory && secondCategory !== category) {
                    // İkinci kategoriyi de kanal objesine ekle (gerekirse)
                    // Normalize edilmiş kategori zaten category olarak ayarlandı
                }
            }
            
            currentChannel = {
                id: `channel_${channelId++}`,
                name: channelName,
                url: '',
                category: category,
                tvgId: tvgIdMatch ? tvgIdMatch[1] : '',
                tvgLogo: tvgLogoMatch ? tvgLogoMatch[1] : ''
            };
        } else if ((line.startsWith('http://') || line.startsWith('https://') || line.startsWith('www.')) && currentChannel) {
            currentChannel.url = line;
            channels.push(currentChannel);
            currentChannel = null;
        }
    }
    
    return channels;
}

// Get playlist name from path
function getPlaylistNameFromPath(path) {
    if (!path) return 'M3U Playlist';
    const fileName = path.split('/').pop().split('\\').pop();
    const nameWithoutExt = fileName.replace(/\.(m3u|m3u8)$/i, '');
    return nameWithoutExt || 'M3U Playlist';
}

// Event Listeners
function setupEventListeners() {
    // Cleanup on page unload
    window.addEventListener('beforeunload', cleanup);
    window.addEventListener('pagehide', cleanup);
    
    // Color picker buttons
    const colorPickerButtons = document.querySelectorAll('.color-picker-btn');
    if (colorPickerButtons && colorPickerButtons.length > 0) {
        colorPickerButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
            const color = btn.dataset.color;
                if (color) {
                    document.documentElement.setAttribute('data-theme', color);
            localStorage.setItem('theme', color);
                    
                    // Update active state
                    colorPickerButtons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                }
        });
    });
    
        // Set active state for current theme
        const currentTheme = localStorage.getItem('theme') || 'purple';
        colorPickerButtons.forEach(btn => {
            if (btn.dataset.color === currentTheme) {
                btn.classList.add('active');
            }
        });
    }
    
    // Tab switching
    if (tabButtons && tabButtons.length > 0) {
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                activeTab = btn.dataset.tab;
                tabButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderSidebarChannels();
            });
        });
    }
    
    // Category selection - setupCategoryEventListeners() tarafından yapılıyor
    setupCategoryEventListeners();
    
    // Zoom button - direkt burada da ekle
    if (zoomToggleBtn) {
        const handleZoom = function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Zoom button clicked from setupEventListeners, current zoom:', zoomLevel);
            toggleZoom();
            return false;
        };
        zoomToggleBtn.addEventListener('click', handleZoom);
        zoomToggleBtn.addEventListener('touchend', handleZoom, { passive: false });
    }
    
    // Fullscreen on double click (desktop) - only add once
    if (videoContainerPlayer && !videoContainerPlayer.hasAttribute('data-dblclick-bound')) {
        videoContainerPlayer.setAttribute('data-dblclick-bound', 'true');
        videoContainerPlayer.addEventListener('dblclick', toggleFullscreen);
    }
    
    // Also allow double click on video/iframe (desktop)
    if (videoPlayer && !videoPlayer.hasAttribute('data-dblclick-bound')) {
        videoPlayer.setAttribute('data-dblclick-bound', 'true');
        videoPlayer.addEventListener('dblclick', toggleFullscreen);
    }
    
    if (iframePlayer && !iframePlayer.hasAttribute('data-dblclick-bound')) {
        iframePlayer.setAttribute('data-dblclick-bound', 'true');
        iframePlayer.addEventListener('dblclick', toggleFullscreen);
    }
    
    // Fullscreen on double tap (mobile/touch devices)
    if (videoContainerPlayer && !videoContainerPlayer.hasAttribute('data-touch-bound')) {
        videoContainerPlayer.setAttribute('data-touch-bound', 'true');
        setupDoubleTapFullscreen(videoContainerPlayer);
    }
    
    // Single click/tap to toggle sidebar (desktop and mobile)
    const playerMain = document.querySelector('.player-main');
    if (playerMain && !playerMain.hasAttribute('data-sidebar-toggle-bound')) {
        playerMain.setAttribute('data-sidebar-toggle-bound', 'true');
        
        // For desktop: handle single click (double click is handled separately)
        let clickTimeout = null;
        let lastClickTime = 0;
        let touchClickTimeout = null;
        let lastTouchTime = 0;
        
        playerMain.addEventListener('click', (e) => {
            // Kontrollere tıklanırsa engelle
            if (e.target.closest('.video-control-btn') ||
                e.target.closest('.video-controls-overlay') ||
                e.target.closest('.video-controls-bar')) {
                return;
            }
            
            // Video container'a tıklama da sidebar toggle için çalışsın
            // Çift tıklama fullscreen için video container'ın dblclick handler'ı çalışacak
            
            // Don't interfere with double-click fullscreen
            const currentTime = new Date().getTime();
            const clickLength = currentTime - lastClickTime;
            
            if (clickTimeout) {
                clearTimeout(clickTimeout);
                activeTimeouts = activeTimeouts.filter(t => t !== clickTimeout);
                clickTimeout = null;
            }
            
            if (clickLength < 400 && clickLength > 0) {
                // Double click detected - don't toggle sidebar (fullscreen açılacak)
                lastClickTime = 0;
                return;
            } else {
                // Single click - wait to see if there's another click
                clickTimeout = safeSetTimeout(() => {
                    toggleSidebar();
                    clickTimeout = null;
                }, 400);
            }
            
            lastClickTime = currentTime;
        });
        
        // For mobile: handle single tap on player area
        // Video container'ın setupDoubleTapFullscreen handler'ı çift dokunmayı yönetir
        // Tek dokunma için bu handler çalışacak
        playerMain.addEventListener('touchend', (e) => {
            // Kontrollere dokunulursa engelle
            if (e.target.closest('.video-control-btn') ||
                e.target.closest('.video-controls-overlay') ||
                e.target.closest('.video-controls-bar')) {
                return;
            }
            
            // Video container'a dokunulduğunda setupDoubleTapFullscreen handler'ı çalışsın
            // Bu handler video container dışındaki alanlar için çalışmalı
            // Video container için setupDoubleTapFullscreen zaten sidebar toggle yapıyor
            if (e.target.closest('#videoContainerPlayer') || 
                e.target.closest('#videoPlayer') || 
                e.target.closest('#iframePlayer')) {
                // Video container'a dokunuldu, setupDoubleTapFullscreen handler'ı çalışacak
                // Bu handler'ı atla, setupDoubleTapFullscreen sidebar toggle yapacak
                return;
            }
            
            // Video container dışındaki alanlara dokunulduğunda sidebar toggle çalışsın
            const currentTime = new Date().getTime();
            const touchLength = currentTime - lastTouchTime;
            
            if (touchClickTimeout) {
                clearTimeout(touchClickTimeout);
                activeTimeouts = activeTimeouts.filter(t => t !== touchClickTimeout);
                touchClickTimeout = null;
            }
            
            if (touchLength < 400 && touchLength > 0) {
                // Double tap detected - don't toggle sidebar
                lastTouchTime = 0;
                return;
            } else {
                // Single tap - wait to see if there's another tap
                touchClickTimeout = safeSetTimeout(() => {
                    toggleSidebar();
                    touchClickTimeout = null;
                }, 400);
            }
            
            lastTouchTime = currentTime;
        }, { passive: true });
    }
    
    // Keyboard shortcuts - only add once
    if (!document.documentElement.hasAttribute('data-keydown-bound')) {
        document.documentElement.setAttribute('data-keydown-bound', 'true');
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                // Escape tuşu ile tam ekrandan çık
                if (document.fullscreenElement || document.webkitFullscreenElement || 
                    document.mozFullScreenElement || document.msFullscreenElement) {
                    toggleFullscreen();
                }
            }
        });
    }
    
    // Refresh button - kanalları yenile
    const refreshIconBtn = document.getElementById('refreshIconBtn');
    if (refreshIconBtn) {
        const handleRefresh = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await refreshChannels();
        };
        refreshIconBtn.addEventListener('click', handleRefresh);
        refreshIconBtn.addEventListener('touchend', handleRefresh, { passive: false });
    }
    
    // Country selector button
    const countrySelectorBtn = document.getElementById('countrySelectorBtn');
    if (countrySelectorBtn) {
        const handleCountrySelect = (e) => {
            e.preventDefault();
            e.stopPropagation();
            openCountryModal();
        };
        countrySelectorBtn.addEventListener('click', handleCountrySelect);
        countrySelectorBtn.addEventListener('touchend', handleCountrySelect, { passive: false });
    }
    
    // Country modal close button
    const countryModalClose = document.getElementById('countryModalClose');
    if (countryModalClose) {
        countryModalClose.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeCountryModal();
        });
    }
    
    // Country modal - click outside to close
    const countryModal = document.getElementById('countryModal');
    if (countryModal) {
        countryModal.addEventListener('click', (e) => {
            if (e.target === countryModal) {
                closeCountryModal();
            }
        });
    }
    
    // Country search input
    const countrySearchInput = document.getElementById('countrySearchInput');
    if (countrySearchInput) {
        countrySearchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            renderCountryList(query);
            const clearBtn = document.getElementById('clearCountrySearch');
            if (clearBtn) {
                clearBtn.style.display = query ? 'block' : 'none';
            }
        });
    }
    
    // Clear country search button
    const clearCountrySearch = document.getElementById('clearCountrySearch');
    if (clearCountrySearch) {
        clearCountrySearch.addEventListener('click', () => {
            if (countrySearchInput) {
                countrySearchInput.value = '';
                renderCountryList('');
                clearCountrySearch.style.display = 'none';
            }
        });
    }
    
    // Apply country selection button
    const applyCountrySelectionBtn = document.getElementById('applyCountrySelection');
    if (applyCountrySelectionBtn) {
        applyCountrySelectionBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await applyCountrySelection();
        });
    }
    
    // Clear country selection button
    const clearCountrySelectionBtn = document.getElementById('clearCountrySelection');
    if (clearCountrySelectionBtn) {
        clearCountrySelectionBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            clearCountrySelection();
        });
    }
    
    // Update country channels button
    const updateCountryChannelsBtn = document.getElementById('updateCountryChannels');
    if (updateCountryChannelsBtn) {
        updateCountryChannelsBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            console.log('🔄 Güncelle butonuna tıklandı');
            console.log('📊 Seçili ülke:', selectedCountry);
            
            if (!selectedCountry) {
                showNotification('⚠️ Lütfen önce bir ülke seçin');
                return;
            }
            
            // Disable button during update
            updateCountryChannelsBtn.disabled = true;
            updateCountryChannelsBtn.style.opacity = '0.5';
            updateCountryChannelsBtn.style.cursor = 'not-allowed';
            
            try {
                await updateCountryChannels();
            } finally {
                // Re-enable button
                updateCountryChannelsBtn.disabled = false;
                updateCountryChannelsBtn.style.opacity = '1';
                updateCountryChannelsBtn.style.cursor = 'pointer';
            }
        });
    }
    
    // Manual M3U URL button
    const manualM3uBtn = document.getElementById('manualM3uBtn');
    const manualM3uSection = document.getElementById('manualM3uSection');
    if (manualM3uBtn && manualM3uSection) {
        manualM3uBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isVisible = manualM3uSection.style.display !== 'none';
            manualM3uSection.style.display = isVisible ? 'none' : 'block';
        });
    }
    
    // Load manual M3U URL
    const loadManualM3uBtn = document.getElementById('loadManualM3u');
    const manualM3uUrlInput = document.getElementById('manualM3uUrl');
    if (loadManualM3uBtn && manualM3uUrlInput) {
        loadManualM3uBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const m3uUrl = manualM3uUrlInput.value.trim();
            if (!m3uUrl) {
                showNotification('⚠️ Lütfen bir M3U URL girin');
                return;
            }
            
            showNotification(`⏳ M3U yükleniyor: ${m3uUrl}`);
            loadManualM3uBtn.disabled = true;
            loadManualM3uBtn.textContent = 'Yükleniyor...';
            
            try {
                // Fetch M3U
                const response = await fetch(m3uUrl, {
                    method: 'GET',
                    mode: 'cors',
                    headers: {
                        'Accept': 'application/vnd.apple.mpegurl, text/plain, */*'
                    }
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                let m3uContent = await response.text();
                
                // Try CORS proxy if direct fetch fails
                if (!m3uContent || m3uContent.length < 100) {
                    for (const proxy of CORS_PROXIES.slice(0, 2)) {
                        try {
                            const proxyUrl = proxy.url(m3uUrl);
                            const proxyResponse = await fetch(proxyUrl);
                            if (proxyResponse.ok) {
                                m3uContent = await proxyResponse.text();
                                if (m3uContent.trim().startsWith('{')) {
                                    try {
                                        const json = JSON.parse(m3uContent);
                                        m3uContent = json.contents || json.data || json.content || m3uContent;
                                    } catch (e) {}
                                }
                                if (m3uContent && m3uContent.length > 100) break;
                            }
                        } catch (e) {
                            continue;
                        }
                    }
                }
                
                if (!m3uContent || m3uContent.length < 100) {
                    throw new Error('M3U içeriği alınamadı veya çok kısa');
                }
                
                // Parse and load
                const parsedChannels = parseM3UContent(m3uContent);
                if (!parsedChannels || parsedChannels.length === 0) {
                    // Try fallback parser
                    const fallbackParsed = parseM3uContentForPlayer(m3uContent);
                    if (fallbackParsed && fallbackParsed.length > 0) {
                        countryChannels = fallbackParsed.map((ch, index) => ({
                            id: ch.id || `manual_${index}`,
                            name: ch.name || ch.tvgName || 'İsimsiz Kanal',
                            url: ch.url || ch.streamUrl || '',
                            tvgName: ch.tvgName || ch.name,
                            tvgLogo: ch.tvgLogo || '',
                            group: ch.group || ch.category || '',
                            category: ch.category || ch.group || '',
                            country: selectedCountry ? selectedCountry.code : ''
                        }));
                    } else {
                        throw new Error('M3U parse edilemedi - geçersiz format');
                    }
                } else {
                    countryChannels = parsedChannels.map((ch, index) => ({
                        id: ch.id || `manual_${index}`,
                        name: ch.name || ch.tvgName || 'İsimsiz Kanal',
                        url: ch.url || ch.streamUrl || '',
                        tvgName: ch.tvgName || ch.name,
                        tvgLogo: ch.tvgLogo || '',
                        group: ch.group || ch.category || '',
                        category: ch.category || ch.group || '',
                        country: ch.country || (selectedCountry ? selectedCountry.code : '')
                    }));
                }
                
                countryChannels = countryChannels.filter(ch => ch.url && ch.url.trim().length > 0);
                
                if (countryChannels.length === 0) {
                    throw new Error('M3U dosyasında geçerli kanal bulunamadı');
                }
                
                // Load as M3U user
                const countryM3uContent = generateM3UFromChannels(countryChannels);
                const playlistName = selectedCountry 
                    ? `${selectedCountry.flag} ${selectedCountry.name}` 
                    : 'Manuel M3U';
                
                await loadM3uFromFileContent(countryM3uContent, playlistName);
                loadUsers();
                await new Promise(resolve => setTimeout(resolve, 200));
                
                const countryUser = users.find(u => u && u.name === playlistName);
                if (countryUser) {
                    setActiveUser(countryUser.id, { source: 'manualM3u' });
                }
                
                renderDynamicCategories();
                renderSidebarChannels();
                closeCountryModal();
                showNotification(`✅ ${countryChannels.length} kanal yüklendi (Manuel M3U)`);
                
            } catch (error) {
                console.error('❌ Manuel M3U yükleme hatası:', error);
                showNotification(`❌ Hata: ${error.message || 'Bilinmeyen hata'}`);
            } finally {
                loadManualM3uBtn.disabled = false;
                loadManualM3uBtn.textContent = 'Yükle';
            }
        });
    }
    
    
    // M3U Switch button - M3U listelerini göster
    const usersSwitchBtn = document.getElementById('usersSwitchBtn');
    if (usersSwitchBtn) {
        const handleUsersSwitch = (e) => {
            e.preventDefault();
            e.stopPropagation();
            openM3uSwitchModal();
        };
        usersSwitchBtn.addEventListener('click', handleUsersSwitch);
        usersSwitchBtn.addEventListener('touchend', handleUsersSwitch, { passive: false });
    }
    
    // M3U Switch modal close button
    const m3uSwitchModalClose = document.getElementById('m3uSwitchModalClose');
    if (m3uSwitchModalClose) {
        m3uSwitchModalClose.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeM3uSwitchModal();
        });
    }
    
    // M3U Switch modal - dışarı tıklayınca kapat
    const m3uSwitchModal = document.getElementById('m3uSwitchModal');
    if (m3uSwitchModal) {
        m3uSwitchModal.addEventListener('click', (e) => {
            if (e.target === m3uSwitchModal) {
                closeM3uSwitchModal();
            }
        });
    }
    
    // Sort button - sıralama modalını aç
    const sortIconBtn = document.getElementById('sortIconBtn');
    if (sortIconBtn) {
        const handleSort = (e) => {
            e.preventDefault();
            e.stopPropagation();
            openSortModal();
        };
        sortIconBtn.addEventListener('click', handleSort);
        sortIconBtn.addEventListener('touchend', handleSort, { passive: false });
    }
    
    // Sort modal close button
    const sortModalClose = document.getElementById('sortModalClose');
    if (sortModalClose) {
        sortModalClose.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeSortModal();
        });
    }
    
    // Sort modal - dışarı tıklayınca kapat
    const sortModal = document.getElementById('sortModal');
    if (sortModal) {
        sortModal.addEventListener('click', (e) => {
            if (e.target === sortModal) {
                closeSortModal();
            }
        });
    }
    
    // Sort options - sıralama seçenekleri
    const sortOptions = document.querySelectorAll('.sort-option');
    sortOptions.forEach(option => {
        option.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const type = option.dataset.type;
            const sort = option.dataset.sort;
            
            // Aktif durumu güncelle
            document.querySelectorAll(`.sort-option[data-type="${type}"]`).forEach(opt => {
                opt.classList.remove('active');
            });
            option.classList.add('active');
            
            // Sıralamayı uygula
            applySort(type, sort);
        });
    });
    
    // User icon button - M3U ekle
    // Not: setupUserMenuAndM3UButtons() içinde daha kapsamlı event listener'lar var
    // Burada sadece backup olarak basit bir handler ekliyoruz
    const userIconBtn = document.getElementById('userIconBtn');
    if (userIconBtn) {
        const handleUserIcon = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            console.log('👤 User icon clicked from setupEventListeners');
            
            // Dosya seçiciyi aç
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.m3u,.m3u8,audio/x-mpegurl,application/vnd.apple.mpegurl,text/plain,*/*';
            fileInput.style.display = 'none';
            fileInput.style.position = 'absolute';
            fileInput.style.left = '-9999px';
            fileInput.style.visibility = 'hidden';
            
            fileInput.addEventListener('change', async (event) => {
                // Sayfa yenilenmesini engelle
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                
                const file = event.target.files[0];
                if (file) {
                    try {
                        const text = await file.text();
                        const fileName = file.name.replace(/\.(m3u|m3u8)$/i, '') || 'M3U Playlist';
                        await loadM3uFromFileContent(text, fileName);
                        console.log('✅ M3U dosyası yüklendi:', fileName);
                    } catch (error) {
                        console.error('❌ M3U dosyası yüklenirken hata:', error);
                        alert('Dosya yüklenirken hata oluştu: ' + (error.message || error));
                    }
                }
                if (fileInput.parentNode) {
                    document.body.removeChild(fileInput);
                }
                return false;
            }, { once: true, passive: false });
            
            document.body.appendChild(fileInput);
            
            // Mobil cihazlarda da çalışması için setTimeout kullan
            setTimeout(() => {
                try {
                    fileInput.click();
                } catch (error) {
                    console.error('❌ File input tıklanamadı:', error);
                    if (fileInput.parentNode) {
                        document.body.removeChild(fileInput);
                    }
                }
            }, 50);
        };
        
        // Hem click hem touchend için event listener ekle
        userIconBtn.addEventListener('click', handleUserIcon, { passive: false });
        userIconBtn.addEventListener('touchend', handleUserIcon, { passive: false });
        
        // Touch start'ı da yakala (mobil için)
        userIconBtn.addEventListener('touchstart', (e) => {
            // Sadece event'i yakala, işleme setupUserMenuAndM3UButtons bırak
        }, { passive: true });
    }
    
    // Search button - toggle arama kutucukları
    const searchIconBtn = document.getElementById('searchIconBtn');
    const searchBoxCategory = document.getElementById('searchBoxCategory');
    const searchBoxChannel = document.getElementById('searchBoxChannel');
    let searchVisible = false;
    
    if (searchIconBtn) {
        const handleSearchToggle = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            searchVisible = !searchVisible;
            
            if (searchBoxCategory) {
                searchBoxCategory.style.display = searchVisible ? 'flex' : 'none';
            }
            if (searchBoxChannel) {
                searchBoxChannel.style.display = searchVisible ? 'flex' : 'none';
            }
            
            // Eğer arama kutucukları gizleniyorsa, arama terimlerini temizle
            if (!searchVisible) {
                const searchInputCategory = document.getElementById('searchInputCategory');
                const searchInputChannel = document.getElementById('searchInputChannel');
                if (searchInputCategory) {
                    searchInputCategory.value = '';
                    handleCategorySearch('');
                }
                if (searchInputChannel) {
                    searchInputChannel.value = '';
                    handleChannelSearch('');
                }
            } else {
                // Arama kutucukları görünür olduğunda, kanal arama kutucuğuna odaklan
                setTimeout(() => {
                    const searchInputChannel = document.getElementById('searchInputChannel');
                    if (searchInputChannel) {
                        searchInputChannel.focus();
                    }
                }, 100);
            }
        };
        searchIconBtn.addEventListener('click', handleSearchToggle);
        searchIconBtn.addEventListener('touchend', handleSearchToggle, { passive: false });
    }
    
    // Kategori arama
    const searchInputCategory = document.getElementById('searchInputCategory');
    const clearSearchCategory = document.getElementById('clearSearchCategory');
    
    if (searchInputCategory) {
        searchInputCategory.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            handleCategorySearch(query);
            
            if (clearSearchCategory) {
                clearSearchCategory.style.display = query ? 'flex' : 'none';
            }
        });
        
        searchInputCategory.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                searchInputCategory.value = '';
                handleCategorySearch('');
                if (clearSearchCategory) {
                    clearSearchCategory.style.display = 'none';
                }
            }
        });
    }
    
    if (clearSearchCategory) {
        clearSearchCategory.addEventListener('click', () => {
            if (searchInputCategory) {
                searchInputCategory.value = '';
                handleCategorySearch('');
                clearSearchCategory.style.display = 'none';
            }
        });
    }
    
    // Kanal arama
    const searchInputChannel = document.getElementById('searchInputChannel');
    const clearSearchChannel = document.getElementById('clearSearchChannel');
    
    if (searchInputChannel) {
        searchInputChannel.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            handleChannelSearch(query);
            
            if (clearSearchChannel) {
                clearSearchChannel.style.display = query ? 'flex' : 'none';
            }
        });
        
        searchInputChannel.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                searchInputChannel.value = '';
                handleChannelSearch('');
                if (clearSearchChannel) {
                    clearSearchChannel.style.display = 'none';
                }
            }
        });
    }
    
    if (clearSearchChannel) {
        clearSearchChannel.addEventListener('click', () => {
            if (searchInputChannel) {
                searchInputChannel.value = '';
                handleChannelSearch('');
                clearSearchChannel.style.display = 'none';
            }
        });
    }
}

// Kategori arama fonksiyonu
let categorySearchQuery = '';
function handleCategorySearch(query) {
    categorySearchQuery = query.toLowerCase().trim();
    renderDynamicCategories();
}

// Kanal arama fonksiyonu
let channelSearchQuery = '';
function handleChannelSearch(query) {
    channelSearchQuery = query.toLowerCase().trim();
    renderSidebarChannels();
}

// Load M3U file
async function loadChannelsFromM3U() {
    try {
        channels = [];
        allCategories.clear();
        let channelId = 1;
        
        // Tüm M3U dosyalarını yükle
        for (const m3uFile of m3uFiles) {
            try {
                // Try a few variants so tv.m3u works regardless of base path.
                const candidates = [
                    m3uFile,
                    m3uFile.startsWith('/') ? m3uFile : `/${m3uFile}`,
                    `./${m3uFile}`,
                ];

                let text = null;
                let lastErr = null;

                for (const candidate of candidates) {
                    try {
                        const response = await fetch(candidate, { cache: 'no-store' });
                        if (!response.ok) {
                            lastErr = new Error(`HTTP ${response.status}`);
                            continue;
                        }
                        text = await response.text();
                        if (text && (text.includes('#EXTM3U') || text.includes('#EXTINF'))) {
                            break;
                        }
                    } catch (e) {
                        lastErr = e;
                    }
                }

                if (!text) {
                    console.warn(`⚠️ ${m3uFile} okunamadı (tv.m3u server üzerinden servis edilmiyor olabilir):`, lastErr?.message || lastErr);
                    console.warn('ℹ️ Çözüm: Uygulamayı dosyayı çift tıklayarak değil, http://localhost:8080 üzerinden açın.');
                    continue;
                }
                // Use regex for faster parsing instead of line-by-line
                const lines = text.split('\n');
                
                let currentChannel = null;
                let fileChannelCount = 0;
                
                // Pre-compile regex patterns for better performance
                const tvgIdRegex = /tvg-id="([^"]*)"/;
                const tvgLogoRegex = /tvg-logo="([^"]*)"/;
                const groupTitleRegex = /group-title="([^"]*)"/;
                const channelNameRegex = /,(.*)$/;
                
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    
                    if (!line) continue;
                    
                    if (line.startsWith('#EXTINF:')) {
                        const tvgIdMatch = tvgIdRegex.exec(line);
                        const tvgLogoMatch = tvgLogoRegex.exec(line);
                        const groupTitleMatch = groupTitleRegex.exec(line);
                        
                        const channelNameMatch = channelNameRegex.exec(line);
                        let channelName = channelNameMatch ? channelNameMatch[1].trim() : '';
                        
                        let groupTitle = groupTitleMatch ? groupTitleMatch[1].trim() : 'Ulusal';
                        
                        // Clean category name - birleşik kategorileri ayır
                        // "Ulusal - Yurt Disi" -> "Ulusal" ve "Yurt Dışı" olarak işle
                        let category = groupTitle.split(' - ')[0].trim();
                        
                        // Eğer kategori boşsa veya geçersizse "Ulusal" yap
                        if (!category || category === '' || category === 'undefined') {
                            category = 'Ulusal';
                        }
                        
                        // Normalize category (normalizeCategory fonksiyonu kullan - büyük/küçük harf duyarsız)
                        category = normalizeCategory(category);
                        
                        // Tüm kategorileri ekle (normalize edilmiş haliyle - çiftlemeyi önlemek için)
                        if (category) {
                            allCategories.add(category);
                        }
                        
                        // Eğer birleşik kategori varsa (örn: "Ulusal - Yurt Disi"), ikinci kategoriyi de ekle
                        if (groupTitle.includes(' - ')) {
                            const secondCategory = groupTitle.split(' - ')[1]?.trim();
                            if (secondCategory && secondCategory !== category) {
                                const normalizedSecond = normalizeCategory(secondCategory);
                                if (normalizedSecond) {
                                    allCategories.add(normalizedSecond);
                                }
                            }
                        }
                        
                        currentChannel = {
                            id: channelId++,
                            name: channelName,
                            url: '',
                            category: category,
                            tvgId: tvgIdMatch ? tvgIdMatch[1] : '',
                            tvgLogo: tvgLogoMatch ? tvgLogoMatch[1] : ''
                        };
                    }
                    else if ((line.startsWith('http://') || line.startsWith('https://') || line.startsWith('www.')) && currentChannel) {
                        currentChannel.url = line;
                        channels.push(currentChannel);
                        fileChannelCount++;
                        currentChannel = null;
                    }
                }
                
                console.log(`✅ ${m3uFile}: ${fileChannelCount} kanal eklendi`);
            } catch (fileError) {
                console.warn(`⚠️ ${m3uFile} yüklenirken hata:`, fileError);
            }
        }
        
         // YouTube Radyo kanallarını ekle
        const radioChannels = [
            { name: 'Kral POP Radyo', url: 'https://youtu.be/uda4_9qDAwY?si=-dxHUDMT1P12QAYm' },
            { name: 'Kral FM', url: 'https://youtu.be/gkWeZBwyCD8?si=yFwKFNMryizlfCu3' },
            { name: 'Kral Akustik', url: 'https://m.youtube.com/watch?v=6He9sFxFv8Y' },
            { name: "Radyo İmparator", url: 'https://m.youtube.com/watch?v=T7I85FOQHuc' },
            { name: 'Radyo Arabesk', url: 'https://www.youtube.com/watch?v=gSBZcx5YbH4' },
            { name: 'Viva Arabesk', url: 'https://www.youtube.com/watch?v=Vie289ngRO8' },
            { name: 'Radyo Damar', url: 'https://m.youtube.com/watch?v=N1VogsSbe6M' },
            { name: 'Slow Türk', url: 'https://youtu.be/iy5oTws2RyQ?si=sOL2AmvDH2dOZ4NP' },
            { name: 'Fenomen Türk', url: 'https://www.youtube.com/watch?v=lYq5eFZp2GQ' },
            { name: 'Akustik Türkü', url: 'https://www.youtube.com/watch?v=_qm_JqY-6OI' },
            { name: 'Radyo 44', url: 'https://www.youtube.com/watch?v=gsD3xoM8v3k' },
            { name: 'Radyo 7 Akustik', url: 'https://www.youtube.com/watch?v=WN59fUXkEz0' },
            { name: 'Radyo Mix', url: 'https://www.youtube.com/watch?v=afIDdrWAoQQ' },
            { name: 'Karadeniz Akustik', url: 'https://www.youtube.com/watch?v=Fru_Ss-TqgY' },
            { name: 'Radyo 2000', url: 'https://www.youtube.com/watch?v=ydJGw5tjJyA&list=RDydJGw5tjJyA&start_radio=1' },
            { name: 'Hit Remix', url: 'https://www.youtube.com/watch?v=4j0GAzbACjk' },
            { name: 'Radyo Dram', url: 'https://www.youtube.com/watch?v=hEuPzfboeEA' },
            { name: 'Dert Fm', url: 'https://www.youtube.com/watch?v=HVtFDo44LZc' },
            { name: 'Vav Radyo', url: 'https://m.youtube.com/watch?v=XoUj-5ElxFc' },
            { name: 'En Çok Dinlenen Türküler', url: 'https://www.youtube.com/watch?v=vhOeV8QsVzo&list=RDvhOeV8QsVzo&start_radio=1' }
        ];
        
        radioChannels.forEach(radio => {
            channels.push({
                id: channelId++,
                name: radio.name,
                url: radio.url,
                category: 'Radyo Canlı',
                tvgId: '',
                tvgLogo: ''
            });
        });
        
        allCategories.add('Radyo Canlı');
        
        console.log(`✅ Toplam ${channels.length} kanal yüklendi!`);
        console.log(`✅ ${allCategories.size} kategori bulundu:`, Array.from(allCategories).sort());
        
        // Render dynamic categories immediately (non-blocking)
        requestAnimationFrame(() => {
            renderDynamicCategories();
        });
    } catch (error) {
        console.error('M3U dosyası yüklenemedi:', error);
        // Hata mesajı kaldırıldı - sessiz çalış
        console.warn('Kanal listesi yüklenemedi');
    }
}

// Kategorileri birleştir ve normalize et
function mergeAndNormalizeCategories() {
    const categoryMap = new Map(); // normalized -> { name, icon, id, count, isStandard }
    
    // Mevcut kanalları al (current user'ın kanalları veya default channels)
    const currentChannels = getCurrentChannels();
    
    // Aktif user'ın kaynağını kontrol et
    let currentUserSource = null;
    if (currentUserId && users && Array.isArray(users)) {
        const currentUser = users.find(u => u && u.id === currentUserId);
        if (currentUser && currentUser.source) {
            currentUserSource = currentUser.source;
        }
    }
    
    // Tüm kanalları kategorilere göre grupla
    const channelCategoryMap = new Map(); // normalized category -> channels[]
    
    currentChannels.forEach(ch => {
        // Kategoriyi normalize etmeden önce orijinal halini kullan
        let category = ch.category || '';
        // VOD ve Dizi prefix'li kategoriler için normalize etme (tam ismi koru)
        let normalized;
        if (category.startsWith('VOD - ') || category.startsWith('Dizi - ')) {
            normalized = category.toLowerCase();
        } else {
            normalized = category ? normalizeCategory(category).toLowerCase() : 'ulusal';
        }
        if (!channelCategoryMap.has(normalized)) {
            channelCategoryMap.set(normalized, []);
        }
        channelCategoryMap.get(normalized).push(ch);
    });
    
    // allCategories Set'indeki kategorileri ekle
    // Xtream için de allCategories'ten kategorileri ekle (kanallardan çıkarılan kategoriler)
    if (allCategories && allCategories.size > 0) {
        allCategories.forEach(category => {
            if (category) {
                // VOD ve Dizi prefix'li kategoriler için normalize etme (tam ismi koru)
                let normalized;
                if (category.startsWith('VOD - ') || category.startsWith('Dizi - ')) {
                    normalized = category.toLowerCase();
                } else {
                    normalized = normalizeCategory(category).toLowerCase();
                }
                // Eğer bu kategori channelCategoryMap'te yoksa, boş bir array ile ekle
                if (!channelCategoryMap.has(normalized)) {
                    channelCategoryMap.set(normalized, []);
                }
            }
        });
    }
    
    // STANDARD_CATEGORIES'i öncelikli olarak ekle (sadece Xtream değilse)
    // Xtream user aktifse, varsayılan kategorileri gösterme
    if (currentUserSource !== 'xtream') {
        STANDARD_CATEGORIES.forEach(cat => {
            if (cat.id === 'all') return;
            
            const normalized = cat.id.toLowerCase();
            const matchingChannels = [];
            
            // Bu kategoriye ait tüm kanalları bul
            for (const [catKey, catChannels] of channelCategoryMap.entries()) {
                if (catKey === normalized || 
                    catKey.includes(normalized) || 
                    normalized.includes(catKey) ||
                    catKey.split(' ').some(word => word === normalized) ||
                    normalized.split(' ').some(word => catKey === word)) {
                    matchingChannels.push(...catChannels);
                }
            }
            
            // Tekrarları kaldır
            const uniqueChannels = Array.from(new Set(matchingChannels.map(ch => ch.id))).map(id => 
                matchingChannels.find(ch => ch.id === id)
            );
            
            if (uniqueChannels.length > 0) {
                categoryMap.set(normalized, {
                    name: cat.name,
                    icon: cat.icon,
                    id: cat.id,
                    count: uniqueChannels.length,
                    isStandard: true
                });
                
                // Bu kategoriye ait kanalları işaretle (tekrar işlenmesin)
                uniqueChannels.forEach(ch => {
                    const chNormalized = normalizeCategory(ch.category).toLowerCase();
                    channelCategoryMap.delete(chNormalized);
                });
            }
        });
    }
    
    // "Diğer" kategorisindeki kanalları "Ulusal"a taşı
    if (channelCategoryMap.has('diğer')) {
        const digerChannels = channelCategoryMap.get('diğer');
        const ulusalNormalized = 'ulusal';
        if (!channelCategoryMap.has(ulusalNormalized)) {
            channelCategoryMap.set(ulusalNormalized, []);
        }
        channelCategoryMap.get(ulusalNormalized).push(...digerChannels);
        channelCategoryMap.delete('diğer');
        
        // Ulusal kategorisini güncelle
        if (categoryMap.has(ulusalNormalized)) {
            categoryMap.get(ulusalNormalized).count += digerChannels.length;
        }
    }
    
    // Kalan kategorileri ekle (sadece benzersiz olanlar)
    for (const [normalized, catChannels] of channelCategoryMap.entries()) {
        if (normalized === 'all' || normalized === 'tümü' || normalized === 'diğer') continue;
        if (categoryMap.has(normalized)) continue; // Zaten eklenmiş
        
        // Kategori ismini düzelt
        const originalCategory = catChannels[0]?.category || normalized;
        const displayName = originalCategory.split(' ').map(w => 
            w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
        ).join(' ');
        
        categoryMap.set(normalized, {
            name: displayName,
            icon: categoryIcons[normalized] || categoryIcons[normalizeCategory(originalCategory)] || '📺',
            id: normalized,
            count: catChannels.length,
            isStandard: false
        });
    }
    
    // allCategories Set'indeki kategorileri ekle
    // Xtream için de allCategories'ten kategorileri ekle (kanallardan çıkarılan kategoriler)
    if (allCategories && allCategories.size > 0) {
        allCategories.forEach(category => {
            if (category && category.trim()) {
                // VOD ve Dizi prefix'li kategoriler için normalize etme (tam ismi koru)
                let normalized, categoryLower;
                if (category.startsWith('VOD - ') || category.startsWith('Dizi - ')) {
                    categoryLower = category.toLowerCase().trim();
                    normalized = categoryLower;
                } else {
                    categoryLower = category.toLowerCase().trim();
                    normalized = normalizeCategory(category).toLowerCase();
                }
                
                // Eğer bu kategori categoryMap'te yoksa ekle
                if (categoryLower !== 'all' && categoryLower !== 'tümü' && categoryLower !== 'diğer' && !categoryMap.has(normalized) && !categoryMap.has(categoryLower)) {
                    // Kategori ismini düzelt (orijinal ismi kullan)
                    const displayName = category.split(' ').map(w => 
                        w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
                    ).join(' ');
                    
                    // Bu kategorideki kanal sayısını bul
                    const catChannels = channelCategoryMap.get(normalized) || channelCategoryMap.get(categoryLower) || [];
                    
                    // Kategori ID'sini belirle (normalize edilmiş veya orijinal)
                    const categoryId = normalized || categoryLower;
                    
                    // Orijinal kategori ismini kullan
                    categoryMap.set(categoryId, {
                        name: displayName,
                        icon: categoryIcons[categoryLower] || categoryIcons[normalizeCategory(category)] || '📺',
                        id: categoryId,
                        count: catChannels.length,
                        isStandard: false
                    });
                }
            }
        });
    }
    
    let sortedCategories = Array.from(categoryMap.values());
    
    // Sıralama uygula
    if (categorySort === 'az') {
        sortedCategories.sort((a, b) => {
            // Önce standart kategoriler, sonra diğerleri
            if (a.isStandard && !b.isStandard) return -1;
            if (!a.isStandard && b.isStandard) return 1;
            // Sonra isme göre A-Z sırala
            return a.name.localeCompare(b.name, 'tr');
        });
    } else if (categorySort === 'za') {
        sortedCategories.sort((a, b) => {
            // Önce standart kategoriler, sonra diğerleri
            if (a.isStandard && !b.isStandard) return -1;
            if (!a.isStandard && b.isStandard) return 1;
            // Sonra isme göre Z-A sırala
            return b.name.localeCompare(a.name, 'tr');
        });
    } else {
        // Varsayılan sıralama - STANDARD_CATEGORIES sırasına göre
        sortedCategories.sort((a, b) => {
            // Önce standart kategoriler, sonra diğerleri
            if (a.isStandard && !b.isStandard) return -1;
            if (!a.isStandard && b.isStandard) return 1;
            
            // Standart kategoriler için order değerine göre sırala
            if (a.isStandard && b.isStandard) {
                const aOrder = STANDARD_CATEGORIES.find(cat => cat.id === a.id)?.order ?? 999;
                const bOrder = STANDARD_CATEGORIES.find(cat => cat.id === b.id)?.order ?? 999;
                return aOrder - bOrder;
            }
            
            // Diğer kategoriler için isme göre sırala
            return a.name.localeCompare(b.name, 'tr');
        });
    }
    
    return sortedCategories;
}

// Dinamik kategori kartlarını oluştur (sol sidebar'da)
function renderDynamicCategories() {
    const categoriesSidebarList = document.getElementById('categoriesSidebarList');
    if (!categoriesSidebarList) {
        console.warn('⚠️ categoriesSidebarList bulunamadı');
        return;
    }
    
    // Mevcut kanalları al (current user'ın kanalları veya default channels)
    const currentChannels = getCurrentChannels();
    
    // TÜM kartları temizle (Tümü dahil - yeniden oluşturacağız)
    categoriesSidebarList.innerHTML = '';
    
    // Kategorileri birleştir ve normalize et (sadece mevcut kanallara göre)
    const mergedCategories = mergeAndNormalizeCategories();
    
    // "Tümü" kategorisini ekle (arama sorgusu yoksa veya "tümü" kelimesi geçiyorsa)
    if (!categorySearchQuery || 'tümü'.includes(categorySearchQuery) || categorySearchQuery === '') {
        const allItem = document.createElement('div');
        allItem.className = 'category-sidebar-item';
        allItem.dataset.category = 'all';
        if (currentCategory === 'all') {
            allItem.classList.add('active');
        }
        const allIcon = categoryIcons['all'] || '📺';
        allItem.innerHTML = `
            <div class="category-sidebar-icon">${allIcon}</div>
            <div class="category-sidebar-name">Tümü</div>
        `;
        allItem.addEventListener('click', () => {
            currentCategory = 'all';
            activeTab = 'channels'; // Tümü seçildiğinde normal kanallar sekmesine geç
            showSidebar(); // Sidebar gizliyse aç
            
            // Dikey ekranlarda kanalları göster
            applyPortraitMode();
            const playerContentWrapper = document.querySelector('.player-content-wrapper');
            if (playerContentWrapper && isPortraitMode()) {
                playerContentWrapper.classList.remove('channels-hidden');
                // Player view mode'dan çık (eğer aktifse)
                playerContentWrapper.classList.remove('player-view-mode');
            }
            
            renderSidebarChannels();
            renderDynamicCategories();
        });
        categoriesSidebarList.appendChild(allItem);
    }
    
    // "Favoriler" kategorisini ekle (Tümü'nün altına) - arama sorgusu varsa filtrele
    if (!categorySearchQuery || 'favoriler'.includes(categorySearchQuery) || 'favori'.includes(categorySearchQuery)) {
        const favoritesItem = document.createElement('div');
        favoritesItem.className = 'category-sidebar-item';
        favoritesItem.dataset.category = 'favorites';
        if (currentCategory === 'favorites') {
            favoritesItem.classList.add('active');
        }
        const favoritesIcon = categoryIcons['favorites'] || '⭐';
        const favoritesCount = favoriteChannels.length;
        favoritesItem.innerHTML = `
            <div class="category-sidebar-icon">${favoritesIcon}</div>
            <div class="category-sidebar-name">Favoriler${favoritesCount > 0 ? ` (${favoritesCount})` : ''}</div>
        `;
        favoritesItem.addEventListener('click', () => {
            currentCategory = 'favorites';
            activeTab = 'favorites'; // Favoriler seçildiğinde favoriler sekmesine geç
            showSidebar(); // Sidebar gizliyse aç
            renderSidebarChannels();
            renderDynamicCategories();
        });
        categoriesSidebarList.appendChild(favoritesItem);
    }
    
    // "Son İzlenenler" kategorisini ekle (Favoriler'in altına) - arama sorgusu varsa filtrele
    if (!categorySearchQuery || 'son izlenenler'.includes(categorySearchQuery) || 'izlenen'.includes(categorySearchQuery)) {
        const recentItem = document.createElement('div');
        recentItem.className = 'category-sidebar-item';
        recentItem.dataset.category = 'recent';
        if (currentCategory === 'recent') {
            recentItem.classList.add('active');
        }
        const recentIcon = categoryIcons['recent'] || '🕐';
        const recentCount = recentChannels.length;
        recentItem.innerHTML = `
            <div class="category-sidebar-icon">${recentIcon}</div>
            <div class="category-sidebar-name">Son İzlenenler${recentCount > 0 ? ` (${recentCount})` : ''}</div>
        `;
        recentItem.addEventListener('click', () => {
            currentCategory = 'recent';
            activeTab = 'channels'; // Son İzlenenler seçildiğinde normal kanallar sekmesine geç
            showSidebar(); // Sidebar gizliyse aç
            
            // Dikey ekranlarda kanalları göster
            applyPortraitMode();
            const playerContentWrapper = document.querySelector('.player-content-wrapper');
            if (playerContentWrapper && isPortraitMode()) {
                playerContentWrapper.classList.remove('channels-hidden');
                // Player view mode'dan çık (eğer aktifse)
                playerContentWrapper.classList.remove('player-view-mode');
            }
            
            renderSidebarChannels();
            renderDynamicCategories();
        });
        categoriesSidebarList.appendChild(recentItem);
    }
    
    // Diğer kategorileri ekle
    mergedCategories.forEach(cat => {
        if (cat.id.toLowerCase() === 'diğer') return; // Diğer kategorisini gösterme
        
        // Arama sorgusu varsa filtrele
        if (categorySearchQuery) {
            const categoryNameLower = cat.name.toLowerCase();
            if (!categoryNameLower.includes(categorySearchQuery)) {
                return; // Bu kategori arama sorgusuna uymuyor, atla
            }
        }
        
        const categoryItem = document.createElement('div');
        categoryItem.className = 'category-sidebar-item';
        categoryItem.dataset.category = cat.id;
        if (currentCategory === cat.id) {
            categoryItem.classList.add('active');
        }
        // İkonu bul - önce cat.icon, sonra categoryIcons'tan
        const icon = cat.icon || categoryIcons[cat.id] || categoryIcons[normalizeCategory(cat.name)] || '📺';
        categoryItem.innerHTML = `
            <div class="category-sidebar-icon">${icon}</div>
            <div class="category-sidebar-name">${cat.name}</div>
        `;
        categoryItem.addEventListener('click', () => {
            currentCategory = cat.id;
            showSidebar(); // Sidebar gizliyse aç
            
            // Dikey ekranlarda kanalları göster
            applyPortraitMode();
            const playerContentWrapper = document.querySelector('.player-content-wrapper');
            if (playerContentWrapper && isPortraitMode()) {
                playerContentWrapper.classList.remove('channels-hidden');
                // Player view mode'dan çık (eğer aktifse)
                playerContentWrapper.classList.remove('player-view-mode');
            }
            
            renderSidebarChannels();
            renderDynamicCategories();
        });
        categoriesSidebarList.appendChild(categoryItem);
    });
    
    console.log('✅ Kategoriler render edildi:', categoriesSidebarList.children.length, 'kategori');
    
    // Use event delegation for category clicks (better performance)
    if (!categoriesSidebarList.hasAttribute('data-delegated')) {
        categoriesSidebarList.setAttribute('data-delegated', 'true');
        categoriesSidebarList.addEventListener('click', (e) => {
            const categoryItem = e.target.closest('.category-sidebar-item');
            if (!categoryItem) return;
            
            const category = categoryItem.dataset.category;
            if (!category) return;
            
            console.log('📂 Kategori tıklandı:', category);
            currentCategory = category;
            
            // Set active tab based on category
            if (category === 'favorites') {
                activeTab = 'favorites';
            } else {
                activeTab = 'channels';
            }
            
            showSidebar();
            
            // Dikey ekranlarda kanalları göster (kategori tıklandığında)
            const playerContentWrapper = document.querySelector('.player-content-wrapper');
            if (playerContentWrapper) {
                playerContentWrapper.classList.remove('channels-hidden');
                // Player view mode'dan çık (eğer aktifse)
                playerContentWrapper.classList.remove('player-view-mode');
            }
            
            renderSidebarChannels();
            renderDynamicCategories();
        });
    }
    
    // Event listener'ları yeniden bağla
    setupCategoryEventListeners();
}

// Kategori event listener'larını yeniden bağla
function setupCategoryEventListeners() {
    categoryCards = document.querySelectorAll('.category-card');
    
    if (categoryCards && categoryCards.length > 0) {
        categoryCards.forEach(card => {
            // Önceki listener'ları kaldır
            const newCard = card.cloneNode(true);
            card.parentNode.replaceChild(newCard, card);
            
            // Touch scrolling için - sadece gerçek click'te tetiklenmeli
            let touchStartX = 0;
            let touchStartY = 0;
            let isScrolling = false;
            
            // Touch start - scroll tespiti için
            newCard.addEventListener('touchstart', (e) => {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                isScrolling = false;
            }, { passive: true });
            
            // Touch move - scroll olup olmadığını kontrol et
            newCard.addEventListener('touchmove', (e) => {
                if (!touchStartX || !touchStartY) return;
                
                const touchEndX = e.touches[0].clientX;
                const touchEndY = e.touches[0].clientY;
                const diffX = Math.abs(touchEndX - touchStartX);
                const diffY = Math.abs(touchEndY - touchStartY);
                
                // Yatay kaydırma varsa scroll olarak işaretle
                if (diffX > 10 || diffY > 10) {
                    isScrolling = true;
                }
            }, { passive: true });
            
            // Click event - sadece scroll değilse tetikle
            newCard.addEventListener('click', (e) => {
                // Eğer scroll yapıldıysa click'i yok say
                if (isScrolling) {
                    isScrolling = false;
                    return;
                }
                
                const category = newCard.dataset.category;
                currentCategory = category;
                
                // Update active state
                categoryCards = document.querySelectorAll('.category-card');
                categoryCards.forEach(c => c.classList.remove('active'));
                newCard.classList.add('active');
                
                showSidebar(); // Sidebar gizliyse aç
                renderSidebarChannels();
            }, { passive: false });
            
            // Touch end - scroll durumunu sıfırla
            newCard.addEventListener('touchend', () => {
                // Kısa bir gecikme sonra scroll durumunu sıfırla
                setTimeout(() => {
                    isScrolling = false;
                }, 100);
            }, { passive: true });
        });
    }
}

// Render Sidebar Channels
function renderSidebarChannels() {
    if (!channelsSidebarList) {
        console.warn('⚠️ channelsSidebarList not found');
        return;
    }
    
    // Get current channels (from user or default)
    const currentChannels = getCurrentChannels();
    
    if (!currentChannels || !Array.isArray(currentChannels) || currentChannels.length === 0) {
        console.warn('⚠️ No channels available');
        channelsSidebarList.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
                <p>Kanal bulunamadı</p>
            </div>
        `;
        return;
    }
    
    let filteredChannels = [];
    
    // Özel kategoriler için filtreleme
    if (currentCategory === 'favorites') {
        // Favoriler kategorisi
        filteredChannels = currentChannels.filter(ch => favoriteChannels.includes(ch.id));
        if (sidebarCategoryTitle) {
            sidebarCategoryTitle.textContent = 'Favori Kanallar';
        }
    } else if (currentCategory === 'recent') {
        // Son İzlenenler kategorisi
        // recentChannels array'inde channel ID'ler var, bunları kullanarak kanalları bul
        filteredChannels = currentChannels.filter(ch => recentChannels.includes(ch.id));
        // En son izlenenler önce gelsin (ters sıralama)
        filteredChannels.sort((a, b) => {
            const indexA = recentChannels.indexOf(a.id);
            const indexB = recentChannels.indexOf(b.id);
            return indexA - indexB; // Daha yeni olanlar önce
        });
        if (sidebarCategoryTitle) {
            sidebarCategoryTitle.textContent = 'Son İzlenenler';
        }
    } else if (activeTab === 'favorites') {
        filteredChannels = currentChannels.filter(ch => favoriteChannels.includes(ch.id));
        if (sidebarCategoryTitle) {
            sidebarCategoryTitle.textContent = 'Favori Kanallar';
        }
            } else {
                // Show channels from current category
                if (currentCategory === 'all') {
                    filteredChannels = currentChannels;
                } else {
                    // currentCategory zaten normalize edilmiş bir kategori ID'si
                    // Sadece kanallardaki kategoriyi normalize et ve karşılaştır
                    const normalizedTargetCategory = currentCategory.toLowerCase();
                    
                    filteredChannels = currentChannels.filter(ch => {
                        if (!ch.category) return false;
                        
                        // VOD ve Dizi prefix'li kategoriler için normalize etme
                        let chCategory;
                        if (ch.category.startsWith('VOD - ') || ch.category.startsWith('Dizi - ')) {
                            chCategory = ch.category.toLowerCase();
                        } else {
                            chCategory = normalizeCategory(ch.category).toLowerCase();
                        }
                        
                        // Tam eşleşme kontrolü
                        return chCategory === normalizedTargetCategory;
                    });
                }
        
        const categoryNames = {
            'all': 'Tüm Kanallar',
            'Ulusal': 'Ulusal Kanallar',
            'Haber': 'Haber Kanalları',
            'Spor': 'Spor Kanalları',
            'Eğlence': 'Eğlence Kanalları',
            'Müzik': 'Müzik Kanalları',
            'Belgesel': 'Belgesel Kanalları',
            'Dini': 'Dini Kanallar',
            'Çocuk': 'Çocuk Kanalları',
            'Ekonomi': 'Ekonomi Kanalları',
            'Yurt Dışı': 'Yurt Dışı Kanallar',
            'Radyo Canlı': 'Radyo Canlı'
        };
        if (sidebarCategoryTitle) {
            sidebarCategoryTitle.textContent = categoryNames[currentCategory] || 'Kanallar';
        }
        // Update active category
        if (categoryCards && categoryCards.length > 0) {
            categoryCards.forEach(card => {
                card.classList.remove('active');
                if (card.dataset.category === currentCategory) {
                    card.classList.add('active');
                }
            });
        }
    }
    
    // Kanal arama sorgusu varsa filtrele
    if (channelSearchQuery) {
        filteredChannels = filteredChannels.filter(ch => {
            const channelNameLower = ch.name.toLowerCase();
            const channelCategoryLower = (ch.category || '').toLowerCase();
            return channelNameLower.includes(channelSearchQuery) || 
                   channelCategoryLower.includes(channelSearchQuery);
        });
    }
    
    // Kanal sıralaması uygula
    if (channelSort === 'az') {
        filteredChannels.sort((a, b) => {
            return a.name.localeCompare(b.name, 'tr');
        });
    } else if (channelSort === 'za') {
        filteredChannels.sort((a, b) => {
            return b.name.localeCompare(a.name, 'tr');
        });
    }
    // 'default' için sıralama yapma, orijinal sırada kalsın
    
    channelsSidebarList.innerHTML = '';
    
    if (filteredChannels.length === 0) {
        channelsSidebarList.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
                <p>Kanal bulunamadı</p>
            </div>
        `;
        return;
    }
    
    // Clear first for immediate visual feedback
    channelsSidebarList.innerHTML = '';
    
    // Batch rendering for better performance - render in chunks
    const BATCH_SIZE = 50; // Render 50 channels at a time
    let currentIndex = 0;
    
    function renderBatch() {
        const fragment = document.createDocumentFragment();
        const endIndex = Math.min(currentIndex + BATCH_SIZE, filteredChannels.length);
        
        for (let i = currentIndex; i < endIndex; i++) {
            const channel = filteredChannels[i];
            const channelItem = document.createElement('div');
            channelItem.className = 'channel-sidebar-item';
            channelItem.dataset.channelId = channel.id;
            if (currentChannel && currentChannel.id === channel.id) {
                channelItem.classList.add('active');
            }
            
            const isFavorite = favoriteChannels.includes(channel.id);
            
            // Use template string for faster DOM creation
            const logoHtml = channel.tvgLogo 
                ? `<img src="${channel.tvgLogo}" alt="${channel.name}" class="channel-sidebar-logo" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><div class="channel-sidebar-logo-placeholder" style="display:none">📺</div>`
                : '<div class="channel-sidebar-logo-placeholder">📺</div>';
            
            channelItem.innerHTML = `
                <div class="channel-sidebar-content">
                    <div class="channel-sidebar-logo-container">${logoHtml}</div>
                    <div class="channel-sidebar-info">
                        <div class="channel-sidebar-name">${channel.name}</div>
                        <div class="channel-sidebar-category">${channel.category}</div>
                    </div>
                </div>
                <button class="favorite-sidebar-btn" data-channel-id="${channel.id}" title="${isFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}">${isFavorite ? '⭐' : '☆'}</button>
            `;
            
            fragment.appendChild(channelItem);
        }
        
        channelsSidebarList.appendChild(fragment);
        currentIndex = endIndex;
        
        // Continue rendering if there are more channels
        if (currentIndex < filteredChannels.length) {
            requestAnimationFrame(renderBatch);
        }
    }
    
    // Start batch rendering
    renderBatch();
    
    // Update navigation buttons when channels are rendered
    updateChannelNavButtons();
    
    // Use event delegation (better performance) - only add once
    if (channelsSidebarList && !channelsSidebarList.hasAttribute('data-delegated')) {
        channelsSidebarList.setAttribute('data-delegated', 'true');
        channelsSidebarList.addEventListener('click', (e) => {
            const favoriteBtn = e.target.closest('.favorite-sidebar-btn');
            if (favoriteBtn) {
                e.stopPropagation();
                const channelId = parseInt(favoriteBtn.dataset.channelId);
                toggleFavorite(channelId);
                // Use requestAnimationFrame to prevent render loops
                requestAnimationFrame(() => {
                    renderSidebarChannels();
                });
                return;
            }
            
            const channelItem = e.target.closest('.channel-sidebar-item');
            if (channelItem && channelItem.dataset.channelId) {
                const channelId = channelItem.dataset.channelId; // String veya number olabilir
                // Mevcut kanallardan bul (getCurrentChannels kullan)
                const currentChannels = getCurrentChannels();
                const channel = currentChannels.find(ch => {
                    // ID'yi string veya number olarak karşılaştır
                    return String(ch.id) === String(channelId) || ch.id === channelId;
                });
                if (channel) {
                    playChannel(channel);
                }
            }
        });
    }
}

// Render Category Sidebar
function renderCategorySidebar() {
    if (!categorySidebarList) return;
    
    // Aktif user'ın kaynağını kontrol et
    let currentUserSource = null;
    if (currentUserId && users && Array.isArray(users)) {
        const currentUser = users.find(u => u && u.id === currentUserId);
        if (currentUser && currentUser.source) {
            currentUserSource = currentUser.source;
        }
    }
    
    // Xtream user aktifse varsayılan kategorileri gösterme (sadece dinamik kategoriler gösterilecek)
    if (currentUserSource === 'xtream') {
        categorySidebarList.innerHTML = '';
        return;
    }
    
    const categories = ['all', 'favorites', 'recent', 'Ulusal', 'Haber', 'Spor', 'Eğlence', 'Müzik', 'Belgesel', 'Dini', 'Çocuk', 'Ekonomi', 'Yurt Dışı', 'Radyo Canlı'];
    const categoryNames = {
        'all': 'Tümü',
        'favorites': `Favoriler${favoriteChannels.length > 0 ? ` (${favoriteChannels.length})` : ''}`,
        'recent': `Son İzlenenler${recentChannels.length > 0 ? ` (${recentChannels.length})` : ''}`,
        'Ulusal': 'Ulusal',
        'Haber': 'Haber',
        'Spor': 'Spor',
        'Eğlence': 'Eğlence',
        'Müzik': 'Müzik',
        'Belgesel': 'Belgesel',
        'Dini': 'Dini',
        'Çocuk': 'Çocuk',
        'Ekonomi': 'Ekonomi',
        'Yurt Dışı': 'Yurt Dışı',
        'Radyo Canlı': 'Radyo Canlı'
    };
    
    const categoryIconsMap = {
        'all': '📺',
        'favorites': '⭐',
        'recent': '🕐',
        'Ulusal': '📡',
        'Haber': '📰',
        'Spor': '⚽',
        'Eğlence': '🎭',
        'Müzik': '🎵',
        'Belgesel': '🎬',
        'Dini': '🕌',
        'Çocuk': '👶',
        'Ekonomi': '💰',
        'Yurt Dışı': '🌍',
        'Radyo Canlı': '▶️'
    };
    
    categorySidebarList.innerHTML = '';
    
    categories.forEach(category => {
            const categoryItem = document.createElement('div');
            categoryItem.className = 'category-sidebar-item';
        if (currentCategory === category) {
                categoryItem.classList.add('active');
            }
            
        const icon = categoryIconsMap[category] || '📺';
        categoryItem.innerHTML = `
            <div class="category-sidebar-icon">${icon}</div>
            <div class="category-sidebar-name">${categoryNames[category]}</div>
        `;
            
            categoryItem.addEventListener('click', () => {
            currentCategory = category;
            // Özel kategoriler için activeTab'ı ayarla
            if (category === 'favorites') {
                activeTab = 'favorites';
            } else if (category === 'recent') {
                activeTab = 'channels';
            } else {
                activeTab = 'channels';
            }
            showSidebar(); // Sidebar gizliyse aç
                renderSidebarChannels();
                renderCategorySidebar();
            
            // Update category cards
            if (categoryCards && categoryCards.length > 0) {
                categoryCards.forEach(card => {
                    card.classList.remove('active');
                    if (card.dataset.category === category) {
                        card.classList.add('active');
                    }
                });
            }
        });
        
        categorySidebarList.appendChild(categoryItem);
    });
}

// Get filtered channels (same logic as renderSidebarChannels)
function getFilteredChannels() {
    const currentChannels = getCurrentChannels();
    
    if (!currentChannels || !Array.isArray(currentChannels) || currentChannels.length === 0) {
        return [];
    }
    
    let filteredChannels = [];
    
    // Özel kategoriler için filtreleme
    if (currentCategory === 'favorites') {
        filteredChannels = currentChannels.filter(ch => favoriteChannels.includes(ch.id));
    } else if (currentCategory === 'recent') {
        filteredChannels = currentChannels.filter(ch => recentChannels.includes(ch.id));
        filteredChannels.sort((a, b) => {
            const indexA = recentChannels.indexOf(a.id);
            const indexB = recentChannels.indexOf(b.id);
            return indexA - indexB;
        });
    } else if (activeTab === 'favorites') {
        filteredChannels = currentChannels.filter(ch => favoriteChannels.includes(ch.id));
    } else {
        if (currentCategory === 'all') {
            filteredChannels = currentChannels;
        } else {
            // currentCategory zaten normalize edilmiş bir kategori ID'si
            // Sadece kanallardaki kategoriyi normalize et ve karşılaştır
            const normalizedTargetCategory = currentCategory.toLowerCase();
            
            filteredChannels = currentChannels.filter(ch => {
                if (!ch.category) return false;
                
                // VOD ve Dizi prefix'li kategoriler için normalize etme
                let chCategory;
                if (ch.category.startsWith('VOD - ') || ch.category.startsWith('Dizi - ')) {
                    chCategory = ch.category.toLowerCase();
                } else {
                    chCategory = normalizeCategory(ch.category).toLowerCase();
                }
                
                // Tam eşleşme kontrolü
                return chCategory === normalizedTargetCategory;
            });
        }
    }
    
    // Kanal arama sorgusu varsa filtrele
    if (channelSearchQuery) {
        filteredChannels = filteredChannels.filter(ch => {
            const channelNameLower = ch.name.toLowerCase();
            const channelCategoryLower = (ch.category || '').toLowerCase();
            return channelNameLower.includes(channelSearchQuery) || 
                   channelCategoryLower.includes(channelSearchQuery);
        });
    }
    
    // Kanal sıralaması uygula
    if (channelSort === 'az') {
        filteredChannels.sort((a, b) => {
            return a.name.localeCompare(b.name, 'tr');
        });
    } else if (channelSort === 'za') {
        filteredChannels.sort((a, b) => {
            return b.name.localeCompare(a.name, 'tr');
        });
    }
    
    return filteredChannels;
}

// Navigate to previous channel
function navigateToPreviousChannel() {
    if (!currentChannel) return;
    
    const filteredChannels = getFilteredChannels();
    if (filteredChannels.length === 0) return;
    
    const currentIndex = filteredChannels.findIndex(ch => 
        String(ch.id) === String(currentChannel.id) || ch.id == currentChannel.id
    );
    
    if (currentIndex === -1) {
        // Current channel not in filtered list, play first channel
        if (filteredChannels.length > 0) {
            playChannel(filteredChannels[0]);
        }
        return;
    }
    
    // Go to previous channel (wrap around to last if at first)
    const prevIndex = currentIndex === 0 ? filteredChannels.length - 1 : currentIndex - 1;
    playChannel(filteredChannels[prevIndex]);
}

// Navigate to next channel
function navigateToNextChannel() {
    if (!currentChannel) return;
    
    const filteredChannels = getFilteredChannels();
    if (filteredChannels.length === 0) return;
    
    const currentIndex = filteredChannels.findIndex(ch => 
        String(ch.id) === String(currentChannel.id) || ch.id == currentChannel.id
    );
    
    if (currentIndex === -1) {
        // Current channel not in filtered list, play first channel
        if (filteredChannels.length > 0) {
            playChannel(filteredChannels[0]);
        }
        return;
    }
    
    // Go to next channel (wrap around to first if at last)
    const nextIndex = currentIndex === filteredChannels.length - 1 ? 0 : currentIndex + 1;
    playChannel(filteredChannels[nextIndex]);
}

// Update channel navigation buttons state
function updateChannelNavButtons() {
    const prevSmallBtn = document.getElementById('prevSmallBtn');
    const nextSmallBtn = document.getElementById('nextSmallBtn');
    const controlsOverlay = document.getElementById('videoControlsOverlay');
    
    if (!prevSmallBtn || !nextSmallBtn || !controlsOverlay) return;
    
    const filteredChannels = getFilteredChannels();
    
    // Kanal oynatılıyorsa kontrol overlay'ini göster
    if (currentChannel && filteredChannels.length > 0) {
        controlsOverlay.style.display = 'block';
        
        // Butonları her zaman aktif yap (wrap around özelliği var)
        if (filteredChannels.length <= 1) {
            prevSmallBtn.disabled = true;
            nextSmallBtn.disabled = true;
        } else {
            prevSmallBtn.disabled = false;
            nextSmallBtn.disabled = false;
        }
    } else {
        // Kanal yoksa kontrol overlay'ini gizle
        controlsOverlay.style.display = 'none';
    }
}

// Play Channel
function playChannel(channel) {
    if (!channel || !channel.url) {
        // Hata mesajı kaldırıldı - sessiz çalış
        console.warn('Geçersiz kanal bilgisi');
        return;
    }
    
    currentChannel = channel;
    
    // Tam ekran kontrolü - tam ekranda iken normal ekrana dönmesin
    const isFullscreen = !!(document.fullscreenElement || 
                           document.webkitFullscreenElement || 
                           document.mozFullScreenElement || 
                           document.msFullscreenElement);
    
    // Mobil uygulama kontrolü
    const inApp = isInApp();
    
    // Dikey modda kanal tıklandığında player-view-mode'a geç (tam ekranda değilse)
    const playerContentWrapper = document.querySelector('.player-content-wrapper');
    if (isPortraitMode() && playerContentWrapper && !isFullscreen) {
        playerContentWrapper.classList.add('player-view-mode');
    }
    
    // Update navigation buttons
    updateChannelNavButtons();
    
    // Update play/pause button
    setTimeout(updatePlayPauseButton, 100);
    
    // Son İzlenenler listesine ekle
    addToRecentChannels(channel.id);
    
    // Update document title and video title (hide URL)
    document.title = `${channel.name} - PlusTV`;
    if (videoPlayer) {
        videoPlayer.title = channel.name;
        // Controls'u tekrar ayarla (uygulama içinde olabilir)
        setupVideoControls();
    }
    
    // Kontrolleri göster
    showVideoControls();
    
    // Tam ekranda ise video ayarlarını koru
    if (isFullscreen) {
        setTimeout(() => {
            adjustVideoForFullscreen();
        }, 100);
    }
    
    // MediaSession metadata'yı güncelle
    updateMediaSessionMetadata();
    
    // Update active channel in sidebar (optimized)
    const items = channelsSidebarList.querySelectorAll('.channel-sidebar-item');
    items.forEach(item => {
        const itemChannelId = item.dataset.channelId;
        // ID'yi string veya number olarak karşılaştır
        if (String(itemChannelId) === String(channel.id) || itemChannelId == channel.id) {
            item.classList.add('active');
            // Use requestAnimationFrame for smooth scrolling
            requestAnimationFrame(() => {
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
        } else {
            item.classList.remove('active');
        }
    });
    
    // Cleanup previous playback
    cleanup();
    
    // Tam ekran durumunu tekrar kontrol et (cleanup sonrası)
    const isFullscreenAfterCleanup = !!(document.fullscreenElement || 
                                       document.webkitFullscreenElement || 
                                       document.mozFullScreenElement || 
                                       document.msFullscreenElement);
    
    // Eğer tam ekrandaydık ama cleanup sonrası çıktıysak, tekrar tam ekrana geç
    // Hem normal hem mobil uygulama için geçerli
    if (isFullscreen && !isFullscreenAfterCleanup) {
        // Tam ekran durumu kayboldu, tekrar tam ekrana geç
        // Mobil uygulamada daha uzun süre bekle
        const delay = inApp ? 150 : 50;
        setTimeout(() => {
            const container = videoContainerPlayer;
            if (container) {
                // Mobil uygulamada da tam ekran API'lerini dene
                if (container.requestFullscreen) {
                    container.requestFullscreen().catch(() => {});
                } else if (container.webkitRequestFullscreen) {
                    container.webkitRequestFullscreen().catch(() => {});
                } else if (container.mozRequestFullScreen) {
                    container.mozRequestFullScreen().catch(() => {});
                } else if (container.msRequestFullscreen) {
                    container.msRequestFullscreen().catch(() => {});
                }
            }
        }, delay);
    }
    
    // Mobil uygulamada video yüklendikten sonra tam ekran durumunu tekrar kontrol et
    if (inApp && isFullscreen) {
        // Video yüklendikten sonra tam ekran durumunu koru
        setTimeout(() => {
            const isFullscreenStillActive = !!(document.fullscreenElement || 
                                             document.webkitFullscreenElement || 
                                             document.mozFullScreenElement || 
                                             document.msFullscreenElement);
            if (!isFullscreenStillActive && isFullscreen) {
                // Tam ekran durumu kayboldu, tekrar tam ekrana geç
                const container = videoContainerPlayer;
                if (container) {
                    if (container.requestFullscreen) {
                        container.requestFullscreen().catch(() => {});
                    } else if (container.webkitRequestFullscreen) {
                        container.webkitRequestFullscreen().catch(() => {});
                    } else if (container.mozRequestFullScreen) {
                        container.mozRequestFullScreen().catch(() => {});
                    } else if (container.msRequestFullscreen) {
                        container.msRequestFullscreen().catch(() => {});
                    }
                }
            }
        }, 300);
    }
	
	// Xtream kanallar için: HTML5 player içinde kal, ama mümkünse native video elementini kullan.
	// Bu sayede Fermata / PlusTV eklentisinde tasarım bozulmadan oynatma denenir.
	if (isXtreamStreamUrlForApp(channel.url)) {
		// Reset displays for Xtream
		if (iframePlayer) {
			iframePlayer.style.display = 'none';
		}
		if (videoPlaceholderPlayer) {
			videoPlaceholderPlayer.style.display = 'flex';
		}
		if (loadingPlayer) {
			loadingPlayer.classList.add('active');
		}

		// HLS ise doğrudan native player ile dene (CORS/MSE sorunlarını azaltmak için)
		if (channel.url.includes('.m3u8')) {
			playM3U8Native(channel.url);
		} else if (isVideoFile(channel.url)) {
			// MKV / AVI / MP4 vb. için de native video elementini kullan
			playVideoFile(channel.url);
		} else {
			// Diğer durumlarda iframe fallback
			playIframe(channel.url);
		}
		return;
	}

    // Reset displays
    if (iframePlayer) {
        iframePlayer.style.display = 'none';
    }
    
    // Play video
    if (channel.url.includes('.m3u8')) {
        // CORS sorunu olan domain'ler için native player'ı dene
        if (channel.url.includes('duhnet.tv') || channel.url.includes('daioncdn.net') || 
            channel.url.includes('162.212.179.33')) {
            // CORS sorunu olan domain'ler için native video player kullan
            videoPlaceholderPlayer.style.display = 'flex';
            loadingPlayer.classList.add('active');
            playM3U8Native(channel.url);
        } else {
            // M3U8 için loading göster
            videoPlaceholderPlayer.style.display = 'flex';
            loadingPlayer.classList.add('active');
            playM3U8(channel.url);
        }
    } else if (channel.url.includes('youtube.com') || channel.url.includes('youtu.be')) {
        // YouTube linkleri için loading'i gösterme (iframe hızlı yüklenir)
        videoPlaceholderPlayer.style.display = 'none';
        loadingPlayer.classList.remove('active');
        // YouTube linklerini embed formatına çevir
        const youtubeUrl = convertYouTubeToEmbed(channel.url);
        playIframe(youtubeUrl);
    } else if (isVideoFile(channel.url)) {
        // MKV, AVI, MOV, WMV, MP4, WEBM gibi video dosyaları için native video player kullan
        videoPlaceholderPlayer.style.display = 'flex';
        loadingPlayer.classList.add('active');
        playVideoFile(channel.url);
    } else {
        // Diğer iframe linkleri için loading göster
        videoPlaceholderPlayer.style.display = 'flex';
        loadingPlayer.classList.add('active');
        playIframe(channel.url);
    }
}

// Fermata / PlusTV Android uygulaması için Xtream stream URL kontrolü
function isXtreamStreamUrlForApp(url) {
	if (!url) return false;
	const u = url.toLowerCase();

	// Yaygın Xtream path kalıpları
	if (u.includes('/live/') || u.includes('/movie/') || u.includes('/series/')) {
		return true;
	}

	// Xtream stilinde /username/password/streamId (uzantısız) pattern'i:
	// Örnek: http://host:port/user/pass/1841
	const path = (new URL(url)).pathname.toLowerCase();
	const segments = path.split('/');
	if (segments.length >= 4) {
		const lastSeg = segments[segments.length - 1];
		const hasDot = lastSeg.includes('.');
		if (!hasDot) {
			return true;
		}
	}

	// Doğrudan medya uzantıları (Xtream proxy / PHP çıktıları dahil)
	if (u.endsWith('.m3u8') || u.endsWith('.ts') || u.endsWith('.mp4') ||
		u.endsWith('.mkv') || u.endsWith('.avi') || u.endsWith('.mov') ||
		u.endsWith('.webm') || u.endsWith('.m4v') || u.endsWith('.flv')) {
		return true;
	}

	// Query içinde Xtream credentials varsa ve player_api değilse
	if (u.includes('username=') && u.includes('password=') && !u.includes('player_api.php')) {
		return true;
	}

	return false;
}

// Play M3U8
function playM3U8(url) {
    videoPlayer.style.display = 'block';
    iframePlayer.style.display = 'none';
    if (currentChannel && videoPlayer) {
        videoPlayer.title = currentChannel.name;
    }
    
    // Video element'ini optimize et
    videoPlayer.preload = 'auto';
    videoPlayer.playsInline = true;
    
    // Controls'u ayarla (uygulama içinde olabilir)
    setupVideoControls();
    
    if (typeof Hls === 'undefined') {
        // Hata mesajı kaldırıldı - sessiz çalış
        console.warn('HLS.js yüklenemedi');
        loadingPlayer.classList.remove('active');
        return;
    }
    
    if (Hls.isSupported()) {
        // Cleanup previous HLS instance
        if (hlsInstance) {
            try {
                hlsInstance.destroy();
            } catch (e) {
                console.warn('Previous HLS cleanup error:', e);
            }
        }
        
        if (videoPlayer.hls) {
            try {
                videoPlayer.hls.destroy();
            } catch (e) {
                console.warn('Video player HLS cleanup error:', e);
            }
            videoPlayer.hls = null;
        }
        
        // Player boyutunu al (4K sorunlarını önlemek için)
        const playerWidth = videoPlayer.clientWidth || window.innerWidth;
        const playerHeight = videoPlayer.clientHeight || window.innerHeight;
        const maxResolution = Math.max(playerWidth, playerHeight);
        
        // 4K (2160p) ve çok yüksek çözünürlükleri filtrele
        const shouldCapQuality = maxResolution < 1920; // Full HD'dan küçükse kaliteyi sınırla
        
        const hls = new Hls({
            enableWorker: true,
            maxBufferLength: 2,                    // Daha hızlı açılış için düşük tampon
            maxMaxBufferLength: 3,                  // Maksimum buffer sınırı
            backBufferLength: 0,                    // Eski segmentleri tutma (hız için)
            maxBufferSize: 30 * 1000 * 1000,        // 30MB buffer limiti
            maxBufferHole: 0.5,                     // Buffer boşluk toleransı
            startLevel: -1,                         // Otomatik kalite seçimi
            capLevelToPlayerSize: shouldCapQuality, // Player boyutuna göre kalite sınırla
            testBandwidth: true,                    // Bant genişliği testi
            progressive: false,                     // Progressive download değil
            lowLatencyMode: false,                  // Düşük gecikme modu (daha hızlı başlangıç)
            abrEwmaDefaultEstimate: 500000,         // Varsayılan bant genişliği tahmini (500kbps)
            abrBandWidthFactor: 0.95,               // Bant genişliği faktörü
            abrBandWidthUpFactor: 0.7,              // Kalite yükseltme faktörü (daha konservatif)
            fragLoadingTimeOut: 5000,                // Fragment yükleme timeout (5 saniye)
            manifestLoadingTimeOut: 5000,            // Manifest yükleme timeout (5 saniye)
            levelLoadingTimeOut: 5000,              // Level yükleme timeout (5 saniye)
            nudgeOffset: 0.1,                       // Buffer nudge offset
            nudgeMaxRetry: 3,                       // Maksimum nudge retry
            maxFragLoadingTimeOut: 5000,            // Maksimum fragment timeout
            forceKeyFrameOnDiscontinuity: true,     // Kesintilerde keyframe zorla
            debug: false                            // Debug modu kapalı
        });
        
        hlsInstance = hls;
        videoPlayer.hls = hls;
        
        // VideoPlayer'ı temizle ve optimize et
        videoPlayer.src = '';
        videoPlayer.load();
        
        // HLS'yi yükle
        hls.loadSource(url);
        hls.attachMedia(videoPlayer);
        
        let manifestParsed = false;
        let timeout;
        let qualityFallbackAttempted = false; // 4K sorunları için fallback kontrolü
        let videoDimensionCheckAttempted = false; // Video boyut kontrolü
        
        // Loading'i daha erken kaldırmak için fragment loading event'lerini dinle
        let firstFragmentLoaded = false;
        hls.on(Hls.Events.FRAG_LOADED, () => {
            // İlk fragment yüklendiğinde loading'i kaldır
            if (!firstFragmentLoaded && loadingPlayer && loadingPlayer.classList.contains('active')) {
                firstFragmentLoaded = true;
                loadingPlayer.classList.remove('active');
                if (videoPlaceholderPlayer) videoPlaceholderPlayer.style.display = 'none';
                
                // Tam ekran kontrolü - tam ekranda ise durumu koru
                const isFullscreen = !!(document.fullscreenElement || 
                                       document.webkitFullscreenElement || 
                                       document.mozFullScreenElement || 
                                       document.msFullscreenElement);
                
                // Mobil uygulama kontrolü
                const inApp = isInApp();
                
                if (isFullscreen || (inApp && isFullscreen)) {
                    setTimeout(() => {
                        adjustVideoForFullscreen();
                    }, 50);
                }
            }
        });
        
        hls.on(Hls.Events.LEVEL_LOADED, () => {
            // Level yüklendiğinde de loading'i kaldır (fallback)
            if (loadingPlayer && loadingPlayer.classList.contains('active')) {
                loadingPlayer.classList.remove('active');
                if (videoPlaceholderPlayer) videoPlaceholderPlayer.style.display = 'none';
            }
            
            // Tam ekran kontrolü - tam ekranda ise durumu koru
            const isFullscreen = !!(document.fullscreenElement || 
                                       document.webkitFullscreenElement || 
                                       document.mozFullScreenElement || 
                                       document.msFullscreenElement);
            
            // Mobil uygulama kontrolü
            const inApp = isInApp();
            
            if (isFullscreen || (inApp && isFullscreen)) {
                setTimeout(() => {
                    adjustVideoForFullscreen();
                }, 50);
            }
        });
        
        // VideoPlayer'ın canplay event'ini dinle (daha erken loading kaldırma)
        const canPlayHandler = () => {
            if (loadingPlayer && loadingPlayer.classList.contains('active')) {
                loadingPlayer.classList.remove('active');
                if (videoPlaceholderPlayer) videoPlaceholderPlayer.style.display = 'none';
            }
            // Reapply video scale when video can play
            const currentScale = localStorage.getItem('videoScaleMode') || 'contain';
            applyVideoScale(currentScale);
            updatePlayPauseButton();
            
            // Tam ekran kontrolü - tam ekranda ise durumu koru
            const isFullscreen = !!(document.fullscreenElement || 
                                   document.webkitFullscreenElement || 
                                   document.mozFullScreenElement || 
                                   document.msFullscreenElement);
            
            // Mobil uygulama kontrolü
            const inApp = isInApp();
            
            if (isFullscreen || (inApp && isFullscreen)) {
                setTimeout(() => {
                    adjustVideoForFullscreen();
                }, 100);
            }
            
            videoPlayer.removeEventListener('canplay', canPlayHandler);
        };
        videoPlayer.addEventListener('canplay', canPlayHandler);
        
        hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
            manifestParsed = true;
            if (timeout) {
                clearTimeout(timeout);
                activeTimeouts = activeTimeouts.filter(t => t !== timeout);
            }
            
            // 4K (2160p) ve çok yüksek çözünürlükleri filtrele
            if (hls.levels && hls.levels.length > 0) {
                const levels = hls.levels;
                let has4K = false;
                let highestSafeLevel = -1;
                
                // 4K seviyelerini bul ve daha düşük kaliteye geç
                for (let i = 0; i < levels.length; i++) {
                    const level = levels[i];
                    if (level.height >= 2160) {
                        has4K = true;
                        console.log(`4K seviye tespit edildi: ${level.height}p, atlanıyor...`);
                    } else if (level.height <= 1080 && highestSafeLevel === -1) {
                        // İlk güvenli seviyeyi (1080p veya daha düşük) bul
                        highestSafeLevel = i;
                    }
                }
                
                // Eğer 4K varsa ve güvenli bir seviye bulunduysa, onu kullan
                if (has4K && highestSafeLevel !== -1 && !qualityFallbackAttempted) {
                    console.log(`4K tespit edildi, ${levels[highestSafeLevel].height}p seviyesine geçiliyor...`);
                    hls.currentLevel = highestSafeLevel;
                    qualityFallbackAttempted = true;
                } else if (has4K && highestSafeLevel === -1) {
                    // Sadece 4K varsa, en düşük seviyeyi kullan
                    console.log('Sadece 4K seviyeler mevcut, en düşük seviyeye geçiliyor...');
                    hls.currentLevel = 0;
                    qualityFallbackAttempted = true;
                }
            }
            
            // Video oynatmayı başlat
            videoPlayer.play();
            
            // Yayın başladığı an kilitlemeyi başlat
            startStrictScale(videoPlayer);
            
            // Loading'i kaldır
            if (loadingPlayer) loadingPlayer.classList.remove('active');
            if (videoPlaceholderPlayer) videoPlaceholderPlayer.style.display = 'none';
            
            // Tam ekran kontrolü - tam ekranda ise durumu koru
            const isFullscreen = !!(document.fullscreenElement || 
                                   document.webkitFullscreenElement || 
                                   document.mozFullScreenElement || 
                                   document.msFullscreenElement);
            
            // Mobil uygulama kontrolü
            const inApp = isInApp();
            
            // Controls'u tekrar ayarla (video yüklendiğinde)
            setupVideoControls();
            
            // Update quality menu with HLS levels
            updateQualityMenu();
            
            // Reapply video scale
            const currentScale = localStorage.getItem('videoScaleMode') || 'contain';
            applyVideoScale(currentScale);
            
            // Tam ekranda ise video ayarlarını koru (hem normal hem mobil uygulama)
            if (isFullscreen || (inApp && isFullscreen)) {
                setTimeout(() => {
                    adjustVideoForFullscreen();
                }, 100);
            }
            
            videoPlayer.play().catch(err => {
                console.error('Playback error:', err);
                // Hata mesajı kaldırıldı - sessiz çalış
                console.warn('Video oynatılamadı');
            }).finally(() => {
                updatePlayPauseButton();
                // Tam ekranda ise tekrar kontrol et (hem normal hem mobil uygulama)
                if (isFullscreen || (inApp && isFullscreen)) {
                    setTimeout(() => {
                        adjustVideoForFullscreen();
                        // Mobil uygulamada tam ekran durumunu tekrar kontrol et
                        if (inApp) {
                            const isFullscreenStillActive = !!(document.fullscreenElement || 
                                                             document.webkitFullscreenElement || 
                                                             document.mozFullScreenElement || 
                                                             document.msFullscreenElement);
                            if (!isFullscreenStillActive && isFullscreen) {
                                // Tam ekran durumu kayboldu, tekrar tam ekrana geç
                                const container = videoContainerPlayer;
                                if (container) {
                                    if (container.requestFullscreen) {
                                        container.requestFullscreen().catch(() => {});
                                    } else if (container.webkitRequestFullscreen) {
                                        container.webkitRequestFullscreen().catch(() => {});
                                    } else if (container.mozRequestFullScreen) {
                                        container.mozRequestFullScreen().catch(() => {});
                                    } else if (container.msRequestFullscreen) {
                                        container.msRequestFullscreen().catch(() => {});
                                    }
                                }
                            }
                        }
                    }, 200);
                }
            });
        });
        
        // LEVEL_SWITCHED event'i - 4K'a geçişi engelle
        hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
            if (hls.levels && hls.levels[data.level] && hls.levels[data.level].height >= 2160) {
                // 4K seviyesine geçiş tespit edildi, daha düşük kaliteye zorla
                console.log('4K seviyesine geçiş engellendi, daha düşük kaliteye geçiliyor...');
                if (hls.levels && hls.levels.length > 0) {
                    // 1080p veya daha düşük bir seviye bul
                    for (let i = 0; i < hls.levels.length; i++) {
                        if (hls.levels[i].height <= 1080) {
                            hls.currentLevel = i;
                            break;
                        }
                    }
                }
            }
        });
        
        // Video boyut kontrolü - 4K sorunlarını tespit et (ses var görüntü yok)
        const checkVideoDimensions = () => {
            if (videoDimensionCheckAttempted) return;
            
            setTimeout(() => {
                // Video yüklendiğinde boyutları kontrol et
                if (videoPlayer.readyState >= 2) { // HAVE_CURRENT_DATA
                    const videoWidth = videoPlayer.videoWidth;
                    const videoHeight = videoPlayer.videoHeight;
                    const hasAudio = videoPlayer.audioTracks && videoPlayer.audioTracks.length > 0;
                    
                    // Eğer video boyutu 0 ama ses varsa, 4K codec sorunu olabilir
                    if ((videoWidth === 0 || videoHeight === 0) && hasAudio && !qualityFallbackAttempted) {
                        console.warn('4K codec sorunu tespit edildi (ses var görüntü yok), kalite düşürülüyor...');
                        qualityFallbackAttempted = true;
                        
                        // Daha düşük kaliteye geç
                        if (hls.levels && hls.levels.length > 0) {
                            for (let i = 0; i < hls.levels.length; i++) {
                                if (hls.levels[i].height <= 1080) {
                                    hls.currentLevel = i;
                                    break;
                                }
                            }
                        }
                    }
                    
                    videoDimensionCheckAttempted = true;
                } else if (videoPlayer.readyState < 2) {
                    // Henüz yüklenmediyse tekrar dene
                    checkVideoDimensions();
                }
            }, 2000); // 2 saniye bekle
        };
        
        // Video metadata yüklendiğinde kontrol et
        videoPlayer.addEventListener('loadedmetadata', () => {
            checkVideoDimensions();
        }, { once: true });
        
        hls.on(Hls.Events.ERROR, (event, data) => {
            console.error('HLS Error:', data);
            if (data.fatal) {
                switch(data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        try {
                            hls.startLoad();
                        } catch(e) {
                            if (loadingPlayer) loadingPlayer.classList.remove('active');
                            try {
                                hls.destroy();
                            } catch (destroyErr) {
                                console.warn('HLS destroy error:', destroyErr);
                            }
                            // Hata mesajı kaldırıldı - sessiz çalış
                            console.warn('Ağ hatası');
                        }
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        // MEDIA_ERROR durumunda önce kalite düşürmeyi dene
                        if (!qualityFallbackAttempted && hls.levels && hls.levels.length > 0) {
                            console.warn('MEDIA_ERROR tespit edildi, kalite düşürülüyor...');
                            qualityFallbackAttempted = true;
                            
                            // Mevcut seviyeden daha düşük bir seviye bul
                            const currentLevel = hls.currentLevel;
                            if (currentLevel >= 0 && currentLevel < hls.levels.length) {
                                // Daha düşük kaliteye geç
                                for (let i = currentLevel - 1; i >= 0; i--) {
                                    if (hls.levels[i].height <= 1080) {
                                        hls.currentLevel = i;
                                        try {
                                            hls.recoverMediaError();
                                        } catch(e) {
                                            console.warn('Media error recovery failed:', e);
                                        }
                                        return;
                                    }
                                }
                            }
                        }
                        
                        try {
                            hls.recoverMediaError();
                        } catch(e) {
                            if (loadingPlayer) loadingPlayer.classList.remove('active');
                            try {
                                hls.destroy();
                            } catch (destroyErr) {
                                console.warn('HLS destroy error:', destroyErr);
                            }
                            // Hata mesajı kaldırıldı - sessiz çalış
                            console.warn('Video çözümlenemedi');
                        }
                        break;
                    default:
                        if (timeout) {
                            clearTimeout(timeout);
                            activeTimeouts = activeTimeouts.filter(t => t !== timeout);
                        }
                        if (loadingPlayer) loadingPlayer.classList.remove('active');
                        try {
                            hls.destroy();
                        } catch (destroyErr) {
                            console.warn('HLS destroy error:', destroyErr);
                        }
                        // Hata mesajı kaldırıldı - sessiz çalış
                        console.warn('Kanal yüklenemedi');
                        break;
                }
            }
        });
        
        timeout = safeSetTimeout(() => {
            if (!manifestParsed) {
                if (loadingPlayer) loadingPlayer.classList.remove('active');
                try {
                    hls.destroy();
                } catch (destroyErr) {
                    console.warn('HLS destroy error:', destroyErr);
                }
                // Hata mesajı kaldırıldı - sessiz çalış
                console.warn('Kanal yükleme zaman aşımı');
            }
        }, 5000); // 5 saniye timeout (daha hızlı hata tespiti)
        
    } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
        // Controls'u ayarla (Safari için)
        setupVideoControls();
        
        videoPlayer.src = url;
        
        // Safari için loading'i daha erken kaldırmak için canplay event'ini dinle
        const canPlayHandler = () => {
            if (loadingPlayer) loadingPlayer.classList.remove('active');
            if (videoPlaceholderPlayer) videoPlaceholderPlayer.style.display = 'none';
            // Controls'u tekrar ayarla
            setupVideoControls();
            // Reapply video scale
            const currentScale = localStorage.getItem('videoScaleMode') || 'contain';
            applyVideoScale(currentScale);
            videoPlayer.removeEventListener('canplay', canPlayHandler);
            if (safariTimeout) {
                clearTimeout(safariTimeout);
                activeTimeouts = activeTimeouts.filter(t => t !== safariTimeout);
            }
        };
        videoPlayer.addEventListener('canplay', canPlayHandler);
        
        const playPromise = videoPlayer.play();
        
        if (playPromise !== undefined) {
            playPromise.then(() => {
                // Play başarılı olduğunda loading'i kaldır
                if (loadingPlayer) loadingPlayer.classList.remove('active');
                if (videoPlaceholderPlayer) videoPlaceholderPlayer.style.display = 'none';
            }).catch(err => {
                console.error('Playback error:', err);
                if (loadingPlayer) loadingPlayer.classList.remove('active');
                // Hata mesajı kaldırıldı - sessiz çalış
                console.warn('Video oynatılamadı');
            });
        }
        
        const safariTimeout = safeSetTimeout(() => {
            if (videoPlayer.readyState === 0) {
                if (loadingPlayer) loadingPlayer.classList.remove('active');
                // Hata mesajı kaldırıldı - sessiz çalış
                console.warn('Kanal yükleme zaman aşımı');
            }
        }, 5000); // 5 saniye timeout (daha hızlı hata tespiti)
        
        const loadedDataHandler = () => {
            if (safariTimeout) {
            clearTimeout(safariTimeout);
            activeTimeouts = activeTimeouts.filter(t => t !== safariTimeout);
            }
            videoPlayer.removeEventListener('loadeddata', loadedDataHandler);
        };
        videoPlayer.addEventListener('loadeddata', loadedDataHandler, { once: true });
    } else {
        loadingPlayer.classList.remove('active');
        // Hata mesajı kaldırıldı - sessiz çalış
        console.warn('Tarayıcı bu video formatını desteklemiyor');
    }
}

// Play M3U8 with Native Player (for CORS issues)
function playM3U8Native(url) {
    videoPlayer.style.display = 'block';
    iframePlayer.style.display = 'none';
    if (currentChannel && videoPlayer) {
        videoPlayer.title = currentChannel.name;
    }
    
    // Video element'ini optimize et
    videoPlayer.preload = 'auto';
    videoPlayer.playsInline = true;
    
    // Controls'u ayarla
    setupVideoControls();
    
    // Cleanup previous HLS instance if exists
    if (hlsInstance) {
        try {
            hlsInstance.destroy();
        } catch (e) {
            console.warn('Previous HLS cleanup error:', e);
        }
        hlsInstance = null;
    }
    
    if (videoPlayer.hls) {
        try {
            videoPlayer.hls.destroy();
        } catch (e) {
            console.warn('Video player HLS cleanup error:', e);
        }
        videoPlayer.hls = null;
    }
    
    // Use native video player (works better with CORS issues)
    videoPlayer.src = url;
    videoPlayer.load();
    
    // Native HLS desteği için startStrictScale ekle
    if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
        videoPlayer.addEventListener('loadedmetadata', () => {
            startStrictScale(videoPlayer);
        }, { once: true });
    }
    
    // Loading'i kaldırmak için event'leri dinle
    const canPlayHandler = () => {
        if (loadingPlayer) loadingPlayer.classList.remove('active');
        if (videoPlaceholderPlayer) videoPlaceholderPlayer.style.display = 'none';
        setupVideoControls();
        const currentScale = localStorage.getItem('videoScaleMode') || 'contain';
        applyVideoScale(currentScale);
        
        // Tam ekran kontrolü - tam ekranda ise durumu koru
        const isFullscreen = !!(document.fullscreenElement || 
                               document.webkitFullscreenElement || 
                               document.mozFullScreenElement || 
                               document.msFullscreenElement);
        
        // Mobil uygulama kontrolü
        const inApp = isInApp();
        
        if (isFullscreen || (inApp && isFullscreen)) {
            setTimeout(() => {
                adjustVideoForFullscreen();
                // Mobil uygulamada tam ekran durumunu tekrar kontrol et
                if (inApp) {
                    const isFullscreenStillActive = !!(document.fullscreenElement || 
                                                     document.webkitFullscreenElement || 
                                                     document.mozFullScreenElement || 
                                                     document.msFullscreenElement);
                    if (!isFullscreenStillActive && isFullscreen) {
                        // Tam ekran durumu kayboldu, tekrar tam ekrana geç
                        const container = videoContainerPlayer;
                        if (container) {
                            if (container.requestFullscreen) {
                                container.requestFullscreen().catch(() => {});
                            } else if (container.webkitRequestFullscreen) {
                                container.webkitRequestFullscreen().catch(() => {});
                            } else if (container.mozRequestFullScreen) {
                                container.mozRequestFullScreen().catch(() => {});
                            } else if (container.msRequestFullscreen) {
                                container.msRequestFullscreen().catch(() => {});
                            }
                        }
                    }
                }
            }, 100);
        }
        
        videoPlayer.removeEventListener('canplay', canPlayHandler);
        if (nativeTimeout) {
            clearTimeout(nativeTimeout);
            activeTimeouts = activeTimeouts.filter(t => t !== nativeTimeout);
        }
    };
    videoPlayer.addEventListener('canplay', canPlayHandler);
    
    const playPromise = videoPlayer.play();
    
    if (playPromise !== undefined) {
        playPromise.then(() => {
            if (loadingPlayer) loadingPlayer.classList.remove('active');
            if (videoPlaceholderPlayer) videoPlaceholderPlayer.style.display = 'none';
            updatePlayPauseButton();
        }).catch(err => {
            console.error('Playback error:', err);
            if (loadingPlayer) loadingPlayer.classList.remove('active');
            console.warn('Video oynatılamadı');
        });
    }
    
    const nativeTimeout = safeSetTimeout(() => {
        if (videoPlayer.readyState === 0) {
            if (loadingPlayer) loadingPlayer.classList.remove('active');
            console.warn('Kanal yükleme zaman aşımı');
        }
    }, 10000);
    activeTimeouts.push(nativeTimeout);
    
    const loadedDataHandler = () => {
        if (nativeTimeout) {
            clearTimeout(nativeTimeout);
            activeTimeouts = activeTimeouts.filter(t => t !== nativeTimeout);
        }
        videoPlayer.removeEventListener('loadeddata', loadedDataHandler);
    };
    videoPlayer.addEventListener('loadeddata', loadedDataHandler);
    
    const errorHandler = (e) => {
        console.error('Native player error:', e);
        if (loadingPlayer) loadingPlayer.classList.remove('active');
        // Fallback to HLS.js if native fails
        if (typeof Hls !== 'undefined' && Hls.isSupported()) {
            console.log('Falling back to HLS.js');
            playM3U8(url);
        }
        videoPlayer.removeEventListener('error', errorHandler);
    };
    videoPlayer.addEventListener('error', errorHandler);
}

// Check if URL is a video file
function isVideoFile(url) {
    if (!url) return false;
    const videoExtensions = ['.mkv', '.avi', '.mov', '.wmv', '.mp4', '.webm', '.flv', '.m4v', '.3gp', '.ogv', '.ts', '.mts'];
    const lowerUrl = url.toLowerCase();
    // Check if URL ends with video extension or contains video extension before query params
    return videoExtensions.some(ext => {
        const extIndex = lowerUrl.indexOf(ext);
        if (extIndex === -1) return false;
        // Check if extension is at the end or followed by query params
        const afterExt = lowerUrl.substring(extIndex + ext.length);
        return afterExt === '' || afterExt.startsWith('?') || afterExt.startsWith('#') || afterExt.startsWith('&');
    });
}

// Play video file (MKV, AVI, MOV, WMV, etc.)
function playVideoFile(url) {
    const lowerUrl = url.toLowerCase();
    const isMKV = lowerUrl.includes('.mkv');
    
    // MKV için önce native video player'ı dene (Video.js codec sorunlarına neden olabilir)
    // Video.js'i atla, doğrudan native player'a geç
    
    // MKV değilse veya Video.js yoksa normal player kullan
    videoPlayer.style.display = 'block';
    iframePlayer.style.display = 'none';
    if (videoJsPlayer) videoJsPlayer.style.display = 'none';
    
    if (currentChannel && videoPlayer) {
        videoPlayer.title = currentChannel.name;
    }
    
    // Video element'ini optimize et
    videoPlayer.preload = 'auto';
    videoPlayer.playsInline = true;
    
    // Controls'u ayarla
    setupVideoControls();
    
    // MKV için HLS.js ile oynatmayı dene (bazı durumlarda çalışabilir)
    if (isMKV && typeof Hls !== 'undefined' && Hls.isSupported()) {
        console.log('MKV dosyası HLS.js ile oynatılmaya çalışılıyor...');
        
        // Cleanup previous HLS instance if exists
        if (hlsInstance) {
            try {
                hlsInstance.destroy();
            } catch (e) {
                console.warn('Previous HLS cleanup error:', e);
            }
            hlsInstance = null;
        }
        
        if (videoPlayer.hls) {
            try {
                videoPlayer.hls.destroy();
            } catch (e) {
                console.warn('Video player HLS cleanup error:', e);
            }
            videoPlayer.hls = null;
        }
        
        // Clear video player
        videoPlayer.innerHTML = '';
        videoPlayer.src = '';
        videoPlayer.removeAttribute('src');
        
        // HLS.js ile MKV'yi oynatmayı dene
        const hls = new Hls({
            enableWorker: true,
            maxBufferLength: 10,
            startLevel: -1,
            capLevelToPlayerSize: false,
            // MKV için özel ayarlar
            fragLoadingTimeOut: 20000,
            manifestLoadingTimeOut: 10000
        });
        
        hlsInstance = hls;
        videoPlayer.hls = hls;
        
        // MKV dosyasını HLS source olarak yükle
        hls.loadSource(url);
        hls.attachMedia(videoPlayer);
        
        // Event handlers
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            console.log('MKV HLS manifest parsed');
            const playPromise = videoPlayer.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    if (loadingPlayer) loadingPlayer.classList.remove('active');
                    if (videoPlaceholderPlayer) videoPlaceholderPlayer.style.display = 'none';
                    updatePlayPauseButton();
                }).catch(err => {
                    console.error('MKV HLS play error:', err);
                    // HLS başarısız olursa native video player'a geç
                    fallbackToNativeVideo(url);
                });
            }
        });
        
        hls.on(Hls.Events.FRAG_LOADED, () => {
            if (loadingPlayer) loadingPlayer.classList.remove('active');
            if (videoPlaceholderPlayer) videoPlaceholderPlayer.style.display = 'none';
        });
        
        hls.on(Hls.Events.ERROR, (event, data) => {
            console.error('MKV HLS Error:', data);
            if (data.fatal) {
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        console.log('MKV HLS network error, native player\'a geçiliyor...');
                        fallbackToNativeVideo(url);
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        console.log('MKV HLS media error, native player\'a geçiliyor...');
                        fallbackToNativeVideo(url);
                        break;
                    default:
                        console.log('MKV HLS fatal error, native player\'a geçiliyor...');
                        fallbackToNativeVideo(url);
                        break;
                }
            }
        });
        
        return; // HLS.js ile devam et, native player'a geçme
    }
    
    // HLS.js yoksa veya MKV değilse native video player kullan
    fallbackToNativeVideo(url);
}

// Native video player fallback
function fallbackToNativeVideo(url) {
    // Cleanup previous HLS instance if exists
    if (hlsInstance) {
        try {
            hlsInstance.destroy();
        } catch (e) {
            console.warn('Previous HLS cleanup error:', e);
        }
        hlsInstance = null;
    }
    
    if (videoPlayer.hls) {
        try {
            videoPlayer.hls.destroy();
        } catch (e) {
            console.warn('Video player HLS cleanup error:', e);
        }
        videoPlayer.hls = null;
    }
    
    // Clear any existing source elements and src
    videoPlayer.innerHTML = '';
    videoPlayer.src = '';
    videoPlayer.removeAttribute('src');
    
    const lowerUrl = url.toLowerCase();
    const isMKV = lowerUrl.includes('.mkv');
    
    // MKV için özel işlem - type belirtmeden doğrudan src kullan
    if (isMKV) {
        // MKV için doğrudan src kullan, tarayıcı kendi algılamasına bırak
        videoPlayer.src = url;
        videoPlayer.preload = 'auto';
        
        // Codec kontrolü - eğer video boyutu 0 ise iframe'e geç
        const checkCodec = () => {
            setTimeout(() => {
                if (videoPlayer.videoWidth === 0 && videoPlayer.videoHeight === 0 && videoPlayer.readyState >= 2) {
                    console.warn('MKV codec sorunu tespit edildi (video boyutu 0), iframe\'e geçiliyor...');
                    playIframe(url);
                    return;
                }
                // 3 saniye sonra tekrar kontrol et
                if (videoPlayer.videoWidth === 0) {
                    setTimeout(checkCodec, 3000);
                }
            }, 2000);
        };
        checkCodec();
    } else {
        // Diğer formatlar için MIME type belirle
        let mimeType = 'video/mp4'; // default
        if (lowerUrl.includes('.avi')) {
            mimeType = 'video/x-msvideo';
        } else if (lowerUrl.includes('.mov')) {
            mimeType = 'video/quicktime';
        } else if (lowerUrl.includes('.wmv')) {
            mimeType = 'video/x-ms-wmv';
        } else if (lowerUrl.includes('.webm')) {
            mimeType = 'video/webm';
        } else if (lowerUrl.includes('.flv')) {
            mimeType = 'video/x-flv';
        } else if (lowerUrl.includes('.m4v')) {
            mimeType = 'video/x-m4v';
        } else if (lowerUrl.includes('.3gp')) {
            mimeType = 'video/3gpp';
        } else if (lowerUrl.includes('.ogv')) {
            mimeType = 'video/ogg';
        } else if (lowerUrl.includes('.ts') || lowerUrl.includes('.mts')) {
            mimeType = 'video/mp2t';
        }
        
        // Source element ile type belirt
        const source = document.createElement('source');
        source.src = url;
        source.type = mimeType;
        videoPlayer.appendChild(source);
    }
    
    videoPlayer.load();
    
    // Loading'i kaldırmak için event'leri dinle
    const canPlayHandler = () => {
        if (loadingPlayer) loadingPlayer.classList.remove('active');
        if (videoPlaceholderPlayer) videoPlaceholderPlayer.style.display = 'none';
        setupVideoControls();
        const currentScale = localStorage.getItem('videoScaleMode') || 'contain';
        applyVideoScale(currentScale);
        
        // Tam ekran kontrolü
        const isFullscreen = !!(document.fullscreenElement || 
                               document.webkitFullscreenElement || 
                               document.mozFullScreenElement || 
                               document.msFullscreenElement);
        
        const inApp = isInApp();
        
        if (isFullscreen || (inApp && isFullscreen)) {
            setTimeout(() => {
                adjustVideoForFullscreen();
                if (inApp) {
                    const isFullscreenStillActive = !!(document.fullscreenElement || 
                                                     document.webkitFullscreenElement || 
                                                     document.mozFullScreenElement || 
                                                     document.msFullscreenElement);
                    if (!isFullscreenStillActive && isFullscreen) {
                        const container = videoContainerPlayer;
                        if (container) {
                            if (container.requestFullscreen) {
                                container.requestFullscreen().catch(() => {});
                            } else if (container.webkitRequestFullscreen) {
                                container.webkitRequestFullscreen().catch(() => {});
                            } else if (container.mozRequestFullScreen) {
                                container.mozRequestFullScreen().catch(() => {});
                            } else if (container.msRequestFullscreen) {
                                container.msRequestFullscreen().catch(() => {});
                            }
                        }
                    }
                }
            }, 100);
        }
        
        videoPlayer.removeEventListener('canplay', canPlayHandler);
        if (videoTimeout) {
            clearTimeout(videoTimeout);
            activeTimeouts = activeTimeouts.filter(t => t !== videoTimeout);
        }
    };
    videoPlayer.addEventListener('canplay', canPlayHandler);
    
    const playPromise = videoPlayer.play();
    
    if (playPromise !== undefined) {
        playPromise.then(() => {
            if (loadingPlayer) loadingPlayer.classList.remove('active');
            if (videoPlaceholderPlayer) videoPlaceholderPlayer.style.display = 'none';
            updatePlayPauseButton();
        }).catch(err => {
            console.error('Playback error:', err);
            if (loadingPlayer) loadingPlayer.classList.remove('active');
            console.warn('Video oynatılamadı');
            // MKV için iframe'e geç
            if (isMKV) {
                console.log('MKV native play hatası, iframe ile denenecek...');
                playIframe(url);
            }
        });
    }
    
    const videoTimeout = safeSetTimeout(() => {
        if (videoPlayer.readyState === 0) {
            if (loadingPlayer) loadingPlayer.classList.remove('active');
            console.warn('Video yükleme zaman aşımı');
            // MKV için iframe'e geç
            if (isMKV) {
                console.log('MKV yükleme zaman aşımı, iframe ile denenecek...');
                playIframe(url);
            }
        }
    }, 10000);
    activeTimeouts.push(videoTimeout);
    
    const loadedDataHandler = () => {
        if (videoTimeout) {
            clearTimeout(videoTimeout);
            activeTimeouts = activeTimeouts.filter(t => t !== videoTimeout);
        }
        
        // MKV için codec kontrolü - video boyutu 0 ise codec sorunu var
        if (isMKV && videoPlayer.videoWidth === 0 && videoPlayer.videoHeight === 0) {
            console.warn('MKV codec sorunu: video boyutu 0, iframe\'e geçiliyor...');
            videoPlayer.removeEventListener('loadeddata', loadedDataHandler);
            videoPlayer.removeEventListener('error', errorHandler);
            videoPlayer.removeEventListener('canplay', canPlayHandler);
            if (videoTimeout) {
                clearTimeout(videoTimeout);
                activeTimeouts = activeTimeouts.filter(t => t !== videoTimeout);
            }
            playIframe(url);
            return;
        }
        
        videoPlayer.removeEventListener('loadeddata', loadedDataHandler);
    };
    videoPlayer.addEventListener('loadeddata', loadedDataHandler);
    
    const errorHandler = (e) => {
        console.error('Video file playback error:', e);
        console.error('Error details:', {
            code: videoPlayer.error?.code,
            message: videoPlayer.error?.message,
            networkState: videoPlayer.networkState,
            readyState: videoPlayer.readyState
        });
        
        // MKV için özel fallback - eğer video element çalışmazsa iframe dene
        if (isMKV) {
            console.log('MKV video element hatası, iframe ile denenecek...');
            videoPlayer.removeEventListener('error', errorHandler);
            videoPlayer.removeEventListener('canplay', canPlayHandler);
            videoPlayer.removeEventListener('loadeddata', loadedDataHandler);
            if (videoTimeout) {
                clearTimeout(videoTimeout);
                activeTimeouts = activeTimeouts.filter(t => t !== videoTimeout);
            }
            // Iframe ile dene
            playIframe(url);
            return;
        }
        
        if (loadingPlayer) loadingPlayer.classList.remove('active');
        videoPlayer.removeEventListener('error', errorHandler);
    };
    videoPlayer.addEventListener('error', errorHandler);
    
    // MKV için codec kontrolü - eğer 3 saniye sonra video boyutu hala 0 ise iframe'e geç
    if (isMKV) {
        const mkvCodecCheck = safeSetTimeout(() => {
            if (videoPlayer.videoWidth === 0 && videoPlayer.videoHeight === 0 && videoPlayer.readyState >= 2) {
                console.log('MKV codec sorunu: 3 saniye sonra video boyutu hala 0, iframe ile denenecek...');
                videoPlayer.removeEventListener('error', errorHandler);
                videoPlayer.removeEventListener('canplay', canPlayHandler);
                videoPlayer.removeEventListener('loadeddata', loadedDataHandler);
                if (videoTimeout) {
                    clearTimeout(videoTimeout);
                    activeTimeouts = activeTimeouts.filter(t => t !== videoTimeout);
                }
                playIframe(url);
            }
        }, 3000);
        activeTimeouts.push(mkvCodecCheck);
    }
}

// Convert YouTube URL to embed format
function convertYouTubeToEmbed(url) {
    let videoId = '';
    
    // YouTube URL formatlarını kontrol et
    if (url.includes('youtube.com/watch?v=')) {
        const match = url.match(/[?&]v=([^&]+)/);
        if (match) {
            videoId = match[1];
        }
    } else if (url.includes('youtu.be/')) {
        const match = url.match(/youtu\.be\/([^?&]+)/);
        if (match) {
            videoId = match[1];
        }
    } else if (url.includes('youtube.com/embed/')) {
        // Zaten embed formatında
        return url;
    }
    
    if (videoId) {
        // URL parametrelerini temizle (list, start_radio vb.)
        videoId = videoId.split('&')[0].split('?')[0];
        // YouTube embed URL'ini optimize et: autoplay, rel=0, modestbranding, controls=1
        return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&controls=1&playsinline=1&enablejsapi=1`;
    }
    
    return url;
}

// Play Iframe
function playIframe(url) {
    videoPlayer.style.display = 'none';
    iframePlayer.style.display = 'block';
    iframePlayer.src = url;
    
    if (currentChannel && iframePlayer) {
        iframePlayer.title = currentChannel.name;
    }
    
    // Tam ekran kontrolü - tam ekranda ise durumu koru
    const isFullscreen = !!(document.fullscreenElement || 
                           document.webkitFullscreenElement || 
                           document.mozFullScreenElement || 
                           document.msFullscreenElement);
    
    // Mobil uygulama kontrolü
    const inApp = isInApp();
    
    // Reapply video scale for iframe
    const currentScale = localStorage.getItem('videoScaleMode') || 'contain';
    applyVideoScale(currentScale);
    
    // Play/pause butonunu güncelle (iframe için play/pause çalışmayabilir)
    updatePlayPauseButton();
    
    // Tam ekranda ise video ayarlarını koru (hem normal hem mobil uygulama)
    if (isFullscreen || (inApp && isFullscreen)) {
        setTimeout(() => {
            adjustVideoForFullscreen();
        }, 100);
    }
    
    // YouTube olmayan linkler için load event'ini bekle
    if (!url.includes('youtube.com')) {
        iframePlayer.onload = () => {
            loadingPlayer.classList.remove('active');
            videoPlaceholderPlayer.style.display = 'none';
            // Tam ekranda ise tekrar kontrol et (hem normal hem mobil uygulama)
            const isFullscreenOnLoad = !!(document.fullscreenElement || 
                                         document.webkitFullscreenElement || 
                                         document.mozFullScreenElement || 
                                         document.msFullscreenElement);
            const inAppOnLoad = isInApp();
            if (isFullscreenOnLoad || (inAppOnLoad && isFullscreen)) {
                setTimeout(() => {
                    adjustVideoForFullscreen();
                    // Mobil uygulamada tam ekran durumunu tekrar kontrol et
                    if (inAppOnLoad) {
                        const isFullscreenStillActive = !!(document.fullscreenElement || 
                                                         document.webkitFullscreenElement || 
                                                         document.mozFullScreenElement || 
                                                         document.msFullscreenElement);
                        if (!isFullscreenStillActive && isFullscreen) {
                            // Tam ekran durumu kayboldu, tekrar tam ekrana geç
                            const container = videoContainerPlayer;
                            if (container) {
                                if (container.requestFullscreen) {
                                    container.requestFullscreen().catch(() => {});
                                } else if (container.webkitRequestFullscreen) {
                                    container.webkitRequestFullscreen().catch(() => {});
                                } else if (container.mozRequestFullScreen) {
                                    container.mozRequestFullScreen().catch(() => {});
                                } else if (container.msRequestFullscreen) {
                                    container.msRequestFullscreen().catch(() => {});
                                }
                            }
                        }
                    }
                }, 100);
            }
        };
    } else {
        // YouTube için de tam ekran kontrolü yap (hem normal hem mobil uygulama)
        if (isFullscreen || (inApp && isFullscreen)) {
            setTimeout(() => {
                adjustVideoForFullscreen();
                // Mobil uygulamada tam ekran durumunu tekrar kontrol et
                if (inApp) {
                    const isFullscreenStillActive = !!(document.fullscreenElement || 
                                                     document.webkitFullscreenElement || 
                                                     document.mozFullScreenElement || 
                                                     document.msFullscreenElement);
                    if (!isFullscreenStillActive && isFullscreen) {
                        // Tam ekran durumu kayboldu, tekrar tam ekrana geç
                        const container = videoContainerPlayer;
                        if (container) {
                            if (container.requestFullscreen) {
                                container.requestFullscreen().catch(() => {});
                            } else if (container.webkitRequestFullscreen) {
                                container.webkitRequestFullscreen().catch(() => {});
                            } else if (container.mozRequestFullScreen) {
                                container.mozRequestFullScreen().catch(() => {});
                            } else if (container.msRequestFullscreen) {
                                container.msRequestFullscreen().catch(() => {});
                            }
                        }
                    }
                }
            }, 200);
        }
    }
}

// Setup double tap for fullscreen (mobile)
function setupDoubleTapFullscreen(element) {
    if (!element) return;
    
    let lastTap = 0;
    let tapTimeout = null;
    let touchStartX = 0;
    let touchStartY = 0;
    
    const touchStartHandler = function(e) {
        // Store touch start position
        if (e.touches.length === 1) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }
    };
    
    const touchEndHandler = function(e) {
        // Only handle single finger taps
        if (e.changedTouches.length !== 1) return;
        
        // Kontrollere dokunulduğunda sidebar toggle yapma
        if (e.target.closest('.video-control-btn') || 
            e.target.closest('.speed-menu') || 
            e.target.closest('.quality-menu') || 
            e.target.closest('.scale-menu') ||
            e.target.closest('.volume-slider-container') || 
            e.target.closest('.progress-container') ||
            e.target.closest('.video-controls-bar') ||
            e.target.closest('.video-controls-overlay')) {
            // Kontrollere dokunuldu, sidebar toggle yapma
            if (tapTimeout) {
                clearTimeout(tapTimeout);
                activeTimeouts = activeTimeouts.filter(t => t !== tapTimeout);
                tapTimeout = null;
            }
            lastTap = 0;
            return;
        }
        
        const touch = e.changedTouches[0];
        const touchEndX = touch.clientX;
        const touchEndY = touch.clientY;
        
        // Check if it's a tap (not a swipe) - movement should be less than 10px
        const deltaX = Math.abs(touchEndX - touchStartX);
        const deltaY = Math.abs(touchEndY - touchStartY);
        
        if (deltaX > 10 || deltaY > 10) {
            // It's a swipe, not a tap - ignore
            lastTap = 0;
            if (tapTimeout) {
                clearTimeout(tapTimeout);
                activeTimeouts = activeTimeouts.filter(t => t !== tapTimeout);
                tapTimeout = null;
            }
            return;
        }
        
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTap;
        
        if (tapTimeout) {
            clearTimeout(tapTimeout);
            activeTimeouts = activeTimeouts.filter(t => t !== tapTimeout);
            tapTimeout = null;
        }
        
        if (tapLength < 400 && tapLength > 0) {
            // Double tap detected - open fullscreen
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            // Clear single tap timeout if exists
            if (tapTimeout) {
                clearTimeout(tapTimeout);
                activeTimeouts = activeTimeouts.filter(t => t !== tapTimeout);
                tapTimeout = null;
            }
            toggleFullscreen();
            lastTap = 0; // Reset to prevent triple tap
        } else {
            // Single tap - wait to see if there's another tap
            tapTimeout = safeSetTimeout(() => {
                // Single tap confirmed, toggle sidebar
                toggleSidebar();
                tapTimeout = null;
            }, 400);
        }
        
        lastTap = currentTime;
    };
    
    // Use capture phase to ensure this handler runs before other handlers
    element.addEventListener('touchstart', touchStartHandler, { passive: true, capture: true });
    element.addEventListener('touchend', touchEndHandler, { passive: false, capture: true });
    
    // Store handlers for potential cleanup
    element._touchStartHandler = touchStartHandler;
    element._touchEndHandler = touchEndHandler;
}

// Toggle Sidebar
function toggleSidebar() {
    const playerContentWrapper = document.querySelector('.player-content-wrapper');
    if (!playerContentWrapper) return;
    
    playerContentWrapper.classList.toggle('sidebar-hidden');
    
    // Video container'ı yeniden boyutlandır
    setTimeout(() => {
        const container = document.getElementById('videoContainerPlayer');
        if (container) {
            // Force reflow to ensure responsive layout
            const currentWidth = container.offsetWidth;
            const currentHeight = container.offsetHeight;
            container.style.width = currentWidth + 'px';
            container.style.height = currentHeight + 'px';
            container.offsetHeight; // Force reflow
            container.style.width = '';
            container.style.height = '';
            
            // Ölçeklendirmeyi yeniden uygula
            const currentScale = localStorage.getItem('videoScaleMode') || 'contain';
            applyVideoScale(currentScale);
        }
    }, 150);
}

// Show Sidebar (if hidden)
function showSidebar() {
    const playerContentWrapper = document.querySelector('.player-content-wrapper');
    if (!playerContentWrapper) return;
    
    if (playerContentWrapper.classList.contains('sidebar-hidden')) {
        playerContentWrapper.classList.remove('sidebar-hidden');
    }
}

// Fullscreen'de video'yu tam ekran yap
function adjustVideoForFullscreen() {
    if (!videoPlayer && !iframePlayer) return;
    
    const isFullscreen = !!(document.fullscreenElement || 
                           document.webkitFullscreenElement || 
                           document.mozFullScreenElement || 
                           document.msFullscreenElement);
    
    if (isFullscreen) {
        // Fullscreen'de video container'ı tam ekran yap
        const container = document.getElementById('videoContainerPlayer');
        if (container) {
            container.style.width = '100vw';
            container.style.height = '100vh';
        }
        
        // Fullscreen'de de ölçeklendirme ayarlarını uygula
        const currentScale = localStorage.getItem('videoScaleMode') || 'contain';
        
        // Önce ölçeklendirmeyi uygula
        applyVideoScale(currentScale);
        
        // Sonra fullscreen için gerekli position ve z-index ayarlarını yap
        // Ölçeklendirme ayarlarını koru, sadece position ve z-index'i ayarla
        const inApp = isInApp();
        if (videoPlayer) {
            if (inApp) {
                videoPlayer.style.zIndex = '1';
                videoPlayer.style.pointerEvents = 'none';
            } else {
            videoPlayer.style.zIndex = '9999';
            }
            // Position'ı sadece cover modunda değilse ayarla (cover modunda zaten applyVideoScale ayarlıyor)
            if (currentScale !== 'cover') {
                videoPlayer.style.position = 'fixed';
            }
        }
        
        if (iframePlayer) {
            if (inApp) {
                iframePlayer.style.zIndex = '1';
                iframePlayer.style.pointerEvents = 'none';
            } else {
            iframePlayer.style.zIndex = '9999';
        }
            // Position'ı sadece cover modunda değilse ayarla (cover modunda zaten applyVideoScale ayarlıyor)
            if (currentScale !== 'cover') {
                iframePlayer.style.position = 'fixed';
            }
        }
        
        // Ölçeklendirmeyi tekrar uygula (mobil uygulamada düzgün çalışması için)
        setTimeout(() => {
            applyVideoScale(currentScale);
        }, 100);
    } else {
        // Normal moda dön
        const container = document.getElementById('videoContainerPlayer');
        if (container) {
            container.style.width = '';
            container.style.height = '';
        }
        
        // Normal modda ölçeklendirme ayarlarını uygula
        const currentScale = localStorage.getItem('videoScaleMode') || 'contain';
        applyVideoScale(currentScale);
        
        // Position ve z-index'i sıfırla
        if (videoPlayer) {
            videoPlayer.style.position = '';
            videoPlayer.style.zIndex = '';
            videoPlayer.style.pointerEvents = '';
        }
        
        if (iframePlayer) {
            iframePlayer.style.position = '';
            iframePlayer.style.zIndex = '';
            iframePlayer.style.pointerEvents = '';
        }
    }
}

// Toggle Fullscreen
function toggleFullscreen() {
    const container = videoContainerPlayer;
    
    try {
        if (!document.fullscreenElement && 
            !document.webkitFullscreenElement && 
            !document.mozFullScreenElement && 
            !document.msFullscreenElement) {
            // Enter fullscreen
            let fullscreenPromise;
            if (container.requestFullscreen) {
                fullscreenPromise = container.requestFullscreen();
            } else if (container.webkitRequestFullscreen) {
                fullscreenPromise = container.webkitRequestFullscreen();
            } else if (container.mozRequestFullScreen) {
                fullscreenPromise = container.mozRequestFullScreen();
            } else if (container.msRequestFullscreen) {
                fullscreenPromise = container.msRequestFullscreen();
            }
            
            // Fullscreen açıldıktan sonra video'yu ayarla
            if (fullscreenPromise && fullscreenPromise.then) {
                fullscreenPromise.then(() => {
                    setTimeout(() => {
                        adjustVideoForFullscreen();
                        updateFullscreenButton();
                        // Tam ekranda kontrolleri gizle
                        hideVideoControls();
                        const overlay = document.getElementById('videoControlsOverlay');
                        if (overlay) {
                            overlay.style.display = 'none';
                        }
                        // Kontrol bar'ı da gizle
                        const controlsBar = document.getElementById('videoControlsBar');
                        if (controlsBar) {
                            controlsBar.style.display = 'none';
                            controlsBar.style.opacity = '0';
                            controlsBar.style.visibility = 'hidden';
                            controlsBar.style.pointerEvents = 'none';
                        }
                    }, 100);
                });
            } else {
                setTimeout(() => {
                    adjustVideoForFullscreen();
                    updateFullscreenButton();
                    // Tam ekranda kontrolleri gizle
                    hideVideoControls();
                    const overlay = document.getElementById('videoControlsOverlay');
                    if (overlay) {
                        overlay.style.display = 'none';
                    }
                    // Kontrol bar'ı da gizle
                    const controlsBar = document.getElementById('videoControlsBar');
                    if (controlsBar) {
                        controlsBar.style.display = 'none';
                        controlsBar.style.opacity = '0';
                        controlsBar.style.visibility = 'hidden';
                        controlsBar.style.pointerEvents = 'none';
                    }
                }, 100);
            }
        } else {
            // Exit fullscreen
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
            
            // Normal moda dön
            setTimeout(() => {
                adjustVideoForFullscreen();
                updateFullscreenButton();
                showVideoControls();
            }, 100);
        }
    } catch (error) {
        console.error('Tam ekran hatası:', error);
        showError('Tam ekran modu açılamadı.');
    }
}

// Fullscreen event listener'ları ekle
function setupFullscreenListeners() {
    const fullscreenEvents = [
        'fullscreenchange',
        'webkitfullscreenchange',
        'mozfullscreenchange',
        'MSFullscreenChange'
    ];
    
    fullscreenEvents.forEach(event => {
        document.addEventListener(event, () => {
            setTimeout(() => {
                adjustVideoForFullscreen();
                updateFullscreenButton();
                
                // Fullscreen'de kontrolleri gizle
                const isFullscreen = !!(document.fullscreenElement || 
                                       document.webkitFullscreenElement || 
                                       document.mozFullScreenElement || 
                                       document.msFullscreenElement);
                
                if (isFullscreen) {
                    // Tam ekranda kontrolleri gizle
                    hideVideoControls();
                    const overlay = document.getElementById('videoControlsOverlay');
                    if (overlay) {
                        overlay.style.display = 'none';
                    }
                    // Kontrol bar'ı da gizle
                    const controlsBar = document.getElementById('videoControlsBar');
                    if (controlsBar) {
                        controlsBar.style.display = 'none';
                        controlsBar.style.opacity = '0';
                        controlsBar.style.visibility = 'hidden';
                        controlsBar.style.pointerEvents = 'none';
                    }
                    
                    // Fullscreen'de ölçeklendirme ayarlarını uygula
                    const currentScale = localStorage.getItem('videoScaleMode') || 'contain';
                    applyVideoScale(currentScale);
                    
                    // Fullscreen'de video container'a tıklama ve dokunma desteği
                    const videoContainer = document.getElementById('videoContainerPlayer');
                    const videoPlayerEl = document.getElementById('videoPlayer');
                    const iframePlayerEl = document.getElementById('iframePlayer');
                    
                    if (videoContainer) {
                        // Long press timer
                        let longPressTimer = null;
                        let touchStartTime = 0;
                        let touchStartX = 0;
                        let touchStartY = 0;
                        const LONG_PRESS_DURATION = 500; // 500ms for long press
                        
                        // Click handler
                        const handleFullscreenClick = (e) => {
                            if (!e.target.closest('.video-control-btn') && 
                                !e.target.closest('.speed-menu') && 
                                !e.target.closest('.quality-menu') && 
                                !e.target.closest('.scale-menu') &&
                                !e.target.closest('.volume-slider-container') &&
                                !e.target.closest('.progress-container')) {
                                
                                // Menüler açıksa sadece menüleri kapat
                                const speedMenu = document.getElementById('speedMenu');
                                const qualityMenu = document.getElementById('qualityMenu');
                                const scaleMenu = document.getElementById('scaleMenu');
                                const isAnyMenuOpen = (speedMenu && speedMenu.style.display === 'block') ||
                                                      (qualityMenu && qualityMenu.style.display === 'block') ||
                                                      (scaleMenu && scaleMenu.style.display === 'block');
                                
                                if (isAnyMenuOpen) {
                                    hideAllMenus();
                                    showVideoControls();
                                    resetControlsTimeout();
                                } else {
                                    toggleVideoControls();
                                }
                            }
                        };
                        
                        // Touch start handler
                        const handleFullscreenTouchStart = (e) => {
                            // Kontrollere dokunulduğunda event'in çalışmasına izin ver
                            if (e.target.closest('.video-control-btn') || 
                                e.target.closest('.speed-menu') || 
                                e.target.closest('.quality-menu') || 
                                e.target.closest('.scale-menu') ||
                                e.target.closest('.volume-slider-container') ||
                                e.target.closest('.progress-container') ||
                                e.target.closest('.video-controls-overlay')) {
                                // Event'in kontrollere ulaşmasına izin ver, sadece timer'ı sıfırla
                                e.stopPropagation();
                                resetControlsTimeout();
                                return;
                            }
                            
                            touchStartTime = Date.now();
                            if (e.touches.length === 1) {
                                touchStartX = e.touches[0].clientX;
                                touchStartY = e.touches[0].clientY;
                            }
                            
                            // Long press timer
                            longPressTimer = setTimeout(() => {
                                toggleVideoControls();
                            }, LONG_PRESS_DURATION);
                        };
                        
                        // Touch end handler
                        const handleFullscreenTouchEnd = (e) => {
                            if (longPressTimer) {
                                clearTimeout(longPressTimer);
                                longPressTimer = null;
                            }
                            
                            // Kontrollere dokunulduğunda event'in çalışmasına izin ver
                            if (e.target.closest('.video-control-btn') || 
                                e.target.closest('.speed-menu') || 
                                e.target.closest('.quality-menu') || 
                                e.target.closest('.scale-menu') ||
                                e.target.closest('.volume-slider-container') ||
                                e.target.closest('.progress-container') ||
                                e.target.closest('.video-controls-overlay')) {
                                // Event'in kontrollere ulaşmasına izin ver
                                e.stopPropagation();
                                resetControlsTimeout();
                                return;
                            }
                            
                            // Menüler açıksa ve video container'a dokunulduysa sadece menüleri kapat
                            const speedMenu = document.getElementById('speedMenu');
                            const qualityMenu = document.getElementById('qualityMenu');
                            const scaleMenu = document.getElementById('scaleMenu');
                            const isAnyMenuOpen = (speedMenu && speedMenu.style.display === 'block') ||
                                                  (qualityMenu && qualityMenu.style.display === 'block') ||
                                                  (scaleMenu && scaleMenu.style.display === 'block');
                            
                            if (isAnyMenuOpen) {
                                hideAllMenus();
                                showVideoControls();
                                resetControlsTimeout();
                                return;
                            }
                            
                            const touchEndTime = Date.now();
                            const touchDuration = touchEndTime - touchStartTime;
                            
                            // Check if it was a tap (not a scroll)
                            if (e.changedTouches.length === 1) {
                                const touchEndX = e.changedTouches[0].clientX;
                                const touchEndY = e.changedTouches[0].clientY;
                                const deltaX = Math.abs(touchEndX - touchStartX);
                                const deltaY = Math.abs(touchEndY - touchStartY);
                                
                                // If it's a tap (not a long press, not a scroll)
                                if (touchDuration < LONG_PRESS_DURATION && deltaX < 10 && deltaY < 10) {
                                    toggleVideoControls();
                                }
                            }
                        };
                        
                        // Touch move handler - cancel long press on scroll
                        const handleFullscreenTouchMove = (e) => {
                            if (e.touches.length === 1) {
                                const touchX = e.touches[0].clientX;
                                const touchY = e.touches[0].clientY;
                                const deltaX = Math.abs(touchX - touchStartX);
                                const deltaY = Math.abs(touchY - touchStartY);
                                
                                // If moved more than 10px, cancel long press
                                if (deltaX > 10 || deltaY > 10) {
                                    if (longPressTimer) {
                                        clearTimeout(longPressTimer);
                                        longPressTimer = null;
                                    }
                                }
                            }
                        };
                        
                        // Remove old listeners if any
                        videoContainer.removeEventListener('click', handleFullscreenClick);
                        videoContainer.removeEventListener('touchstart', handleFullscreenTouchStart);
                        videoContainer.removeEventListener('touchend', handleFullscreenTouchEnd);
                        videoContainer.removeEventListener('touchmove', handleFullscreenTouchMove);
                        
                        // Add new listeners - mobil uygulamada passive: false kullan
                        const inApp = isInApp();
                        const passiveOption = inApp ? false : true; // Mobil uygulamada false, tarayıcıda true
                        
                        videoContainer.addEventListener('click', handleFullscreenClick, { passive: true });
                        videoContainer.addEventListener('touchstart', handleFullscreenTouchStart, { passive: passiveOption, capture: true });
                        videoContainer.addEventListener('touchend', handleFullscreenTouchEnd, { passive: passiveOption, capture: true });
                        videoContainer.addEventListener('touchmove', handleFullscreenTouchMove, { passive: passiveOption, capture: true });
                        
                        // Also add to video player and iframe player
                        if (videoPlayerEl) {
                            videoPlayerEl.addEventListener('touchstart', handleFullscreenTouchStart, { passive: passiveOption, capture: true });
                            videoPlayerEl.addEventListener('touchend', handleFullscreenTouchEnd, { passive: passiveOption, capture: true });
                            videoPlayerEl.addEventListener('touchmove', handleFullscreenTouchMove, { passive: passiveOption, capture: true });
                        }
                        
                        if (iframePlayerEl) {
                            iframePlayerEl.addEventListener('touchstart', handleFullscreenTouchStart, { passive: passiveOption, capture: true });
                            iframePlayerEl.addEventListener('touchend', handleFullscreenTouchEnd, { passive: passiveOption, capture: true });
                            iframePlayerEl.addEventListener('touchmove', handleFullscreenTouchMove, { passive: passiveOption, capture: true });
                        }
                        
                        // Fullscreen modda kontrol düğmelerine normal moddaki gibi handler'lar ekle
                        // Normal moddaki handleButtonClick mantığını kullan (hem inApp hem de normal için)
                        const handleButtonClick = (handler) => {
                            return (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                e.stopImmediatePropagation();
                                handler();
                                showVideoControls();
                                resetControlsTimeout();
                            };
                        };
                        
                        // Tüm kontrol düğmelerine handler ekle (her zaman)
                        {
                            
                            // Tüm kontrol düğmelerini bul
                            const prevSmallBtn = document.getElementById('prevSmallBtn');
                            const nextSmallBtn = document.getElementById('nextSmallBtn');
                            const playPauseBtn = document.getElementById('playPauseBtn');
                            const fullscreenBtn = document.getElementById('fullscreenBtn');
                            const volumeBtn = document.getElementById('volumeBtn');
                            const speedBtn = document.getElementById('speedBtn');
                            const qualityBtn = document.getElementById('qualityBtn');
                            const scaleBtn = document.getElementById('scaleBtn');
                            const pipBtn = document.getElementById('pipBtn');
                            const minimizeBtn = document.getElementById('minimizeBtn');
                            
                            // Previous channel button
                            if (prevSmallBtn) {
                                if (prevSmallBtn._fullscreenClickHandler) {
                                    prevSmallBtn.removeEventListener('click', prevSmallBtn._fullscreenClickHandler);
                                }
                                if (prevSmallBtn._fullscreenTouchHandler) {
                                    prevSmallBtn.removeEventListener('touchend', prevSmallBtn._fullscreenTouchHandler);
                                }
                                
                                prevSmallBtn._fullscreenClickHandler = handleButtonClick(() => {
                                    navigateToPreviousChannel();
                                });
                                prevSmallBtn._fullscreenTouchHandler = handleButtonClick(() => {
                                    navigateToPreviousChannel();
                                });
                                
                                prevSmallBtn.addEventListener('click', prevSmallBtn._fullscreenClickHandler, { capture: true, passive: false });
                                prevSmallBtn.addEventListener('touchend', prevSmallBtn._fullscreenTouchHandler, { capture: true, passive: false });
                            }
                            
                            // Next channel button
                            if (nextSmallBtn) {
                                if (nextSmallBtn._fullscreenClickHandler) {
                                    nextSmallBtn.removeEventListener('click', nextSmallBtn._fullscreenClickHandler);
                                }
                                if (nextSmallBtn._fullscreenTouchHandler) {
                                    nextSmallBtn.removeEventListener('touchend', nextSmallBtn._fullscreenTouchHandler);
                                }
                                
                                nextSmallBtn._fullscreenClickHandler = handleButtonClick(() => {
                                    navigateToNextChannel();
                                });
                                nextSmallBtn._fullscreenTouchHandler = handleButtonClick(() => {
                                    navigateToNextChannel();
                                });
                                
                                nextSmallBtn.addEventListener('click', nextSmallBtn._fullscreenClickHandler, { capture: true, passive: false });
                                nextSmallBtn.addEventListener('touchend', nextSmallBtn._fullscreenTouchHandler, { capture: true, passive: false });
                            }
                            
                            // Play/Pause button
                            if (playPauseBtn) {
                                if (playPauseBtn._fullscreenClickHandler) {
                                    playPauseBtn.removeEventListener('click', playPauseBtn._fullscreenClickHandler);
                                }
                                if (playPauseBtn._fullscreenTouchHandler) {
                                    playPauseBtn.removeEventListener('touchend', playPauseBtn._fullscreenTouchHandler);
                                }
                                
                                playPauseBtn._fullscreenClickHandler = handleButtonClick(() => {
                                    togglePlayPause();
                                });
                                playPauseBtn._fullscreenTouchHandler = handleButtonClick(() => {
                                    togglePlayPause();
                                });
                                
                                playPauseBtn.addEventListener('click', playPauseBtn._fullscreenClickHandler, { capture: true, passive: false });
                                playPauseBtn.addEventListener('touchend', playPauseBtn._fullscreenTouchHandler, { capture: true, passive: false });
                            }
                            
                            // Fullscreen button
                            if (fullscreenBtn) {
                                if (fullscreenBtn._fullscreenClickHandler) {
                                    fullscreenBtn.removeEventListener('click', fullscreenBtn._fullscreenClickHandler);
                                }
                                if (fullscreenBtn._fullscreenTouchHandler) {
                                    fullscreenBtn.removeEventListener('touchend', fullscreenBtn._fullscreenTouchHandler);
                                }
                                
                                fullscreenBtn._fullscreenClickHandler = handleButtonClick(() => {
                                    toggleFullscreen();
                                });
                                fullscreenBtn._fullscreenTouchHandler = handleButtonClick(() => {
                                    toggleFullscreen();
                                });
                                
                                fullscreenBtn.addEventListener('click', fullscreenBtn._fullscreenClickHandler, { capture: true, passive: false });
                                fullscreenBtn.addEventListener('touchend', fullscreenBtn._fullscreenTouchHandler, { capture: true, passive: false });
                            }
                            
                            // Speed, Quality, Scale butonları için özel handler'lar (menüleri açmak için)
                            if (speedBtn) {
                                const speedMenu = document.getElementById('speedMenu');
                                if (speedMenu) {
                                    if (speedBtn._fullscreenClickHandler) {
                                        speedBtn.removeEventListener('click', speedBtn._fullscreenClickHandler);
                                    }
                                    if (speedBtn._fullscreenTouchHandler) {
                                        speedBtn.removeEventListener('touchend', speedBtn._fullscreenTouchHandler);
                                    }
                                    if (speedBtn._fullscreenTouchStartHandler) {
                                        speedBtn.removeEventListener('touchstart', speedBtn._fullscreenTouchStartHandler);
                                    }
                                    
                                    const speedHandler = (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        e.stopImmediatePropagation();
                                        const isVisible = speedMenu.style.display === 'block';
                                        hideAllMenus();
                                        speedMenu.style.display = isVisible ? 'none' : 'block';
                                        showVideoControls();
                                        resetControlsTimeout();
                                    };
                                    
                                    speedBtn._fullscreenClickHandler = speedHandler;
                                    speedBtn._fullscreenTouchHandler = speedHandler;
                                    speedBtn._fullscreenTouchStartHandler = (e) => {
                                        e.stopPropagation();
                                    };
                                    
                                    speedBtn.addEventListener('click', speedHandler, { capture: true, passive: false });
                                    speedBtn.addEventListener('touchend', speedHandler, { capture: true, passive: false });
                                    speedBtn.addEventListener('touchstart', speedBtn._fullscreenTouchStartHandler, { capture: true, passive: false });
                                }
                            }
                            
                            if (qualityBtn) {
                                const qualityMenu = document.getElementById('qualityMenu');
                                if (qualityMenu) {
                                    if (qualityBtn._fullscreenClickHandler) {
                                        qualityBtn.removeEventListener('click', qualityBtn._fullscreenClickHandler);
                                    }
                                    if (qualityBtn._fullscreenTouchHandler) {
                                        qualityBtn.removeEventListener('touchend', qualityBtn._fullscreenTouchHandler);
                                    }
                                    if (qualityBtn._fullscreenTouchStartHandler) {
                                        qualityBtn.removeEventListener('touchstart', qualityBtn._fullscreenTouchStartHandler);
                                    }
                                    
                                    const qualityHandler = (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        e.stopImmediatePropagation();
                                        const isVisible = qualityMenu.style.display === 'block';
                                        hideAllMenus();
                                        qualityMenu.style.display = isVisible ? 'none' : 'block';
                                        showVideoControls();
                                        resetControlsTimeout();
                                    };
                                    
                                    qualityBtn._fullscreenClickHandler = qualityHandler;
                                    qualityBtn._fullscreenTouchHandler = qualityHandler;
                                    qualityBtn._fullscreenTouchStartHandler = (e) => {
                                        e.stopPropagation();
                                    };
                                    
                                    qualityBtn.addEventListener('click', qualityHandler, { capture: true, passive: false });
                                    qualityBtn.addEventListener('touchend', qualityHandler, { capture: true, passive: false });
                                    qualityBtn.addEventListener('touchstart', qualityBtn._fullscreenTouchStartHandler, { capture: true, passive: false });
                                }
                            }
                            
                            if (scaleBtn) {
                                const scaleMenu = document.getElementById('scaleMenu');
                                if (scaleMenu) {
                                    if (scaleBtn._fullscreenClickHandler) {
                                        scaleBtn.removeEventListener('click', scaleBtn._fullscreenClickHandler);
                                    }
                                    if (scaleBtn._fullscreenTouchHandler) {
                                        scaleBtn.removeEventListener('touchend', scaleBtn._fullscreenTouchHandler);
                                    }
                                    if (scaleBtn._fullscreenTouchStartHandler) {
                                        scaleBtn.removeEventListener('touchstart', scaleBtn._fullscreenTouchStartHandler);
                                    }
                                    
                                    const scaleHandler = (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        e.stopImmediatePropagation();
                                        const isVisible = scaleMenu.style.display === 'block';
                                        hideAllMenus();
                                        scaleMenu.style.display = isVisible ? 'none' : 'block';
                                        showVideoControls();
                                        resetControlsTimeout();
                                    };
                                    
                                    scaleBtn._fullscreenClickHandler = scaleHandler;
                                    scaleBtn._fullscreenTouchHandler = scaleHandler;
                                    scaleBtn._fullscreenTouchStartHandler = (e) => {
                                        e.stopPropagation();
                                    };
                                    
                                    scaleBtn.addEventListener('click', scaleHandler, { capture: true, passive: false });
                                    scaleBtn.addEventListener('touchend', scaleHandler, { capture: true, passive: false });
                                    scaleBtn.addEventListener('touchstart', scaleBtn._fullscreenTouchStartHandler, { capture: true, passive: false });
                                }
                            }
                            
                            // Diğer kontrol düğmeleri için de aynı mantığı uygula
                            const otherButtons = [volumeBtn, pipBtn, minimizeBtn].filter(btn => btn);
                            otherButtons.forEach(btn => {
                                if (btn._fullscreenClickHandler) {
                                    btn.removeEventListener('click', btn._fullscreenClickHandler);
                                }
                                if (btn._fullscreenTouchHandler) {
                                    btn.removeEventListener('touchend', btn._fullscreenTouchHandler);
                                }
                                
                                const clickHandler = (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.stopImmediatePropagation();
                                    btn.click();
                                    showVideoControls();
                                    resetControlsTimeout();
                                };
                                
                                btn._fullscreenClickHandler = clickHandler;
                                btn._fullscreenTouchHandler = clickHandler;
                                
                                btn.addEventListener('click', clickHandler, { capture: true, passive: false });
                                btn.addEventListener('touchend', clickHandler, { capture: true, passive: false });
                            });
                            
                            // Menu butonları (speed, quality, scale menülerindeki butonlar)
                            const speedMenu = document.getElementById('speedMenu');
                            const qualityMenu = document.getElementById('qualityMenu');
                            const scaleMenu = document.getElementById('scaleMenu');
                            const speedLabel = document.getElementById('speedLabel');
                            const qualityLabel = document.getElementById('qualityLabel');
                            
                            // Speed menu butonları
                            if (speedMenu) {
                                speedMenu.querySelectorAll('button').forEach(btn => {
                                    if (btn._fullscreenClickHandler) {
                                        btn.removeEventListener('click', btn._fullscreenClickHandler);
                                    }
                                    if (btn._fullscreenTouchHandler) {
                                        btn.removeEventListener('touchend', btn._fullscreenTouchHandler);
                                    }
                                    if (btn._fullscreenTouchStartHandler) {
                                        btn.removeEventListener('touchstart', btn._fullscreenTouchStartHandler);
                                    }
                                    
                                    const speedMenuHandler = (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        e.stopImmediatePropagation();
                                        const speed = parseFloat(btn.dataset.speed);
                                        
                                        if (videoPlayer && videoPlayer.style.display !== 'none') {
                                            videoPlayer.playbackRate = speed;
                                        }
                                        
                                        speedMenu.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                                        btn.classList.add('active');
                                        if (speedLabel) speedLabel.textContent = `${speed}x`;
                                        speedMenu.style.display = 'none';
                                        showVideoControls();
                                        resetControlsTimeout();
                                    };
                                    
                                    btn._fullscreenClickHandler = speedMenuHandler;
                                    btn._fullscreenTouchHandler = speedMenuHandler;
                                    btn._fullscreenTouchStartHandler = (e) => {
                                        e.stopPropagation();
                                    };
                                    
                                    btn.addEventListener('click', speedMenuHandler, { capture: true, passive: false });
                                    btn.addEventListener('touchend', speedMenuHandler, { capture: true, passive: false });
                                    btn.addEventListener('touchstart', btn._fullscreenTouchStartHandler, { capture: true, passive: false });
                                });
                            }
                            
                            // Quality menu butonları
                            if (qualityMenu) {
                                // Auto quality button
                                const autoBtn = qualityMenu.querySelector('[data-quality="auto"]');
                                if (autoBtn) {
                                    if (autoBtn._fullscreenClickHandler) {
                                        autoBtn.removeEventListener('click', autoBtn._fullscreenClickHandler);
                                    }
                                    if (autoBtn._fullscreenTouchHandler) {
                                        autoBtn.removeEventListener('touchend', autoBtn._fullscreenTouchHandler);
                                    }
                                    if (autoBtn._fullscreenTouchStartHandler) {
                                        autoBtn.removeEventListener('touchstart', autoBtn._fullscreenTouchStartHandler);
                                    }
                                    
                                    const autoHandler = (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        e.stopImmediatePropagation();
                                        if (hlsInstance) {
                                            hlsInstance.currentLevel = -1; // Auto
                                        }
                                        qualityMenu.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                                        autoBtn.classList.add('active');
                                        if (qualityLabel) qualityLabel.textContent = 'Auto';
                                        qualityMenu.style.display = 'none';
                                        showVideoControls();
                                        resetControlsTimeout();
                                    };
                                    
                                    autoBtn._fullscreenClickHandler = autoHandler;
                                    autoBtn._fullscreenTouchHandler = autoHandler;
                                    autoBtn._fullscreenTouchStartHandler = (e) => {
                                        e.stopPropagation();
                                    };
                                    
                                    autoBtn.addEventListener('click', autoHandler, { capture: true, passive: false });
                                    autoBtn.addEventListener('touchend', autoHandler, { capture: true, passive: false });
                                    autoBtn.addEventListener('touchstart', autoBtn._fullscreenTouchStartHandler, { capture: true, passive: false });
                                }
                                
                                // Quality level buttons
                                qualityMenu.querySelectorAll('button[data-quality]:not([data-quality="auto"])').forEach(btn => {
                                    if (btn._fullscreenClickHandler) {
                                        btn.removeEventListener('click', btn._fullscreenClickHandler);
                                    }
                                    if (btn._fullscreenTouchHandler) {
                                        btn.removeEventListener('touchend', btn._fullscreenTouchHandler);
                                    }
                                    if (btn._fullscreenTouchStartHandler) {
                                        btn.removeEventListener('touchstart', btn._fullscreenTouchStartHandler);
                                    }
                                    
                                    const qualityMenuHandler = (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        e.stopImmediatePropagation();
                                        const qualityIndex = parseInt(btn.dataset.quality);
                                        
                                        if (hlsInstance) {
                                            hlsInstance.currentLevel = qualityIndex;
                                        }
                                        
                                        qualityMenu.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                                        btn.classList.add('active');
                                        
                                        // Quality label'ı güncelle
                                        if (hlsInstance && hlsInstance.levels && hlsInstance.levels[qualityIndex]) {
                                            const level = hlsInstance.levels[qualityIndex];
                                            if (qualityLabel) qualityLabel.textContent = level.height ? `${level.height}p` : `Level ${qualityIndex}`;
                                        }
                                        
                                        qualityMenu.style.display = 'none';
                                        showVideoControls();
                                        resetControlsTimeout();
                                    };
                                    
                                    btn._fullscreenClickHandler = qualityMenuHandler;
                                    btn._fullscreenTouchHandler = qualityMenuHandler;
                                    btn._fullscreenTouchStartHandler = (e) => {
                                        e.stopPropagation();
                                    };
                                    
                                    btn.addEventListener('click', qualityMenuHandler, { capture: true, passive: false });
                                    btn.addEventListener('touchend', qualityMenuHandler, { capture: true, passive: false });
                                    btn.addEventListener('touchstart', btn._fullscreenTouchStartHandler, { capture: true, passive: false });
                                });
                            }
                            
                            // Scale menu butonları
                            if (scaleMenu) {
                                scaleMenu.querySelectorAll('button').forEach(btn => {
                                    if (btn._fullscreenClickHandler) {
                                        btn.removeEventListener('click', btn._fullscreenClickHandler);
                                    }
                                    if (btn._fullscreenTouchHandler) {
                                        btn.removeEventListener('touchend', btn._fullscreenTouchHandler);
                                    }
                                    if (btn._fullscreenTouchStartHandler) {
                                        btn.removeEventListener('touchstart', btn._fullscreenTouchStartHandler);
                                    }
                                    
                                    const scaleMenuHandler = (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        e.stopImmediatePropagation();
                                        const scale = btn.dataset.scale;
                                        
                                        applyVideoScale(scale);
                                        
                                        scaleMenu.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                                        btn.classList.add('active');
                                        scaleMenu.style.display = 'none';
                                        showVideoControls();
                                        resetControlsTimeout();
                                    };
                                    
                                    btn._fullscreenClickHandler = scaleMenuHandler;
                                    btn._fullscreenTouchHandler = scaleMenuHandler;
                                    btn._fullscreenTouchStartHandler = (e) => {
                                        e.stopPropagation();
                                    };
                                    
                                    btn.addEventListener('click', scaleMenuHandler, { capture: true, passive: false });
                                    btn.addEventListener('touchend', scaleMenuHandler, { capture: true, passive: false });
                                    btn.addEventListener('touchstart', btn._fullscreenTouchStartHandler, { capture: true, passive: false });
                                });
                            }
                        }
                    }
                } else {
                    // Exit fullscreen - cleanup
                    const videoContainer = document.getElementById('videoContainerPlayer');
                    if (videoContainer) {
                        // Remove fullscreen-specific listeners will be handled by next fullscreen entry
                    }
                }
            }, 50);
        });
    });
    
    // Window resize'da da kontrol et
    window.addEventListener('resize', () => {
        setTimeout(() => {
            adjustVideoForFullscreen();
            updateFullscreenButton();
        }, 50);
    });
}


// Toggle Favorite
function toggleFavorite(channelId) {
    const index = favoriteChannels.indexOf(channelId);
    if (index > -1) {
        favoriteChannels.splice(index, 1);
    } else {
        favoriteChannels.push(channelId);
    }
    localStorage.setItem('favoriteChannels', JSON.stringify(favoriteChannels));
}

// Son İzlenenler listesine ekle
function addToRecentChannels(channelId) {
    // Eğer zaten listede varsa, önce kaldır (en üste taşımak için)
    const existingIndex = recentChannels.indexOf(channelId);
    if (existingIndex > -1) {
        recentChannels.splice(existingIndex, 1);
    }
    
    // En başa ekle (en yeni önce)
    recentChannels.unshift(channelId);
    
    // Maksimum 50 kanal tut (eski olanları sil)
    if (recentChannels.length > 50) {
        recentChannels = recentChannels.slice(0, 50);
    }
    
    // localStorage'a kaydet
    localStorage.setItem('recentChannels', JSON.stringify(recentChannels));
    
    // Eğer "Son İzlenenler" kategorisi aktifse, sidebar'ı güncelle
    if (currentCategory === 'recent') {
        renderSidebarChannels();
        renderDynamicCategories(); // Sayıları güncellemek için
    }
}

// Show Error
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--danger);
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 12px;
        z-index: 10000;
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        font-size: 0.9375rem;
        max-width: 400px;
    `;
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    
    // Zaman aşımı mesajları 2 saniye, diğerleri 5 saniye sonra kaybolsun
    const timeoutDuration = message.includes('zaman aşımı') ? 2000 : 5000;
    
    const fadeTimeout = safeSetTimeout(() => {
        errorDiv.style.opacity = '0';
        errorDiv.style.transition = 'opacity 0.3s ease';
        const removeTimeout = safeSetTimeout(() => {
            errorDiv.remove();
        }, 300);
    }, timeoutDuration);
}

function showNotification(message) {
    const notificationDiv = document.createElement('div');
    notificationDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 12px;
        z-index: 10000;
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        font-size: 0.9375rem;
        max-width: 400px;
        animation: slideInRight 0.3s ease;
    `;
    notificationDiv.textContent = message;
    document.body.appendChild(notificationDiv);
    
    // Mesaj tipine göre timeout süresi belirle
    // Başarılı yükleme mesajları için 4 saniye, diğerleri için 3 saniye
    const isSuccessMessage = message.includes('✅') && (message.includes('yüklendi') || message.includes('yüklendi (Toplam:'));
    const timeoutDuration = isSuccessMessage ? 4000 : 3000;
    
    // Timeout ile otomatik kaybolma
    const fadeTimeout = safeSetTimeout(() => {
        if (notificationDiv && notificationDiv.parentNode) {
            notificationDiv.style.opacity = '0';
            notificationDiv.style.transition = 'opacity 0.3s ease';
            const removeTimeout = safeSetTimeout(() => {
                if (notificationDiv && notificationDiv.parentNode) {
                    notificationDiv.remove();
                }
            }, 300);
        }
    }, timeoutDuration);
    
    // Tıklanınca da kapatılabilir
    notificationDiv.style.cursor = 'pointer';
    notificationDiv.addEventListener('click', () => {
        if (notificationDiv && notificationDiv.parentNode) {
            notificationDiv.style.opacity = '0';
            notificationDiv.style.transition = 'opacity 0.3s ease';
            safeSetTimeout(() => {
                if (notificationDiv && notificationDiv.parentNode) {
                    notificationDiv.remove();
                }
            }, 300);
        }
    });
}

