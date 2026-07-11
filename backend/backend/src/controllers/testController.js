// Email functionality has been removed from this system.
// These endpoints are kept as stubs to avoid breaking existing route imports.

exports.emailHealth = (req, res) => {
  res.json({ message: "Email functionality has been disabled." });
};

exports.testEmail = (req, res) => {
  res.json({ message: "Email functionality has been disabled." });
};
