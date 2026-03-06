/* ================================================================
   GOMEAL — TABLE-SELECT.JS
   File: public/js/user/table-select.js

   Luồng hoạt động:
     1. Slideshow (4s/slide) — clone pattern từ login.html
     2. loadTables()        — GET /api/user/public/tables
     3. renderTableGrid()   — render bàn, bind click
     4. selectTable()       — lưu state, hiển thị selected-bar, enable btn
     5. openQrModal()       — hiện QR từ /uploads/qrcodes/qr_table_N.png
     6. startPolling()      — setInterval 2s → GET /api/user/public/table/check-session/N
     7. onVerified()        — clearInterval, lưu localStorage, redirect
     8. cancelQr()          — clearInterval, đóng modal, reset state

   APIs dùng (đã có trong user.routes.js):
     GET /api/user/public/tables
     GET /api/user/public/table/check-session/:tableNumber

   Không tạo route mới. Không phá layout user.
   ================================================================ */

'use strict';

/* ================================================================
   0. DOM REFERENCES (lấy 1 lần tại init, không query lặp)
   ================================================================ */
const DOM = {};

function _cacheDom() {
    // Slideshow
    DOM.slideTrack   = document.getElementById('slideTrack');
    DOM.slides       = document.querySelectorAll('.slide');
    DOM.dots         = document.querySelectorAll('.dot-btn');

    // Floating badge (left panel)
    DOM.tfActive     = document.getElementById('tfActiveTables');
    DOM.tfFree       = document.getElementById('tfFreeTables');

    // Alert
    DOM.pageAlert    = document.getElementById('pageAlert');
    DOM.alertIcon    = document.getElementById('alertIcon');
    DOM.alertMsg     = document.getElementById('alertMsg');

    // Table grid
    DOM.loadingGrid      = document.getElementById('loadingGrid');
    DOM.tableGridWrap    = document.getElementById('tableGridWrap');
    DOM.tableGrid        = document.getElementById('tableGrid');

    // Selected bar
    DOM.selectedBar      = document.getElementById('selectedBar');
    DOM.selectedBarTitle = document.getElementById('selectedBarTitle');
    DOM.selectedBarSub   = document.getElementById('selectedBarSub');
    DOM.clearSelectionBtn= document.getElementById('clearSelectionBtn');

    // CTA
    DOM.btnConfirm       = document.getElementById('btnConfirm');
    DOM.btnLabel         = DOM.btnConfirm ? DOM.btnConfirm.querySelector('.blabel') : null;

    // QR modal
    DOM.qrOverlay    = document.getElementById('qrOverlay');
    DOM.qrModal      = document.getElementById('qrModal');
    DOM.qrCloseBtn   = document.getElementById('qrCloseBtn');
    DOM.qrTableBadge = document.getElementById('qrTableBadge');
    DOM.qrImage      = document.getElementById('qrImage');
    DOM.qrFallback   = document.getElementById('qrFallback');
    DOM.qrStep2      = document.getElementById('qrStep2');
    DOM.qrStep3      = document.getElementById('qrStep3');
    DOM.qrStatusBar  = document.getElementById('qrStatusBar');
    DOM.qrStatusText = document.getElementById('qrStatusText');
    DOM.qrCancelBtn  = document.getElementById('qrCancelBtn');

    // Success overlay
    DOM.successOverlay = document.getElementById('successOverlay');
}


/* ================================================================
   1. STATE
   ================================================================ */
const STATE = {
    tables:          [],    // array từ API
    selectedTable:   null,  // { id, table_number, capacity, status }
    pollTimer:       null,  // setInterval handle
    slideIndex:      0,
    slideTimer:      null,
    isPolling:       false,
    redirecting:     false,
};


/* ================================================================
   2. SLIDESHOW (4 giây/slide — giống login.html)
   ================================================================ */
function _goToSlide(idx) {
    try {
        if (!DOM.slides || !DOM.slides.length) return;
        if (idx === STATE.slideIndex) return;

        // Mark current leaving
        DOM.slides[STATE.slideIndex].classList.remove('is-active');
        DOM.slides[STATE.slideIndex].classList.add('is-leaving');
        if (DOM.dots[STATE.slideIndex]) DOM.dots[STATE.slideIndex].classList.remove('is-active');

        const prev = STATE.slideIndex;
        setTimeout(function () {
            try { DOM.slides[prev].classList.remove('is-leaving'); } catch (_) {}
        }, 1400);

        STATE.slideIndex = idx;
        DOM.slides[STATE.slideIndex].classList.add('is-active');
        if (DOM.dots[STATE.slideIndex]) DOM.dots[STATE.slideIndex].classList.add('is-active');
    } catch (_) {}
}

function _nextSlide() {
    try {
        _goToSlide((STATE.slideIndex + 1) % (DOM.slides ? DOM.slides.length : 1));
    } catch (_) {}
}

function _startSlideShow() {
    try {
        if (STATE.slideTimer) clearInterval(STATE.slideTimer);
        STATE.slideTimer = setInterval(_nextSlide, 4000); // 4s như yêu cầu
    } catch (_) {}
}

function _initSlideshow() {
    try {
        // Dot click
        if (DOM.dots) {
            DOM.dots.forEach(function (dot) {
                dot.addEventListener('click', function () {
                    try {
                        const idx = parseInt(this.getAttribute('data-idx'), 10);
                        if (!isNaN(idx)) {
                            _goToSlide(idx);
                            _startSlideShow(); // reset timer
                        }
                    } catch (_) {}
                });
            });
        }

        // Touch swipe
        if (DOM.slideTrack) {
            let _startX = 0;
            DOM.slideTrack.addEventListener('touchstart', function (e) {
                _startX = e.touches[0].clientX;
            }, { passive: true });
            DOM.slideTrack.addEventListener('touchend', function (e) {
                try {
                    const diff = _startX - e.changedTouches[0].clientX;
                    if (Math.abs(diff) > 50) {
                        if (diff > 0) {
                            _goToSlide((STATE.slideIndex + 1) % DOM.slides.length);
                        } else {
                            _goToSlide((STATE.slideIndex - 1 + DOM.slides.length) % DOM.slides.length);
                        }
                        _startSlideShow();
                    }
                } catch (_) {}
            }, { passive: true });
        }

        _startSlideShow();
    } catch (err) {
        console.warn('[TableSelect] _initSlideshow error:', err.message);
    }
}


/* ================================================================
   3. ALERT HELPERS
   ================================================================ */
function _showAlert(msg, type) {
    try {
        if (!DOM.pageAlert) return;
        const iconMap = {
            error: 'fas fa-circle-exclamation',
            ok:    'fas fa-circle-check',
            info:  'fas fa-circle-info',
        };
        DOM.pageAlert.className = 'ts-alert show ' + (type || 'error');
        if (DOM.alertIcon) DOM.alertIcon.className = iconMap[type] || iconMap.error;
        if (DOM.alertMsg)  DOM.alertMsg.textContent  = msg || '';
    } catch (_) {}
}

function _hideAlert() {
    try {
        if (DOM.pageAlert) DOM.pageAlert.className = 'ts-alert';
    } catch (_) {}
}


/* ================================================================
   4. LOAD TABLES — GET /api/user/public/tables
   ================================================================ */
async function loadTables() {
    try {
        _hideAlert();
        _showLoadingState(true);

        const res = await fetch('/api/user/public/tables', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!res.ok) {
            throw new Error('HTTP ' + res.status);
        }

        let data = null;
        try {
            const txt = await res.text();
            if (txt && txt.trim()) data = JSON.parse(txt);
        } catch (_) {
            data = null;
        }

        if (!Array.isArray(data)) {
            throw new Error('Dữ liệu bàn không hợp lệ từ server.');
        }

        STATE.tables = data;
        _showLoadingState(false);
        _renderTableGrid(data);
        _updateFloatingBadge(data);

    } catch (err) {
        console.warn('[TableSelect] loadTables error:', err.message);
        _showLoadingState(false);
        _showAlert('Không thể tải sơ đồ bàn. Vui lòng tải lại trang.', 'error');
        // Show retry button
        _showRetryOption();
    }
}

function _showLoadingState(on) {
    try {
        if (DOM.loadingGrid)   DOM.loadingGrid.style.display   = on ? 'grid' : 'none';
        if (DOM.tableGridWrap) DOM.tableGridWrap.style.display  = on ? 'none' : 'block';
    } catch (_) {}
}

function _showRetryOption() {
    try {
        if (!DOM.tableGrid) return;
        DOM.tableGridWrap.style.display = 'block';
        DOM.tableGrid.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:24px 0">
                <div style="font-size:2rem;margin-bottom:8px">⚠️</div>
                <p style="font-size:.82rem;color:#9CA3AF;margin-bottom:12px">Không tải được dữ liệu bàn</p>
                <button onclick="loadTables()"
                    style="background:linear-gradient(135deg,#FF6B35,#F7931E);color:#fff;border:none;
                           border-radius:10px;padding:8px 20px;font-family:'Outfit',sans-serif;
                           font-size:.82rem;font-weight:700;cursor:pointer">
                    <i class="fas fa-rotate-right"></i> Thử lại
                </button>
            </div>
        `;
    } catch (_) {}
}


/* ================================================================
   5. RENDER TABLE GRID
   ================================================================ */
function _renderTableGrid(tables) {
    try {
        if (!DOM.tableGrid) return;

        if (!tables || tables.length === 0) {
            DOM.tableGrid.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;padding:24px 0;color:#9CA3AF;font-size:.84rem">
                    Không có bàn nào khả dụng
                </div>
            `;
            return;
        }

        // Sort: available first, then occupied
        const sorted = [...tables].sort(function (a, b) {
            if (a.status === 'available' && b.status !== 'available') return -1;
            if (a.status !== 'available' && b.status === 'available') return 1;
            return (a.table_number || 0) - (b.table_number || 0);
        });

        DOM.tableGrid.innerHTML = sorted.map(function (table) {
            const isOccupied = table.status !== 'available';
            const cap        = table.capacity || '?';
            const num        = table.table_number;

            return `
                <button
                    class="table-btn ${isOccupied ? 'occupied' : ''}"
                    data-id="${table.id}"
                    data-num="${num}"
                    data-cap="${cap}"
                    data-status="${table.status || 'available'}"
                    ${isOccupied ? 'disabled aria-disabled="true"' : ''}
                    title="${isOccupied ? 'Bàn đang có khách' : 'Bàn ' + num + ' — ' + cap + ' người'}"
                    aria-label="Bàn số ${num}${isOccupied ? ', đang có khách' : ''}"
                >
                    <span class="tb-num">${num}</span>
                    <span class="tb-icon"><i class="fas fa-users"></i></span>
                    <span class="tb-cap">${cap} người</span>
                </button>
            `;
        }).join('');

        // Bind click events
        DOM.tableGrid.querySelectorAll('.table-btn:not(.occupied)').forEach(function (btn) {
            btn.addEventListener('click', function () {
                try {
                    const id     = parseInt(this.getAttribute('data-id'), 10);
                    const num    = parseInt(this.getAttribute('data-num'), 10);
                    const cap    = parseInt(this.getAttribute('data-cap'), 10);
                    const status = this.getAttribute('data-status');

                    const tableObj = { id, table_number: num, capacity: cap, status };
                    selectTable(tableObj);
                } catch (_) {}
            });
        });

    } catch (err) {
        console.warn('[TableSelect] _renderTableGrid error:', err.message);
    }
}


/* ================================================================
   6. UPDATE FLOATING BADGE (left panel stats)
   ================================================================ */
function _updateFloatingBadge(tables) {
    try {
        if (!Array.isArray(tables)) return;
        const occupied = tables.filter(function (t) { return t.status !== 'available'; }).length;
        const free     = tables.filter(function (t) { return t.status === 'available'; }).length;

        if (DOM.tfActive) DOM.tfActive.textContent = occupied;
        if (DOM.tfFree)   DOM.tfFree.textContent   = free;
        // Sync hero stat cards
        var a2=document.getElementById('tfActiveTables2'); if(a2) a2.textContent=occupied;
        var f2=document.getElementById('tfFreeTables2');   if(f2) f2.textContent=free;
    } catch (_) {}
}


/* ================================================================
   7. SELECT TABLE — cập nhật UI, không mở modal ngay
   ================================================================ */
function selectTable(tableObj) {
    try {
        if (!tableObj) return;

        // Nếu click lại bàn đang chọn → bỏ chọn
        if (STATE.selectedTable && STATE.selectedTable.id === tableObj.id) {
            clearSelection();
            return;
        }

        STATE.selectedTable = tableObj;
        _hideAlert();

        // Update table button UI
        DOM.tableGrid.querySelectorAll('.table-btn').forEach(function (btn) {
            btn.classList.remove('selected');
        });
        const activeBtn = DOM.tableGrid.querySelector(
            '.table-btn[data-id="' + tableObj.id + '"]'
        );
        if (activeBtn) activeBtn.classList.add('selected');

        // Show selected bar
        if (DOM.selectedBar)      DOM.selectedBar.classList.add('show');
        if (DOM.selectedBarTitle) DOM.selectedBarTitle.textContent = 'Bàn số ' + tableObj.table_number;
        if (DOM.selectedBarSub)   DOM.selectedBarSub.textContent   = 'Sức chứa ' + tableObj.capacity + ' người';

        // Enable confirm button
        if (DOM.btnConfirm) {
            DOM.btnConfirm.disabled = false;
            if (DOM.btnLabel) DOM.btnLabel.textContent = 'Xác nhận bàn ' + tableObj.table_number;
        }

    } catch (err) {
        console.warn('[TableSelect] selectTable error:', err.message);
    }
}


/* ================================================================
   8. CLEAR SELECTION
   ================================================================ */
function clearSelection() {
    try {
        STATE.selectedTable = null;

        // Remove selected class from all buttons
        if (DOM.tableGrid) {
            DOM.tableGrid.querySelectorAll('.table-btn').forEach(function (btn) {
                btn.classList.remove('selected');
            });
        }

        // Hide selected bar
        if (DOM.selectedBar) DOM.selectedBar.classList.remove('show');

        // Disable confirm button
        if (DOM.btnConfirm) {
            DOM.btnConfirm.disabled = true;
            if (DOM.btnLabel) DOM.btnLabel.textContent = 'Chọn bàn để tiếp tục';
        }
    } catch (err) {
        console.warn('[TableSelect] clearSelection error:', err.message);
    }
}


/* ================================================================
   9. OPEN QR MODAL
   ================================================================ */
function openQrModal() {
    try {
        const table = STATE.selectedTable;
        if (!table) {
            _showAlert('Vui lòng chọn một bàn trước.', 'error');
            return;
        }

        // Set loading state on button
        _setBtnLoading(true);

        // Populate modal
        if (DOM.qrTableBadge) DOM.qrTableBadge.textContent = 'Bàn ' + table.table_number;

        // Load QR image: /uploads/qrcodes/qr_table_[Số bàn].png
        const qrUrl = '/uploads/qrcodes/qr_table_' + table.table_number + '.png';
        if (DOM.qrImage) {
            // Reset fallback first
            DOM.qrImage.style.display = 'block';
            if (DOM.qrFallback) DOM.qrFallback.style.display = 'none';
            DOM.qrImage.src = qrUrl;
        }

        // Reset step states
        if (DOM.qrStep2) DOM.qrStep2.classList.remove('done');
        if (DOM.qrStep3) DOM.qrStep3.classList.remove('done');

        // Reset status bar
        _setQrStatus('waiting', 'Đang chờ quét QR...');

        // Show overlay
        if (DOM.qrOverlay) {
            DOM.qrOverlay.classList.add('show');
            document.body.style.overflow = 'hidden';
        }

        // Reset button state (close loading)
        _setBtnLoading(false);

        // Start polling
        startPolling(table.table_number);

    } catch (err) {
        console.warn('[TableSelect] openQrModal error:', err.message);
        _setBtnLoading(false);
        _showAlert('Có lỗi khi mở QR. Vui lòng thử lại.', 'error');
    }
}


/* ================================================================
   10. CLOSE QR MODAL / CANCEL
   ================================================================ */
function cancelQr() {
    try {
        stopPolling();

        if (DOM.qrOverlay) {
            DOM.qrOverlay.classList.remove('show');
            document.body.style.overflow = '';
        }

        // Reset QR image (tránh cache cũ hiện khi mở lại)
        if (DOM.qrImage) DOM.qrImage.src = '';

        // Reset status
        _setQrStatus('waiting', 'Đang chờ quét QR...');

        // Không reset selectedTable — user vẫn giữ bàn đã chọn
    } catch (err) {
        console.warn('[TableSelect] cancelQr error:', err.message);
    }
}


/* ================================================================
   11. POLLING — GET /api/user/public/table/check-session/:tableNumber
   ================================================================ */
function startPolling(tableNumber) {
    try {
        // Bảo vệ: nếu đang poll → dừng timer cũ trước
        stopPolling();

        STATE.isPolling = true;

        STATE.pollTimer = setInterval(async function () {
            try {
                await _pollOnce(tableNumber);
            } catch (pollErr) {
                console.warn('[TableSelect] poll tick error:', pollErr.message);
            }
        }, 2000); // 2 giây

        console.log('[TableSelect] Polling started for table:', tableNumber);
    } catch (err) {
        console.warn('[TableSelect] startPolling error:', err.message);
    }
}

function stopPolling() {
    try {
        if (STATE.pollTimer !== null) {
            clearInterval(STATE.pollTimer);
            STATE.pollTimer = null;
            console.log('[TableSelect] Polling stopped.');
        }
        STATE.isPolling = false;
    } catch (_) {}
}

async function _pollOnce(tableNumber) {
    // Nếu đã redirect → không poll thêm
    if (STATE.redirecting) {
        stopPolling();
        return;
    }

    try {
        const res = await fetch(
            '/api/user/public/table/check-session/' + tableNumber,
            { method: 'GET', headers: { 'Content-Type': 'application/json' } }
        );

        if (!res.ok) {
            // Server error — log nhưng không crash polling
            console.warn('[TableSelect] Poll response not OK:', res.status);
            return;
        }

        let data = null;
        try {
            const txt = await res.text();
            if (txt && txt.trim()) data = JSON.parse(txt);
        } catch (_) {
            return;
        }

        if (!data) return;

        if (data.status === 'verified') {
            // ═══ THEN CHỐT: Stop polling NGAY LẬP TỨC ═══
            stopPolling();
            onVerified(data);

        } else if (data.status === 'waiting') {
            // Vẫn chờ — cập nhật UI nhẹ
            _setQrStatus('waiting', 'Đang chờ quét QR...');
        }

    } catch (netErr) {
        // Lỗi mạng — không crash polling, thử lại lần sau
        console.warn('[TableSelect] Poll network error:', netErr.message);
    }
}


/* ================================================================
   12. ON VERIFIED — Lưu session và redirect
   ================================================================ */
function onVerified(data) {
    try {
        // Guard: chỉ xử lý 1 lần
        if (STATE.redirecting) return;
        STATE.redirecting = true;

        // Cập nhật QR step UI
        if (DOM.qrStep2) DOM.qrStep2.classList.add('done');
        if (DOM.qrStep3) DOM.qrStep3.classList.add('done');
        _setQrStatus('verified', 'Xác thực thành công! Đang mở menu...');

        // === LƯU VÀO LOCALSTORAGE (đúng key theo common.js) ===
        try {
            // guestToken → key: 'guestToken'
            if (data.guest_token) {
                localStorage.setItem('guestToken', data.guest_token);
            }

            // tableId → key: 'tableId'
            if (data.table_id) {
                localStorage.setItem('tableId', String(data.table_id));
            }

            // tableName → key: 'tableName' (bổ sung để hiển thị trong topbar)
            if (data.table_number) {
                localStorage.setItem('tableName', 'Bàn ' + data.table_number);
            }

            // Xóa authToken cũ nếu có (phân biệt rõ guest vs member)
            // KHÔNG xóa — giữ nguyên để member vẫn nhận dạng được
        } catch (storageErr) {
            console.warn('[TableSelect] localStorage write error:', storageErr.message);
            // Tiếp tục redirect dù không lưu được
        }

        // Đóng QR modal
        if (DOM.qrOverlay) DOM.qrOverlay.classList.remove('show');

        // Hiện success overlay
        if (DOM.successOverlay) {
            DOM.successOverlay.classList.add('show');
            document.body.style.overflow = 'hidden';
        }

        // Redirect sau 1.8s (khớp với progress bar animation 1.6s + buffer)
        setTimeout(function () {
            try {
                window.location.href = '/views/user/menu.html';
            } catch (_) {
                window.location.replace('/views/user/menu.html');
            }
        }, 1800);

    } catch (err) {
        console.warn('[TableSelect] onVerified error:', err.message);
        // Fallback redirect ngay nếu lỗi UI
        try {
            window.location.href = '/views/user/menu.html';
        } catch (_) {}
    }
}


/* ================================================================
   13. QR STATUS BAR HELPER
   ================================================================ */
function _setQrStatus(type, text) {
    try {
        if (!DOM.qrStatusBar) return;
        DOM.qrStatusBar.className = 'qr-status-bar ' + (type || 'waiting');
        if (DOM.qrStatusText) DOM.qrStatusText.textContent = text || '';
    } catch (_) {}
}


/* ================================================================
   14. BUTTON LOADING STATE
   ================================================================ */
function _setBtnLoading(on) {
    try {
        if (!DOM.btnConfirm) return;
        DOM.btnConfirm.classList.toggle('loading', on);
        DOM.btnConfirm.disabled = on;
    } catch (_) {}
}


/* ================================================================
   15. INIT EVENT LISTENERS
   ================================================================ */
function _initEventListeners() {
    try {
        // Confirm button → open QR modal
        if (DOM.btnConfirm) {
            DOM.btnConfirm.addEventListener('click', function (e) {
                try {
                    e.preventDefault();
                    openQrModal();
                } catch (_) {}
            });
        }

        // Clear selection button
        if (DOM.clearSelectionBtn) {
            DOM.clearSelectionBtn.addEventListener('click', function () {
                clearSelection();
            });
        }

        // QR modal close (X button)
        if (DOM.qrCloseBtn) {
            DOM.qrCloseBtn.addEventListener('click', function () {
                cancelQr();
            });
        }

        // QR cancel button
        if (DOM.qrCancelBtn) {
            DOM.qrCancelBtn.addEventListener('click', function () {
                cancelQr();
            });
        }

        // Click outside modal to close
        if (DOM.qrOverlay) {
            DOM.qrOverlay.addEventListener('click', function (e) {
                try {
                    if (e.target === DOM.qrOverlay) {
                        cancelQr();
                    }
                } catch (_) {}
            });
        }

        // ESC key
        document.addEventListener('keydown', function (e) {
            try {
                if (e.key === 'Escape') {
                    if (DOM.qrOverlay && DOM.qrOverlay.classList.contains('show')) {
                        cancelQr();
                    }
                }
            } catch (_) {}
        });

    } catch (err) {
        console.warn('[TableSelect] _initEventListeners error:', err.message);
    }
}


/* ================================================================
   16. GUARD — Kiểm tra nếu đã có guestToken hợp lệ → skip table-select
   Nếu đã verify → vào thẳng menu.html
   ================================================================ */
function _checkExistingSession() {
    try {
        const existingGuest = localStorage.getItem('guestToken');
        const existingTable = localStorage.getItem('tableId');

        if (existingGuest && existingTable) {
            // Có session cũ — hỏi user có muốn tiếp tục không
            // Không tự redirect để tránh loop nếu token đã hết hạn
            // Chỉ hiện thông báo
            _showAlert(
                'Bạn đang có phiên làm việc tại Bàn ' +
                (localStorage.getItem('tableName') || existingTable) +
                '. Chọn bàn mới để bắt đầu lại.',
                'info'
            );
        }
    } catch (_) {}
}


/* ================================================================
   17. EXPOSE PUBLIC API (cho HTML onclick hoặc debug)
   ================================================================ */
window.loadTables    = loadTables;
window.selectTable   = selectTable;
window.clearSelection= clearSelection;
window.openQrModal   = openQrModal;
window.cancelQr      = cancelQr;
window.startPolling  = startPolling;
window.stopPolling   = stopPolling;


/* ================================================================
   18. ENTRY POINT
   ================================================================ */
document.addEventListener('DOMContentLoaded', function tableSelectInit() {
    try {
        // 1. Cache DOM references
        _cacheDom();

        // 2. Init slideshow (4s)
        _initSlideshow();

        // 3. Bind event listeners
        _initEventListeners();

        // 4. Check existing session
        _checkExistingSession();

        // 5. Load table data from API
        loadTables();

        console.log('[TableSelect] Initialized successfully.');
    } catch (err) {
        console.error('[TableSelect] Init error:', err.message);
    }
});