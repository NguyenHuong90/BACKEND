const express = require("express");
const router = express.Router();
const ActivityLog = require("../models/ActivityLog");
const jwt = require("jsonwebtoken");

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

// Lấy danh sách nhật ký hoạt động
router.get("/", verifyToken, async (req, res) => {
  try {
    console.log("GET /api/activitylog received");
    const { userId, action, startDate, endDate, source, page = 1, limit = 10 } = req.query;
    const query = {};

    if (userId) query.userId = userId;
    if (action) query.action = { $regex: action, $options: "i" };
    if (source) query.source = source;
    if (startDate && endDate) {
      query.timestamp = {
        $gte: new Date(startDate),
        $lte: new Date(endDate).setHours(23, 59, 59, 999),
      };
    }

    const logs = await ActivityLog.find(query)
      .populate("userId", "username firstName lastName")
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ timestamp: -1 });
    const totalLogs = await ActivityLog.countDocuments(query);
    const totalPages = Math.ceil(totalLogs / limit);

    res.json({ logs, totalPages });
  } catch (err) {
    console.error("Lỗi khi lấy nhật ký hoạt động:", err);
    res.status(500).json({ error: err.message });
  }
});

// Xóa toàn bộ nhật ký
router.delete("/", verifyToken, async (req, res) => {
  try {
    console.log("DELETE /api/activitylog received");
    await ActivityLog.deleteMany({});
    await new ActivityLog({
      userId: req.user.id,
      action: "clear_activity_log",
      ip: req.ip,
      timestamp: new Date(),
    }).save();
    res.json({ message: "Toàn bộ nhật ký đã được xóa" });
  } catch (err) {
    console.error("Lỗi khi xóa nhật ký:", err);
    res.status(500).json({ error: err.message });
  }
});

// Xóa một mục nhật ký
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    console.log("DELETE /api/activitylog/:id received, id:", req.params.id);
    const log = await ActivityLog.findByIdAndDelete(req.params.id);
    if (!log) {
      return res.status(404).json({ message: "Nhật ký không tồn tại" });
    }
    await new ActivityLog({
      userId: req.user.id,
      action: "delete_activity_log",
      details: { logId: req.params.id },
      ip: req.ip,
      timestamp: new Date(),
    }).save();
    res.json({ message: "Nhật ký đã được xóa" });
  } catch (err) {
    console.error("Lỗi khi xóa mục nhật ký:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;