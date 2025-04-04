

const baseUrl = "http://localhost:80/api/regions";
let refreshInterval = 300000; // 5 minutes
let pingInterval = 30000; // 30 seconds
let countdownTime = refreshInterval / 1000; // Convert to seconds
let currentRegion = "global"; 
let deviceDetailsCache = {}; // Store previous details to prevent redundant updates

document.addEventListener("DOMContentLoaded", () => {
    fetchData("global"); // Load initial data
    startAutoRefresh("global");

    document.querySelectorAll(".region-button").forEach((button) => {
        button.addEventListener("click", () => {
            const region = button.getAttribute("data-region");
            document.getElementById("region-title").textContent = `${region.toUpperCase()} Summary`;
            switchRegion(region);
        });
    });

    document.getElementById("close-modal").addEventListener("click", () => {
        document.getElementById("modal").style.display = "none";
    });
});

function switchRegion(region) {
    clearExistingIntervals(); // Avoid interval duplication
    fetchData(region);
    startAutoRefresh(region);
}

// **Auto-refresh mechanism**
function startAutoRefresh(regionName) {
    fetchData(regionName); // Fetch initial data

    clearExistingIntervals();

    // Start countdown timer
    window.countdownTimer = setInterval(() => {
        document.getElementById("countdown").innerText = `Refreshing in ${countdownTime} seconds`;
        countdownTime--;
        if (countdownTime < 0) countdownTime = refreshInterval / 1000;
    }, 1000);

    // Refresh summary & details every 5 minutes
    window.refreshTimer = setInterval(() => {
        fetchData(regionName);
        countdownTime = refreshInterval / 1000;
    }, refreshInterval);

    // Ping devices every 30 seconds
    window.pingTimer = setInterval(() => {
        pingAllDevices(regionName);
    }, pingInterval);
}

function clearExistingIntervals() {
    clearInterval(window.countdownTimer);
    clearInterval(window.refreshTimer);
    clearInterval(window.pingTimer);
}

// **Fetch summary and details together**
function fetchData(regionName) {
    Promise.all([
        fetch(`${baseUrl}/summary/${regionName}`).then(res => res.json()),
        fetch(`${baseUrl}/details/${regionName}`).then(res => res.json())
    ])
    .then(([summary, details]) => {
        console.log("Summary Data:", summary);
        console.log("Details Data:", details);

        updateSummary(summary);
        
        if (JSON.stringify(details) !== JSON.stringify(deviceDetailsCache)) {
            updateDetails(details);
            deviceDetailsCache = details; // Update cache
        }
    })
    .catch((error) => console.error("Error fetching data:", error));
}
function pingAllDevices(details, regionName) {
    let statusChanged = false; // Track if any status changed

    for (const [key, devices] of Object.entries(details.details)) {
        if (!Array.isArray(devices) || devices.length === 0) continue;

        devices.forEach((device) => {
            const ip = device.ip_address || "N/A";
            const card = document.querySelector(`[data-ip="${ip}"]`);

            if (!card) return; // If device is not found in UI, skip

            // Ping the device API
            fetch(`${baseUrl}/ping/${ip}`)
                .then(response => response.json())
                .then(statusData => {
                    const newStatus = statusData.status.toLowerCase(); // Get live status
                    const currentStatus = card.dataset.status; // Current status in UI

                    // Update the UI instantly
                    const statusDot = card.querySelector(".status-dot");
                    const statusText = card.querySelector(".device-status");

                    if (newStatus === "online") {
                        statusDot.style.backgroundColor = "green";
                        statusText.textContent = "Online";
                    } else {
                        statusDot.style.backgroundColor = "red";
                        statusText.textContent = "Offline";
                    }

                    if (newStatus !== currentStatus) {
                        statusChanged = true; // A change in status was detected
                        card.dataset.status = newStatus; // Update dataset
                    }
                })
                .catch(error => console.error(`Ping failed for ${ip}:`, error));
        });
    }

    // After processing all devices, if any status changed, refresh summary
    setTimeout(() => {
        if (statusChanged) {
            fetchSummary(regionName);
        }
    }, 5000); // Small delay to ensure all pings are processed
}

setInterval(() => {
    pingAllDevices(details, regionName);
}, 300000); // Every 5 minutes



function updateSummary(data) {
    document.getElementById("total-devices").textContent = data.summary?.totalDevices || "N/A";
    document.getElementById("online-devices").textContent = data.summary?.totalOnlineDevices || "N/A";
    document.getElementById("offline-devices").textContent = data.summary?.totalOfflineDevices || "N/A";

    document.getElementById("camera-total").textContent = data.summary?.cameras?.total || "N/A";
    document.getElementById("camera-online").textContent = data.summary?.cameras?.online || "N/A";
    document.getElementById("camera-offline").textContent = data.summary?.cameras?.offline || "N/A";

    document.getElementById("archiver-total").textContent = data.summary?.archivers?.total || "N/A";
    document.getElementById("archiver-online").textContent = data.summary?.archivers?.online || "N/A";
    document.getElementById("archiver-offline").textContent = data.summary?.archivers?.offline || "N/A";

    document.getElementById("controller-total").textContent = data.summary?.controllers?.total || "N/A";
    document.getElementById("controller-online").textContent = data.summary?.controllers?.online || "N/A";
    document.getElementById("controller-offline").textContent = data.summary?.controllers?.offline || "N/A";

    document.getElementById("server-total").textContent = data.summary?.servers?.total || "N/A";
    document.getElementById("server-online").textContent = data.summary?.servers?.online || "N/A";
    document.getElementById("server-offline").textContent = data.summary?.servers?.offline || "N/A";
}



function updateDetails(data) {
    const detailsContainer = document.getElementById("device-details");
    const deviceFilter = document.getElementById("device-filter");
    const onlineFilterButton = document.getElementById("filter-online");
    const offlineFilterButton = document.getElementById("filter-offline");
    const allFilterButton = document.getElementById("filter-all");

    detailsContainer.innerHTML = ""; // Clear previous data

    const offlineDevices = [];
    const onlineDevices = [];
    let allDevices = [];




    // Fetch real-time status from the backend
    fetch("http://localhost:80/api/region/devices/status")
        .then((response) => response.json())
        .then((realTimeStatus) => {
            console.log("Live Status Data:", realTimeStatus);

            // Loop through each device type
            for (const [key, devices] of Object.entries(data.details)) {
                if (!Array.isArray(devices) || devices.length === 0) continue;

                const deviceType = key.toLowerCase(); // Convert to lowercase for filtering

                devices.forEach((device) => {
                    const deviceIP = device.ip_address || "N/A";
                    const currentStatus = realTimeStatus[deviceIP] || device.status; // Use live status if available

                    const card = document.createElement("div");
                    card.className = "device-card";
                    card.dataset.type = deviceType; // Store type for filtering
                    card.dataset.status = currentStatus.toLowerCase(); // Store status for filtering

                    // Create a status dot
                    const statusDot = document.createElement("span");
                    statusDot.className = "status-dot";
                    statusDot.style.backgroundColor = currentStatus === "Online" ? "green" : "red";

                    card.innerHTML = `
                        <h3>${device.cameraname || device.controllername || device.archivername || device.servername || "Unknown Device"}</h3>
                        <p>DEVICE TYPE: ${deviceType.toUpperCase()}</p>
                        <p>IP: ${deviceIP}</p>
                        <p>LOCATION: ${device.location || "N/A"}</p>
                        <p>Status: ${currentStatus} ${statusDot.outerHTML}</p>
                        <button class="details-button" onclick="showModal('${device.cameraname || device.controllername || device.archivername || device.servername || "Unknown Device"}', '${deviceIP}', '${device.location || "N/A"}', '${currentStatus}')">Details</button>
                    `;

                    allDevices.push(card);
                    if (currentStatus === "Online") {
                        onlineDevices.push(card);
                    } else {
                        offlineDevices.push(card);
                    }
                });
            }

            // Function to filter devices
            function filterDevices() {
                const selectedType = deviceFilter.value;
                const selectedStatus = document.querySelector(".status-filter.active")?.dataset.status || "all";

                detailsContainer.innerHTML = ""; // Clear current display

                const filteredDevices = allDevices.filter((device) =>
                    (selectedType === "all" || device.dataset.type === selectedType) &&
                    (selectedStatus === "all" || device.dataset.status === selectedStatus)
                );

                filteredDevices.forEach((deviceCard) => {
                    detailsContainer.appendChild(deviceCard);
                });
            }

            // Initially display all devices
            filterDevices();

            // Add event listener to dropdown
            deviceFilter.addEventListener("change", filterDevices);

            // Add event listeners for status filters
            [allFilterButton, onlineFilterButton, offlineFilterButton].forEach((button) => {
                button.addEventListener("click", () => {
                    document.querySelectorAll(".status-filter").forEach((btn) => btn.classList.remove("active"));
                    button.classList.add("active");
                    filterDevices();
                });
            });

            // Append offline devices first, followed by online devices
            [...offlineDevices, ...onlineDevices].forEach((deviceCard) => {
                detailsContainer.appendChild(deviceCard);
            });

        })
        .catch((error) => {
            console.error("Error fetching real-time device status:", error);
            detailsContainer.innerHTML = "<p>Failed to load device details.</p>";
        });
    }


    function showModal(name, ip, location, status) {
        document.getElementById("modal-title").textContent = `Details for ${name}`;
        document.getElementById("modal-body").innerHTML = `
            <li><strong>Name:</strong> ${name}</li>
            <li><strong>IP:</strong> ${ip}</li>
            <li><strong>Location:</strong> ${location}</li>

            <li><strong>Status:</strong> ${status}</li>
        `;
        document.getElementById("modal").style.display = "block";
    }


