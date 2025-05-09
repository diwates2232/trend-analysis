
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
setInterval(pingDevices, 30000);

// Get device status
app.get("/api/devices/status", (req, res) => {
  res.json(deviceStatus);
});





// Get downtime/uptime summary for a region
app.get("/api/region/devices/downtime-uptime/:region", (req, res) => {
  try {
    const region = req.params.region.toLowerCase();
    console.log(`Fetching downtime-uptime data for region: ${region}`);

    if (!uptimeDowntimeStats) {
      console.error("uptimeDowntimeStats is undefined or empty");
      return res.status(500).json({ message: "Server error: Data not available" });
    }

    const { day, week, month } = getDateKeys();
    if (!day || !week || !month) {
      console.error("Error getting date keys");
      return res.status(500).json({ message: "Error generating date keys" });
    }

    // Find devices in the given region
    const regionDevices = Object.keys(uptimeDowntimeStats).map(ip => {
      const device = allData.cameras.find(d => d.ip_address === ip) ||
                     allData.archivers.find(d => d.ip_address === ip) ||
                     allData.controllers.find(d => d.ip_address === ip) ||
                     allData.servers.find(d => d.ip_address === ip);

      if (device && device.location?.toLowerCase() === region) {
        return { ip, name: device.name, stats: uptimeDowntimeStats[ip] };
      }
      return null;
    }).filter(d => d !== null);

    if (regionDevices.length === 0) {
      console.warn(`No devices found for region: ${region}`);
      return res.status(404).json({ message: `No devices found for region: ${region}` });
    }

    let dailySummary = { totalUptime: 0, totalDowntime: 0, totalDowntimeDuration: 0 };
    let weeklySummary = { totalUptime: 0, totalDowntime: 0, totalDowntimeDuration: 0 };
    let monthlySummary = { totalUptime: 0, totalDowntime: 0, totalDowntimeDuration: 0 };

    let deviceDetails = regionDevices.map(({ ip, name, stats }) => {
      const dailyStats = stats.daily[day] || { uptime: 0, downtime: 0, downtimeDuration: 0 };
      const weeklyStats = stats.weekly[week] || { uptime: 0, downtime: 0, downtimeDuration: 0 };
      const monthlyStats = stats.monthly[month] || { uptime: 0, downtime: 0, downtimeDuration: 0 };

      dailySummary.totalUptime += dailyStats.uptime;
      dailySummary.totalDowntime += dailyStats.downtime;
      dailySummary.totalDowntimeDuration += dailyStats.downtimeDuration;

      weeklySummary.totalUptime += weeklyStats.uptime;
      weeklySummary.totalDowntime += weeklyStats.downtime;
      weeklySummary.totalDowntimeDuration += weeklyStats.downtimeDuration;

      monthlySummary.totalUptime += monthlyStats.uptime;
      monthlySummary.totalDowntime += monthlyStats.downtime;
      monthlySummary.totalDowntimeDuration += monthlyStats.downtimeDuration;

      return {
        ip,
        name,
        status: deviceStatus[ip] || "Unknown",
        daily: dailyStats,
        weekly: weeklyStats,
        monthly: monthlyStats
      };
    });

    return res.status(200).json({
      region: region,
      dailySummary,
      weeklySummary,
      monthlySummary,
      deviceDetails
    });

  } catch (error) {
    console.error("Error in API:", error);
    return res.status(500).json({ message: "Something went wrong!", error: error.message });
  }
});



// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  pingDevices();
});
