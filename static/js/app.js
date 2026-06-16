// Global State Management
const state = {
    updates: [],
    filteredUpdates: [],
    selectedUpdate: null,
    activeFilter: 'ALL',
    searchQuery: '',
    activeStyle: 'professional',
    isLoading: false
};

// DOM Elements
const elements = {
    refreshBtn: document.getElementById('refresh-btn'),
    refreshIcon: document.getElementById('refresh-icon'),
    searchInput: document.getElementById('search-input'),
    clearSearchBtn: document.getElementById('clear-search-btn'),
    filterPillsList: document.getElementById('filter-pills-list'),
    notesFeed: document.getElementById('notes-feed'),
    composerSidebar: document.getElementById('composer-sidebar'),
    composerEmpty: document.getElementById('composer-empty'),
    composerActive: document.getElementById('composer-active'),
    closeComposerBtn: document.getElementById('close-composer-btn'),
    
    // Preview / Composer fields
    previewBadge: document.getElementById('preview-badge'),
    previewDate: document.getElementById('preview-date'),
    tweetTextarea: document.getElementById('tweet-textarea'),
    charCounter: document.getElementById('char-counter'),
    charProgressRing: document.getElementById('char-progress-ring'),
    tweetSubmitBtn: document.getElementById('tweet-submit-btn'),
    toastContainer: document.getElementById('toast-container'),
    
    // Filter Counter Badges
    countAll: document.getElementById('count-all'),
    countFeature: document.getElementById('count-feature'),
    countChanged: document.getElementById('count-changed'),
    countIssue: document.getElementById('count-issue'),
    countAnnouncement: document.getElementById('count-announcement'),
    
    // Template buttons
    tmplProfessional: document.getElementById('tmpl-professional'),
    tmplTechnical: document.getElementById('tmpl-technical'),
    tmplMinimal: document.getElementById('tmpl-minimal')
};

// Progress Ring Configuration
// Circumference = 2 * PI * r = 2 * 3.14159 * 11 = ~69.115
const RING_CIRCUMFERENCE = 2 * Math.PI * 11;

/* ==========================================================================
   INITIALIZATION & EVENT LISTENERS
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    initProgressRing();
    fetchReleaseNotes();
    setupEventListeners();
});

function initProgressRing() {
    elements.charProgressRing.style.strokeDasharray = `${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`;
    elements.charProgressRing.style.strokeDashoffset = RING_CIRCUMFERENCE;
}

function setupEventListeners() {
    // Refresh click
    elements.refreshBtn.addEventListener('click', () => {
        fetchReleaseNotes(true);
    });

    // Search input
    elements.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.toLowerCase().trim();
        elements.clearSearchBtn.style.display = state.searchQuery ? 'block' : 'none';
        filterAndRenderFeed();
    });

    // Clear search
    elements.clearSearchBtn.addEventListener('click', () => {
        elements.searchInput.value = '';
        state.searchQuery = '';
        elements.clearSearchBtn.style.display = 'none';
        filterAndRenderFeed();
        elements.searchInput.focus();
    });

    // Filter pills
    elements.filterPillsList.addEventListener('click', (e) => {
        const pill = e.target.closest('.pill');
        if (!pill) return;

        // Toggle active pill classes
        document.querySelectorAll('.filter-pills .pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');

        state.activeFilter = pill.dataset.category;
        filterAndRenderFeed();
    });

    // Composer close button (for mobile sliding drawer)
    elements.closeComposerBtn.addEventListener('click', () => {
        elements.composerSidebar.classList.remove('open');
    });

    // Textarea change
    elements.tweetTextarea.addEventListener('input', () => {
        updateCharCount();
    });

    // Share action
    elements.tweetSubmitBtn.addEventListener('click', () => {
        shareToX();
    });

    // Template style click
    const templates = [
        { btn: elements.tmplProfessional, style: 'professional' },
        { btn: elements.tmplTechnical, style: 'technical' },
        { btn: elements.tmplMinimal, style: 'minimal' }
    ];

    templates.forEach(t => {
        t.btn.addEventListener('click', () => {
            templates.forEach(x => x.btn.classList.remove('active'));
            t.btn.classList.add('active');
            state.activeStyle = t.style;
            generateTweetDraft();
        });
    });
}

/* ==========================================================================
   DATA FETCHING & RENDERING
   ========================================================================== */
async function fetchReleaseNotes(force = false) {
    if (state.isLoading) return;
    
    setLoadingState(true);
    showSkeletonPlaceholder();
    
    try {
        const url = `/api/notes${force ? '?force=true' : ''}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success) {
            state.updates = data.updates;
            
            // Render Stats & Badges
            updateCategoryCounters();
            
            // Render Feed Card List
            filterAndRenderFeed();
            
            if (force) {
                showToast(data.fetched_live ? 'Successfully fetched latest release notes!' : 'Release notes are already up to date.');
            }
        } else {
            showToast(`Failed to parse release notes: ${data.error}`, 'error');
            elements.notesFeed.innerHTML = `<div class="feed-empty-state">Error fetching updates: ${data.error}</div>`;
        }
    } catch (error) {
        console.error(error);
        showToast('A network error occurred while fetching release notes.', 'error');
        elements.notesFeed.innerHTML = `<div class="feed-empty-state">Unable to contact the Flask server. Please make sure the app is running.</div>`;
    } finally {
        setLoadingState(false);
    }
}

function setLoadingState(isLoading) {
    state.isLoading = isLoading;
    if (isLoading) {
        elements.refreshIcon.classList.add('loading');
        elements.refreshBtn.disabled = true;
    } else {
        elements.refreshIcon.classList.remove('loading');
        elements.refreshBtn.disabled = false;
    }
}

function showSkeletonPlaceholder() {
    elements.notesFeed.innerHTML = `
        <div class="feed-loading-placeholder">
            <div class="loading-pulse-card"></div>
            <div class="loading-pulse-card"></div>
            <div class="loading-pulse-card"></div>
        </div>
    `;
}

function updateCategoryCounters() {
    const counts = {
        ALL: state.updates.length,
        Feature: 0,
        Changed: 0,
        Issue: 0,
        Announcement: 0
    };
    
    state.updates.forEach(upd => {
        if (counts.hasOwnProperty(upd.category_type)) {
            counts[upd.category_type]++;
        }
    });
    
    // Update labels
    elements.countAll.textContent = counts.ALL;
    elements.countFeature.textContent = counts.Feature;
    elements.countChanged.textContent = counts.Changed;
    elements.countIssue.textContent = counts.Issue;
    elements.countAnnouncement.textContent = counts.Announcement;
}

function filterAndRenderFeed() {
    // Filter logic
    state.filteredUpdates = state.updates.filter(upd => {
        const matchesCategory = state.activeFilter === 'ALL' || upd.category_type === state.activeFilter;
        const matchesSearch = !state.searchQuery || 
                              upd.category.toLowerCase().includes(state.searchQuery) ||
                              upd.content_text.toLowerCase().includes(state.searchQuery) ||
                              upd.date.toLowerCase().includes(state.searchQuery);
        return matchesCategory && matchesSearch;
    });
    
    // Update search summary counter
    const countText = document.getElementById('results-count-text');
    if (state.filteredUpdates.length === 0) {
        countText.textContent = 'No matching updates found';
    } else {
        countText.textContent = `Showing ${state.filteredUpdates.length} update${state.filteredUpdates.length > 1 ? 's' : ''}`;
    }
    
    // Update cache indicator
    const cacheStatus = document.getElementById('cache-status');
    if (state.updates.length > 0) {
        cacheStatus.textContent = 'Data cached locally';
    } else {
        cacheStatus.textContent = '';
    }

    // Render cards
    renderFeed();
}

function renderFeed() {
    if (state.filteredUpdates.length === 0) {
        elements.notesFeed.innerHTML = `
            <div class="composer-empty-state">
                <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.604 10.604z" />
                </svg>
                <p>No release notes found matching your criteria. Try adjustments or search keywords.</p>
            </div>
        `;
        return;
    }
    
    elements.notesFeed.innerHTML = '';
    
    state.filteredUpdates.forEach(upd => {
        const card = document.createElement('div');
        card.className = `note-card cat-${upd.category_type}`;
        if (state.selectedUpdate && state.selectedUpdate.id === upd.id) {
            card.classList.add('selected');
        }
        
        // Add card click listener
        card.addEventListener('click', (e) => {
            // Avoid selecting if clicked on an anchor tag directly
            if (e.target.tagName.toLowerCase() === 'a') return;
            selectUpdate(upd, card);
        });
        
        card.innerHTML = `
            <div class="card-header">
                <span class="badge cat-${upd.category_type}">${upd.category}</span>
                <span class="card-date">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    ${upd.date}
                </span>
            </div>
            <div class="card-content">
                ${upd.content_html}
            </div>
            <div class="card-footer">
                ${upd.link ? `<a href="${upd.link}" target="_blank" rel="noopener noreferrer" class="card-action-link" title="Open official notes">
                    <span>Docs</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="7" y1="17" x2="17" y2="7"/>
                        <polyline points="7 7 17 7 17 17"/>
                    </svg>
                </a>` : ''}
                <button class="btn btn-draft-tweet" data-note-id="${upd.id}">
                    <svg class="icon-x-mini" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 4px; vertical-align: middle;">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                    Draft Tweet
                </button>
            </div>
        `;
        
        // Draft button click event
        const draftBtn = card.querySelector('.btn-draft-tweet');
        draftBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Avoid triggering card click again
            selectUpdate(upd, card);
        });
        
        elements.notesFeed.appendChild(card);
    });
}

/* ==========================================================================
   TWEET DRAFT COMPOSER
   ========================================================================== */
function selectUpdate(update, cardElement) {
    state.selectedUpdate = update;
    
    // Visual Highlight of Card
    document.querySelectorAll('.note-card').forEach(card => card.classList.remove('selected'));
    cardElement.classList.add('selected');
    
    // Open Sidebar Drawer (on mobile device views)
    elements.composerSidebar.classList.add('open');
    
    // Transition UI state
    elements.composerEmpty.classList.add('hidden');
    elements.composerActive.classList.remove('hidden');
    
    // Set Preview Meta
    elements.previewBadge.textContent = update.category;
    elements.previewBadge.className = `badge cat-${update.category_type}`;
    elements.previewDate.textContent = update.date;
    
    // Generate Draft Tweet
    generateTweetDraft();
    
    // Scroll to composer on small screens
    if (window.innerWidth < 1024) {
        elements.composerSidebar.scrollIntoView({ behavior: 'smooth' });
    }
}

function cleanTextForTweet(rawText) {
    if (!rawText) return "";
    
    // Replace double spaces and clean newlines
    let text = rawText.replace(/\s+/g, ' ').trim();
    
    // Limit to sentence structures
    // Let's strip out typical artifacts
    text = text.replace(/This feature is in Preview\./g, '');
    
    return text;
}

function generateTweetDraft() {
    if (!state.selectedUpdate) return;
    
    const upd = state.selectedUpdate;
    const rawContent = cleanTextForTweet(upd.content_text);
    
    // We allocate 23 chars for the link (Twitter/X intent URL rules)
    // 280 max chars - 23 (link) - 5 (newlines/spaces) = ~252 chars budget for text
    const budget = 250;
    
    let trimmedText = rawContent;
    if (trimmedText.length > budget) {
        trimmedText = trimmedText.substring(0, budget - 3) + '...';
    }
    
    let draft = "";
    
    switch (state.activeStyle) {
        case 'technical':
            draft = `🛠️ BigQuery Dev Alert: [${upd.category_type}]\n${trimmedText}\n\nSpecs: ${upd.link}`;
            break;
            
        case 'minimal':
            draft = `New in #BigQuery (${upd.date}):\n${trimmedText}\n\n${upd.link}`;
            break;
            
        case 'professional':
        default:
            draft = `📢 Google Cloud BigQuery Update:\n${trimmedText}\n\nRead more details here: ${upd.link} #GCP #DataWarehouse`;
            break;
    }
    
    elements.tweetTextarea.value = draft;
    updateCharCount();
}

function updateCharCount() {
    const text = elements.tweetTextarea.value;
    
    // Calculate twitter character counts
    // Twitter handles URLs by replacing them with a t.co link which is exactly 23 characters long.
    const urlRegex = /https?:\/\/[^\s]+/g;
    let computedLength = text.length;
    
    const matches = text.match(urlRegex);
    if (matches) {
        matches.forEach(url => {
            computedLength = computedLength - url.length + 23;
        });
    }
    
    const maxChars = 280;
    const remaining = maxChars - computedLength;
    
    // Update Counter Text
    elements.charCounter.textContent = `${computedLength} / ${maxChars}`;
    
    // Color alert states
    elements.charCounter.className = 'char-limit-indicator-text';
    if (computedLength > 260 && computedLength <= 280) {
        elements.charCounter.classList.add('warning');
    } else if (computedLength > 280) {
        elements.charCounter.classList.add('danger');
    }
    
    // Disable submit if empty or too long
    elements.tweetSubmitBtn.disabled = computedLength === 0 || computedLength > 280;
    
    // Update Circular Progress Ring
    const percentage = Math.min(computedLength / maxChars, 1);
    const strokeDashoffset = RING_CIRCUMFERENCE - (percentage * RING_CIRCUMFERENCE);
    
    elements.charProgressRing.style.strokeDashoffset = strokeDashoffset;
    
    // Progress indicator color
    if (computedLength > 280) {
        elements.charProgressRing.style.stroke = 'var(--color-issue)'; // Red
    } else if (computedLength > 260) {
        elements.charProgressRing.style.stroke = 'var(--color-deprecated)'; // Orange
    } else {
        elements.charProgressRing.style.stroke = 'var(--accent)'; // Cyan/Blue
    }
}

function shareToX() {
    if (!state.selectedUpdate) return;
    
    const text = elements.tweetTextarea.value;
    if (text.length === 0) return;
    
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    
    showToast('Opening X/Twitter composer...');
    window.open(tweetUrl, '_blank', 'noopener,noreferrer');
}

/* ==========================================================================
   TOAST SYSTEM (NOTIFICATIONS)
   ========================================================================== */
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Customize layout
    let iconSvg = '';
    if (type === 'error') {
        iconSvg = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
        `;
    } else {
        iconSvg = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
        `;
    }
    
    toast.innerHTML = `
        ${iconSvg}
        <span>${message}</span>
    `;
    
    elements.toastContainer.appendChild(toast);
    
    // Fade out and remove after 4 seconds
    setTimeout(() => {
        toast.style.animation = 'slideInLeft 0.3s cubic-bezier(0.4, 0, 0.2, 1) reverse';
        toast.style.opacity = '0';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4000);
}
