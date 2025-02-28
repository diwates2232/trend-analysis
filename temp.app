app.get("/api/region/trend/details/:region", (req, res) => {
  try {
    const region = req.params.region.toLowerCase();
    console.log(`Fetching details for region: ${region}`);

    const { day, week, month } = getDateKeys(); // Retrieve keys for day, week, and month

    let deviceDetails = [];

    // Function to convert seconds into day/hour/minute/second format
    const formatDuration = (seconds) => {
      const days = Math.floor(seconds / (24 * 3600));
      const hours = Math.floor((seconds % (24 * 3600)) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const sec = seconds % 60;
      return `${days}d ${hours}h ${minutes}m ${sec}s`;
    };

    // Loop through devices
    Object.keys(uptimeDowntimeStats).forEach(ip => {
      const device = allData.cameras.find(d => d.ip_address === ip) ||
                     allData.archivers.find(d => d.ip_address === ip) ||
                     allData.controllers.find(d => d.ip_address === ip) ||
                     allData.servers.find(d => d.ip_address === ip);

      if (device && device.location?.toLowerCase() === region) {
        const stats = uptimeDowntimeStats[ip];

        // Ensure device name and type are included
        const deviceName = device.name || "Unknown Device";
        const deviceType = device.type || "Unknown Type";
        const deviceLocation = device.location || "Unknown Location";

        // Format uptime and downtime in readable form
        const dailyUptime = formatDuration(stats.daily[day]?.uptime || 0);
        const weeklyUptime = formatDuration(stats.weekly[week]?.uptime || 0);
        const monthlyUptime = formatDuration(stats.monthly[month]?.uptime || 0);

        const dailyDowntime = formatDuration(stats.daily[day]?.downtimeDuration || 0);
        const weeklyDowntime = formatDuration(stats.weekly[week]?.downtimeDuration || 0);
        const monthlyDowntime = formatDuration(stats.monthly[month]?.downtimeDuration || 0);

        deviceDetails.push({
          ip,
          name: deviceName,
          type: deviceType,
          location: deviceLocation,
          status: deviceStatus[ip] || "Unknown",
          daily: {
            date: new Date().toLocaleDateString(), // Current date for daily
            uptime: dailyUptime,
            downtime: dailyDowntime
          },
          weekly: {
            week: `Week ${new Date().getWeek()}`, // Week number, format as desired
            uptime: weeklyUptime,
            downtime: weeklyDowntime
          },
          monthly: {
            month: new Date().toLocaleString('default', { month: 'long' }), // Full month name
            uptime: monthlyUptime,
            downtime: monthlyDowntime
          }
        });
      }
    });

    if (deviceDetails.length === 0) {
      return res.status(404).json({ message: `No devices found for region: ${region}` });
    }

    return res.status(200).json({ region, devices: deviceDetails });

  } catch (error) {
    console.error("Error in details API:", error);
    return res.status(500).json({ message: "Something went wrong!", error: error.message });
  }
});












require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const ping = require("ping");
const regionRoutes = require("./routes/regionRoutes");
const { fetchAllIpAddress, allData } = require("./services/excelService");

const app = express();
const PORT = process.env.PORT || 80;

// Middleware
app.use(cors({
  origin: "http://127.0.0.1:5500", // Match your frontend's origin
  methods: "GET,POST,PUT,DELETE",
  allowedHeaders: "Content-Type,Authorization",
}));
app.use(bodyParser.json());

// Routes
app.use("/api/regions", regionRoutes);

// Store device statuses and downtime tracking
const devices = fetchAllIpAddress();
let deviceStatus = {};
let downtimeTracking = {};
let uptimeDowntimeStats = {};

// Logging allData at startup
console.log("All Device Data Loaded from Excel:");
console.log(JSON.stringify(allData, null, 2));

// Function to get date keys
const getDateKeys = () => {
  const now = new Date();
  const day = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const week = Math.ceil(now.getDate() / 7); // Week in the month
  const month = now.getMonth() + 1; // Month number
  return { day, week, month };
};

// Function to ping devices and update status
async function pingDevices() {
  const { day, week, month } = getDateKeys();

  for (const ip of devices) {
    try {
      const result = await ping.promise.probe(ip);
      const isOnline = result.alive;

      if (!uptimeDowntimeStats[ip]) {
        uptimeDowntimeStats[ip] = { daily: {}, weekly: {}, monthly: {} };
      }

      if (!uptimeDowntimeStats[ip].daily[day]) {
        uptimeDowntimeStats[ip].daily[day] = { uptime: 0, downtime: 0, downtimeDuration: 0 };
      }
      if (!uptimeDowntimeStats[ip].weekly[week]) {
        uptimeDowntimeStats[ip].weekly[week] = { uptime: 0, downtime: 0, downtimeDuration: 0 };
      }
      if (!uptimeDowntimeStats[ip].monthly[month]) {
        uptimeDowntimeStats[ip].monthly[month] = { uptime: 0, downtime: 0, downtimeDuration: 0 };
      }

      if (isOnline) {
        if (downtimeTracking[ip]?.lastOffline) {
          const lastOfflineTime = downtimeTracking[ip].lastOffline;
          const downtimeMinutes = Math.floor((Date.now() - lastOfflineTime) / 60000);
          uptimeDowntimeStats[ip].daily[day].downtimeDuration += downtimeMinutes;
          uptimeDowntimeStats[ip].weekly[week].downtimeDuration += downtimeMinutes;
          uptimeDowntimeStats[ip].monthly[month].downtimeDuration += downtimeMinutes;
          delete downtimeTracking[ip];
        }
        uptimeDowntimeStats[ip].daily[day].uptime += 1;
        uptimeDowntimeStats[ip].weekly[week].uptime += 1;
        uptimeDowntimeStats[ip].monthly[month].uptime += 1;
      } else {
        if (!downtimeTracking[ip]) {
          downtimeTracking[ip] = { lastOffline: Date.now(), totalDowntime: 0 };
        } else {
          const lastOfflineTime = downtimeTracking[ip].lastOffline;
          const downtimeMinutes = Math.floor((Date.now() - lastOfflineTime) / 60000);
          if (downtimeMinutes > 0) {
            uptimeDowntimeStats[ip].daily[day].downtimeDuration += downtimeMinutes;
            uptimeDowntimeStats[ip].weekly[week].downtimeDuration += downtimeMinutes;
            uptimeDowntimeStats[ip].monthly[month].downtimeDuration += downtimeMinutes;
            downtimeTracking[ip].totalDowntime += downtimeMinutes;
            downtimeTracking[ip].lastOffline = Date.now();
          }
        }
        uptimeDowntimeStats[ip].daily[day].downtime += 1;
        uptimeDowntimeStats[ip].weekly[week].downtime += 1;
        uptimeDowntimeStats[ip].monthly[month].downtime += 1;
      }

      deviceStatus[ip] = isOnline ? "Online" : "Offline";
    } catch (error) {
      console.error(`Error pinging ${ip}:`, error);
      deviceStatus[ip] = "Offline";
    }
  }
}

// Start pinging devices every 30 seconds
setInterval(pingDevices, 60000);

// Get device status
app.get("/api/region/devices/status", (req, res) => {
  res.json(deviceStatus);
});



app.get("/api/region/trend/summary/:region", (req, res) => {
  try {
    const region = req.params.region.toLowerCase();
    console.log(`Fetching summary for region: ${region}`);

    const { day, week, month } = getDateKeys();

    let summary = {
      daily: { totalUptime: 0, totalDowntime: 0, totalDowntimeDuration: 0 },
      weekly: { totalUptime: 0, totalDowntime: 0, totalDowntimeDuration: 0 },
      monthly: { totalUptime: 0, totalDowntime: 0, totalDowntimeDuration: 0 },
    };

    Object.keys(uptimeDowntimeStats).forEach(ip => {
      const device = allData.cameras.find(d => d.ip_address === ip) ||
                     allData.archivers.find(d => d.ip_address === ip) ||
                     allData.controllers.find(d => d.ip_address === ip) ||
                     allData.servers.find(d => d.ip_address === ip);

      if (!device) return;

      if (region !== "global" && device.location?.toLowerCase() !== region) return;

      const stats = uptimeDowntimeStats[ip];

      const dailyStats = stats.daily[day] || { uptime: 0, downtime: 0, downtimeDuration: 0 };
      const weeklyStats = stats.weekly[week] || { uptime: 0, downtime: 0, downtimeDuration: 0 };
      const monthlyStats = stats.monthly[month] || { uptime: 0, downtime: 0, downtimeDuration: 0 };

      summary.daily.totalUptime += dailyStats.uptime;
      summary.daily.totalDowntime += dailyStats.downtime;
      summary.daily.totalDowntimeDuration += dailyStats.downtimeDuration;

      summary.weekly.totalUptime += weeklyStats.uptime;
      summary.weekly.totalDowntime += weeklyStats.downtime;
      summary.weekly.totalDowntimeDuration += weeklyStats.downtimeDuration;

      summary.monthly.totalUptime += monthlyStats.uptime;
      summary.monthly.totalDowntime += monthlyStats.downtime;
      summary.monthly.totalDowntimeDuration += monthlyStats.downtimeDuration;
    });

    return res.status(200).json({ region, summary });

  } catch (error) {
    console.error("Error in summary API:", error);
    return res.status(500).json({ message: "Something went wrong!", error: error.message });
  }
});



app.get("/api/region/trend/details/:region", (req, res) => {
  try {
    const region = req.params.region.toLowerCase();
    console.log(`Fetching details for region: ${region}`);

    const { day, week, month } = getDateKeys();

    let deviceDetails = [];

    Object.keys(uptimeDowntimeStats).forEach(ip => {
      const device = allData.cameras.find(d => d.ip_address === ip) ||
                     allData.archivers.find(d => d.ip_address === ip) ||
                     allData.controllers.find(d => d.ip_address === ip) ||
                     allData.servers.find(d => d.ip_address === ip);

      if (device && device.location?.toLowerCase() === region) {
        const stats = uptimeDowntimeStats[ip];

        deviceDetails.push({
          ip,
          name: device.name,
          status: deviceStatus[ip] || "Unknown",
          daily: stats.daily[day] || { uptime: 0, downtime: 0, downtimeDuration: 0 },
          weekly: stats.weekly[week] || { uptime: 0, downtime: 0, downtimeDuration: 0 },
          monthly: stats.monthly[month] || { uptime: 0, downtime: 0, downtimeDuration: 0 }
        });
      }
    });

    if (deviceDetails.length === 0) {
      return res.status(404).json({ message: `No devices found for region: ${region}` });
    }

    return res.status(200).json({ region, devices: deviceDetails });

  } catch (error) {
    console.error("Error in details API:", error);
    return res.status(500).json({ message: "Something went wrong!", error: error.message });
  }
});



// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  pingDevices();
   setInterval(pingDevices, 120000);
});




