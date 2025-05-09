

let deviceUptimeTimers = {};
let deviceDowntimeTimers = {};


function fetchDeviceData() {
    const selectedRegion = document.getElementById('region').value;

    if (selectedRegion === 'All') {
        fetch(`http://localhost/api/regions/all-details`)  // Adjust API endpoint if needed
            .then(response => response.json())
            .then(allRegionsData => {
                let combinedDetails = {
                    cameras: [],
                    archivers: [],
                    controllers: [],
                    servers: []
                };


                // Merge all devices from different regions into a single list
                Object.values(allRegionsData).forEach(regionData => {
                    if (regionData.details) {
                        ['cameras', 'archivers', 'controllers', 'servers'].forEach(deviceType => {
                            if (regionData.details[deviceType]) {
                                combinedDetails[deviceType].push(...regionData.details[deviceType]);
                            }
                        });
                    }
                });

                fetchDeviceHistory(combinedDetails);
            })
            .catch(error => console.error('Error fetching all regions data:', error));
    } else {
        fetch(`http://localhost/api/regions/details/${selectedRegion}`)
            .then(response => response.json())
            .then(regionData => {


                const details = regionData.details;

                const totalDevices = 
                    (details.cameras?.length || 0) + 
                    (details.archivers?.length || 0) + 
                    (details.controllers?.length || 0) + 
                    (details.servers?.length || 0);
                
                const totalOnlineDevices = [
                    ...details.cameras || [],
                    ...details.archivers || [],
                    ...details.controllers || [],
                    ...details.servers || []
                ].filter(device => device.status === "Online").length;
                
                document.getElementById("total-devices").innerText = `Total Devices: ${totalDevices}`;
                document.getElementById("total-online").innerText = `Total Online Devices: ${totalOnlineDevices}`;
                document.getElementById("total-cameras").innerText = `Total Cameras: ${details.cameras?.length || 0}`;
                document.getElementById("total-controllers").innerText = `Total Controllers: ${details.controllers?.length || 0}`;
                document.getElementById("total-archivers").innerText = `Total Archivers: ${details.archivers?.length || 0}`;
                document.getElementById("total-servers").innerText = `Total Servers: ${details.servers?.length || 0}`;
                
               

                fetchDeviceHistory(regionData.details);
            })
            .catch(error => console.error('Error fetching device data:', error));
    }
}


function fetchDeviceHistory(regionDetails) {
    fetch(`http://localhost/api/devices/history`)
        .then(response => response.json())
        .then(historyData => {
            populateDeviceTable(regionDetails, historyData);
            window.deviceHistoryData = historyData; // Store history for reuse
        })
        .catch(error => console.error('Error fetching device history:', error));
}



// In the populateDeviceTable function, make sure to pass the correct deviceType when calling updateDowntimeCount and updateRemarks:
function populateDeviceTable(details, historyData, selectedRegion = 'Global') {
    const tableBody = document.getElementById('device-table').getElementsByTagName('tbody')[0];
    tableBody.innerHTML = ''; // Clear existing rows

    let deviceList = [];

    if (details) {
        ['cameras', 'archivers', 'controllers', 'servers'].forEach(deviceType => {
            details[deviceType]?.forEach(device => {
                const deviceIp = device.ip_address;
                const deviceName = device[deviceType.slice(0, -1) + 'name'] || 'Unknown';
                const deviceCategory = deviceType.slice(0, -1).toUpperCase();
                const deviceRegion = device.location || "Unknown"; // Fix: Use location instead of region

                const deviceHistory = historyData[deviceIp] || [];
                const lastStatusEntry = deviceHistory.length > 0 ? deviceHistory[deviceHistory.length - 1] : null;
                const currentStatus = device.status || (lastStatusEntry ? lastStatusEntry.status : "Unknown"); // Fix: Use device.status directly

                let downtimeCount = deviceHistory.filter(entry => entry.status === "Offline").length;

                // Add condition to display only offline devices with downtimeCount greater than 15
                if ((currentStatus === "Offline" || downtimeCount > 15)) {
                    deviceList.push({
                        deviceIp,
                        deviceName,
                        deviceCategory,
                        deviceRegion,
                        currentStatus,
                        deviceHistory,
                        downtimeCount,
                        deviceType
                    });
                }
            });
        });

        deviceList.sort((a, b) => b.downtimeCount - a.downtimeCount);

        if (deviceList.length === 0) {
            const row = tableBody.insertRow();
            const cell = row.insertCell(0);
            cell.colSpan = 9;
            cell.textContent = "No devices found";
            cell.style.textAlign = "center";
            cell.style.fontWeight = "bold";
            return;
        }

        deviceList.forEach(({ deviceIp, deviceName, deviceCategory, currentStatus, deviceRegion, deviceHistory, downtimeCount, deviceType }) => {
            const row = tableBody.insertRow();
            row.style.border = "1px solid black";

            row.innerHTML = `
                <td>${deviceIp || 'Unknown'}</td>
                <td>${deviceName || 'Unknown'}</td>
                <td>${deviceCategory || 'Unknown'}</td>
                <td>${deviceRegion || 'Unknown'}</td>
                <td id="uptime-${deviceIp}">0h/0m/0s</td>
                <td id="downtime-count-${deviceIp}">${downtimeCount}</td>
                <td id="downtime-${deviceIp}">0h/0m/0s</td>
                <td><button onclick="openDeviceHistory('${deviceIp}', '${deviceName}')">View History</button></td>
                <td id="remark-${deviceIp}">Device working properly</td>
            `;

            const color = currentStatus === "Online" ? "green" : "red";
            row.style.color = color;

            if (currentStatus === "Online") {
                startUptime(deviceIp, deviceHistory);
            } else {
                startDowntime(deviceIp, deviceHistory);
            }

            updateRemarks(deviceIp, deviceHistory, deviceType);
        });
    } else {
        console.error('No details found in the response');
    }
}




function startUptime(deviceIp, history) {
    clearInterval(deviceDowntimeTimers[deviceIp]);
    let lastOnlineEntry = history.filter(entry => entry.status === "Online").pop();
    
    if (!lastOnlineEntry) return;
    
    let startTime = new Date(lastOnlineEntry.timestamp).getTime();
    deviceUptimeTimers[deviceIp] = setInterval(() => {
        let elapsedTime = Math.floor((Date.now() - startTime) / 1000);
        const uptimeElement = document.getElementById(`uptime-${deviceIp}`);
        if (uptimeElement) {
            uptimeElement.innerText = formatDuration(elapsedTime);
        }
    }, 1000);
}

function startDowntime(deviceIp, history) {
    clearInterval(deviceUptimeTimers[deviceIp]);
    let lastOfflineEntry = history.filter(entry => entry.status === "Offline").pop();

    if (!lastOfflineEntry) return;
    
    let startTime = new Date(lastOfflineEntry.timestamp).getTime();
    deviceDowntimeTimers[deviceIp] = setInterval(() => {
        let elapsedTime = Math.floor((Date.now() - startTime) / 1000);
        const downtimeElement = document.getElementById(`downtime-${deviceIp}`);
        if (downtimeElement) {
            downtimeElement.innerText = formatDuration(elapsedTime);
        }
        updateDowntimeCount(deviceIp, history);
    }, 1000);
}






// **Fix Downtime Count and Remarks Update (with proper filtering)**
function updateDowntimeCount(deviceIp, history) {
    let downtimeEntries = history.filter(entry => entry.status === "Offline");

    // Only count downtimes that last more than 5 minutes, except for servers
    let filteredDowntimeEntries = downtimeEntries.filter((entry, index, arr) => {
        if (deviceType === "SERVER") return true; // Always count downtime for servers
        if (index === 0) return true; // Always keep the first entry

        let previousEntry = arr[index - 1];
        let duration = (new Date(entry.timestamp) - new Date(previousEntry.timestamp)) / 1000;
        return duration >= 300; // 300 seconds = 5 minutes
    });

    let downtimeCount = filteredDowntimeEntries.length;
    
    let downtimeElement = document.getElementById(`downtime-count-${deviceIp}`);
    if (downtimeElement) {
        downtimeElement.innerText = downtimeCount;
    }

    // Update remarks based on downtime count and total downtime
    let remarkElement = document.getElementById(`remark-${deviceIp}`);
    if (remarkElement) {
        if (downtimeCount === 0) {
            remarkElement.innerText = "Device is Online.";
        } else if (downtimeCount >= 3) {
            remarkElement.innerText = `Device is Online, but it had ${downtimeCount} offline occurrences. Needs repair!`;
        } else {
            remarkElement.innerText = `Device is Online, but it had ${downtimeCount} offline occurrences.`;
        }
    }
}

// Fix for updateRemarks function to prioritize current status and handle downtime properly
function updateRemarks(deviceIp, history, deviceType) {
    let downtimeEntries = history.filter(entry => entry.status === "Offline");

    // Filter downtimes that lasted more than 5 minutes (except for servers)
    let filteredDowntimeEntries = downtimeEntries.filter((entry, index, arr) => {
        if (deviceType === "SERVER") return true; // Always count downtime for servers
        if (index === 0) return true; // Always keep the first entry

        let previousEntry = arr[index - 1];
        let duration = (new Date(entry.timestamp) - new Date(previousEntry.timestamp)) / 1000;
        return duration >= 300; // 300 seconds = 5 minutes
    });

    let downtimeCount = filteredDowntimeEntries.length;
    let lastStatus = history.length > 0 ? history[history.length - 1].status : "Unknown";
    let remarkElement = document.getElementById(`remark-${deviceIp}`);
    
    // Calculate total offline duration
    let totalOfflineTime = 0;
    let lastOfflineTime = null;

    history.forEach(entry => {
        if (entry.status === "Offline") {
            if (!lastOfflineTime) lastOfflineTime = new Date(entry.timestamp);
        } else if (entry.status === "Online" && lastOfflineTime) {
            totalOfflineTime += (new Date(entry.timestamp) - lastOfflineTime) / 1000;
            lastOfflineTime = null;
        }
    });

    if (lastOfflineTime) {
        totalOfflineTime += (new Date() - lastOfflineTime) / 1000;
    }

    let totalOfflineDays = Math.floor(totalOfflineTime / 86400); // Convert seconds to days

    // **Condition: Device needs repair if any of the following is true**
    let needsRepair = downtimeCount >= 10 || totalOfflineDays >= 1;

    // **Setting the Correct Remark**
    if (lastStatus === "Offline") {
        if (needsRepair) {
            remarkElement.innerText = "Device is Offline, needs repair.";
        } else {
            remarkElement.innerText = "Device is Offline.";
        }
    } else if (lastStatus === "Online") {
        if (needsRepair) {
            remarkElement.innerText = "Device is Online, needs repair.";
        } else if (downtimeCount > 0) {
            remarkElement.innerText = `Device is Online, it had ${downtimeCount} downtime occurrences.`;
        } else {
            remarkElement.innerText = "Device is Online.";
        }
    } else {
        remarkElement.innerText = "Device status unknown.";
    }

    // **Update Downtime Count in UI**
    let downtimeElement = document.getElementById(`downtime-count-${deviceIp}`);
    if (downtimeElement) {
        downtimeElement.innerText = downtimeCount;
    }
}


function formatDuration(seconds) {
    let days = Math.floor(seconds / 86400); // 1 day = 86400 seconds
    let hours = Math.floor((seconds % 86400) / 3600);
    let minutes = Math.floor((seconds % 3600) / 60);
    let secs = seconds % 60;

    let result = [];
    if (days > 0) result.push(`${days}d`);
    if (hours > 0 || days > 0) result.push(`${hours}h`);
    if (minutes > 0 || hours > 0 || days > 0) result.push(`${minutes}m`);
    result.push(`${secs}s`); // Always show seconds

    return result.join('/');
}


function openDeviceHistory(deviceIp, deviceName) {
    if (!window.deviceHistoryData) {
        console.error("Device history data not loaded.");
        return;
    }
    const history = window.deviceHistoryData[deviceIp] || [];
    displayDeviceHistory(deviceIp, deviceName, history);
    document.getElementById('device-history-modal').style.display = 'block';
}


function calculateDowntimeDuration(timestamp, history) {
    let downtimeStart = new Date(timestamp).getTime();
    
    // Find the next Online entry after the current Offline timestamp
    let nextOnlineEntry = history.find(entry => 
        entry.status === "Online" && new Date(entry.timestamp).getTime() > downtimeStart
    );

    if (nextOnlineEntry) {
        let downtimeEnd = new Date(nextOnlineEntry.timestamp).getTime();
        let durationInSeconds = (downtimeEnd - downtimeStart) / 1000;
        return formatDuration(durationInSeconds);
    }

    // If device is still offline, calculate downtime until now
    let durationInSeconds = (Date.now() - downtimeStart) / 1000;
    return formatDuration(durationInSeconds);
}


    
    function formatDuration(seconds) {
        let days = Math.floor(seconds / 86400); // 1 day = 86400 seconds
        let hours = Math.floor((seconds % 86400) / 3600);
        let minutes = Math.floor((seconds % 3600) / 60);
        let secs = seconds % 60;
    
        let result = [];
        if (days > 0) result.push(`${days}d`);
        if (hours > 0 || days > 0) result.push(`${hours}h`);
        if (minutes > 0 || hours > 0 || days > 0) result.push(`${minutes}m`);
        result.push(`${secs}s`); // Always show seconds
    
        return result.join('/');
    
    }
    
    
    function displayDeviceHistory(deviceIp, deviceName, history) {
        const modalHeader = document.getElementById('device-history-header');
        const historyContainer = document.getElementById('device-history');
    
        modalHeader.innerHTML = `
            <h3>Device History</h3>
            <p><strong>Device Name:</strong> ${deviceName}</p>
            <p><strong>Device IP:</strong> ${deviceIp}</p>
            <hr>
        `;
    
        historyContainer.innerHTML = '';
    
        if (history.length === 0) {
            historyContainer.innerHTML = `<p>No history available for this device.</p>`;
            return;
        }
    
        let tableHTML = `
            <table border="1" style="width:100%; text-align:center; border-collapse: collapse;">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Day</th>
                        <th>Time</th>
                        <th>Status</th>
                        <th>Downtime Duration</th>
                    </tr>
                </thead>
                <tbody>
        `;
    
        let lastOfflineTimestamp = null;
        let lastStatus = null;
    
        history.forEach((entry, index) => {
            let entryDate = new Date(entry.timestamp);
            let formattedDate = entryDate.toLocaleDateString();
            let formattedTime = entryDate.toLocaleTimeString();
            let formattedDay = entryDate.toLocaleString('en-US', { weekday: 'long' });
    
            let downtimeDuration = "-"; // Default, only set for Offline entries
    
            if (entry.status === "Offline") {
                lastOfflineTimestamp = entry.timestamp; // Store last offline time
            } else if (entry.status === "Online" && lastOfflineTimestamp) {
                // Only calculate duration when switching from Offline → Online
                downtimeDuration = calculateDowntimeDuration(lastOfflineTimestamp, history);
                lastOfflineTimestamp = null; // Reset after use
            }
    
            lastStatus = entry.status;
    
            tableHTML += `
                <tr>
                    <td>${formattedDate}</td>
                    <td>${formattedDay}</td>
                    <td>${formattedTime}</td>
                    <td style="color: ${entry.status === "Online" ? 'green' : 'red'};">${entry.status}</td>
                    <td>${downtimeDuration}</td>
                </tr>
            `;
        });
    
        tableHTML += `</tbody></table>`;
        historyContainer.innerHTML = tableHTML;
    }

    
    // **Updated function to format duration properly**
    function formatDuration(seconds) {
        let days = Math.floor(seconds / 86400); // 1 day = 86400 seconds
        let hours = Math.floor((seconds % 86400) / 3600);
        let minutes = Math.floor((seconds % 3600) / 60);
        let secs = Math.round(seconds % 60); // Round seconds properly
    
        let result = [];
        if (days > 0) result.push(`${days}d`);
        if (hours > 0) result.push(`${hours}h`);
        if (minutes > 0) result.push(`${minutes}m`);
        if (secs > 0 || result.length === 0) result.push(`${secs}s`); // Always show at least seconds
    
        return result.join('/');
    }
    
    function calculateDowntimeDuration(timestamp, history) {
        let downtimeStart = new Date(timestamp).getTime();
    
        // Find the next Online entry after the current Offline timestamp
        let nextOnlineEntry = history.find(entry => 
            entry.status === "Online" && new Date(entry.timestamp).getTime() > downtimeStart
        );
    
        if (nextOnlineEntry) {
            let downtimeEnd = new Date(nextOnlineEntry.timestamp).getTime();
            let durationInSeconds = (downtimeEnd - downtimeStart) / 1000;
            return formatDuration(durationInSeconds);
        }
    
        // If the device is still offline, calculate downtime until now
        let durationInSeconds = (Date.now() - downtimeStart) / 1000;
        return formatDuration(durationInSeconds);
    }
    

function closeHistoryModal() {
    document.getElementById('device-history-modal').style.display = 'none';
}


function filterData() {
    const selectedType = document.getElementById('device-type').value.toUpperCase();
    const selectedRemark = document.getElementById('remark-filter').value;

    const table = document.getElementById('device-table');
    const rows = table.getElementsByTagName('tbody')[0].getElementsByTagName('tr');

    for (let row of rows) {
        const type = row.cells[2].textContent.toUpperCase();
        const remark = row.cells[7].textContent.trim();

        const matchesType = selectedType === "ALL" || type === selectedType;
        const matchesRemark = selectedRemark === "ALL" || remark.includes(selectedRemark);

        row.style.display = matchesType && matchesRemark ? "" : "none";
    }
}


document.addEventListener("DOMContentLoaded", function () {
    document.getElementById('region').addEventListener('change', fetchDeviceData);
    fetchDeviceData(); // Initial load
});
