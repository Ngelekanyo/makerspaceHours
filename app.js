/* =========================================================
   D-SCHOOL HOURS TRACKER
   FRONTEND CONTROLLER
   V2
   ========================================================= */


/* =========================================================
   CONFIGURATION
   ========================================================= */

const API_URL =
    "https://script.google.com/macros/s/AKfycbyTf7RqC7danMLSfEMTNRQIMYKiGJn5MVFYm3vYqqfrcvOz-jGJLl9UAIz1yOXLm3w/exec";

const ACTIVE_SHIFT_KEY = "dschool_active_shift";


/* =========================================================
   STARTUP
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    setConnectionStatus("connecting");

    setDefaultManualDate();

    restoreActiveShift();

    loadHours();

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

        let finished = false;

        const timeout = setTimeout(() => {

            if (finished) return;

            finished = true;

            cleanup();

            reject(
                new Error("Request timed out.")
            );

        }, 15000);


        window[callbackName] = function(result) {

            if (finished) return;

            finished = true;

            clearTimeout(timeout);

            cleanup();

            resolve(result);

        };


        script.onload = function() {

            /*
             * JSONP should execute the callback before onload.
             * If it doesn't, the timeout will handle the failure.
             */

        };


        script.onerror = function() {

            if (finished) return;

            finished = true;

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
   LOCAL ACTIVE SHIFT
   ========================================================= */

function saveActiveShift(startTime) {

    localStorage.setItem(
        ACTIVE_SHIFT_KEY,
        JSON.stringify({
            startTime: startTime
        })
    );

}


function getActiveShift() {

    const stored =
        localStorage.getItem(ACTIVE_SHIFT_KEY);

    if (!stored) {
        return null;
    }

    try {

        return JSON.parse(stored);

    } catch (error) {

        localStorage.removeItem(ACTIVE_SHIFT_KEY);

        return null;

    }

}


function clearActiveShift() {

    localStorage.removeItem(
        ACTIVE_SHIFT_KEY
    );

}


/* =========================================================
   RESTORE ACTIVE SHIFT
   ========================================================= */

function restoreActiveShift() {

    const activeShift =
        getActiveShift();

    if (!activeShift) {
        return;
    }

    updateShiftDisplay(
        new Date(activeShift.startTime)
    );

    startLocalTimer();

}


/* =========================================================
   CLOCK IN / OUT
   ========================================================= */

async function toggleClock() {

    const button =
        document.getElementById("clockButton");

    button.disabled = true;


    try {

        const activeShift =
            getActiveShift();


        /* =========================
           CLOCK OUT
           ========================= */

        if (activeShift) {

            const result =
                await apiRequest("clockOut");


            if (!result.success) {

                /*
                 * If the backend says there is no active shift,
                 * clear our local state so the two sides agree.
                 */

                if (
                    result.message &&
                    result.message
                        .toLowerCase()
                        .includes("not currently")
                ) {
                    clearActiveShift();
                    stopLocalTimer();
                    await loadHours();
                }

                throw new Error(
                    result.message
                );

            }


            clearActiveShift();

            stopLocalTimer();


            alert(
                `Clocked out.\n\nHours worked: ${formatHours(result.hours)}`
            );


            await loadHours();

            return;

        }


        /* =========================
           CLOCK IN
           ========================= */

        const result =
            await apiRequest(
                "clockIn",
                {
                    description: ""
                }
            );


        if (!result.success) {
            throw new Error(result.message);
        }


        /*
         * Use the backend timestamp when available.
         * This keeps the local timer aligned with the recorded shift.
         */

        const startTime =
            result.time || new Date().toISOString();


        saveActiveShift(startTime);

        updateShiftDisplay(
            new Date(startTime)
        );

        startLocalTimer();


        alert(
            "Clocked in successfully."
        );


        await loadHours();


    } catch (error) {

        console.error(error);

        alert(
            "Something went wrong:\n\n" +
            error.message
        );

    } finally {

        button.disabled = false;

    }

}


/* =========================================================
   LOCAL TIMER
   ========================================================= */

let timerInterval = null;


function startLocalTimer() {

    stopLocalTimer();

    updateLocalTimer();

    timerInterval =
        setInterval(
            updateLocalTimer,
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


function updateLocalTimer() {

    const activeShift =
        getActiveShift();

    if (!activeShift) {
        return;
    }


    const start =
        new Date(
            activeShift.startTime
        );

    const now =
        new Date();


    const elapsed =
        now - start;


    if (elapsed < 0) {
        return;
    }


    const totalSeconds =
        Math.floor(
            elapsed / 1000
        );


    const hours =
        Math.floor(
            totalSeconds / 3600
        );


    const minutes =
        Math.floor(
            (totalSeconds % 3600) / 60
        );


    const seconds =
        totalSeconds % 60;


    const time =
        document.getElementById(
            "shiftTime"
        );


    if (time) {

        time.textContent =
            `Started at ${formatTime(start)} · ` +
            `${hours}h ` +
            `${String(minutes).padStart(2, "0")}m ` +
            `${String(seconds).padStart(2, "0")}s`;

    }

}


function updateShiftDisplay(startTime) {

    const status =
        document.getElementById(
            "shiftStatus"
        );

    const time =
        document.getElementById(
            "shiftTime"
        );

    const button =
        document.getElementById(
            "clockButton"
        );


    status.textContent =
        "Currently clocked in";


    time.textContent =
        `Started at ${formatTime(startTime)}`;


    button.textContent =
        "CLOCK OUT";

}


/* =========================================================
   LOAD HOURS
   ========================================================= */

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


async function loadHours() {

    try {

        const hours =
            await getHoursData();


        setConnectionStatus(
            "connected"
        );


        /*
         * Synchronise local active-shift state with
         * the backend when the page loads.
         */

        const activeShift =
            hours.find(
                entry => !entry.endTime
            );


        if (activeShift) {

            saveActiveShift(
                activeShift.startTime
            );

            updateShiftDisplay(
                new Date(
                    activeShift.startTime
                )
            );

            startLocalTimer();

        } else {

            clearActiveShift();

            stopLocalTimer();

            updateCurrentShift(
                hours
            );

        }


        updateTodayTotal(
            hours
        );


        renderHistory(
            hours
        );


    } catch (error) {

        console.error(error);

        setConnectionStatus(
            "error"
        );


        /*
         * IMPORTANT:
         * If we already have an active shift stored locally,
         * do NOT destroy it just because the API is unavailable.
         */

        if (!getActiveShift()) {

            document.getElementById(
                "hoursList"
            ).innerHTML = `
                <p class="empty-state">
                    Could not load hours.
                </p>
            `;

        }

    }

}


/* =========================================================
   CURRENT SHIFT
   ========================================================= */

function updateCurrentShift(hours) {

    const activeShift =
        hours.find(
            entry => !entry.endTime
        );


    const status =
        document.getElementById(
            "shiftStatus"
        );


    const time =
        document.getElementById(
            "shiftTime"
        );


    const button =
        document.getElementById(
            "clockButton"
        );


    if (activeShift) {

        status.textContent =
            "Currently clocked in";


        time.textContent =
            `Started at ${formatTime(activeShift.startTime)}`;


        button.textContent =
            "CLOCK OUT";


    } else {

        status.textContent =
            "Not clocked in";


        time.textContent =
            "—";


        button.textContent =
            "CLOCK IN";

    }

}


/* =========================================================
   TODAY'S TOTAL
   ========================================================= */

function updateTodayTotal(hours) {

    const today =
        new Date();


    const todayString =
        today.toISOString()
            .split("T")[0];


    let total = 0;


    hours.forEach(entry => {

        const entryDate =
            new Date(entry.date);


        const entryDateString =
            entryDate.toISOString()
                .split("T")[0];


        if (
            entryDateString === todayString &&
            entry.hours
        ) {

            total +=
                Number(entry.hours);

        }

    });


    document.getElementById(
        "todayHours"
    ).textContent =
        formatHours(total);

}


/* =========================================================
   HISTORY
   ========================================================= */

function renderHistory(hours) {

    const container =
        document.getElementById(
            "hoursList"
        );


    if (
        !hours ||
        hours.length === 0
    ) {

        container.innerHTML = `
            <p class="empty-state">
                No hours recorded yet.
            </p>
        `;

        return;

    }


    const completedHours =
        hours
            .filter(
                entry => entry.endTime
            )
            .sort(
                (a, b) =>
                    new Date(b.date) -
                    new Date(a.date)
            );


    if (
        completedHours.length === 0
    ) {

        container.innerHTML = `
            <p class="empty-state">
                No completed shifts yet.
            </p>
        `;

        return;

    }


    container.innerHTML =
        completedHours
            .slice(0, 10)
            .map(createHourEntry)
            .join("");

}


/* =========================================================
   CREATE HISTORY ENTRY
   ========================================================= */

function createHourEntry(entry) {

    const date =
        formatDate(entry.date);


    const hours =
        formatHours(entry.hours);


    const description =
        entry.description ||
        `${formatTime(entry.startTime)} → ${formatTime(entry.endTime)}`;


    const status =
        (entry.status || "Pending")
            .toLowerCase();


    return `
        <div class="hour-entry">

            <div>

                <div class="entry-date">
                    ${date}
                </div>

                <div class="entry-description">
                    ${description}
                </div>

            </div>

            <div class="entry-right">

                <div class="entry-hours">
                    ${hours}
                </div>

                <span class="badge ${status}">
                    ${entry.status}
                </span>

            </div>

        </div>
    `;

}


/* =========================================================
   MANUAL ENTRY
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

    const dateInput =
        document.getElementById(
            "manualDate"
        );


    const today =
        new Date()
            .toISOString()
            .split("T")[0];


    dateInput.value =
        today;

}


/* =========================================================
   SUBMIT MANUAL HOURS
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

        alert(
            "Please enter the date, start time and end time."
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


        alert(
            `Hours added successfully.\n\nTotal: ${formatHours(result.hours)}`
        );


        document.getElementById(
            "manualStart"
        ).value = "";


        document.getElementById(
            "manualEnd"
        ).value = "";


        document.getElementById(
            "manualDescription"
        ).value = "";


        closeManualEntry();


        await loadHours();


    } catch (error) {

        console.error(error);


        alert(
            "Could not add hours:\n\n" +
            error.message
        );

    }

}


/* =========================================================
   CONNECTION STATUS
   ========================================================= */

function setConnectionStatus(state) {

    const indicator =
        document.getElementById(
            "connectionStatus"
        );


    indicator.classList.remove(
        "connected",
        "error"
    );


    if (
        state === "connected"
    ) {

        indicator.classList.add(
            "connected"
        );

        indicator.title =
            "Connected";


    } else if (
        state === "error"
    ) {

        indicator.classList.add(
            "error"
        );

        indicator.title =
            "Connection error";


    } else {

        indicator.title =
            "Connecting...";

    }

}


/* =========================================================
   FORMATTERS
   ========================================================= */

function formatHours(decimalHours) {

    if (
        decimalHours === null ||
        decimalHours === undefined ||
        isNaN(decimalHours)
    ) {

        return "0h 00m";

    }


    const totalMinutes =
        Math.round(
            Number(decimalHours) * 60
        );


    const hours =
        Math.floor(
            totalMinutes / 60
        );


    const minutes =
        totalMinutes % 60;


    return `${hours}h ${String(minutes).padStart(2, "0")}m`;

}


function formatDate(value) {

    const date =
        new Date(value);


    return date.toLocaleDateString(
        "en-ZA",
        {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }
    );

}


function formatTime(value) {

    if (!value) {
        return "—";
    }


    const date =
        new Date(value);


    return date.toLocaleTimeString(
        "en-ZA",
        {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        }
    );

}
