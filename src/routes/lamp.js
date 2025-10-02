const express = require("express");
const router = express.Router();
const Lamp = require("../models/Lamp");
const ActivityLog = require("../models/ActivityLog");
const jwt = require("jsonwebtoken");
const mqtt = require("mqtt");

const mqttClient = mqtt.connect("mqtt://broker.hivemq.com:1883");

mqttClient.on("connect", () => {
  console.log("Connected to MQTT broker");
});

mqttClient.on("error", (err) => {
  console.error("MQTT error:", err);
});

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Không có token được cung cấp" });
  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token đã hết hạn" });
    }
    res.status(401).json({ message: "Token không hợp lệ" });
  }
};

// Lấy trạng thái tất cả đèn
router.get("/state", verifyToken, async (req, res) => {
  try {
    console.log("GET /api/lamp/state received");
    const lamps = await Lamp.find({});
    res.json(lamps);
  } catch (err) {
    console.error("Lỗi khi lấy trạng thái đèn:", err);
    res.status(500).json({ error: err.message });
  }
});

// Điều khiển đèn
router.post("/control", verifyToken, async (req, res) => {
  const { gw_id, node_id, lamp_state, lamp_dim, lux, current_a } = req.body;
  console.log("POST /api/lamp/control received:", req.body); // Log dữ liệu nhận được
  try {
    if (!gw_id || !node_id) {
      return res.status(400).json({ message: "Thiếu gw_id hoặc node_id" });
    }

    let lamp = await Lamp.findOne({ gw_id, node_id });
    if (!lamp) {
      // Tạo đèn mới nếu không tìm thấy
      lamp = new Lamp({
        gw_id,
        node_id,
        lamp_state: lamp_state || "OFF",
        lamp_dim: lamp_dim || 0,
        lux: lux || 0,
        current_a: current_a || 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } else {
      // Cập nhật trạng thái nếu đèn đã tồn tại
      lamp.lamp_state = lamp_state || lamp.lamp_state;
      lamp.lamp_dim = lamp_dim !== undefined ? lamp_dim : lamp.lamp_dim;
      lamp.lux = lux !== undefined ? lux : lamp.lux;
      lamp.current_a = current_a !== undefined ? current_a : lamp.current_a;
      lamp.updatedAt = new Date();
    }
    await lamp.save();
    console.log("Lamp state updated:", lamp);

    // Gửi lệnh qua MQTT
    const payload = JSON.stringify({
      lamp_state: lamp.lamp_state,
      lamp_dim: lamp.lamp_dim,
    });
    const topic = `lamp/control/${node_id}`;
    mqttClient.publish(topic, payload, { qos: 0 }, (err) => {
      if (err) {
        console.error("Lỗi khi gửi MQTT:", err);
        return res.status(500).json({ error: "Lỗi khi gửi lệnh qua MQTT" });
      } else {
        console.log(`MQTT published to ${topic}: ${payload}`);
      }
    });

    // Ghi vào ActivityLog với chi tiết
    await new ActivityLog({
      userId: req.user.id,
      action: lamp_state
        ? `set_lamp_${lamp_state.toLowerCase()}`
        : lamp_dim !== undefined
        ? `set_lamp_brightness_to_${lamp_dim}%`
        : "update_lamp_state",
      details: {
        startTime: new Date(),
        lampDim: lamp.lamp_dim,
        lux: lamp.lux,
        currentA: lamp.current_a,
        nodeId: node_id,
        gwId: gw_id,
      },
      source: "manual",
      ip: req.ip,
      timestamp: new Date(),
    }).save();

    res.json({ lamp });
  } catch (err) {
    console.error("Lỗi khi cập nhật trạng thái đèn:", err);
    res.status(500).json({ error: err.message });
  }
});

// Xóa đèn
router.delete("/delete", verifyToken, async (req, res) => {
  const { gw_id, node_id } = req.body;
  console.log("DELETE /api/lamp/delete received:", req.body);
  try {
    const lamp = await Lamp.findOneAndDelete({ gw_id, node_id });
    if (!lamp) {
      return res.status(404).json({ message: "Bóng đèn không tồn tại" });
    }
    console.log("Lamp deleted:", lamp);

    await new ActivityLog({
      userId: req.user.id,
      action: "delete_lamp",
      details: { nodeId: node_id, gwId: gw_id },
      source: "manual",
      ip: req.ip,
      timestamp: new Date(),
    }).save();

    res.json({ message: "Bóng đèn đã được xóa" });
  } catch (err) {
    console.error("Lỗi khi xóa bóng đèn:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;