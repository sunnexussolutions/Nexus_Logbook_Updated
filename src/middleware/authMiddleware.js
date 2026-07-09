const jwt = require("jsonwebtoken");

exports.verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1]; // Bearer <token>

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "secretkey"
    );
    req.user = decoded; // { id, role }
    console.log("AUTH USER FROM TOKEN 👉", decoded);

    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

exports.isAdmin = (req, res, next) => {
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

exports.isTeamLead = (req, res, next) => {
  if (req.user.role !== "TEAM_LEAD") {
    return res.status(403).json({ message: "Team Lead access required" });
  }
  next();
};
