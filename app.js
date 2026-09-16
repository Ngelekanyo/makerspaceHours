/* =========================================================
   D-SCHOOL HOURS TRACKER
   Frontend controller — Step 1
   Local shift state + resilient UI
   ========================================================= */

const API_URL =
    "https://script.google.com/a/macros/dschool.org.za/s/AKfycbxiYdXiPM7OCQO-OGR3tVmbLmwe7U50CyEe37ux8m9j6DxLWirG1B5IgXD4rGAGNsfo-g/exec";

const ACTIVE_SHIFT_KEY = "dschool_active_shift";

let activeShift = null;
let timerInterval = null;
let isRequesting = false;


/* =========================================================
   INITIALISE
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    setConnectionStatus("connecting");

    restoreLocalShift();
    setDefaultManualDate();

    // Load server data in the background.
    // The UI does NOT wait for this.
    loadHoursInBackground();
});


/* =========================================================
   API REQUEST
   ========================================================= */

function apiRequest(action, data = {}) {
    return new Promise((resolve, reject) => {

        const callbackName =
            "apiCallback_" +
            Date.now() +
            "_" +
            Math.floor(Math.random() * 1000);

        const params = new URLSearchParams({
            action,
            callback: callbackName,
            ...data
        });

        const script = document.createElement("script");

        const timeout = setTimeout(() => {
            cleanup();

            reject(
                new Error("Request timed out.")
            );
        }, 10000);

        window[callbackName] = function(result) {
            clearTimeout(timeout);
            cleanup();
            resolve(result);
        };

        script.onerror = function() {
            clearTimeout(timeout);
            cleanup();

            reject(
                new Error(
                    "Could not connect to the Hours Tracker backend."
                )
            );
        };

        script.src =
            `${API_URL}?${params.toString()}`;

        document.body.appendChild(script);

        function cleanup() {
            delete window[callbackName];

            if (script.parentNode) {
                script.parentNode.removeChild(script);
            }
        }
    });
}


/* =========================================================
   CLOCK TOGGLE
   ========================================================= */

async function toggleClock() {

    if (isRequesting) {
        return;
    }

    isRequesting = true;

    const button =
        document.getElementById("clockButton");

    button.disabled = true;

    try {

        if (activeShift) {

            await clockOut();

        } else {

            await clockIn();

        }

    } catch (error) {

        console.error(error);

        showMessage(
            error.message ||
            "Something went wrong."
        );

    } finally {

        isRequesting = false;

        updateClockButton();
    }
}


/* =========================================================
   CLOCK IN
   ========================================================= */

async function clockIn() {

    const description =
        prompt(
            "What are you working on? (Optional)"
        );

    // User cancelled the prompt.
    if (description === null) {
        return;
    }

    const result =
        await apiRequest(
            "clockIn",
            {
                description
            }
        );

    if (!result.success) {
        throw new Error(result.message);
    }

    /*
     * Use the server timestamp.
     * This means the official start time
     * comes from Google, not the user's PC.
     */

    const startTime =
        new Date(result.time);

    activeShift = {
        id: result.id,
        startTime: startTime.toISOString(),
        description
    };

    saveLocalShift();

    startLocalTimer();
    updateCurrentShiftUI();

    showMessage(
        "Clocked in successfully."
    );

    setConnectionStatus("connected");
}


/* =========================================================
   CLOCK OUT
   ========================================================= */

async function clockOut() {

    const result =
        await apiRequest("clockOut");

    if (!result.success) {
        throw new Error(result.message);
    }

    /*
     * Clear local state only after the
     * server confirms the clock-out.
     */

    activeShift = null;

    clearLocalShift();
    stopLocalTimer();

    updateCurrentShiftUI();

    showMessage(
        `Clocked out — ${formatHours(result.hours)} recorded.`
    );

    setConnectionStatus("connected");

    /*
     * Refresh the dashboard AFTER clock-out.
     * This happens once, not continuously.
     */

    await loadHours();
}


/* =========================================================
   LOCAL SHIFT STORAGE
   ========================================================= */

function saveLocalShift() {

    if (!activeShift) {
        return;
    }

    localStorage.setItem(
        ACTIVE_SHIFT_KEY,
        JSON.stringify(activeShift)
    );
}


function restoreLocalShift() {

    const saved =
        localStorage.getItem(
            ACTIVE_SHIFT_KEY
        );

    if (!saved) {
        updateCurrentShiftUI();
        return;
    }

    try {

        activeShift =
            JSON.parse(saved);

        if (
            !activeShift ||
            !activeShift.startTime
        ) {
            throw new Error(
                "Invalid saved shift."
            );
        }

        startLocalTimer();
        updateCurrentShiftUI();

    } catch (error) {

        console.error(
            "Could not restore local shift:",
            error
        );

        clearLocalShift();
        activeShift = null;

        updateCurrentShiftUI();
    }
}


function clearLocalShift() {

    localStorage.removeItem(
        ACTIVE_SHIFT_KEY
    );
}


/* =========================================================
   LOCAL TIMER
   ========================================================= */

function startLocalTimer() {

    stopLocalTimer();

    updateShiftTimer();

    timerInterval =
        setInterval(
            updateShiftTimer,
            1000
        );
}


function stopLocalTimer() {

    if (timerInterval) {

        clearInterval(
            timerInterval
        );

        timerInterval = null;
    }
}


function updateShiftTimer() {

    if (!activeShift) {
        return;
    }

    const start =
        new Date(
            activeShift.startTime
        );

    const now =
        new Date();

    const milliseconds =
        now - start;

    const seconds =
        Math.max(
            0,
            Math.floor(
                milliseconds / 1000
            )
        );

    const hours =
        Math.floor(
            seconds / 3600
        );

    const minutes =
        Math.floor(
            (seconds % 3600) / 60
        );

    const secs =
        seconds % 60;

    const shiftTime =
        document.getElementById(
            "shiftTime"
        );

    if (shiftTime) {

        shiftTime.textContent =
            `${pad(hours)}h ` +
            `${pad(minutes)}m ` +
            `${pad(secs)}s`;
    }
}


function pad(number) {

    return String(number)
        .padStart(2, "0");
}


/* =========================================================
   CURRENT SHIFT UI
   ========================================================= */

function updateCurrentShiftUI() {

    const status =
        document.getElementById(
            "shiftStatus"
        );

    const shiftTime =
        document.getElementById(
            "shiftTime"
        );

    const button =
        document.getElementById(
            "clockButton"
        );

    if (!status || !shiftTime || !button) {
        return;
    }

    if (activeShift) {

        status.textContent =
            "Currently working";

        status.classList.add(
            "active"
        );

        button.textContent =
            "CLOCK OUT";

        button.classList.add(
            "clocked-in"
        );

        updateShiftTimer();

    } else {

        status.textContent =
            "Not clocked in";

        status.classList.remove(
            "active"
        );

        shiftTime.textContent =
            "—";

        button.textContent =
            "CLOCK IN";

        button.classList.remove(
            "clocked-in"
        );
    }
}


function updateClockButton() {

    const button =
        document.getElementById(
            "clockButton"
        );

    if (!button) {
        return;
    }

    button.disabled =
        isRequesting;

    updateCurrentShiftUI();
}


/* =========================================================
   LOAD SERVER DATA
   ========================================================= */

async function loadHoursInBackground() {

    try {

        await loadHours();

        setConnectionStatus(
            "connected"
        );

    } catch (error) {

        console.error(error);

        /*
         * Do NOT destroy the local shift state
         * if the API happens to be unavailable.
         */

        setConnectionStatus(
            "error"
        );
    }
}


async function loadHours() {

    const hours =
        await getHoursData();

    updateTodayTotal(hours);

    renderHistory(hours);

    /*
     * Only use server data to recover
     * from a missing local state.
     *
     * We don't overwrite a known local
     * active shift here.
     */

    if (!activeShift) {

        const serverActiveShift =
            hours.find(
                entry =>
                    !entry.endTime
            );

        if (serverActiveShift) {

            activeShift = {
                id: serverActiveShift.id,
                startTime:
                    new Date(
                        serverActiveShift.startTime
                    ).toISOString(),
                description:
                    serverActiveShift.description || ""
            };

            saveLocalShift();

            startLocalTimer();
            updateCurrentShiftUI();
        }
    }
}


async function getHoursData() {

    const result =
        await apiRequest(
            "getHours"
        );

    if (!result.success) {
        throw new Error(
            result.message
        );
    }

    return result.data;
}


/* =========================================================
   TODAY'S TOTAL
   ========================================================= */

function updateTodayTotal(hours) {

    const today =
        new Date()
            .toISOString()
            .split("T")[0];

    let total = 0;

    hours.forEach(entry => {

        const entryDate =
            formatDateForComparison(
                entry.date
            );

        if (
            entryDate === today &&
            entry.hours
        ) {
            total +=
                Number(entry.hours);
        }
    });

    /*
     * Include the currently running
     * shift in today's live total.
     */

    if (activeShift) {

        const start =
            new Date(
                activeShift.startTime
            );

        const now =
            new Date();

        const liveHours =
            (now - start) /
            (1000 * 60 * 60);

        total += liveHours;
    }

    const element =
        document.getElementById(
            "todayHours"
        );

    if (element) {

        element.textContent =
            formatHours(total);
    }
}


/* =========================================================
   HISTORY
   ========================================================= */

function renderHistory(hours) {

    const container =
        document.getElementById(
            "hoursList"
        );

    if (!container) {
        return;
    }

    const completed =
        hours
            .filter(
                entry =>
                    entry.endTime
            )
            .sort(
                (a, b) =>
                    new Date(b.date) -
                    new Date(a.date)
            )
            .slice(0, 10);

    if (!completed.length) {

        container.innerHTML =
            `<p class="empty-state">
                No completed hours yet.
            </p>`;

        return;
    }

    container.innerHTML =
        completed
            .map(createHourEntry)
            .join("");
}


function createHourEntry(entry) {

    const date =
        formatDate(entry.date);

    const hours =
        formatHours(
            Number(entry.hours) || 0
        );

    const description =
        entry.description ||
        "Work session";

    const status =
        (entry.status || "Pending")
            .toLowerCase();

    return `
        <div class="hour-entry">

            <div class="hour-main">

                <div class="hour-date">
                    ${date}
                </div>

                <div class="hour-description">
                    ${escapeHtml(description)}
                </div>

            </div>

            <div class="hour-meta">

                <div class="hour-total">
                    ${hours}
                </div>

                <div class="badge ${status}">
                    ${entry.status}
                </div>

            </div>

        </div>
    `;
}


/* =========================================================
   MANUAL ENTRY
   ========================================================= */

async function submitManualHours() {

    const date =
        document.getElementById(
            "manualDate"
        ).value;

    const startTime =
        document.getElementById(
            "manualStart"
        ).value;

    const endTime =
        document.getElementById(
            "manualEnd"
        ).value;

    const description =
        document.getElementById(
            "manualDescription"
        ).value;

    if (
        !date ||
        !startTime ||
        !endTime
    ) {

        showMessage(
            "Please enter a date, start time and end time."
        );

        return;
    }

    try {

        const result =
            await apiRequest(
                "addManualHours",
                {
                    date,
                    startTime,
                    endTime,
                    description
                }
            );

        if (!result.success) {
            throw new Error(
                result.message
            );
        }

        closeManualEntry();

        showMessage(
            "Hours submitted successfully."
        );

        await loadHours();

    } catch (error) {

        console.error(error);

        showMessage(
            error.message
        );
    }
}


/* =========================================================
   MODAL
   ========================================================= */

function openManualEntry() {

    document
        .getElementById(
            "manualModal"
        )
        .classList.remove(
            "hidden"
        );
}


function closeManualEntry() {

    document
        .getElementById(
            "manualModal"
        )
        .classList.add(
            "hidden"
        );
}


function setDefaultManualDate() {

    const input =
        document.getElementById(
            "manualDate"
        );

    if (!input) {
        return;
    }

    const today =
        new Date();

    input.value =
        today
            .toISOString()
            .split("T")[0];
}


/* =========================================================
   CONNECTION STATUS
   ========================================================= */

function setConnectionStatus(state) {

    const element =
        document.getElementById(
            "connectionStatus"
        );

    if (!element) {
        return;
    }

    element.classList.remove(
        "connected",
        "error",
        "connecting"
    );

    element.classList.add(
        state
    );
}


/* =========================================================
   MESSAGES
   ========================================================= */

function showMessage(message) {

    console.log(
        "[D-SCHOOL HOURS]",
        message
    );

    /*
     * For now we use a browser notification.
     * We can replace this with a proper
     * in-app toast later.
     */

    alert(message);
}


/* =========================================================
   FORMATTERS
   ========================================================= */

function formatHours(hours) {

    hours =
        Number(hours) || 0;

    const totalMinutes =
        Math.round(
            hours * 60
        );

    const h =
        Math.floor(
            totalMinutes / 60
        );

    const m =
        totalMinutes % 60;

    return `${h}h ${String(m).padStart(2, "0")}m`;
}


function formatDate(dateValue) {

    const date =
        new Date(dateValue);

    if (isNaN(date)) {
        return "Unknown date";
    }

    return date.toLocaleDateString(
        "en-ZA",
        {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }
    );
}


function formatDateForComparison(dateValue) {

    const date =
        new Date(dateValue);

    if (isNaN(date)) {
        return "";
    }

    return date
        .toISOString()
        .split("T")[0];
}


function escapeHtml(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
