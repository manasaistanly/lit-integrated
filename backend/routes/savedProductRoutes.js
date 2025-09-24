
const express = require("express");
const router = express.Router();
const savedProductController = require("../controllers/savedProductController");

router.post("/save", savedProductController.saveProduct);
router.delete("/:id/remove", savedProductController.removeProduct);
router.get("/saved/:userId", savedProductController.listSavedProducts);

module.exports = router;
