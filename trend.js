
document.addEventListener("DOMContentLoaded", function () {
    // Default to APAC region and Cameras device type
    fetchTrendData('apac', 'cameras');
});

// Fetch and display the trend data for selected region and device type
function fetchTrendData(region, deviceType = 'cameras') {
    console.log(`Fetching data for region: ${region}, device type: ${deviceType}`);

    fetch(`http://localhost:80/api/region/trend/details/${region}`)
        .then(response => response.json())
        .then(data => {
            console.log("API Response:", data);  // Debug: Log the API response
            
            if (data && data.devices && data.devices.length > 0) {
                const filteredDevices = filterDevicesByType(data.devices, deviceType);
                console.log("Filtered Devices:", filteredDevices);  // Debug: Log the filtered devices
                displayTrendChart(filteredDevices);  // Display chart for selected region and device type
            } else {
                console.error("No devices data available.");
                alert("No devices found for the selected region and device type.");
            }
        })
        .catch(error => {
            console.error("Error fetching trend data:", error);
            alert("Error fetching trend data");
        });
}

// Filter devices based on the selected device type
function filterDevicesByType(devices, deviceType) {
    console.log("Available devices:", devices);  // Log all devices
    const filteredDevices = devices.filter(device => {
        console.log(`Device type: ${device.type}, Comparing with: ${deviceType}`);  // Log device type and comparison
        return device.type.toLowerCase() === deviceType.toLowerCase();
    });
    console.log(`Filtered devices by type (${deviceType}):`, filteredDevices);  // Log filtered devices
    return filteredDevices;
}

// Display the trend chart with device 
let chartInstance = null;  // Declare a variable to store the chart instance

function displayTrendChart(devices) {
    const labels = devices.map(device => device.ip);
    const uptimeData = devices.map(device => convertToMinutes(device.daily.uptime));
    const downtimeData = devices.map(device => convertToMinutes(device.daily.downtimeDuration));

    const ctx = document.getElementById("trendChart").getContext("2d");

    // Destroy the previous chart instance if it exists
    if (chartInstance) {
        chartInstance.destroy();
    }

    // Create a new chart instance
    chartInstance = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [
                {
                    label: "Uptime (minutes)",
                    data: uptimeData,
                    backgroundColor: "green",
                },
                {
                    label: "Downtime (minutes)",
                    data: downtimeData,
                    backgroundColor: "red",
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}


// Convert time in "d h m s" format to total minutes
function convertToMinutes(timeString) {
    const parts = timeString.split(" ");
    let totalMinutes = 0;
    parts.forEach(part => {
        if (part.includes("d")) totalMinutes += parseInt(part) * 1440; // 1 day = 1440 minutes
        if (part.includes("h")) totalMinutes += parseInt(part) * 60;  // 1 hour = 60 minutes
        if (part.includes("m")) totalMinutes += parseInt(part);       // 1 minute = 1 minute
    });
    return totalMinutes;
}

// Update device type and fetch trend data again based on the selected device type
function updateDeviceType() {
    const deviceType = document.getElementById('deviceType').value;
    const regionButtons = document.querySelectorAll('.region-selector button');
    let selectedRegion = 'apac'; // Default region, update based on active region

    // Get the active region button
    regionButtons.forEach(button => {
        if (button.style.backgroundColor === 'rgb(85, 85, 85)') {
            selectedRegion = button.textContent.toLowerCase();
        }
    });

    fetchTrendData(selectedRegion, deviceType); // Fetch data for selected region and device type
}

// Event listeners for region selection
document.querySelectorAll('.region-selector button').forEach(button => {
    button.addEventListener('click', function () {
        const region = button.textContent.toLowerCase();
        const deviceType = document.getElementById('deviceType').value;
        fetchTrendData(region, deviceType);
        
        // Highlight the active region button
        document.querySelectorAll('.region-selector button').forEach(btn => btn.style.backgroundColor = 'gray');
        button.style.backgroundColor = '#555';
    });
});

// Event listener for device type dropdown change
document.getElementById('deviceType').addEventListener('change', updateDeviceType);

