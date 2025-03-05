const fetchRegionTrendData = async (region) => {
    if (!region) {
        throw new Error("Region parameter is missing");
    }

    // Ensure devices have a valid location before filtering
    const filterByRegion = (devices) => {
        return devices.filter(device => 
            device.location && typeof device.location === "string" &&
            device.location.toLowerCase() === region.toLowerCase()
        );
    };

    const devices = {
        cameras: filterByRegion(allData.cameras),
        archivers: filterByRegion(allData.archivers),
        controllers: filterByRegion(allData.controllers),
        servers: filterByRegion(allData.servers),
    };

    // Sample logic to compute trends
    const trends = {
        daily: calculateTrend(devices, "daily"),
        weekly: calculateTrend(devices, "weekly"),
        monthly: calculateTrend(devices, "monthly"),
    };

    return trends;
};












const fetchRegionTrendData = async (region) => {
    if (!region) {
        throw new Error("Region parameter is missing");
    }

    // Ensure devices have a valid location before filtering
    const filterByRegion = (devices) => {
        return devices.filter(device => 
            device.location && typeof device.location === "string" &&
            device.location.toLowerCase() === region.toLowerCase()
        );
    };

    const devices = {
        cameras: filterByRegion(allData.cameras),
        archivers: filterByRegion(allData.archivers),
        controllers: filterByRegion(allData.controllers),
        servers: filterByRegion(allData.servers),
    };

    // Sample logic to compute trends
    const trends = {
        daily: calculateTrend(devices, "daily"),
        weekly: calculateTrend(devices, "weekly"),
        monthly: calculateTrend(devices, "monthly"),
    };

    return trends;
};









const baseUrl = "http://localhost:80/api/regions";
let region = "Global"; // Default region

document.addEventListener("DOMContentLoaded", () => {
    console.log("Initializing content for:", region);
    setupEventListeners();
    startAutoRefresh(region);
});

function setupEventListeners() {
    document.querySelectorAll(".region-button").forEach((button) => {
        button.addEventListener("click", () => {
            region = button.getAttribute("data-region");
            document.getElementById("region-title").textContent = `${region.toUpperCase()} Summary`;

            fetchSummary(region);
            fetchDetails(region);
            fetchTrendData(region);

            // Restart auto-refresh with the new region
            resetAutoRefresh(region);
        });
    });

    const viewTrendButton = document.getElementById("viewTrendButton");
    if (viewTrendButton) {
        viewTrendButton.addEventListener("click", () => {
            console.log("View Trend Analysis button clicked!");
            fetchTrendData(region);
        });
    } else {
        console.error("View Trend Analysis button not found in the DOM.");
    }
}

let refreshInterval = 300000; // 5 minutes
let countdownTime = refreshInterval / 1000;
let refreshTimer; // Store interval ID

function startAutoRefresh(regionName) {
    fetchData(regionName);
    updateCountdown();

    refreshTimer = setInterval(() => {
        fetchData(regionName);
        countdownTime = refreshInterval / 1000;
    }, refreshInterval);

    setInterval(updateCountdown, 1000);
}

function resetAutoRefresh(regionName) {
    clearInterval(refreshTimer);
    startAutoRefresh(regionName);
}

function fetchTrendData(region) {
    const trendApiUrl = `http://localhost:80/api/region/devices/downtime-uptime/${region}`;
    fetch(trendApiUrl)
        .then(response => response.json())
        .then(trendData => {
            console.log("Trend Data:", trendData);
            updateTrendAnalysis(trendData);
        })
        .catch(error => console.error("Error fetching trend data:", error));
}

const trendApiUrl = `http://localhost:80/api/region/devices/downtime-uptime/${region}`;

document.addEventListener("DOMContentLoaded", () => {
    // Fetch initial data for default region
    fetchSummary(region);
    fetchDetails(region);
    fetchTrendData(region);

    // Select all region buttons
    const regionButtons = document.querySelectorAll(".region-button");

    // Attach event listeners correctly
    regionButtons.forEach((button) => {
        button.addEventListener("click", () => {
            region = button.getAttribute("data-region"); // Update global region variable
            document.getElementById("region-title").textContent = `${region.toUpperCase()} Summary`;

            fetchSummary(region);
            fetchDetails(region);
            fetchTrendData(region);
        });
    });
});


document.addEventListener("DOMContentLoaded", () => {
    // Fetch initial trend data for the default region
    fetchTrendData(region);

    // Add event listeners for regions
    document.querySelectorAll(".region-button").forEach((button) => {
        button.addEventListener("click", () => {
            region = button.getAttribute("data-region");
            fetchTrendData(region); // Fetch trend data for selected region
        });
    });
});



document.addEventListener("DOMContentLoaded", () => {
    const viewTrendButton = document.getElementById("viewTrendButton");

    if (viewTrendButton) {
        viewTrendButton.addEventListener("click", () => {
            console.log("View Trend Analysis button clicked!");
            fetchTrendData(region);
        });
    } else {
        console.error("View Trend Analysis button not found in the DOM.");
    }
});

function fetchData(regionName) {
    const summaryUrl = `${baseUrl}/summary/${regionName}`;
    const detailsUrl = `${baseUrl}/details/${regionName}`;

    Promise.all([
        fetch(summaryUrl).then((res) => res.json()),
        fetch(detailsUrl).then((res) => res.json())
    ])
    .then(([summary, details]) => {
        console.log("Summary Data:", summary);
        console.log("Details Data:", details);
        updateSummary(summary);
        updateDetails(details);
    })
    .catch((error) => {
        console.error("Error fetching data:", error);
    });
}

// Function to start auto-refresh with a countdown
function startAutoRefresh(regionName) {
    fetchData(regionName); // Fetch data initially

    // Countdown Timer Display
    const countdownDisplay = document.getElementById("countdown");
    function updateCountdown() {
        countdownDisplay.innerText = `Refreshing in ${countdownTime} seconds`;
        countdownTime--;
        if (countdownTime < 0) countdownTime = refreshInterval / 1000;
    }
    
    // Start countdown every second
    setInterval(updateCountdown, 1000);

    // Refresh data every 5 minutes
    setInterval(() => {
        fetchData(regionName); // Fetch fresh data
        countdownTime = refreshInterval / 1000; // Reset countdown
    }, refreshInterval);
}

// Call function with the selected region when the page loads
document.addEventListener("DOMContentLoaded", () => {
    let regionName = "Global"; // Default region
    startAutoRefresh(regionName);
    fetchTrendData(regionName); // Fetch trend data on page load
});

function fetchSummary(regionName) {
    const summaryUrl = `${baseUrl}/summary/${regionName}`;

    fetch(summaryUrl)
        .then((response) => {
            if (!response.ok) {
                throw new Error("Error fetching summary data from API.");
            }
            return response.json();
        })
        .then((summary) => {
            console.log("Summary Data:", summary);
            updateSummary(summary);
        })
        .catch((error) => {
            console.error("Error fetching summary:", error);
            alert("Failed to load summary data. Please check the console for details.");
        });
}



function fetchDetails(regionName) {
    const detailsUrl = `${baseUrl}/details/${regionName}`;

    fetch(detailsUrl)
        .then((response) => response.json())
        .then((details) => {
            console.log("Details Data:", details);
            updateDetails(details);
            
            // Start live pinging every 10 seconds
            setInterval(() => {
                pingAllDevices(details);
              //  fetchLiveStatus(regionName); // Fetch live status every 10s
            }, 10000);
        })
        .catch((error) => {
            console.error("Error fetching details:", error);
            document.getElementById("device-details").innerHTML = "<p>Failed to load device details.</p>";
        });
}

// Function to fetch trend data
function fetchTrendData(region) {
    const trendApiUrl = `http://localhost:80/api/region/devices/downtime-uptime/${region}`;
    fetch(trendApiUrl)
        .then(response => response.json())
        .then(trendData => {
            console.log("Trend Data:", trendData);
            updateTrendAnalysis(trendData); // Call function to update UI
        })
        .catch(error => console.error("Error fetching trend data:", error));
}


// Function to update trend analysis in UI
function updateTrendAnalysis(data) {
    const trendContainer = document.getElementById("trend-container");
    trendContainer.innerHTML = ""; // Clear previous trend data

    // Loop through daily, weekly, and monthly trends and render each one
    const trends = ['daily', 'weekly', 'monthly'];
    trends.forEach((period) => {
        const trendData = data[period];

        const trendCard = document.createElement("div");
        trendCard.className = "trend-card";
        trendCard.innerHTML = `
            <h4>${period.charAt(0).toUpperCase() + period.slice(1)} Trend</h4>
            <canvas id="${period}-chart"></canvas>
        `;
        trendContainer.appendChild(trendCard);

        // Render chart using Chart.js
        renderTrendChart(`${period}-chart`, trendData);
    });
}

// Function to render charts using Chart.js
function renderTrendChart(chartId, trendData) {
    const ctx = document.getElementById(chartId).getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: trendData.labels, // e.g., days/weeks/months
            datasets: [{
                label: 'Downtime',
                data: trendData.downtime, // Downtime data
                borderColor: 'red',
                fill: false
            }, {
                label: 'Uptime',
                data: trendData.uptime, // Uptime data
                borderColor: 'green',
                fill: false
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    callbacks: {
                        label: (tooltipItem) => {
                            return `${tooltipItem.dataset.label}: ${tooltipItem.raw} hours`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Time'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Duration (hours)'
                    }
                }
            }
        }
    });
}


// Function to ping all devices
function pingAllDevices(details) {
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

                    // Update the UI instantly
                    const statusDot = card.querySelector(".status-dot");
                    const statusText = card.querySelector(".device-status");

                    if (newStatus === "online") {
                        statusDot.style.backgroundColor = "green";
                        statusText.textContent = "Online";
                        card.dataset.status = "online";
                    } else {
                        statusDot.style.backgroundColor = "red";
                        statusText.textContent = "Offline";
                        card.dataset.status = "offline";
                    }
                })
                .catch(error => console.error(`Ping failed for ${ip}:`, error));
        });
    }
}

function updateSummary(data) {
    document.getElementById("total-devices").textContent = data.summary?.totalDevices || "N/A";
    document.getElementById("online-devices").textContent = data.summary?.totalOnlineDevices || "N/A";
    document.getElementById("offline-devices").textContent = data.summary?.totalOfflineDevices || "N/A";

    // Update Cameras summary
    document.getElementById("camera-total").textContent = data.summary?.cameras?.total || "N/A";
    document.getElementById("camera-online").textContent = data.summary?.cameras?.online || "N/A";
    document.getElementById("camera-offline").textContent = data.summary?.cameras?.offline || "N/A";

    // Update Archivers summary
    document.getElementById("archiver-total").textContent = data.summary?.archivers?.total || "N/A";
    document.getElementById("archiver-online").textContent = data.summary?.archivers?.online || "N/A";
    document.getElementById("archiver-offline").textContent = data.summary?.archivers?.offline || "N/A";

    // Update Controllers summary
    document.getElementById("controller-total").textContent = data.summary?.controllers?.total || "N/A";
    document.getElementById("controller-online").textContent = data.summary?.controllers?.online || "N/A";
    document.getElementById("controller-offline").textContent = data.summary?.controllers?.offline || "N/A";

    // Update Servers summary
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
    
